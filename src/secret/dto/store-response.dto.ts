import { ApiProperty } from '@nestjs/swagger';

export class StoreResponseDto {
  @ApiProperty({
    description: 'The unique slot identifier for the stored secret',
    example: 'a1b2c3d4e5f6...',
  })
  slot: string;
}
