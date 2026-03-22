import { Controller, Get } from '@nestjs/common';

/**
 * Health check endpoint for monitoring and load balancers.
 * Returns minimal information to avoid leaking internal state.
 */
@Controller('health')
export class HealthController {
  /**
   * Basic health check endpoint.
   * @returns Health status object
   */
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe - indicates if the service is ready to accept traffic.
   * @returns Readiness status
   */
  @Get('ready')
  ready() {
    // In a real implementation, check if KMS secrets are loaded,
    // database connections are ready, etc.
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Liveness probe - indicates if the service is alive.
   * @returns Liveness status
   */
  @Get('live')
  live() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }
}
