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
import { SlashingService } from './slashing.service';

// Example: Claude API Pricing (USD per million tokens)
// This can be configured for any API service with similar pricing models
const CLAUDE_PRICING = {
  'claude-opus-4.6': { input: 5, output: 25 },
  'claude-sonnet-4.6': { input: 3, output: 15 },
  'claude-haiku-4.5': { input: 1, output: 5 },
};

type ClaudeModel = keyof typeof CLAUDE_PRICING;

/**
 * Main service for handling ZK-based API requests
 * Generic implementation that can be adapted to any API service
 * Claude API is provided as a reference implementation
 */
@Injectable()
export class ZkApiService {
  private readonly logger = new Logger(ZkApiService.name);
  private readonly anthropic: Anthropic;
  private poseidon: any;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly nullifierStore: NullifierStoreService,
    private readonly proofVerifier: ProofVerifierService,
    private readonly ethRateOracle: EthRateOracleService,
    private readonly refundSigner: RefundSignerService,
    private readonly slashingService: SlashingService,
  ) {
    // Example: Initialize Claude API client
    // Replace with your own API service client initialization
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not found. API calls will use mock responses.',
      );
    }
    this.anthropic = new Anthropic({ apiKey: apiKey || 'mock-key' });
  }

  /**
   * Initialize Poseidon hash (lazy initialization)
   */
  private async initialize() {
    if (this.poseidon) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Use require instead of dynamic import to avoid ESM issues
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
        const circomlibjs = require('circomlibjs');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.poseidon = await circomlibjs.buildPoseidon();
        this.logger.debug(
          'Poseidon hash initialized for secret key extraction',
        );
      } catch (error) {
        this.logger.error('Failed to initialize Poseidon hash', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Handle a ZK API request
   * Implements the full protocol: nullifier check, proof verification, API call, refund
   */
  async handleRequest(req: ZkApiRequestDto): Promise<ZkApiResponseDto> {
    const model = (req.model || 'claude-sonnet-4.6') as ClaudeModel;

    // 1. Check per-nullifier rate limit (before expensive operations)
    if (!this.nullifierStore.checkRateLimit(req.nullifier)) {
      throw new ForbiddenException(
        'Rate limit exceeded for this nullifier. Maximum 3 requests per minute.',
      );
    }

    // 2. Check nullifier for double-spend
    const existingSignal = this.nullifierStore.get(req.nullifier);
    if (existingSignal) {
      if (existingSignal.x !== req.signal.x) {
        // Double-spend detected! Two different signals with same nullifier
        this.logger.error(
          `Double-spend detected for nullifier ${req.nullifier}`,
        );

        // Extract secret key from two signals using field arithmetic
        const secretKey = await this.extractSecretKey(
          existingSignal,
          req.signal,
        );

        // Submit slashing transaction to smart contract
        this.logger.warn(`Secret key extracted: ${secretKey.slice(0, 10)}...`);

        if (this.slashingService.isEnabled()) {
          try {
            const txHash = await this.slashingService.slashDoubleSpend(
              secretKey,
              req.nullifier,
              existingSignal,
              req.signal,
            );
            this.logger.log(
              `Slashing transaction submitted: ${txHash || 'disabled'}`,
            );
          } catch (error) {
            this.logger.error('Failed to submit slashing transaction', error);
            // Continue to reject the request even if slashing fails
          }
        } else {
          this.logger.warn(
            'Slashing disabled - configure ANVIL_RPC_URL, ANVIL_PRIVATE_KEY, and ZK_CONTRACT_ADDRESS',
          );
        }

        throw new ForbiddenException(
          'Double-spend detected. Your secret key has been extracted and you will be slashed.',
        );
      }

      // Same nullifier with same signal = replay attack
      throw new ForbiddenException('Nullifier already used');
    }

    // 3. Verify ZK proof
    const valid = this.proofVerifier.verify(req.proof);
    if (!valid) {
      throw new UnauthorizedException('Invalid ZK proof');
    }

    // 4. Store nullifier to prevent reuse
    this.nullifierStore.set(req.nullifier, req.signal);

    // 5. Execute API request (Claude example)
    const response = await this.executeClaudeRequest(req.payload, model);

    // 6. Calculate actual cost in ETH
    const actualCost = await this.calculateCostInETH(
      response.usage.inputTokens,
      response.usage.outputTokens,
      model,
    );

    // 7. Generate refund ticket
    const refundValue = BigInt(req.maxCost) - actualCost;
    const refundTicket = await this.refundSigner.signRefund({
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
   * Extract secret key from two RLN signals using field arithmetic
   * Given: y1 = k + a*x1 and y2 = k + a*x2
   * Solve: k = (x2*y1 - x1*y2) / (x2 - x1) mod p
   */
  private async extractSecretKey(
    signal1: { x: string; y: string },
    signal2: { x: string; y: string },
  ): Promise<string> {
    await this.initialize();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const F = this.poseidon.F;

    const x1 = BigInt(signal1.x);
    const y1 = BigInt(signal1.y);
    const x2 = BigInt(signal2.x);
    const y2 = BigInt(signal2.y);

    // Prevent division by zero
    if (x2 === x1) {
      throw new Error('Invalid signals: x values are identical');
    }

    // Field arithmetic: k = (x2*y1 - x1*y2) / (x2 - x1) mod p
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const numerator = F.sub(F.mul(F.e(x2), F.e(y1)), F.mul(F.e(x1), F.e(y2)));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const denominator = F.sub(F.e(x2), F.e(x1));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const k = F.div(numerator, denominator);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return '0x' + F.toObject(k).toString(16).padStart(64, '0');
  }

  /**
   * Calculate cost in ETH (wei) for external API usage
   * Example implementation for Claude API - adapt for your external service
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
   * Execute external API request (Claude example)
   * Falls back to mock if ANTHROPIC_API_KEY is not configured
   * Replace this method with your own external API integration
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
   * Mock API response for development/testing
   * Example implementation for Claude - adapt for your external service
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
  async getServerPublicKey(): Promise<{ x: string; y: string }> {
    return this.refundSigner.getPublicKey();
  }
}
