import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Custom throttler guard that hides rate limiting metadata
 *
 * The default ThrottlerGuard adds revealing headers like:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 * - Retry-After
 *
 * These headers can leak information about:
 * - Number of requests made by an IP/user
 * - When the rate limit window resets
 * - Whether specific actions consume more rate limit quota
 *
 * This custom guard prevents such metadata leakage by:
 * - Not adding rate limit headers to responses
 * - Providing generic error messages
 * - Preventing correlation of requests via rate limit state
 */
@Injectable()
export class ThrottlerMetadataGuard extends ThrottlerGuard {
  /**
   * Override canActivate to strip headers after parent processing
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = await super.canActivate(context);

    const response = context.switchToHttp().getResponse<{
      removeHeader: (name: string) => void;
    }>();

    // Remove all rate limiting metadata headers
    const rateLimitHeaders = [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
      'X-Retry-After',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ];

    rateLimitHeaders.forEach((header) => {
      response.removeHeader(header);
    });

    return result;
  }

  /**
   * Override error message to be generic and non-revealing
   */
  protected getErrorMessage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ExecutionContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    // Generic message that doesn't reveal rate limit details
    return Promise.resolve('Request temporarily unavailable');
  }
}
