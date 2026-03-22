import { ApiProperty } from '@nestjs/swagger';

export class AccessResponseDto {
  @ApiProperty({
    description: 'The secret stored in the slot',
    example: '苟全性命於亂世，不求聞達於諸侯。',
  })
  secret: string;
}
