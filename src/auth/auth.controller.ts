import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SiweService } from './siwe.service';
import { NonceResponseDto } from './dto/nonce-response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly siweService: SiweService) {}

  @Post('nonce')
  @ApiOperation({
    summary: 'Generate a nonce for SIWE authentication',
    description:
      'Returns a random nonce that must be included in the SIWE message. ' +
      'The nonce is single-use and expires after 5 minutes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Nonce generated successfully',
    type: NonceResponseDto,
  })
  generateNonce(): NonceResponseDto {
    const nonce = this.siweService.generateNonce();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    return {
      nonce,
      issuedAt,
      expiresAt,
    };
  }
}
