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
- Las notificaciones generan eventos en `outbox_events`; el reconciliador los
  publica con IDs idempotentes cuando Redis vuelve a estar disponible.
- El worker reconcilia esos estados cada minuto si Redis no estaba disponible.
- Los jobs usan IDs estables, tres intentos, backoff exponencial y jitter.
- Los fallos agotados se guardan en `job_failures` y solo ADMIN puede
  reejecutarlos.

Los efectos derivados no convierten una mutación ya persistida en un falso error
HTTP. El outbox durable reduce la ventana documento-evento y permite recuperar
publicaciones; la atomicidad estricta requiere ejecutar MongoDB como replica set
y activar transacciones, por lo que no se presenta como cerrada en el MVP.

## Seguridad de archivos

Solo se aceptan JPEG/PNG, hasta 5 MB, con coincidencia MIME/firma, límites de
dimensiones, filename normalizado, SHA-256 y deduplicación por ticket. La descarga
usa autorización por ticket, `Content-Disposition: attachment` y `nosniff`.

No existe escaneo antivirus/CDR en esta versión; es un riesgo residual explícito.

Los PDFs tienen `expiresAt` y el worker elimina el archivo GridFS expirado,
conservando el registro como `PURGED` para trazabilidad. La retención se
configura con `PDF_RETENTION_DAYS`.

La autenticación acepta un anillo opcional `JWT_KEY_RING_JSON`: firma con el
`JWT_KEY_ID` activo, valida cualquier clave pública aún vigente y expone las
claves públicas en `/api/auth/.well-known/jwks.json`. La retirada de claves
antiguas sigue siendo una operación explícita de rotación.

`/api/metrics` expone métricas Prometheus de baja cardinalidad para solicitudes
HTTP. No contiene tokens, correos ni rutas con identificadores como labels.

## Despliegue

`compose.yml` ofrece el stack completo para desarrollo: MongoDB, Redis, API,
worker y frontend. El `Dockerfile` multi-stage produce la imagen
`secure-service-desk-api:local` usada por API y worker; `apps/web/Dockerfile`
produce la imagen independiente `secure-service-desk-web:local`, compila la SPA
y la sirve con Nginx, que hace proxy de `/api` hacia el servicio NestJS. Solo
Nginx publica un puerto HTTP al host; el API queda en la red interna de Docker.

Vite mantiene un proxy equivalente únicamente para `vite dev`. No se usa como
capa de seguridad porque desaparece al compilar. La validación autoritativa de
JWT, CSRF, estado de usuario y roles vive en los guards/controladores NestJS;
Nginx enruta, conserva cookies y headers de autenticación y evita la exposición
directa del proceso API.

La API y el worker usan la misma imagen, pero son procesos independientes:

```text
node dist/main.js
node dist/worker.js
```

El archivo `compose.floci.yml` agrega un perfil opcional para un laboratorio
AWS-compatible local. No forma parte del arranque normal y no cambia MongoDB,
Redis, BullMQ ni GridFS. Sus adaptadores cloud se incorporarán detrás de
interfaces de infraestructura y deberán conservar fallback, pruebas y rollback.
