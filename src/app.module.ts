import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SecretsService } from './config/secrets.service';
import { AttestationController } from './attestation/attestation.controller';
import { TeePlatformService } from './attestation/tee-platform.service';
import { HealthController } from './health/health.controller';
import { validateEnvironment } from './config/env.validation';
import { SecretModule } from './secret/secret.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // Environment variable validation
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    // Rate limiting to prevent DoS attacks
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // 10 requests per minute per IP
      },
    ]),
    AuthModule,
    SecretModule,
  ],
  controllers: [AppController, AttestationController, HealthController],
  providers: [AppService, SecretsService, TeePlatformService],
  exports: [SecretsService, TeePlatformService],
})
export class AppModule {}
