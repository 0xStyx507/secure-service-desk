# Evidencia QA y AppSec

## Gates automatizados

- `pnpm lint`: TypeScript estricto.
- `pnpm test`: pruebas unitarias.
- `pnpm test:e2e`: contrato HTTP con Supertest.
- `pnpm test:integration`: MongoDB, Redis, GridFS y BullMQ reales mediante
  Testcontainers.
- `pnpm test:cov`: genera cobertura para SonarCloud y revisión local.
- Trivy: filesystem, dependencias, imágenes y secretos en GitHub Actions.
- Dependabot: npm, GitHub Actions y Docker.

## Imágenes Docker

El stack produce dos imágenes de aplicación separadas:

- `secure-service-desk-api:local`: API NestJS y worker BullMQ.
- `secure-service-desk-web:local`: SPA React/Vite servida por Nginx y proxy
  reverse `/api` hacia `api:3000`.

El workflow construye y escanea ambas imágenes mediante una matriz Trivy. El
frontend no se copia dentro de la imagen API porque son procesos y superficies
de ejecución diferentes.

## DAST local

Con Docker Desktop y el stack completo ya levantado:

```powershell
.\scripts\dast.ps1
```

El script verifica el frontend/reverse proxy en `localhost:3001`, ejecuta el
baseline scan de OWASP ZAP contra el endpoint público de salud y no crea,
detiene ni elimina contenedores. `ZAP_IMAGE` puede apuntar a un digest aprobado
antes de usarlo como gate de CI. El scan baseline no autentica rutas protegidas;
no sustituye pruebas negativas autenticadas ni un assessment de penetración.

## Límites honestos

La cobertura no se presenta como un porcentaje objetivo hasta definir el
umbral por módulo. Multi-tenancy, antivirus/CDR y TLS de producción requieren
decisiones e infraestructura que no se pueden demostrar con una prueba local
de healthcheck.
