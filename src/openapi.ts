import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Single source of truth for the interactive Swagger document and the
 * versioned contract exported to docs/openapi.json.
 */
export function createOpenApiDocument(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Secure Service Desk API')
    .setDescription(
      'Secure, modular service desk API for portfolio demonstration. The MVP is single-tenant and manages identity, tickets, files, audit, notifications and reports in code.',
    )
    .setVersion('0.1.0')
    .setOpenAPIVersion('3.0.3')
    .setLicense('MIT', 'https://opensource.org/license/mit/')
    .addServer('http://localhost:3000/api', 'Local API base path')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addCookieAuth('service_desk_refresh', { type: 'apiKey', in: 'cookie' }, 'refreshCookie')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-csrf-token',
        description: 'Double-submit CSRF token returned by register or login.',
      },
      'csrfToken',
    )
    .addTag('system', 'System and health endpoints')
    .addTag('auth', 'Code-managed authentication and sessions')
    .addTag('tickets', 'Service desk tickets and comments')
    .addTag('notifications', 'Persistent in-app notifications')
    .addTag('attachments', 'Authorized ticket images stored in MongoDB GridFS')
    .addTag('reports', 'Asynchronous PDF reports')
    .addTag('governance', 'Administrator roles and audit trail')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // OpenAPI arrays mean OR. Refresh and CSRF are both required by the API, so
  // normalize the two generated decorators into one security requirement.
  for (const path of ['/auth/refresh', '/auth/logout']) {
    const operation = document.paths[path]?.post;
    if (operation) {
      operation.security = [{ refreshCookie: [], csrfToken: [] }];
    }
  }

  return document;
}
