import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestWithId } from '../request-id.types';

type ExceptionResponse = string | { message?: string | string[]; error?: string };

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>() as RequestWithId;
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException
      ? (exception.getResponse() as ExceptionResponse)
      : undefined;
    const detail = this.getSafeDetail(status, exceptionResponse);

    response.status(status).json({
      type: 'about:blank',
      title: status >= 500 ? 'Internal Server Error' : 'Request Error',
      status,
      detail,
      instance: request.url,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private getSafeDetail(status: number, exceptionResponse?: ExceptionResponse): string | string[] {
    if (status >= 500 || !exceptionResponse) {
      return 'The request could not be completed.';
    }

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    return exceptionResponse.message ?? exceptionResponse.error ?? 'The request is invalid.';
  }
}
