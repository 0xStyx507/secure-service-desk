# Integraciones de seguridad y MCP

Este documento explica qué se implementó, por qué se implementó así y qué
queda deliberadamente fuera del runtime actual.

## MFA TOTP opcional

El usuario puede consultar `/api/auth/mfa/status`, iniciar setup con
`POST /api/auth/mfa/setup` y confirmar el código con
`POST /api/auth/mfa/verify-setup`. Cuando MFA está activo, `POST /api/auth/login`
no emite tokens: devuelve un desafío opaco de cinco minutos que solo
`POST /api/auth/login/mfa` puede completar con un código TOTP válido.

Decisiones:

- Se implementó RFC 6238 con Node `crypto` para evitar otra dependencia de OTP.
- El secreto pendiente y el activo se cifran con AES-256-GCM; MongoDB nunca
  recibe el secreto en claro. Configure `MFA_ENCRYPTION_KEY_BASE64` con 32 bytes.
- Los desafíos y códigos tienen límite de intentos, son de un solo uso y solo
  se persiste el hash SHA-256 del desafío.
- Activar o desactivar MFA incrementa `authzVersion`, invalidando sesiones
  emitidas con el estado anterior.
- Desactivar MFA exige la contraseña actual y el TOTP actual.

El secreto y la URI `otpauth` se devuelven únicamente durante setup; no deben
registrarse ni enviarse a analytics.

## SonarCloud

El workflow tiene un job opt-in basado en la acción oficial de SonarSource.
Para activarlo en GitHub configure:

```text
Secret: SONAR_TOKEN
Variable: SONAR_ENABLED=true
Variable: SONAR_ORGANIZATION
Variable: SONAR_PROJECT_KEY
```

El job está condicionado a que existan las tres configuraciones para que un
fork público pueda ejecutar los gates seguros sin inventar una organización o
exponer secretos. `SONAR_ENABLED` es el interruptor explícito. `sonar-project.properties` delimita `src`, tests TypeScript y
exclusiones de artefactos generados.

## MCP

El endpoint `POST /api/mcp` usa Streamable HTTP stateless y bearer JWT. El
servidor no tiene acceso directo a modelos Mongo: cada herramienta delega en
`TicketsService`, `UsersService`, `KnowledgeBaseService` y `AuditService`.

Herramientas read-only:

- `search_tickets`
- `get_ticket_details`
- `summarize_ticket`
- `search_knowledge_base`
- `suggest_priority`
- `suggest_assignee`

Las sugerencias son deterministas y auditables; no se presenta un LLM externo
como si fuera una decisión de negocio. La base de conocimiento acepta artículos
publicados en `knowledge_articles`, dejando la escritura administrativa para una
fase posterior.

Herramientas mutating:

- `prepare_ticket_comment`
- `prepare_status_change`
- `confirm_action`
- `cancel_action`

Las acciones mutantes usan una maquina de estados persistida en MongoDB:

```text
PENDING -> EXECUTING -> COMPLETED
                     \-> FAILED

PENDING -> CANCELLED
```

`confirm_action` reclama el token con una transicion atomica
`PENDING -> EXECUTING`; una segunda confirmacion no puede reclamarlo. La
mutacion de `TicketsService` se ejecuta despues del claim y solo entonces se
marca `COMPLETED`. Si falla, se persiste `FAILED` con un codigo y mensaje
generico, sin guardar detalles potencialmente sensibles. La expiracion y el
RBAC del usuario que preparo la accion se conservan.

Las dos primeras solo validan permisos y guardan una intención temporal. El
token de acción se almacena como hash, caduca a los cinco minutos y queda ligado
al usuario que lo preparó. Solo `confirm_action` ejecuta el servicio de tickets;
`cancel_action` lo invalida. Todas las operaciones MCP registran usuario, acción,
resultado resumido y metadata sanitizada en auditoría.

## Contrato y verificación

Swagger UI y `docs/openapi.json` se generan desde los mismos decorators NestJS:

```powershell
pnpm build
pnpm openapi:export
```

La generación debe ser determinista y no requiere MongoDB, Redis ni BullMQ.
