import { Logger } from '@nestjs/common';
import {
  ApiProvider,
  ProviderConfig,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ValidationResult,
  CostEstimate,
  UsageMetrics,
  RateLimitConfig,
} from './provider.interface';
import { PricingModel } from '../../pricing/dto/pricing-model.dto';

/**
 * Abstract base class for API providers with common functionality
 */
export abstract class BaseProvider implements ApiProvider {
  protected readonly logger: Logger;
  protected config?: ProviderConfig;

  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Get hardcoded pricing configuration for this provider
   * This must be implemented by each provider with their specific pricing
   */
  abstract getPricingConfig(): PricingModel;

  /**
   * Initialize provider with configuration
   */
  abstract initialize(config: ProviderConfig): Promise<void>;

  /**
   * Execute API request
   */
  abstract execute(request: ProviderRequest): Promise<ProviderResponse>;

  /**
   * Estimate cost before request execution
   */
  abstract estimateCost(request: ProviderRequest): Promise<CostEstimate>;

  /**
   * Calculate actual cost from response
   */
  abstract calculateActualCost(
    response: ProviderResponse,
  ): Promise<UsageMetrics>;

  /**
   * Get rate limit configuration
   */
  abstract getRateLimits(): RateLimitConfig;

  /**
   * Validate request structure
   * Subclasses can override for provider-specific validation
   */
  validateRequest(request: ProviderRequest): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!request.endpoint) {
      errors.push('endpoint is required');
    }

    if (!request.method) {
      errors.push('method is required');
    }

    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) {
      errors.push('method must be GET, POST, PUT, or DELETE');
    }

    return Promise.resolve({
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  /**
   * Basic health check (ping)
   * Subclasses can override for provider-specific health checks
   */
  healthCheck(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      // Subclasses can implement actual health check
      const latencyMs = Date.now() - start;

      return Promise.resolve({
        status: 'healthy',
        latencyMs,
        lastCheck: new Date(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Promise.resolve({
        status: 'down',
        lastCheck: new Date(),
        message,
      });
    }
  }

  /**
   * Helper: Check if provider is initialized
   */
  protected ensureInitialized(): void {
    if (!this.config) {
      throw new Error(
        `Provider ${this.id} not initialized. Call initialize() first.`,
      );
    }
  }

  /**
   * Helper: Log request/response for debugging
   */
  protected logRequest(request: ProviderRequest, sanitize = true): void {
    if (sanitize) {
      // Remove sensitive data from logs
      const sanitized = {
        ...request,
        headers: this.sanitizeHeaders(request.headers || {}),
        body: request.body ? '[REDACTED]' : undefined,
      };
      this.logger.debug(`Request: ${JSON.stringify(sanitized)}`);
    } else {
      this.logger.debug(`Request: ${JSON.stringify(request)}`);
    }
  }

  /**
   * Helper: Sanitize headers (remove API keys, tokens, etc.)
   */
  protected sanitizeHeaders(
    headers: Record<string, string>,
  ): Record<string, string> {
    const sanitized = { ...headers };
    const sensitiveKeys = [
      'authorization',
      'api-key',
      'x-api-key',
      'x-auth-token',
    ];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Helper: Calculate retry delay with exponential backoff
   */
  protected calculateRetryDelay(attempt: number, baseDelay = 1000): number {
    return Math.min(baseDelay * Math.pow(2, attempt), 10000);
  }

  /**
   * Helper: Check if error is retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const err = error as {
      code?: string;
      response?: { status?: number };
    };

    // Network errors and 5xx errors are typically retryable
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return true;
    }

    const status = err.response?.status;
    if (typeof status === 'number' && status >= 500 && status < 600) {
      return true;
    }

    // Rate limit errors (429) are retryable
    if (status === 429) {
      return true;
    }

    return false;
  }
}
