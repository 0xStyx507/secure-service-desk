# Secure Service Desk API

API de service desk construida como proyecto de portafolio con TypeScript
estricto, NestJS, MongoDB, Redis y BullMQ. El repositorio comenzó como un CRUD
de autos en Express; ese baseline se conserva en `legacy/`, pero no forma parte
del runtime actual.

El objetivo del proyecto es demostrar cómo diseñar, implementar y operar una API
de soporte con controles de seguridad verificables: identidad propia, RBAC,
persistencia durable, procesamiento asíncrono, auditoría, pruebas de integración
y una interfaz visual pequeña para recorrer los flujos principales.

## Estado y recorrido rápido

La rama `main` contiene la implementación V2 activa. Para probar el proyecto
localmente:

1. Levante MongoDB y Redis con Docker Compose.
2. Configure las variables de entorno y genere las claves RSA de desarrollo.
3. Inicie API, worker y Demo UI en terminales separadas.
4. Cree un usuario `USER` desde la UI o use Swagger para recorrer endpoints
   administrativos con una cuenta bootstrap controlada.

```powershell
docker compose up -d
Copy-Item .env.example .env
pnpm install
pnpm start:dev
pnpm start:worker:dev
pnpm web:dev
```

URLs locales:

- Demo UI: `http://localhost:3001`
- API: `http://localhost:3000`
- Swagger/OpenAPI: `http://localhost:3000/docs`
- Liveness: `http://localhost:3000/api/health/live`
- Readiness: `http://localhost:3000/api/health/ready`

La UI usa los contratos reales de la API y no datos mock. El access token vive
solo en memoria; el refresh token permanece en una cookie HttpOnly y el cliente
conserva únicamente el token CSRF en `sessionStorage`.

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

La secuencia completa de inicio está en [Estado y recorrido rápido](#estado-y-recorrido-rápido).
La primera ejecución requiere completar las claves RSA y los valores de MongoDB,
Redis y cookies descritos en [Autenticación y sesiones](docs/AUTHENTICATION.md).

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

## Demo visual

La interfaz de portafolio vive en `apps/web` y consume los contratos reales de
la API. Es una SPA React/TypeScript deliberadamente pequeña, sin kit visual
externo: incluye autenticación, registro `USER`, restauración de sesión,
dashboard, notificaciones, filtros, paginación, creación y detalle de tickets.

Con MongoDB y Redis activos, ejecute API, worker y frontend en terminales
separadas:

```powershell
pnpm start:dev
pnpm start:worker:dev
pnpm web:dev
```

Abra `http://localhost:3001`. Vite mantiene las llamadas bajo `/api` y las
redirige a `http://localhost:3000`, evitando relajar cookies o CORS durante el
desarrollo. El access token permanece solo en memoria; únicamente el token CSRF
se conserva en `sessionStorage` para poder rotar la cookie HttpOnly después de
recargar la pestaña.

Para validar el frontend de forma independiente:

```powershell
pnpm web:lint
pnpm web:test
pnpm web:build
```

Consulte [Demo UI](docs/DEMO-UI.md) para el alcance, decisiones UX y controles
de un despliegue público.

## Validación

```powershell
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm build
```

Validación del frontend:

```powershell
pnpm web:lint
pnpm web:test
pnpm web:build
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

GitHub Actions ejecuta esta misma suite en un runner Linux con Docker. Después
construye la imagen runtime y aplica tres controles Trivy: dependencias del
workspace, vulnerabilidades de la imagen y secretos. Un hallazgo `HIGH` o
`CRITICAL` bloquea el workflow; el SARIF se publica de forma independiente para
conservar el detalle en GitHub Code Scanning.

Para reproducir localmente el gate principal con Docker Desktop:

```powershell
pnpm test:integration
```

El escaneo de imagen es responsabilidad del workflow porque Trivy y su base de
datos se ejecutan allí con el mismo artefacto que se evalúa en CI.

## Documentación

- [Arquitectura objetivo V2](docs/RESTRUCTURING-V2.md)
- [Arquitectura técnica](docs/ARCHITECTURE.md)
- [Autenticación y sesiones](docs/AUTHENTICATION.md)
- [Decisiones técnicas](docs/DECISIONS.md)
- [Bitácora de implementación](docs/IMPLEMENTATION-LOG.md)
- [Demo UI](docs/DEMO-UI.md)

La documentación versionada es la fuente de decisiones, arquitectura, alcance,
riesgos y evidencia. Los cambios sensibles deben registrarse en la bitácora con
su motivo, alternativas, validación y rollback.

## Persistencia

MongoDB es la fuente de verdad; Redis solo contiene caché reconstruible y estado
operativo de colas. La reestructuración no ejecuta `dropDatabase`, `deleteMany`
ni borrados de la colección histórica `autos`.
