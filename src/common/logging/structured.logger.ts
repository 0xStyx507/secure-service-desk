import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug?(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose?(message: unknown, context?: string): void {
    this.write('trace', message, context);
  }

  fatal?(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(level: string, message: unknown, context?: string, trace?: string): void {
    const normalizedMessage =
      message instanceof Error
        ? {
            name: message.name,
            message: message.message,
            stack: message.stack,
          }
        : message;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: this.redact(
        typeof normalizedMessage === 'string'
          ? normalizedMessage
          : JSON.stringify(normalizedMessage, (key, value: unknown) =>
              /password|token|cookie|authorization|secret|private.?key/i.test(key)
                ? '[REDACTED]'
                : value,
            ),
      ),
      ...(trace ? { trace: this.redact(trace) } : {}),
    };

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }

  private redact(value: string): string {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
      .replace(
        /("(?:password|token|cookie|authorization|secret|private.?key)"\s*:\s*)"[^"]*"/gi,
        '$1"[REDACTED]"',
      );
  }
}
