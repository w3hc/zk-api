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
import { ZkApiRequestDto } from './dto/api-request.dto';
import { ZkApiResponseDto } from './dto/api-response.dto';

@ApiTags('zk-api')
@Controller('zk-api')
export class ZkApiController {
  constructor(private readonly zkApiService: ZkApiService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit anonymous API request with ZK proof',
    description:
      'Submit a Claude API request with zero-knowledge proof of solvency. ' +
      'Requires valid ZK proof and unique nullifier. Returns Claude response and signed refund ticket.',
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
  getServerPublicKey(): { x: string; y: string } {
    return this.zkApiService.getServerPublicKey();
  }
}
