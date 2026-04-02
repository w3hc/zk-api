import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SecretsService } from './config/secrets.service';
import { AttestationController } from './attestation/attestation.controller';
import { TeePlatformService } from './attestation/tee-platform.service';
import { HealthController } from './health/health.controller';
import { validateEnvironment } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { ZkApiModule } from './zk-api/zk-api.module';
import { ThrottlerMetadataGuard } from './guards/throttler-metadata-guard';
import { RequestFingerprintThrottler } from './guards/request-fingerprint-throttler.guard';
import { TimingProtectionInterceptor } from './interceptors/timing-protection.interceptor';
import { MetadataSanitizerInterceptor } from './interceptors/metadata-sanitizer.interceptor';
import { RequestSanitizerMiddleware } from './middleware/request-sanitizer.middleware';

@Module({
  imports: [
    // Environment variable validation
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    // Hybrid rate limiting:
    // 1. Request fingerprint-based (privacy-preserving)
    // 2. Per-nullifier (in ZkApiService via NullifierStoreService)
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // 10 requests per minute per request fingerprint
      },
    ]),
    AuthModule,
    ZkApiModule,
  ],
  controllers: [AppController, AttestationController, HealthController],
  providers: [
    AppService,
    SecretsService,
    TeePlatformService,
    // Hybrid rate limiting with privacy protection
    {
      provide: APP_GUARD,
      useClass: RequestFingerprintThrottler, // Request content-based rate limiting
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerMetadataGuard, // Metadata protection for rate limiting
    },
    // Global metadata leakage protection
    {
      provide: APP_INTERCEPTOR,
      useClass: TimingProtectionInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetadataSanitizerInterceptor,
    },
  ],
  exports: [SecretsService, TeePlatformService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply request sanitization to all routes
    consumer.apply(RequestSanitizerMiddleware).forRoutes('*');
  }
}
