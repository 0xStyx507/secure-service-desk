# Codex project profile

Fuente maestra:
https://app.notion.com/p/3ad1bb7d550581aa871bde5dc746a05a

Backlog tecnico vigente:
https://app.notion.com/p/3b31bb7d550580f48846de9bb3dd77af

## Contexto vigente

- Producto: Secure Service Desk API de portafolio.
- Arquitectura vigente: `docs/ARCHITECTURE.md`.
- Historia de migracion: `docs/history/RESTRUCTURING-V2.md`.
- Runtime: TypeScript estricto y NestJS; no usa APIs funcionales externas.
- Persistencia: MongoDB/Mongoose y GridFS.
- Infraestructura interna: Redis, BullMQ, API y workers separados.
- Baseline historico: CRUD Express de autos preservado en `legacy/`.
- Documentacion actual: `docs/SECURITY.md`, `docs/MCP.md`,
  `docs/TESTING.md`, `docs/CLOUD-DEVELOPMENT.md`, `docs/DEPLOYMENT.md` y
  `docs/API.md`.

## Revision coordinada

Los cambios sensibles se revisan desde tres perspectivas:

1. Fullstack: arquitectura modular, contratos y mantenibilidad.
2. QA API: aceptacion, negativos, regresion y evidencia ejecutable.
3. AppSec: identidad, autorizacion, secretos, archivos y supply chain.

## Reglas

- No guardar secretos ni claves privadas.
- No ejecutar operaciones destructivas sobre MongoDB durante la
  reestructuracion.
- Toda ruta debe declarar autenticacion, autorizacion, DTO, respuesta y errores.
- MongoDB es la fuente de verdad; Redis debe ser reconstruible.
- Registrar motivo, alternativas, archivos, validacion, riesgos y rollback.
- No presentar planes o controles residuales como implementados.
- No cerrar cambios sensibles sin lint, tests, e2e, build y revision defensiva.
- El MVP es monoinquilino; no afirmar aislamiento por tenant.
- `CONTENT_VALIDATED` no significa que un adjunto fue escaneado por antivirus.

## Estado 2026-08-14

- Foundation NestJS, auth propia, tickets, comentarios, GridFS, auditoria,
  notificaciones, PDF, Redis/BullMQ, workers y gobierno: implementados.
- Puntos 1-16 y 18-23: implementados y validados con los gates registrados.
- Punto 17: ZAP implementado en CI como report-only; falta triage del primer
  artefacto antes de bloquear por hallazgos.
- Punto 24: Floci opcional y aislado; no forma parte del runtime productivo.
- Punto 25: ports y adapters AWS-compatible implementados con pruebas
  unitarias y smoke S3/SQS local contra Floci; AWS real sigue pendiente.
- Punto 26: CI/CD implementado parcialmente; falta triage ZAP y branch
  protection configurado en GitHub.
- Punto 27: higiene local parcialmente completada; falta definir el correo Git
  publico y las politicas de merge.
- Punto 28: estructura documental vigente e historica creada; falta migrar
  cada ADR a un archivo individual y revisar enlaces legacy.
- Keycloak, RapidAPI y el modulo activo de autos: retirados.
- Pendientes de evolucion: multi-tenancy, antivirus/CDR, transactional outbox,
  retencion automatica de PDFs y rotacion solapada de claves.

## Skills sincronizadas

- `.codex/skills/senior-engineer/SKILL.md`
- `.codex/skills/security-analyst/SKILL.md`
- `.codex/skills/qa-engineer/SKILL.md`
