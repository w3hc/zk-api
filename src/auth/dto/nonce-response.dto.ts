import { ApiProperty } from '@nestjs/swagger';

export class NonceResponseDto {
  @ApiProperty({
    description: 'Random nonce for SIWE message',
    example: 'a1b2c3d4e5f6...',
  })
  nonce: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp when nonce was created',
    example: '2026-03-17T16:00:00.000Z',
  })
  issuedAt: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp when nonce expires',
    example: '2026-03-17T16:05:00.000Z',
  })
  expiresAt: string;
}
