import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyRequestDto {
  @ApiProperty({
    description: 'SIWE message string (complete formatted message)',
    example:
      'localhost wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\n\nURI: https://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: d4c595490e15489574ca06494154cbedd156db6629224481221c04f83ac32d9e\nIssued At: 2026-03-17T16:49:38.495Z',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: 'Ethereum signature of the SIWE message (hex string)',
    example:
      '0x45b04def8150c21468dc656bfa1c25cb029fef8cee4895b371412a6a0e48e9174722873b6f4a070f1f3a6731ac5dd91d02b236465c14859e8793bbfb2b3ad94e1b',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;
}
