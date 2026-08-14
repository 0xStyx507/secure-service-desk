# ADR-042 — Floci externo como entorno dev

- **Estado:** aceptado.
- **Contexto:** la adaptación cloud debe poder probarse en desarrollo sin
  confundir el laboratorio local con AWS productivo.
- **Decisión:** mantener los ports, adapters AWS SDK v3 y mocks in-memory en el
  proyecto. Floci se ejecuta en un contenedor externo mediante el compose
  opcional y se consulta con `AWS_ENDPOINT_URL`; no se integra como módulo de
  dominio ni sustituye MongoDB, Redis, BullMQ o GridFS.
- **Motivo:** conservar la lógica reutilizable y obtener smoke tests reales
  contra S3/SQS local, sin credenciales reales ni dependencia de una cuenta AWS.
- **Alternativas:** eliminar los adapters y usar solo mocks; descartada porque
  perdería la validación del protocolo compatible. Integrar Floci en NestJS;
  descartada porque acoplaría el producto al laboratorio.
- **Archivos:** `src/infrastructure/cloud/`, `compose.floci.yml`, `.env.example`,
  configuración de entorno y documentación cloud.
- **Validación:** unit tests con mocks y smoke S3/SQS contra Floci local; AWS
  real, IAM, TLS y paridad administrada permanecen pendientes.
- **Riesgo:** los adapters no equivalen a una integración productiva ni
  garantizan permisos o disponibilidad administrada.
- **Rollback:** desactivar el perfil Floci y retirar el endpoint local; no hay
  migración de datos del producto.
