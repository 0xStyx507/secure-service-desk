import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StructuredLogger } from './common/logging/structured.logger';
import { WorkerAppModule } from './worker-app.module';

export function createWorkerContext(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(WorkerAppModule, {
    logger: new StructuredLogger(),
    abortOnError: false,
  });
}

async function bootstrapWorker(): Promise<void> {
  const context = await createWorkerContext();
  context.enableShutdownHooks(['SIGINT', 'SIGTERM']);
}

if (require.main === module) {
  void bootstrapWorker().catch((error: unknown) => {
    new StructuredLogger().error(error, undefined, 'WorkerBootstrap');
    process.exitCode = 1;
  });
}
