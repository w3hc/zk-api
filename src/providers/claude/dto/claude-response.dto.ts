import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Content in Claude response
 */
export class ClaudeContentBlock {
  @ApiProperty({ enum: ['text'] })
  type: 'text';

  @ApiProperty()
  text: string;
}

/**
 * Usage information from Claude API
 */
export class ClaudeUsage {
  @ApiProperty({ description: 'Input tokens used' })
  input_tokens: number;

  @ApiProperty({ description: 'Output tokens generated' })
  output_tokens: number;

  @ApiPropertyOptional({ description: 'Cache creation input tokens' })
  cache_creation_input_tokens?: number;

  @ApiPropertyOptional({ description: 'Cache read input tokens' })
  cache_read_input_tokens?: number;
}

/**
 * Claude API response DTO
 */
export class ClaudeResponseDto {
  @ApiProperty({ description: 'Response ID' })
  id: string;

  @ApiProperty({ enum: ['message'] })
  type: 'message';

  @ApiProperty({ enum: ['assistant'] })
  role: 'assistant';

  @ApiProperty({ description: 'Response content', type: [ClaudeContentBlock] })
  content: ClaudeContentBlock[];

  @ApiProperty({ description: 'Model used' })
  model: string;

  @ApiProperty({
    description: 'Stop reason',
    enum: ['end_turn', 'max_tokens', 'stop_sequence'],
  })
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;

  @ApiPropertyOptional({ description: 'Stop sequence matched' })
  stopSequence?: string | null;

  @ApiProperty({ description: 'Token usage', type: ClaudeUsage })
  usage: ClaudeUsage;
}
