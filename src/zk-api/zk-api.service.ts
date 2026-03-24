import {
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ZkApiRequestDto } from './dto/api-request.dto';
import { ZkApiResponseDto, UsageDto } from './dto/api-response.dto';
import { NullifierStoreService } from './nullifier-store.service';
import { ProofVerifierService } from './proof-verifier.service';
import { EthRateOracleService } from './eth-rate-oracle.service';
import { RefundSignerService } from './refund-signer.service';

// Claude API Pricing (USD per million tokens)
const CLAUDE_PRICING = {
  'claude-opus-4.6': { input: 5, output: 25 },
  'claude-sonnet-4.6': { input: 3, output: 15 },
  'claude-haiku-4.5': { input: 1, output: 5 },
};

type ClaudeModel = keyof typeof CLAUDE_PRICING;

/**
 * Main service for handling ZK-based API requests
 * Implements the protocol from ZK_API.md
 */
@Injectable()
export class ZkApiService {
  private readonly logger = new Logger(ZkApiService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly configService: ConfigService,
    private readonly nullifierStore: NullifierStoreService,
    private readonly proofVerifier: ProofVerifierService,
    private readonly ethRateOracle: EthRateOracleService,
    private readonly refundSigner: RefundSignerService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not found. Claude API calls will use mock responses.',
      );
    }
    this.anthropic = new Anthropic({ apiKey: apiKey || 'mock-key' });
  }

  /**
   * Handle a ZK API request
   * Implements the full protocol: nullifier check, proof verification, API call, refund
   */
  async handleRequest(req: ZkApiRequestDto): Promise<ZkApiResponseDto> {
    const model = (req.model || 'claude-sonnet-4.6') as ClaudeModel;

    // 1. Check nullifier for double-spend
    const existingSignal = this.nullifierStore.get(req.nullifier);
    if (existingSignal) {
      if (existingSignal.x !== req.signal.x) {
        // Double-spend detected! Two different signals with same nullifier
        this.logger.error(
          `Double-spend detected for nullifier ${req.nullifier}`,
        );

        // Extract secret key from two signals
        const secretKey = this.extractSecretKey(existingSignal, req.signal);

        // TODO: Submit slashing transaction to smart contract
        this.logger.warn(`Secret key extracted: ${secretKey.slice(0, 10)}...`);

        throw new ForbiddenException(
          'Double-spend detected. Your secret key has been extracted and you will be slashed.',
        );
      }

      // Same nullifier with same signal = replay attack
      throw new ForbiddenException('Nullifier already used');
    }

    // 2. Verify ZK proof
    const valid = this.proofVerifier.verify(req.proof);
    if (!valid) {
      throw new UnauthorizedException('Invalid ZK proof');
    }

    // 3. Store nullifier to prevent reuse
    this.nullifierStore.set(req.nullifier, req.signal);

    // 4. Execute Claude API request
    const response = await this.executeClaudeRequest(req.payload, model);

    // 5. Calculate actual cost in ETH
    const actualCost = await this.calculateCostInETH(
      response.usage.inputTokens,
      response.usage.outputTokens,
      model,
    );

    // 6. Generate refund ticket
    const refundValue = BigInt(req.maxCost) - actualCost;
    const refundTicket = this.refundSigner.signRefund({
      nullifier: req.nullifier,
      value: refundValue.toString(),
      timestamp: Date.now(),
    });

    this.logger.log(
      `Request processed. Cost: ${actualCost} wei, Refund: ${refundValue} wei`,
    );

    return {
      response: response.content,
      actualCost: actualCost.toString(),
      refundTicket,
      usage: response.usage,
    };
  }

  /**
   * Extract secret key from two RLN signals
   * Given: y1 = k + a*x1 and y2 = k + a*x2
   * Solve: k = (y1*x2 - y2*x1) / (x2 - x1)
   */
  private extractSecretKey(
    signal1: { x: string; y: string },
    signal2: { x: string; y: string },
  ): string {
    const x1 = BigInt(signal1.x);
    const y1 = BigInt(signal1.y);
    const x2 = BigInt(signal2.x);
    const y2 = BigInt(signal2.y);

    // Prevent division by zero
    if (x2 === x1) {
      throw new Error('Invalid signals: x values are identical');
    }

    const numerator = y1 * x2 - y2 * x1;
    const denominator = x2 - x1;
    const k = numerator / denominator;

    return '0x' + k.toString(16).padStart(64, '0');
  }

  /**
   * Calculate cost in ETH (wei) for Claude API usage
   */
  private async calculateCostInETH(
    inputTokens: number,
    outputTokens: number,
    model: ClaudeModel,
  ): Promise<bigint> {
    const pricing = CLAUDE_PRICING[model];

    if (!pricing) {
      throw new Error(
        `Unknown model: ${model}. Valid models: ${Object.keys(CLAUDE_PRICING).join(', ')}`,
      );
    }

    // Calculate cost in USD
    const costUSD =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;

    // Convert to ETH (wei)
    const costWei = await this.ethRateOracle.usdToWei(costUSD);

    this.logger.debug(
      `Cost calculation: ${inputTokens} in + ${outputTokens} out = $${costUSD.toFixed(6)} = ${costWei} wei`,
    );

    return costWei;
  }

  /**
   * Execute Claude API request
   * Falls back to mock if ANTHROPIC_API_KEY is not configured
   */
  private async executeClaudeRequest(
    payload: string,
    model: ClaudeModel,
  ): Promise<{ content: string; usage: UsageDto }> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');

    // Use mock response if no API key configured
    if (!apiKey) {
      return this.mockClaudeRequest(payload, model);
    }

    try {
      this.logger.debug(`Executing Claude API request with ${model}`);

      const message = await this.anthropic.messages.create({
        model: model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: payload }],
      });

      // Extract text content from response
      const textContent = message.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n');

      return {
        content: textContent,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      this.logger.error('Claude API request failed', error);
      throw new Error('Failed to execute Claude API request', {
        cause: error,
      });
    }
  }

  /**
   * Mock Claude response for development/testing
   */
  private mockClaudeRequest(
    payload: string,
    model: ClaudeModel,
  ): { content: string; usage: UsageDto } {
    this.logger.debug(`Using mock Claude API response for ${model}`);

    // Simulate API call
    const inputTokens = Math.ceil(payload.length / 4); // Rough estimate
    const outputTokens = Math.floor(Math.random() * 500) + 100; // Random response size

    const mockResponse = `This is a mock Claude ${model} response to: "${payload.slice(0, 50)}..."`;

    return {
      content: mockResponse,
      usage: {
        inputTokens,
        outputTokens,
      },
    };
  }

  /**
   * Get server's public key for client-side signature verification
   */
  getServerPublicKey(): { x: string; y: string } {
    return this.refundSigner.getPublicKey();
  }
}
