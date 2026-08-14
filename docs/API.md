# Contrato API

Swagger UI está disponible en `/api/docs` cuando el stack está levantado. El
contrato versionado se encuentra en [`openapi.json`](openapi.json) y se genera
desde los decorators NestJS:

```powershell
pnpm build
pnpm openapi:export
```

CI verifica que el archivo generado no tenga drift respecto al repositorio.

## Grupos principales

- `/api/auth`: registro, login, MFA, refresh, logout y sesión actual.
- `/api/tickets`: creación, consulta, búsqueda, filtros, workflow, comentarios
  y watchers.
- `/api/tickets/:id/attachments`: carga y metadata autorizada.
- `/api/attachments/:id/content`: descarga autorizada.
- `/api/notifications`: bandeja interna y estado de lectura.
- `/api/reports`: creación, estado y descarga de reportes PDF.
- `/api/admin`: roles, auditoría, dead letters y reproceso.
- `/api/mcp`: herramientas MCP autenticadas.
- `/api/health/live` y `/api/health/ready`: salud operativa.

Cada ruta declara DTO, respuesta, errores, autenticación y autorización en el
código NestJS y su contrato OpenAPI.
