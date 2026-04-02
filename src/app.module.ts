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
    // Rate limiting to prevent DoS attacks (with metadata protection)
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // 10 requests per minute per IP
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
    // Global metadata leakage protection
    {
      provide: APP_GUARD,
      useClass: ThrottlerMetadataGuard,
    },
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
