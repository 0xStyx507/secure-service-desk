# Reestructuración V2 — Secure Service Desk API

Fecha: 2026-07-30
Estado: arquitectura objetivo única, implementada como base funcional.

## Decisión

Construir el service desk dentro del repositorio con TypeScript, NestJS,
MongoDB, GridFS, Redis y BullMQ. El runtime funcional no depende de Keycloak,
RapidAPI, Jira, GitHub, Cloudinary ni otro SaaS.

MongoDB es la fuente de verdad. Redis contiene caché reconstruible y transporte
de jobs. La API y los workers son procesos separados construidos desde el mismo
código e imagen.

## Alcance del MVP

El sistema es monoinquilino:

- `USER` crea y consulta tickets donde es requester o watcher.
- `SUPPORT` opera la cola completa.
- `ADMIN` añade gobierno, roles, auditoría y dead-letter.

El aislamiento multi-tenant queda fuera de esta versión y requerirá `tenantId`
en documentos, queries, caché, auditoría y jobs.

## Módulos

| Módulo                | Responsabilidad                               | Estado       |
| --------------------- | --------------------------------------------- | ------------ |
| `UsersModule`         | usuarios, roles, bloqueo y authzVersion       | Implementado |
| `AuthModule`          | login, JWT RS256, refresh, logout y bootstrap | Implementado |
| `TicketsModule`       | tickets, comentarios, workflow y autorización | Implementado |
| `AttachmentsModule`   | metadata e imágenes mediante GridFS           | Implementado |
| `AuditModule`         | eventos de seguridad y negocio                | Implementado |
| `NotificationsModule` | notificaciones internas persistidas           | Implementado |
| `ReportsModule`       | solicitudes y resultados PDF                  | Implementado |
| `JobsModule`          | reintentos, reconciliación y dead-letter      | Implementado |
| `HealthModule`        | liveness y readiness MongoDB/Redis            | Implementado |

## Persistencia

No se ejecutan operaciones destructivas sobre las colecciones existentes. La
colección histórica `autos` permanece fuera del dominio activo.

Colecciones incorporadas:

- `users`
- `refresh_sessions`
- `system_bootstrap_state`
- `role_mutation_locks`
- `tickets`
- `ticket_comments`
- `attachment_metadata`
- `attachments.files` y `attachments.chunks`
- `audit_events`
- `notifications`
- `reports`
- `job_failures`
- `counters`

`compose.yml` usa volúmenes nombrados para MongoDB y Redis.

## Autenticación propia

- Registro público únicamente con rol `USER`.
- Password hashing con `scrypt`, salt aleatorio y comparación timing-safe.
- JWT RS256 con claves RSA de 3072 bits o más, `kid`, `iss`, `aud`, `sub`,
  roles, `authzVersion`, `jti`, `iat` y `exp`.
- Verificación del usuario activo y `authzVersion` en cada request protegido.
- Refresh token aleatorio y opaco, persistido solo como SHA-256.
- Rotación por familia, revocación, detección de reuse y expiración TTL.
- Cookie HttpOnly, `SameSite=Strict`, `Secure` y prefijo `__Host-` obligatorios
  en producción.
- Double-submit CSRF, validación de origen y parser defensivo de cookies.
- Rate limiting específico y bloqueo temporal de login.
- Bootstrap ADMIN explícito y registrado una sola vez.

La rotación solapada de múltiples claves y JWKS interno queda como evolución.

## Tickets

Estados: `OPEN`, `IN_PROGRESS`, `WAITING_USER`, `RESOLVED`, `CLOSED`.

Prioridades: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

La máquina de estados impide saltos arbitrarios. Los tickets usan número humano,
requester, assignee, watchers, comentarios públicos/internos, resolución,
timestamps y optimistic concurrency mediante `version`.

Las listas ofrecen paginación acotada, filtros, búsqueda de texto y caché
versionada por alcance.

## Adjuntos con GridFS

La versión implementada acepta únicamente JPEG/PNG de hasta 5 MB:

- coincidencia entre MIME y firma;
- límites de dimensiones/píxeles;
- filename normalizado;
- checksum SHA-256 y deduplicación por ticket;
- autorización antes de listar, subir o descargar;
- descarga como attachment con `nosniff`;
- auditoría de la carga.

No existe antivirus/CDR. `CONTENT_VALIDATED` describe validación estructural, no
certifica ausencia de malware. La cuarentena y re-encoding son evoluciones
pendientes.

## Auditoría

Se registran actor, acción, recurso, request ID, timestamp y metadata limitada.
Las claves asociadas a passwords, tokens, cookies, autorización o secretos se
redactan. Los eventos son consultables únicamente por ADMIN.

## Redis, BullMQ y workers

- Caché de consultas frecuentes con TTL e invalidación por versión.
- Colas `reports` y `notifications`.
- `src/worker.ts` ejecuta los procesadores fuera del proceso HTTP.
- Jobs con payload mínimo, ID estable, tres intentos, backoff exponencial y
  jitter.
- Estados MongoDB `QUEUED`/`PENDING` antes de encolar.
- Reconciliación periódica cuando Redis estuvo fuera de servicio.
- Fallos agotados en `job_failures`.
- Inspección y reproceso allowlisted, autenticado y auditado para ADMIN.

## Supply chain y calidad

- Dockerfile multi-stage y usuario runtime no-root.
- Dependabot para npm, GitHub Actions y Docker.
- CI con TypeScript, Jest, Supertest, build e imagen Trivy.
- Swagger/OpenAPI y Problem Details.
- Helmet, CORS allowlist, throttling y logs JSON con request ID.

## Laboratorio cloud local

`compose.floci.yml` es un perfil opcional para validar integraciones AWS-shaped
con Floci. No pertenece al runtime funcional de la V2 ni reemplaza MongoDB,
Redis, BullMQ o GridFS. S3, SQS, Secrets Manager, KMS y CloudWatch quedan como
adaptadores de infraestructura futuros; no deben acceder directamente a los
servicios de dominio ni introducir credenciales reales.

## Riesgos residuales registrados

1. El outbox durable ya recupera eventos, pero la atomicidad estricta documento-
   evento requiere activar transacciones sobre un replica set de MongoDB.
2. No existe aislamiento multi-tenant.
3. No existe antivirus/CDR para uploads.
4. La validación contra servicios administrados, TLS y topologías de producción
   permanece pendiente; la integración local/CI ya usa MongoDB, Redis, GridFS y
   BullMQ reales en contenedores desechables.

## Regla de transición

Cada incremento debe pasar lint, pruebas unitarias, pruebas HTTP y build antes
de actualizar esta documentación. Ninguna transición borra datos de MongoDB.
