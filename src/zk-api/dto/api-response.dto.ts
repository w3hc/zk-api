import { ApiProperty } from '@nestjs/swagger';

export class UsageDto {
  @ApiProperty({ description: 'Number of input tokens' })
  inputTokens: number;

  @ApiProperty({ description: 'Number of output tokens' })
  outputTokens: number;
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
  @ApiProperty({ description: 'Claude API response content' })
  response: string;

  @ApiProperty({ description: 'Actual cost in wei' })
  actualCost: string;

  @ApiProperty({ description: 'Signed refund ticket', type: RefundTicketDto })
  refundTicket: RefundTicketDto;

  @ApiProperty({ description: 'Token usage', type: UsageDto })
  usage: UsageDto;
}
