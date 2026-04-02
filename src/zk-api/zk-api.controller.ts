import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ZkApiService } from './zk-api.service';
import { ZkApiRequestDto, RedeemRefundRequestDto } from './dto/api-request.dto';
import { ZkApiResponseDto } from './dto/api-response.dto';
import { BlockchainService } from './blockchain.service';
import { NullifierStoreService } from './nullifier-store.service';

@ApiTags('App')
@Controller('zk-api')
export class ZkApiController {
  constructor(
    private readonly zkApiService: ZkApiService,
    private readonly blockchainService: BlockchainService,
    private readonly nullifierStore: NullifierStoreService,
  ) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit anonymous API request with ZK proof',
    description:
      'Submit an external API request with zero-knowledge proof of solvency. ' +
      'Requires valid ZK proof and unique nullifier. Returns API response and signed refund ticket. ' +
      '(Example implementation: Claude API)',
  })
  @ApiResponse({
    status: 200,
    description: 'Request processed successfully',
    type: ZkApiResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid ZK proof',
  })
  @ApiResponse({
    status: 403,
    description: 'Double-spend detected or nullifier already used',
  })
  async handleRequest(
    @Body() request: ZkApiRequestDto,
  ): Promise<ZkApiResponseDto> {
    return this.zkApiService.handleRequest(request);
  }

  @Get('server-pubkey')
  @ApiOperation({
    summary: 'Get server public key',
    description:
      'Returns the server EdDSA public key for verifying refund ticket signatures',
  })
  @ApiResponse({
    status: 200,
    description: 'Server public key',
    schema: {
      type: 'object',
      properties: {
        x: { type: 'string', description: 'Public key x coordinate' },
        y: { type: 'string', description: 'Public key y coordinate' },
      },
    },
  })
  async getServerPublicKey(): Promise<{ x: string; y: string }> {
    return this.zkApiService.getServerPublicKey();
  }

  @Post('redeem-refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redeem a signed refund ticket',
    description:
      'Submit a signed refund ticket obtained from an API response to claim the refund onchain. ' +
      'The refund will be transferred to the specified recipient address.',
  })
  @ApiResponse({
    status: 200,
    description: 'Refund redeemed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        transactionHash: {
          type: 'string',
          description: 'Transaction hash of the refund redemption',
        },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid refund ticket or signature',
  })
  @ApiResponse({
    status: 403,
    description: 'Refund already redeemed or nullifier slashed',
  })
  @ApiResponse({
    status: 503,
    description: 'Blockchain service not available',
  })
  async redeemRefund(
    @Body() request: RedeemRefundRequestDto,
  ): Promise<{ success: boolean; transactionHash: string; message: string }> {
    if (!this.blockchainService.isAvailable()) {
      throw new Error('Blockchain service not available');
    }

    // Check if already redeemed
    const isRedeemed = await this.blockchainService.isRefundRedeemed(
      request.nullifier,
    );
    if (isRedeemed) {
      throw new Error('Refund already redeemed');
    }

    const txHash = await this.blockchainService.redeemRefund({
      idCommitment: request.idCommitment,
      nullifier: request.nullifier,
      refundValue: request.value,
      timestamp: request.timestamp,
      signature: request.signature,
      recipient: request.recipient,
    });

    // Track the redemption in our local store
    this.nullifierStore.markRefundRedeemed(request.nullifier, {
      idCommitment: request.idCommitment,
      value: request.value,
      timestamp: request.timestamp,
      recipient: request.recipient,
      txHash,
    });

    return {
      success: true,
      transactionHash: txHash,
      message: `Refund of ${request.value} wei redeemed successfully`,
    };
  }
}
