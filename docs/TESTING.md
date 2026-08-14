# Testing y calidad

## Gates locales

```powershell
pnpm install --frozen-lockfile
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

Las pruebas unitarias cubren políticas, servicios y contratos futuros con
mocks sin red externa. Testcontainers valida MongoDB, Redis, GridFS y BullMQ
reales con contenedores desechables.

Floci se ejecuta separado del API. El smoke S3/SQS contra ese contenedor valida
el adapter compatible localmente, pero no equivale a una integración productiva
AWS ni prueba IAM, TLS o disponibilidad administrada.

## DevSecOps

GitHub Actions ejecuta calidad, integración, e2e, build, OpenAPI, Trivy,
Dependabot y ZAP. ZAP permanece report-only hasta revisar el primer artefacto y
clasificar falsos positivos.
