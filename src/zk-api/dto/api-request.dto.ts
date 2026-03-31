import {
  IsString,
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RlnSignalDto {
  @ApiProperty({ description: 'RLN signal x value' })
  @IsString()
  @IsNotEmpty()
  x: string;

  @ApiProperty({ description: 'RLN signal y value' })
  @IsString()
  @IsNotEmpty()
  y: string;
}

export class ZkApiRequestDto {
  @ApiProperty({ description: 'Request payload for external API service' })
  @IsString()
  @IsNotEmpty()
  payload: string;

  @ApiProperty({ description: 'RLN nullifier (prevents double-spend)' })
  @IsString()
  @IsNotEmpty()
  nullifier: string;

  @ApiProperty({
    description: 'RLN signal for slashing detection',
    type: RlnSignalDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => RlnSignalDto)
  signal: RlnSignalDto;

  @ApiProperty({ description: 'ZK-STARK proof' })
  @IsString()
  @IsNotEmpty()
  proof: string;

  @ApiProperty({ description: 'Maximum cost user is willing to pay (in wei)' })
  @IsString()
  @IsNotEmpty()
  maxCost: string;

  @ApiProperty({
    description: 'Model/service variant to use (example: claude-sonnet-4.6)',
    required: false,
  })
  @IsString()
  @IsOptional()
  model?: string;
}

export class RefundSignatureDto {
  @ApiProperty({ description: 'EdDSA signature R8x component' })
  @IsString()
  @IsNotEmpty()
  R8x: string;

  @ApiProperty({ description: 'EdDSA signature R8y component' })
  @IsString()
  @IsNotEmpty()
  R8y: string;

  @ApiProperty({ description: 'EdDSA signature S component' })
  @IsString()
  @IsNotEmpty()
  S: string;
}

export class RedeemRefundRequestDto {
  @ApiProperty({ description: 'Identity commitment (Hash of secret key)' })
  @IsString()
  @IsNotEmpty()
  idCommitment: string;

  @ApiProperty({ description: 'Nullifier from the API request' })
  @IsString()
  @IsNotEmpty()
  nullifier: string;

  @ApiProperty({ description: 'Refund value in wei' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ description: 'Timestamp when refund was issued' })
  @IsNotEmpty()
  timestamp: number;

  @ApiProperty({
    description: 'Server EdDSA signature on refund ticket',
    type: RefundSignatureDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => RefundSignatureDto)
  signature: RefundSignatureDto;

  @ApiProperty({ description: 'Recipient address for the refund' })
  @IsString()
  @IsNotEmpty()
  recipient: string;
}
