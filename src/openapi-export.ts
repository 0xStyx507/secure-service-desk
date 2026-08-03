import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = createOpenApiDocument(app);
  const outputPath = resolve(process.cwd(), 'docs/openapi.json');

  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
}

if (require.main === module) {
  void exportOpenApi().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
