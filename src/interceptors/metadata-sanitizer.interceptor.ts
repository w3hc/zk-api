import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Metadata sanitization interceptor for TEE environments
 *
 * Strips potentially revealing HTTP headers and metadata from responses
 * to prevent information leakage about:
 * - Server implementation details
 * - Response timing information
 * - Request correlation identifiers
 * - Framework versions and stack details
 *
 * This is critical for TEE security to prevent metadata-based fingerprinting
 * and correlation attacks.
 */
@Injectable()
export class MetadataSanitizerInterceptor implements NestInterceptor {
  // Headers that reveal information and should be removed
  private readonly REVEALING_HEADERS = [
    'x-powered-by',
    'x-request-id',
    'x-correlation-id',
    'x-response-time',
    'x-runtime',
    'x-transaction-id',
    'x-trace-id',
    'x-span-id',
    'server',
    'etag',
    'last-modified',
    'via',
    'x-cache',
    'x-cache-hits',
    'x-served-by',
    'x-timer',
    'x-backend-server',
    'x-varnish',
    'age',
    'cf-ray', // Cloudflare
    'cf-cache-status', // Cloudflare
    'x-amz-cf-id', // AWS CloudFront
    'x-amz-cf-pop', // AWS CloudFront
    'x-azure-ref', // Azure
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<{
      removeHeader: (name: string) => void;
      setHeader: (name: string, value: string) => void;
    }>();

    return next.handle().pipe(
      tap(() => {
        // Remove all revealing headers
        this.REVEALING_HEADERS.forEach((header) => {
          response.removeHeader(header);
        });

        // Override cache control to prevent response caching
        // Cached responses could leak timing information
        response.setHeader(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, private',
        );
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');

        // Remove Vary header which can leak information about request processing
        response.removeHeader('Vary');
      }),
    );
  }
}
