import { MetadataSanitizerInterceptor } from './metadata-sanitizer.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('MetadataSanitizerInterceptor', () => {
  let interceptor: MetadataSanitizerInterceptor;
  let mockResponse: {
    removeHeader: jest.Mock;
    setHeader: jest.Mock;
  };

  beforeEach(() => {
    interceptor = new MetadataSanitizerInterceptor();
    mockResponse = {
      removeHeader: jest.fn(),
      setHeader: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should remove revealing headers', (done) => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of('test-response'),
    };

    interceptor
      .intercept(mockExecutionContext, mockCallHandler)
      .subscribe(() => {
        // Check that revealing headers are removed
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('x-powered-by');
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('x-request-id');
        expect(mockResponse.removeHeader).toHaveBeenCalledWith(
          'x-response-time',
        );
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('server');
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('etag');
        done();
      });
  });

  it('should set cache control headers to prevent caching', (done) => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of('test-response'),
    };

    interceptor
      .intercept(mockExecutionContext, mockCallHandler)
      .subscribe(() => {
        expect(mockResponse.setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, private',
        );
        expect(mockResponse.setHeader).toHaveBeenCalledWith(
          'Pragma',
          'no-cache',
        );
        expect(mockResponse.setHeader).toHaveBeenCalledWith('Expires', '0');
        done();
      });
  });

  it('should remove Vary header', (done) => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of('test-response'),
    };

    interceptor
      .intercept(mockExecutionContext, mockCallHandler)
      .subscribe(() => {
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('Vary');
        done();
      });
  });

  it('should remove cloud provider headers', (done) => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of('test-response'),
    };

    interceptor
      .intercept(mockExecutionContext, mockCallHandler)
      .subscribe(() => {
        // Cloudflare
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('cf-ray');
        expect(mockResponse.removeHeader).toHaveBeenCalledWith(
          'cf-cache-status',
        );

        // AWS
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('x-amz-cf-id');
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('x-amz-cf-pop');

        // Azure
        expect(mockResponse.removeHeader).toHaveBeenCalledWith('x-azure-ref');
        done();
      });
  });
});
