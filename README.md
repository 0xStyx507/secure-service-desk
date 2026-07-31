# Secure Service Desk API

API de service desk construida como proyecto de portafolio con TypeScript
estricto, NestJS, MongoDB, Redis y BullMQ. El repositorio comenzó como un CRUD
de autos en Express; ese baseline se conserva en `legacy/`, pero no forma parte
del runtime actual.

El producto funcional no consume Keycloak, RapidAPI ni otra API SaaS. Usuarios,
sesiones, tickets, archivos, auditoría, notificaciones y reportes se gestionan
con código propio.

## Capacidades implementadas

- Autenticación propia con `scrypt`, JWT RS256 de 3072 bits o más, `kid`,
  issuer/audience y expiración corta.
- Refresh tokens opacos almacenados solo como SHA-256, rotación por familia,
  detección de reutilización, cookie HttpOnly y CSRF double-submit.
- Invalidación inmediata de access tokens cuando cambian roles o estado del
  usuario mediante `authzVersion`.
- Roles `ADMIN`, `SUPPORT` y `USER`, protección del último administrador y
  bootstrap inicial de una sola ejecución.
- Tickets `SD-000001`, comentarios públicos/internos, prioridad, asignación,
  máquina de estados, resolución y concurrencia optimista.
- Paginación, filtros y búsqueda de texto con caché Redis versionada por alcance.
- Imágenes JPEG/PNG de hasta 5 MB en GridFS, con firma, MIME, dimensiones,
  checksum, deduplicación y autorización por ticket.
- Auditoría persistente con request ID y metadata redactada.
- Notificaciones internas y reportes PDF mediante workers BullMQ separados.
- Reintentos con backoff, jitter, reconciliación de jobs pendientes,
  dead-letter persistente y reproceso administrativo.
- Swagger, Problem Details, Helmet, CORS allowlist, rate limiting, logs JSON,
  Jest, Supertest, Docker, Trivy y Dependabot.

## Alcance de seguridad

El MVP es **monoinquilino**: `SUPPORT` y `ADMIN` operan la cola completa de
tickets. Una versión multi-tenant requerirá `tenantId` obligatorio en todos los
recursos, consultas, claves de caché y jobs.

Los adjuntos se descargan como archivos opacos con `nosniff`; la versión actual
no incorpora antivirus/CDR. No debe presentarse `CONTENT_VALIDATED` como
equivalente a “libre de malware”.

## Ejecución local

Requisitos: Node.js 22, pnpm 11, MongoDB, Redis y Docker para las pruebas de
integración.

```powershell
docker compose up -d
Copy-Item .env.example .env
pnpm install
pnpm start:dev
```

En otra terminal, inicie los workers:

```powershell
pnpm start:worker:dev
```

Si MongoDB ya está instalado en `localhost:27017`, puede iniciar únicamente
Redis con `docker compose up -d redis`. Los volúmenes `mongodb_data` y
`redis_data` preservan los datos entre reinicios.

## Claves y administrador inicial

Genere una pareja RSA y configure sus valores Base64 siguiendo
[Autenticación y sesiones](docs/AUTHENTICATION.md). No incorpore PEM, passwords
ni tokens a Git.

Para crear el primer administrador:

```env
ALLOW_ADMIN_BOOTSTRAP=true
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<secret-fuerte>
```

El estado `initial-admin` queda registrado en MongoDB y evita recrear la cuenta
si luego se elimina. Después del primer arranque, retire las tres variables.

## Endpoints principales

- `/api/auth`: registro, login, refresh, logout e identidad actual.
- `/api/tickets`: tickets, filtros, búsqueda, workflow y comentarios.
- `/api/tickets/:id/attachments`: carga y metadata de imágenes.
- `/api/attachments/:id/content`: descarga autorizada.
- `/api/notifications`: bandeja interna y marcado como leído.
- `/api/reports`: solicitud, estado y descarga de reportes PDF.
- `/api/admin`: roles, auditoría, dead-letter y reproceso.
- `/api/health/live` y `/api/health/ready`.

Swagger: `http://localhost:3000/docs`.

## Validación

```powershell
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm build
```

Las pruebas HTTP actuales ejercitan validación, hardening, cookies/CSRF,
autenticación y autorización de tickets. También compilan los grafos completos
de la API y del worker con dobles únicamente en los bordes externos.

`test:integration` levanta MongoDB y Redis desechables con Testcontainers y
valida el ciclo real de API y worker: autenticación, refresh, tickets, caché,
GridFS, notificaciones, PDF, recuperación de jobs y dead-letter. Usa una base
con nombre aleatorio, claves RSA efímeras y no ejecuta `dropDatabase`,
`deleteMany` ni `flushall`. Al terminar detiene sus contenedores sin tocar los
servicios o volúmenes de `docker compose`.

El mismo comando construye `dist/`, ejecuta `dist/main.js` y `dist/worker.js`,
comprueba readiness y verifica que ambos procesos atiendan `SIGTERM` sin quedar
colgados.

GitHub Actions ejecuta esta misma suite en un runner Linux con Docker antes de
construir y escanear la imagen. Así, quien evalúe el portafolio puede reproducir
el gate con Docker Desktop y un único comando: `pnpm test:integration`.

## Documentación

- [Arquitectura objetivo V2](docs/RESTRUCTURING-V2.md)
- [Arquitectura técnica](docs/ARCHITECTURE.md)
- [Autenticación y sesiones](docs/AUTHENTICATION.md)
- [Decisiones técnicas](docs/DECISIONS.md)
- [Bitácora de implementación](docs/IMPLEMENTATION-LOG.md)
- [Bitácora de Notion](https://app.notion.com/p/3ad1bb7d550581aa871bde5dc746a05a)

## Persistencia

MongoDB es la fuente de verdad; Redis solo contiene caché reconstruible y estado
operativo de colas. La reestructuración no ejecuta `dropDatabase`, `deleteMany`
ni borrados de la colección histórica `autos`.
