import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { resolveErrorCode } from './error-codes';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const payload: Record<string, unknown> =
      typeof exceptionResponse === 'string'
        ? { statusCode: status, message: exceptionResponse }
        : { ...(exceptionResponse as Record<string, unknown>) };

    const message =
      typeof payload.message === 'string'
        ? payload.message
        : Array.isArray(payload.message)
          ? payload.message.join('; ')
          : undefined;

    const errorCode = resolveErrorCode(message);
    if (errorCode) {
      payload.error_code = errorCode;
      response.setHeader('X-Error-Code', String(errorCode));
    }

    response.status(status).json(payload);
  }
}
