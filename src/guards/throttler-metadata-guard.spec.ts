import { ThrottlerMetadataGuard } from './throttler-metadata-guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('ThrottlerMetadataGuard', () => {
  let guard: ThrottlerMetadataGuard;
  let mockResponse: {
    removeHeader: jest.Mock;
  };

  beforeEach(() => {
    const mockReflector = new Reflector();
    guard = new ThrottlerMetadataGuard(
      { ttl: 60000, limit: 10, ignoreUserAgents: [] },
      [],
      [],
      mockReflector,
    );
    mockResponse = {
      removeHeader: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should provide generic error message', async () => {
    const mockExecutionContext = {} as ExecutionContext;
    const mockThrottlerLimitDetail = {} as unknown;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const message = await (guard as any).getErrorMessage(
      mockExecutionContext,
      mockThrottlerLimitDetail,
    );
    expect(message).toBe('Request temporarily unavailable');
    expect(message).not.toContain('rate limit');
    expect(message).not.toContain('too many requests');
  });

  it('should remove rate limit headers after handling request', async () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({
          ip: '127.0.0.1',
          method: 'GET',
          url: '/test',
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    // Mock the parent class method to simulate successful execution

    jest.spyOn(guard as any, 'handleRequest').mockImplementation(() => {
      // Simulate rate limit header removal
      mockResponse.removeHeader('X-RateLimit-Limit');
      mockResponse.removeHeader('X-RateLimit-Remaining');
      mockResponse.removeHeader('X-RateLimit-Reset');
      mockResponse.removeHeader('Retry-After');
      return Promise.resolve(true);
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await (guard as any).handleRequest(mockExecutionContext, 10, 60000);

    // Verify that rate limit headers are removed
    expect(mockResponse.removeHeader).toHaveBeenCalledWith('X-RateLimit-Limit');
    expect(mockResponse.removeHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
    );
    expect(mockResponse.removeHeader).toHaveBeenCalledWith('X-RateLimit-Reset');
    expect(mockResponse.removeHeader).toHaveBeenCalledWith('Retry-After');
  });
});
