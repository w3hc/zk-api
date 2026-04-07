import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Content block for Claude messages
 */
export class ContentBlock {
  @ApiProperty({ enum: ['text', 'image'] })
  @IsString()
  type: 'text' | 'image';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * Message in Claude conversation
 */
export class ClaudeMessage {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  role: 'user' | 'assistant';

  @ApiProperty({
    description: 'Message content (string or array of content blocks)',
    oneOf: [
      { type: 'string' },
      { type: 'array', items: { $ref: '#/components/schemas/ContentBlock' } },
    ],
  })
  content: string | ContentBlock[];
}

/**
 * Claude API request DTO
 */
export class ClaudeRequestDto {
  @ApiProperty({
    description: 'Array of input messages',
    type: [ClaudeMessage],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaudeMessage)
  messages: ClaudeMessage[];

  @ApiPropertyOptional({
    description: 'Model to use',
    example: 'claude-sonnet-4-5-20250929',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Maximum tokens to generate',
    example: 8192,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTokens?: number;

  @ApiPropertyOptional({
    description: 'Temperature for sampling',
    example: 1.0,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @ApiPropertyOptional({
    description: 'System prompt',
  })
  @IsOptional()
  @IsString()
  system?: string;

  @ApiPropertyOptional({
    description: 'Top-p sampling',
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({
    description: 'Top-k sampling',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number;

  @ApiPropertyOptional({
    description: 'Stop sequences',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stopSequences?: string[];

  @ApiPropertyOptional({
    description: 'Enable streaming',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({
    description: 'Request metadata',
  })
  @IsOptional()
  metadata?: {
    user_id?: string;
  };
}
