# Indice de implementacion

La bitacora completa se conserva en
[`history/IMPLEMENTATION-LOG.md`](history/IMPLEMENTATION-LOG.md). Este archivo
es el indice de estado y no debe crecer hasta convertirse nuevamente en una
bitacora monolitica.

## Ultimos incrementos

- Concurrencia atomica de login y MFA.
- Autenticacion completa, step-up y sesiones separadas.
- MCP idempotente, auditoria durable y sanitizacion recursiva.
- Workers idempotentes, retencion recuperable y reglas de tickets.
- ESLint, typecheck, coverage, DAST, metricas, proxy y hardening.
- Adaptación cloud desacoplada: AWS SDK v3 y adapters se mantienen detrás de
  ports; Floci externo es el destino dev y los mocks cubren unit tests sin red.

Cada entrada detallada mantiene motivo, alternativas, archivos, validacion,
riesgos y rollback en el historico.

- Remediacion de 28 warnings ESLint: servicios backend, workers, controllers y
  componentes/hooks del frontend fueron descompuestos sin ocultar reglas ni
  cambiar contratos publicos.
