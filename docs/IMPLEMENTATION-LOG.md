# Bitácora de implementación

Esta bitácora registra cada incremento verificable de la V2. Las decisiones
arquitectónicas permanentes viven en `DECISIONS.md`.

## 2026-07-30 — Composición completa de API y worker

### Objetivo

Comprobar que los grafos completos de `AppModule` y `WorkerAppModule` pueden
resolverse sin depender de servicios externos durante la prueba.

### Motivo

Las pruebas HTTP existentes construían controladores con servicios simulados.
Eso validaba contratos HTTP, pero podía ocultar imports o exports incorrectos
entre módulos NestJS.

### Decisiones

- Mantener los módulos reales en la prueba.
- Sustituir solamente los bordes MongoDB, Redis y BullMQ.
- Compilar el contexto sin ejecutar `init()`, para no activar bootstrap,
  schedulers ni consumidores.
- No usar un mocker automático de providers faltantes.

### Cambios

- Se añadió `test/composition.e2e-spec.ts`.
- `AuthModule` ahora reexporta `UsersModule`, de modo que `JwtAuthGuard`
  conserva acceso a `UsersService` cuando se usa desde otros módulos.
- `UsersModule` dejó de exportar el `MongooseModule` genérico; su contrato
  público queda limitado a `UsersService`.
- El entorno E2E fija configuración local sintética, desactiva el bootstrap
  administrativo e impide cargar archivos `.env`.
- Se fijó la convención Prettier del repositorio para mantener formato
  reproducible y comillas simples en TypeScript.
- Se añadió ADR-015 a `docs/DECISIONS.md`.

### Defecto detectado

La primera ejecución demostró que `NotificationsModule` no podía construir
`JwtAuthGuard`: el guard exportado dependía de `UsersService`, pero el módulo
consumidor no tenía acceso a esa dependencia. La corrección se realizó en el
contrato de exports de `AuthModule`.

### Validación

- Prueba de composición HTTP: `AppModule` y sus controladores resueltos.
- Prueba de composición worker: providers de procesamiento y recuperación de
  colas resueltos, sin iniciar consumidores BullMQ.
- No se abrieron conexiones reales ni se incorporaron secretos.
- TypeScript: correcto con `tsc --noEmit`.
- Unitarias: 14 suites y 30 pruebas correctas.
- HTTP/composición: 5 suites y 17 pruebas correctas.
- Build NestJS: correcto para `main` y `worker`.

### Riesgos pendientes

- No se valida aún persistencia real, índices, GridFS o semántica BullMQ.
- El worker continúa importando módulos que también contienen controladores
  HTTP; su separación interna será un incremento posterior.

### Rollback

Eliminar la prueba de composición y retirar `UsersModule` de los exports de
`AuthModule`. El rollback no modifica datos ni esquemas MongoDB.

## 2026-07-30/31 — Integración real y lifecycle de API/worker

### Objetivo

Convertir la integración con MongoDB, Redis, GridFS y BullMQ en evidencia
reproducible localmente y en GitHub Actions.

### Motivo

Las pruebas unitarias, HTTP y de composición no podían demostrar persistencia,
archivos, ejecución asíncrona, reintentos o recuperación de trabajos perdidos.
Para un portafolio, esas garantías deben poder verificarse sin preparar datos
manualmente ni reutilizar la infraestructura del desarrollador.

### Decisiones

- Usar Testcontainers con imágenes fijadas de MongoDB 7 y Redis 7.
- Crear una base exclusiva por ejecución y claves RS256 efímeras.
- Exponer factories controlables para API y worker; los entrypoints solo
  arrancan cuando se ejecutan directamente.
- Hacer que el reconciliador de colas sea configurable, no solapado y espere su
  trabajo activo durante el apagado.
- Separar la integración real del gate rápido de calidad y exigir ambos antes
  del escaneo Trivy.
- Fijar imágenes por digest y GitHub Actions por SHA; Dependabot conserva el
  flujo revisable de actualización.

### Cambios

- Se añadieron `@testcontainers/mongodb`, `@testcontainers/redis`, el script
  `test:integration` y su configuración Jest.
- `test/integration/lifecycle.integration-spec.ts` valida health, JWT/refresh,
  tickets, consulta cacheable, GridFS y deduplicación, notificaciones, reportes
  PDF, recuperación desde MongoDB y dead-letter tras tres intentos reales.
- `src/main.ts` y `src/worker.ts` permiten crear y cerrar sus contextos sin
  efectos laterales al importarlos.
- La API y el worker habilitan shutdown hooks; la suite también ejecuta los
  entrypoints compilados y los detiene con `SIGTERM`.
- `QueueRecoveryService` evita ejecuciones superpuestas y usa
  `QUEUE_RECOVERY_INTERVAL_MS`; los fallos parciales de enqueue ya no se
  descartan.
- CI ejecuta la suite en Docker sobre Ubuntu antes de construir y escanear la
  imagen, con permisos mínimos por job y credenciales Git no persistentes.

### Defecto detectado

La primera conexión falló porque el replica set del contenedor anunciaba un
hostname interno no resoluble desde Windows. La URI de prueba ahora usa
`directConnection=true`, limitado al contenedor efímero.

Al fijar MongoDB por digest, Testcontainers 12 interpretó `tag@digest` como una
versión antigua e intentó su healthcheck con el cliente `mongo` retirado. La
suite declara explícitamente el healthcheck con `mongosh`, manteniendo el digest
inmutable y la inicialización real del replica set.

### Validación

- Cinco escenarios de integración reales correctos, incluido el smoke de los
  artefactos compilados bajo `SIGTERM`.
- MongoDB conserva usuarios, tickets, adjuntos, reportes y fallos durables
  durante la prueba.
- Redis/BullMQ procesan jobs, tres reintentos, dead-letter y recuperación de un
  job eliminado.
- Los contenedores se detienen al finalizar y no se usan volúmenes del
  `docker compose` local.
- Teardown con `allSettled`: siempre restaura el entorno y trata cada cierre de
  forma independiente.

### Riesgos pendientes

- El smoke separa API y worker por procesos, pero ambos comparten el mismo host y
  red Docker durante la prueba.
- No se cubren TLS, latencia/fallos de red, replica sets productivos ni
  infraestructura administrada.
- La recuperación reduce pérdida silenciosa, pero no sustituye un
  transactional outbox.

### Rollback

Retirar el job `integration` de CI, el script/configuración Testcontainers y las
factories de lifecycle. El rollback no necesita eliminar bases ni volúmenes
porque cada contenedor de prueba es desechable.
