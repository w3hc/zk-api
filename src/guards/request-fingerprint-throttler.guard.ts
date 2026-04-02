import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * Request fingerprint-based throttler guard
 *
 * Instead of using IP addresses (which are anonymized for privacy),
 * this guard creates a fingerprint from the request body content and time window.
 * This prevents rapid repeated submissions of identical requests.
 *
 * Note: This works alongside per-nullifier rate limiting in NullifierStoreService.
 */
@Injectable()
export class RequestFingerprintThrottler extends ThrottlerGuard {
  /**
   * Generate a unique tracker for rate limiting based on request content
   * Uses a hash of the request body + time window for privacy-preserving rate limiting
   */
  protected getTracker(req: Record<string, any>): Promise<string> {
    // Create fingerprint from request body
    const body = JSON.stringify(req.body || {});

    // Add time window to allow same request after window expires
    // Using 1-minute windows to align with rate limit TTL
    const timeWindow = Math.floor(Date.now() / 60000);

    // Hash the fingerprint to prevent storing raw request data
    const fingerprint = createHash('sha256')
      .update(body + timeWindow.toString())
      .digest('hex');

    return Promise.resolve(fingerprint);
  }

  /**
   * Override to provide better error messages
   */
  protected throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(
      'Too many requests with similar content. Please wait before retrying.',
    );
  }
}
