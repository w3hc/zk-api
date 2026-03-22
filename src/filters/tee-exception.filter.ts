import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * Global exception filter for TEE environments.
 *
 * Sanitizes all error responses to prevent information leakage.
 * Never exposes:
 * - Stack traces (can contain variable values)
 * - Internal state or implementation details
 * - User-supplied data that might be echoed back
 * - Database errors or query information
 *
 * This is critical for TEE security as error details could reveal
 * information about the enclave's internal state or data being processed.
 */
@Catch()
export class TeeExceptionFilter implements ExceptionFilter {
  /**
   * Catches and sanitizes all exceptions before sending responses.
   * @param exception The exception that was thrown
   * @param host The arguments host containing request/response context
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => {
        json: (body: { statusCode: number; message: string }) => void;
      };
    }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      message:
        status === 500
          ? 'Internal server error'
          : exception instanceof HttpException
            ? exception.message
            : 'Internal server error',
      // No stack. No request echo. No internal details.
    });
  }
}
