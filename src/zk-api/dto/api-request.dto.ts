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
  @ApiProperty({ description: 'User prompt for Claude API' })
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

  @ApiProperty({ description: 'Claude model to use', required: false })
  @IsString()
  @IsOptional()
  model?: string;
}
