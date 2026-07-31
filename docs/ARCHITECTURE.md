# Arquitectura técnica

El sistema es un monolito modular NestJS con dos procesos desplegables desde la
misma imagen:

```text
Cliente HTTP
    |
    v
API NestJS ─────> MongoDB/Mongoose + GridFS (fuente de verdad)
    |                       ^
    v                       |
Redis/BullMQ ─────> Worker TypeScript
                        ├── notificaciones internas
                        └── reportes PDF
```

`src/main.ts` inicia únicamente HTTP. `src/worker.ts` inicia los procesadores de
colas, su reconciliador y dead-letter handling sin abrir un servidor web.

## Módulos activos

- `AuthModule` y `UsersModule`: identidad, sesiones, roles y bootstrap.
- `TicketsModule`: tickets, comentarios, workflow y autorización por recurso.
- `AttachmentsModule`: metadata y archivos GridFS.
- `AuditModule` y `GovernanceModule`: trazabilidad y operaciones ADMIN.
- `NotificationsModule`: bandeja persistente y productor BullMQ.
- `ReportsModule`: solicitudes y descarga de PDF.
- `JobsModule`: fallos agotados y dead-letter.
- `InfrastructureModule`: Redis, BullMQ, caché y contexto por request.
- `HealthModule`: liveness y readiness MongoDB/Redis.

## Fronteras de datos

MongoDB contiene estado durable: usuarios, sesiones, tickets, comentarios,
metadata de adjuntos, GridFS, auditoría, notificaciones, reportes y fallos de
jobs. Redis puede perderse y reconstruirse sin destruir datos del negocio.

Las consultas cacheadas incorporan versión, filtros y alcance del actor. Una
mutación incrementa la versión; si Redis está caído, la API sigue operando sobre
MongoDB y la posible entrada anterior expira por TTL.

## Autorización

- `USER`: crea tickets y accede únicamente como requester o watcher.
- `SUPPORT`: gestiona la cola completa del service desk monoinquilino.
- `ADMIN`: mismo alcance de tickets y funciones de gobierno.
- Comentarios `INTERNAL`: solo `SUPPORT`/`ADMIN`.
- Adjuntos, comentarios y reportes vuelven a verificar el recurso o propietario.

El diseño actual no ofrece aislamiento multi-tenant.

## Consistencia y resiliencia

- Los tickets usan `version` y optimistic concurrency.
- El workflow permite únicamente transiciones explícitas.
- Los refresh tokens rotan mediante actualización atómica y familia.
- Notificaciones/reportes quedan `PENDING`/`QUEUED` en MongoDB antes de encolarse.
- El worker reconcilia esos estados cada minuto si Redis no estaba disponible.
- Los jobs usan IDs estables, tres intentos, backoff exponencial y jitter.
- Los fallos agotados se guardan en `job_failures` y solo ADMIN puede
  reejecutarlos.

Los efectos derivados no convierten una mutación ya persistida en un falso error
HTTP. Una evolución futura puede adoptar transactional outbox sobre un replica
set para atomicidad estricta entre documento y evento.

## Seguridad de archivos

Solo se aceptan JPEG/PNG, hasta 5 MB, con coincidencia MIME/firma, límites de
dimensiones, filename normalizado, SHA-256 y deduplicación por ticket. La descarga
usa autorización por ticket, `Content-Disposition: attachment` y `nosniff`.

No existe escaneo antivirus en esta versión; es un riesgo residual explícito.

## Despliegue

`compose.yml` ofrece MongoDB y Redis persistentes para desarrollo. El
`Dockerfile` multi-stage produce una imagen no-root que puede ejecutar:

```text
node dist/main.js
node dist/worker.js
```
