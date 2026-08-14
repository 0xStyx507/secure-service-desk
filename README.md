# Secure Service Desk API

Secure Service Desk es una API de service desk para portafolio construida con
TypeScript estricto, NestJS, MongoDB/Mongoose, GridFS, Redis, BullMQ y React/Vite.
El CRUD Express original permanece en `legacy/` como historial de migracion.

## Arquitectura rapida

```text
Browser -> Nginx/frontend -> NestJS API -> MongoDB + GridFS
                                      -> Redis/BullMQ -> workers PDF/notificaciones
```

MongoDB es la fuente de verdad. Redis es reconstruible. API y worker son
procesos separados. Floci y AWS SDK son integraciones cloud opcionales y no
forman parte del runtime productivo por defecto.

## Capacidades

- JWT RS256, refresh HttpOnly, CSRF, MFA TOTP y step-up.
- RBAC `ADMIN`, `SUPPORT`, `USER` y autorizacion por recurso.
- Tickets, comentarios, watchers, workflow, paginacion, filtros y cache.
- Adjuntos JPEG/PNG en GridFS con validacion de formato y limites.
- Auditoria critica, logs estructurados, outbox, notificaciones y PDF.
- BullMQ, reintentos, dead letters y recovery administrativo.
- MCP con consultas directas y mutaciones `prepare -> confirm/cancel`.
- OpenAPI, frontend demo, Docker, Trivy, Dependabot y OWASP ZAP report-only.

## Inicio rapido

Requisitos: Node.js 22, pnpm 11 y Docker Desktop.

```powershell
Copy-Item .env.example .env
# Complete las claves RSA y los secretos locales indicados en docs/AUTHENTICATION.md
docker compose --env-file .env up --build -d
```

URLs:

- Demo: `http://localhost:3001`
- Swagger: `http://localhost:3001/api/docs`
- Liveness: `http://localhost:3001/api/health/live`
- Readiness: `http://localhost:3001/api/health/ready`

El navegador solo conoce `/api`; Nginx hace reverse proxy. El access token vive
en memoria y el refresh token permanece en cookie HttpOnly.

## Validacion

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:cov
pnpm test:e2e
pnpm test:integration
pnpm build
pnpm openapi:export
pnpm web:lint
pnpm web:test
pnpm web:build
```

Las pruebas de integracion usan contenedores desechables para MongoDB, Redis,
GridFS y BullMQ. No ejecutan operaciones destructivas sobre la persistencia
del usuario.

## Seguridad y limites

La autenticacion, autorizacion y reglas de negocio viven en el backend. No se
usa Keycloak, RapidAPI ni otra API SaaS funcional. `CONTENT_VALIDATED` significa
validacion de formato, no antivirus/CDR. El MVP es monoinquilino.

ZAP, Trivy y Dependabot forman parte del pipeline. ZAP permanece report-only
hasta revisar el primer artefacto y los adapters AWS-compatible requieren un
smoke real contra Floci/AWS antes de considerarse validados en cloud.

## Documentacion

- [Arquitectura actual](docs/ARCHITECTURE.md)
- [Seguridad](docs/SECURITY.md)
- [Autenticacion y sesiones](docs/AUTHENTICATION.md)
- [MCP](docs/MCP.md)
- [Testing y calidad](docs/TESTING.md)
- [Desarrollo cloud](docs/CLOUD-DEVELOPMENT.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Contrato API/OpenAPI](docs/API.md)
- [Decisiones](docs/DECISIONS.md)
- [Indice de implementacion](docs/IMPLEMENTATION-LOG.md)
- [Demo UI](docs/DEMO-UI.md)
- [Historial documental](docs/history/README.md)

## Persistencia y secretos

No se guardan `.env` reales, claves privadas ni tokens. MongoDB conserva la
persistencia entre reinicios de Compose; Redis puede reconstruirse y no
reemplaza a MongoDB. El rollback de codigo no requiere borrar colecciones.
