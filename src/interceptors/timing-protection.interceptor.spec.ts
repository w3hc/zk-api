import { TimingProtectionInterceptor } from './timing-protection.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('TimingProtectionInterceptor', () => {
  let interceptor: TimingProtectionInterceptor;

  beforeEach(() => {
    interceptor = new TimingProtectionInterceptor();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should enforce minimum response time', async () => {
    const mockExecutionContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: () => of('test-response'),
    };

    const startTime = Date.now();

    await new Promise<void>((resolve) => {
      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe(() => {
          const elapsed = Date.now() - startTime;
          // Should take at least MIN_RESPONSE_TIME (100ms) + jitter (0-20ms)
          expect(elapsed).toBeGreaterThanOrEqual(100);
          resolve();
        });
    });
  });

  it('should add random jitter to response time', async () => {
    const mockExecutionContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = {
      handle: () => of('test-response'),
    };

    const timings: number[] = [];

    // Execute multiple times and check for variance
    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      await new Promise<void>((resolve) => {
        interceptor
          .intercept(mockExecutionContext, mockCallHandler)
          .subscribe(() => {
            timings.push(Date.now() - startTime);
            resolve();
          });
      });
    }

    // Check that not all timings are identical (due to jitter)
    const uniqueTimings = new Set(timings);
    expect(uniqueTimings.size).toBeGreaterThan(1);
  });
});
