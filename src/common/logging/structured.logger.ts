import { Injectable, LoggerService } from '@nestjs/common';
import { sanitizeSensitiveData } from '../security/sanitize-sensitive-data';

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
    const sanitizedMessage = sanitizeSensitiveData(normalizedMessage, {
      maxDepth: 5,
      maxProperties: 30,
      maxStringLength: 2_000,
    });
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message:
        typeof sanitizedMessage === 'string' ? sanitizedMessage : JSON.stringify(sanitizedMessage),
      ...(trace
        ? {
            trace: sanitizeSensitiveData(trace, { maxStringLength: 5_000 }) as string,
          }
        : {}),
    };

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
