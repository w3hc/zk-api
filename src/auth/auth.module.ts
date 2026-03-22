import { Module } from '@nestjs/common';
import { SiweService } from './siwe.service';
import { SiweGuard } from './siwe.guard';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [SiweService, SiweGuard],
  exports: [SiweService, SiweGuard],
})
export class AuthModule {}
