# ADR-041 — Adapters AWS-compatible opcionales

- **Estado:** aceptado; complementado por ADR-042.
- **Decisión:** el dominio depende de `AttachmentStoragePort`,
  `EventPublisherPort`, `SecretsProviderPort` y `ObservabilityPort`. Los
  adapters usan AWS SDK v3 para S3, SQS, Secrets Manager y CloudWatch.
- **Motivo:** permitir Floci local y AWS real mediante configuración sin crear
  clases acopladas a Floci ni mover MongoDB, Redis, BullMQ o GridFS.
- **Alternativas:** llamadas AWS en controllers, firmas HTTP propias o migrar
  persistencia y colas de una sola vez.
- **Archivos:** `src/infrastructure/cloud/`, configuración de entorno,
  `CloudModule`, `docs/CLOUD-DEVELOPMENT.md` y dependencias AWS.
- **Validación:** typecheck, lint, 12 pruebas dirigidas, 29 suites/78 tests,
  e2e 19/19, integración real 8/8 y smoke S3/SQS contra Floci PASS.
- **Riesgo:** IAM, TLS, permisos, rotación y prueba contra AWS administrado
  dependen del despliegue; los adapters no son todavía el camino de negocio.
- **Rollback:** retirar CloudModule, adapters y dependencias; no hay migración
  de datos.
