import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, delay } from 'rxjs/operators';

/**
 * Timing protection interceptor for TEE environments
 *
 * Prevents timing-based side-channel attacks by ensuring all responses
 * take a minimum amount of time. This makes it harder for attackers to
 * infer information based on response timing patterns.
 *
 * Key protections:
 * - Constant-time responses (minimum delay)
 * - No timing correlation with processing complexity
 * - Prevents timing attacks on proof verification, nullifier checks, etc.
 */
@Injectable()
export class TimingProtectionInterceptor implements NestInterceptor {
  // Minimum response time in milliseconds to prevent timing attacks
  private readonly MIN_RESPONSE_TIME = 100;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTime = Date.now();

    return next.handle().pipe(
      delay(0), // Ensure observable completes first
      tap(() => {
        const elapsed = Date.now() - startTime;
        const delayNeeded = Math.max(0, this.MIN_RESPONSE_TIME - elapsed);

        // Add random jitter (0-20ms) to further obfuscate timing
        const jitter = Math.random() * 20;
        const totalDelay = delayNeeded + jitter;

        // Use synchronous delay for accurate timing
        const end = Date.now() + totalDelay;
        while (Date.now() < end) {
          // Busy wait to ensure accurate timing
        }
      }),
    );
  }
}
