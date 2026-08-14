# Arquitectura técnica

Secure Service Desk es un monolito modular NestJS con dos procesos desplegables
desde la misma imagen:

```text
Cliente HTTP -> API NestJS -> MongoDB/Mongoose + GridFS
                       -> Redis/BullMQ -> Worker TypeScript
```

MongoDB contiene el estado durable: usuarios, sesiones, tickets, comentarios,
adjuntos, auditoría, notificaciones, reportes y fallos de jobs. Redis es
reconstruible y solo sirve para caché, locks y colas internas.

## Módulos activos

- `AuthModule` y `UsersModule`: identidad, sesiones, MFA y roles.
- `TicketsModule`: tickets, comentarios, workflow y autorización por recurso.
- `AttachmentsModule`: metadata y archivos GridFS.
- `AuditModule` y `GovernanceModule`: trazabilidad y operaciones ADMIN.
- `NotificationsModule` y `ReportsModule`: bandeja y reportes PDF.
- `JobsModule`: reintentos agotados y dead-letter handling.
- `InfrastructureModule`: Redis, BullMQ, caché y contexto por request.
- `HealthModule`: liveness y readiness de MongoDB/Redis.

## Seguridad y consistencia

- Roles `ADMIN`, `SUPPORT` y `USER`, con autorización en servicios y guards.
- JWT RS256, refresh tokens rotatorios en cookies HttpOnly y MFA TOTP.
- DTOs con `class-validator`, errores públicos seguros, Helmet y CORS allowlist.
- Tickets con optimistic concurrency y transiciones de workflow explícitas.
- Adjuntos JPEG/PNG con límite, firma, MIME, dimensiones, checksum y GridFS.
- `CONTENT_VALIDATED` no significa que exista antivirus/CDR.
- Auditoría durable y sanitización recursiva de secretos y tokens.

## Floci y cloud futuro

`compose.floci.yml` ofrece un perfil opcional de laboratorio de desarrollo. Floci
no forma parte del runtime de la API, no reemplaza MongoDB, Redis, BullMQ ni
GridFS y no se importa desde NestJS.

Los contracts están en `src/infrastructure/cloud/cloud.ports.ts`; los adapters
AWS-compatible consultan el endpoint configurado. En desarrollo ese endpoint
apunta al Floci externo en Docker. Los mocks siguen cubriendo los contratos sin
red; AWS real requiere permisos, pruebas de contrato y rollback separados.

## Despliegue

`compose.yml` ofrece MongoDB, Redis, API, worker y frontend Nginx. Solo Nginx
publica HTTP al host; el API queda en la red interna. La API y el worker usan la
misma imagen, pero son procesos independientes:

```text
node dist/main.js
node dist/worker.js
```
