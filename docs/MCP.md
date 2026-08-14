# MCP y acciones sensibles

El endpoint `POST /api/mcp` expone herramientas sobre los mismos servicios
NestJS usados por la API HTTP. MCP no consulta MongoDB directamente.

## Herramientas

Consultas y recomendaciones:

- `search_tickets`
- `get_ticket_details`
- `summarize_ticket`
- `search_knowledge_base`
- `suggest_priority`
- `suggest_assignee`

Mutaciones:

- `prepare_ticket_comment`
- `prepare_status_change`
- `confirm_action`
- `cancel_action`

Las sugerencias no mutan datos automáticamente.

## Seguridad del flujo

Las mutaciones siguen:

```text
PENDING → EXECUTING → COMPLETED
                   ↘ FAILED

PENDING → CANCELLED
```

El reclamo `PENDING → EXECUTING` es atómico. Un token solo puede ser confirmado
una vez, expira, queda ligado al usuario que lo preparó y respeta RBAC y
autorización por ticket. Los argumentos y resultados de auditoría se
sanitizan.

## Limitaciones

La mutación de negocio y el cambio de estado MCP no forman una transacción única.
La auditoría crítica y los estados persistidos permiten recuperación, pero no
eliminan completamente esa ventana de consistencia.
