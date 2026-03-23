import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SecretService } from './secret.service';

@ApiTags('Chest')
@Controller('chest')
export class SecretController {
  constructor(private readonly secretService: SecretService) {}
}
