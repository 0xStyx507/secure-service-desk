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
import { MetricsService } from './infrastructure/observability/metrics.service';

export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: new StructuredLogger(),
    abortOnError: false,
  });
  configureHttpApp(
    app,
    app.get(ConfigService),
    app.get(RequestContextService),
    app.get(MetricsService),
  );

  return app;
}

export function configureHttpApp(
  app: INestApplication,
  configService: ConfigService,
  requestContext?: RequestContextService,
  metricsService?: MetricsService,
): void {
  configureHttpTransport(app, configService);
  configureHttpMiddleware(app, configService, requestContext, metricsService);
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  configureSwagger(app);
}

function configureHttpTransport(app: INestApplication, configService: ConfigService): void {
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', configService.get<number>('trustProxyHops', 0));
  app.setGlobalPrefix('api');
}

function configureHttpMiddleware(
  app: INestApplication,
  configService: ConfigService,
  requestContext?: RequestContextService,
  metricsService?: MetricsService,
): void {
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
  app.use(createRequestMiddleware(requestContext, metricsService));
}

function createRequestMiddleware(
  requestContext?: RequestContextService,
  metricsService?: MetricsService,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    const requestWithId = request as RequestWithId;
    const requestId = request.header('x-request-id') ?? randomUUID();
    requestWithId.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    requestStartTimes.set(request, process.hrtime.bigint());
    response.once('finish', () =>
      recordCompletedRequest(request, response, requestId, metricsService),
    );
    if (requestContext) {
      requestContext.run({ requestId }, next);
      return;
    }
    next();
  };
}

function recordCompletedRequest(
  request: Request,
  response: Response,
  requestId: string,
  metricsService?: MetricsService,
): void {
  const durationMs = Number(process.hrtime.bigint() - requestStartedAt(request)) / 1_000_000;
  const authenticatedRequest = request as Request & { user?: { sub?: string } };
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
  metricsService?.increment('secure_service_desk_http_requests_total', {
    method: request.method,
    route: request.route?.path ?? 'unmatched',
    status: String(response.statusCode),
  });
  metricsService?.increment(
    'secure_service_desk_http_request_duration_ms_total',
    { method: request.method },
    Number(durationMs.toFixed(2)),
  );
}

const requestStartTimes = new WeakMap<Request, bigint>();

function requestStartedAt(request: Request): bigint {
  const existing = requestStartTimes.get(request);
  if (existing) return existing;
  const startedAt = process.hrtime.bigint();
  requestStartTimes.set(request, startedAt);
  return startedAt;
}

function configureSwagger(app: INestApplication): void {
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
