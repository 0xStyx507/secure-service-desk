# Codex project profile

Fuente maestra:
https://app.notion.com/p/3ad1bb7d550581aa871bde5dc746a05a

## Contexto vigente

- Producto: Secure Service Desk API de portafolio.
- Arquitectura objetivo única: `docs/RESTRUCTURING-V2.md`.
- Runtime: TypeScript estricto y NestJS; no usa APIs funcionales externas.
- Persistencia: MongoDB/Mongoose y GridFS.
- Infraestructura interna: Redis, BullMQ, API y workers separados.
- Baseline histórico: CRUD Express de autos preservado en `legacy/`.

## Revisión coordinada

Los cambios sensibles se revisan desde tres perspectivas:

1. Fullstack: arquitectura modular, contratos y mantenibilidad.
2. QA API: aceptación, negativos, regresión y evidencia ejecutable.
3. AppSec: identidad, autorización, secretos, archivos y supply chain.

## Reglas

- No guardar secretos ni claves privadas.
- No ejecutar operaciones destructivas sobre MongoDB durante la
  reestructuración.
- Toda ruta debe declarar autenticación, autorización, DTO, respuesta y errores.
- MongoDB es la fuente de verdad; Redis debe ser reconstruible.
- Registrar motivo, alternativas, archivos, validación, riesgos y rollback.
- No presentar planes o controles residuales como implementados.
- No cerrar cambios sensibles sin lint, tests, e2e, build y revisión defensiva.
- El MVP es monoinquilino; no afirmar aislamiento por tenant.
- `CONTENT_VALIDATED` no significa que un adjunto fue escaneado por antivirus.

## Estado 2026-07-30

- Foundation NestJS, auth propia, tickets, comentarios, GridFS, auditoría,
  notificaciones, PDF, Redis/BullMQ, workers y gobierno: implementados.
- Keycloak, RapidAPI y el módulo activo de autos: retirados.
- Trivy, Dependabot, Docker y compose persistente: implementados.
- Pruebas unitarias, HTTP e integración con MongoDB, Redis, GridFS y BullMQ
  reales: implementadas como gates locales y de CI con contenedores desechables.
- Pendientes de evolución: multi-tenancy, antivirus/CDR, transactional outbox,
  retención automática de PDFs y rotación solapada de claves.

## Skills sincronizadas

- `.agents/skills/senior-engineer/SKILL.md`
- `.agents/skills/security-analyst/SKILL.md`
- `.agents/skills/qa-engineer/SKILL.md`
