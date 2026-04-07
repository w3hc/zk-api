import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UsageDto {
  // Universal fields
  @ApiProperty({ description: 'Total billable units' })
  units: number;

  @ApiProperty({
    description: 'Unit type',
    enum: [
      'tokens',
      'calls',
      'bytes',
      'seconds',
      'images',
      'credits',
      'custom',
    ],
  })
  unitType:
    | 'tokens'
    | 'calls'
    | 'bytes'
    | 'seconds'
    | 'images'
    | 'credits'
    | 'custom';

  @ApiProperty({ description: 'Calculated cost in USD' })
  costUSD: number;

  // Optional breakdown (provider-specific)
  @ApiPropertyOptional({ description: 'Breakdown of usage by category' })
  breakdown?: {
    input?: number; // Input tokens/units
    output?: number; // Output tokens/units
    cacheRead?: number; // Cached units (discounted)
    cacheWrite?: number; // Cache creation units
    storage?: number; // Storage units (GB-months)
    transfer?: number; // Data transfer (GB)
    compute?: number; // Compute seconds
    [key: string]: number | undefined; // Provider-specific fields
  };

  // Metadata
  @ApiPropertyOptional({ description: 'Provider ID' })
  provider?: string;

  @ApiPropertyOptional({ description: 'API endpoint' })
  endpoint?: string;

  @ApiPropertyOptional({ description: 'Timestamp' })
  timestamp?: Date;

  // Deprecated fields (backwards compatibility)
  @ApiPropertyOptional({
    description: 'Number of input tokens (deprecated, use breakdown.input)',
  })
  inputTokens?: number;

  @ApiPropertyOptional({
    description: 'Number of output tokens (deprecated, use breakdown.output)',
  })
  outputTokens?: number;
}

export class RefundTicketDto {
  @ApiProperty({ description: 'Nullifier this refund is for' })
  nullifier: string;

  @ApiProperty({ description: 'Refund value in wei' })
  value: string;

  @ApiProperty({ description: 'Timestamp when refund was issued' })
  timestamp: number;

  @ApiProperty({ description: 'Server signature (EdDSA)' })
  signature: {
    R8x: string;
    R8y: string;
    S: string;
  };
}

export class ZkApiResponseDto {
  @ApiProperty({ description: 'External API response content' })
  response: string;

  @ApiProperty({ description: 'Actual cost in wei' })
  actualCost: string;

  @ApiProperty({ description: 'Signed refund ticket', type: RefundTicketDto })
  refundTicket: RefundTicketDto;

  @ApiProperty({
    description: 'Usage metrics (example: token counts)',
    type: UsageDto,
  })
  usage: UsageDto;
}
