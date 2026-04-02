import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

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
  // Lower delay in test environment for faster test execution
  private readonly MIN_RESPONSE_TIME =
    process.env.NODE_ENV === 'test' ? 10 : 100;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTime = Date.now();

    return next.handle().pipe(
      mergeMap(async (data: unknown) => {
        const elapsed = Date.now() - startTime;
        const delayNeeded = Math.max(0, this.MIN_RESPONSE_TIME - elapsed);

        // Add random jitter (0-20ms) to further obfuscate timing
        const jitter = Math.random() * 20;
        const totalDelay = delayNeeded + jitter;

        // Non-blocking delay using Promise to avoid blocking event loop
        await new Promise((resolve) => setTimeout(resolve, totalDelay));

        return data;
      }),
    );
  }
}
