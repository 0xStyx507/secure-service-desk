import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/global-http-exception.filter';
import { StructuredLogger } from './common/logging/structured.logger';
import type { RequestWithId } from './common/request-id.types';
import { RequestContextService } from './infrastructure/context/request-context.service';
import { createOpenApiDocument } from './openapi';

export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: new StructuredLogger(),
    abortOnError: false,
  });
  configureHttpApp(app, app.get(ConfigService), app.get(RequestContextService));

  return app;
}

export function configureHttpApp(
  app: INestApplication,
  configService: ConfigService,
  requestContext?: RequestContextService,
): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.use(helmet());
  app.enableCors({
    origin: configService.get<string[]>('corsOrigins', []),
    credentials: true,
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestWithId = request as RequestWithId;
    const requestId = request.header('x-request-id') ?? randomUUID();

    requestWithId.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const authenticatedRequest = request as Request & {
        user?: { sub?: string };
      };
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'http_request_completed',
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
          ...(authenticatedRequest.user?.sub ? { actorId: authenticatedRequest.user.sub } : {}),
        })}\n`,
      );
    });
    if (requestContext) {
      requestContext.run({ requestId }, next);
      return;
    }
    next();
  });
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document);
}

async function bootstrap(): Promise<void> {
  let app: INestApplication | undefined;
  try {
    app = await createApp();
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    const configService = app.get(ConfigService);
    const port = configService.get<number>('port', 3000);

    await app.listen(port);
  } catch (error) {
    await app?.close().catch(() => undefined);
    throw error;
  }
}

if (require.main === module) {
  void bootstrap().catch((error: unknown) => {
    new StructuredLogger().error(error, undefined, 'ApiBootstrap');
    process.exitCode = 1;
  });
}
