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

## 2026-07-31 — Corrección del setup de Trivy en CI

### Motivo

El primer run publicado no pudo resolver la dependencia transitiva
`aquasecurity/setup-trivy@v0.2.1`, utilizada por `trivy-action` v0.28.0.

### Decisión y cambio

Actualizar `aquasecurity/trivy-action` a v0.36.0 mediante su SHA inmutable. Esta
versión referencia `setup-trivy` v0.2.6 también por SHA, conservando la política
de supply chain sin depender de tags flotantes.

### Validación

- Metadata oficial de `action.yaml` revisada para v0.28.0 y v0.36.0.
- Workflow validado por formato y `git diff --check` antes de publicarlo.
- La confirmación definitiva corresponde al nuevo run de `Secure CI`.

### Riesgo y rollback

La actualización también cambia la versión predeterminada del CLI Trivy. Si
aparece una incompatibilidad distinta, el rollback es restaurar el SHA anterior
solo después de fijar explícitamente una versión válida de `setup-trivy`.

## 2026-07-31 — Primer corte de la Demo UI

### Objetivo

Permitir que una persona evalúe el service desk mediante una experiencia visual
breve, sin depender únicamente de Swagger y sin convertir el repositorio en un
producto frontend de gran alcance.

### Decisiones

- Crear `apps/web` como segundo paquete del workspace pnpm.
- Usar React, TypeScript y Vite sin framework SSR ni librería visual externa.
- Consumir la API real; no incorporar datos mock que aparenten controles no
  ejecutados.
- Mantener el access token en memoria y solo el token CSRF en `sessionStorage`.
- Limitar el corte a autenticación, cola, filtros, creación, detalle y resumen
  de notificaciones.

### Cambios

- Se añadió una pantalla de acceso/registro que explica JWT, auditoría y jobs.
- Se añadió un dashboard responsive con métricas claramente acotadas, actividad
  reciente y notificaciones.
- La cola implementa búsqueda, filtros, paginación y estados de carga/error.
- Crear y abrir tickets usa los DTO y respuestas existentes.
- El cliente HTTP procesa Problem Details, rota la sesión y reintenta solo una
  vez tras un `401`.
- CI incorpora typecheck, pruebas y build del paquete web.
- `docs/DEMO-UI.md` documenta alcance, UX, sesión y despliegue público.

### Validación

- TypeScript estricto del frontend: correcto.
- Pruebas de interacción, sesión, contratos y workspace: 15 escenarios correctos.
- Bundle de producción: 217 kB JavaScript y 20 kB CSS antes de gzip.
- No se añadió ningún secreto ni credencial demo al bundle.
- El gate `pnpm audit:prod` y Trivy filesystem cubren las dependencias runtime
  del workspace; las herramientas de desarrollo quedan fijadas por lockfile y
  monitorizadas por Dependabot sin confundirlas con el artefacto desplegable.
- El build rechaza rutas API cross-origin, incluidas variantes con barras
  invertidas que el parser URL del navegador podría normalizar.
- `js-yaml`, dependencia transitiva runtime de Swagger, se fija de forma
  dirigida en `5.2.2` para corregir su advisory alto sin alterar consumidores
  incompatibles del mismo paquete.

### Riesgos y evolución

- El frontend aún no cubre comentarios, adjuntos, workflow, PDFs o gobierno.
- Una demo pública necesita reverse proxy del mismo sitio, HTTPS, datos
  sintéticos y un proceso de restablecimiento aislado.
- El audit completo reporta `brace-expansion` en herramientas de build y test
  antiguas. No se fuerza la versión 5 porque rompe la API esperada por
  `minimatch` 3; se mantiene como riesgo de desarrollo visible hasta actualizar
  sus paquetes padre, mientras CI bloquea vulnerabilidades runtime altas.
- El resumen usa el total global autorizado, pero los subtotales se calculan
  sobre la página visible y se etiquetan de esa forma.

### Rollback

Retirar `apps/web`, sus cuatro scripts raíz y los gates web de CI. No existen
migraciones ni cambios de datos asociados.

## 2026-07-31 — Robustez de la carga SARIF en CI

### Motivo

El upload de CodeQL se ejecutaba con `if: always()` incluso cuando Trivy fallaba
antes de generar el archivo SARIF. Esto añadía el error secundario `Path does
not exist` y ocultaba la causa primaria del escaneo. Además, CodeQL Action v3
emitía advertencias por su runtime Node.js 20.

### Decisión y cambio

- Actualizar ambos uploads a CodeQL Action v4.37.4 mediante SHA inmutable.
- Condicionar cada upload a la existencia de su SARIF con `hashFiles`.
- Conservar `exit-code: 1` en Trivy para que hallazgos altos o críticos y fallos
  reales del escáner sigan bloqueando el job.

### Validación

- Los nombres evaluados por `hashFiles` coinciden con los `output` de Trivy.
- Workflow formateado y validado mediante inspección del diff.
- La confirmación definitiva corresponde al siguiente run de `Secure CI`.

### Riesgo y rollback

Si Trivy no produce un SARIF, el upload se omite, pero el resultado del paso de
Trivy conserva el estado fallido. El rollback es restaurar CodeQL v3 y
`if: always()`, aceptando de nuevo las advertencias y el error secundario.

## 2026-07-31 — Instalación pnpm reproducible en Docker

### Motivo

Tras convertir el repositorio en un workspace, el lockfile pasó a registrar el
override de seguridad definido en `pnpm-workspace.yaml`. Docker copiaba solo los
manifests raíz, por lo que pnpm recibía una configuración vacía y detenía
correctamente `--frozen-lockfile` con `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.

### Decisión y cambio

- Copiar `pnpm-workspace.yaml` antes de instalar en las etapas build y runtime.
- Filtrar explícitamente `secure-service-desk-api` para no instalar la Demo UI
  dentro de la imagen del backend.
- Mantener `--frozen-lockfile`, `--ignore-scripts` y `--prod` en runtime.

### Validación

- El error se reprodujo en Docker con el Dockerfile anterior.
- Una imagen de diagnóstico con la configuración propuesta instaló el lockfile
  congelado y compiló NestJS correctamente.
- La imagen completa construyó correctamente y la inspección runtime confirmó
  NestJS disponible, con la Demo UI y TypeScript ausentes.

### Riesgo y rollback

El selector depende del nombre estable del paquete raíz. Si este cambia, Docker
fallará de forma visible en la instalación en vez de incluir paquetes no
deseados. El rollback es retirar el filtro y conservar la copia del workspace,
asumiendo entonces una instalación más amplia.

## 2026-07-31 — Gate SARIF alineado con severidades

### Motivo

El escaneo de imagen generaba SARIF con todas las severidades. Trivy Action
elimina internamente el filtro `severity` para ese formato salvo que se active
`limit-severities-for-sarif`, por lo que `exit-code: 1` bloqueaba también
hallazgos inferiores a `HIGH`. El escáner de secretos se activaba por defecto y
recorría el caché de Corepack, que no forma parte del runtime de la aplicación.

### Decisión y cambio

- Activar `limit-severities-for-sarif: true` en workspace e imagen.
- Declarar `scanners: vuln` en el gate de vulnerabilidades de imagen.
- Mantener un gate de secretos de imagen separado, visible y fail-closed.
- Eliminar pnpm, sus shims, caché de Corepack y store después de instalar
  producción.
- Conservar `severity: HIGH,CRITICAL`, `ignore-unfixed: false` y `exit-code: 1`.

### Validación

- El run `30653075144` confirmó quality, integración, build, workspace scan y
  upload SARIF correctos; solo el gate de imagen falló.
- El entrypoint fijado de Trivy Action fue revisado para confirmar la semántica
  de `limit-severities-for-sarif`.
- La imagen completa construyó correctamente con 120 MB; NestJS quedó disponible
  y se verificó la ausencia de pnpm utilizable, sus cachés, TypeScript y la Demo
  UI. Corepack permanece como paquete incluido por Node, pero sus shims están
  deshabilitados.

### Riesgo y rollback

El SARIF deja de publicar severidades inferiores a `HIGH`, coherente con el gate
de vulnerabilidades. Los secretos se evalúan en un paso independiente contra la
imagen construida; si el build falla, este paso se omite para no añadir un error
secundario por imagen inexistente. El rollback es retirar el límite y volver a
un único escaneo mixto, aceptando menor observabilidad.

## 2026-07-31 — Enforcement Trivy visible y runtime mínimo

### Motivo

Tras alinear el SARIF con `HIGH,CRITICAL`, el gate confirmó un hallazgo de esas
severidades, pero el formato SARIF no mostró paquete, identificador ni versión en
la consola. La inspección del gate de secretos también detectó metadatos de pnpm
en `/root/.cache/pnpm`, innecesarios después de construir la imagen.

### Decisión y cambio

- Ejecutar primero un scan de vulnerabilidades en formato `table` con
  `exit-code: 1` para enforcement visible.
- Generar SARIF en un paso independiente con `exit-code: 0`, conservando el
  upload a Code Scanning aunque el enforcement encuentre vulnerabilidades.
- Mantener el gate de secretos independiente y fail-closed.
- Retirar caché de pnpm, lockfile y configuración del workspace del runtime; el
  gate de workspace continúa siendo la fuente de cobertura de dependencias.

### Validación

- El run `30654633031` confirmó que build, upload SARIF y secret scan pasan; el
  único fallo fue el scan de vulnerabilidades de imagen.
- La imagen completa construyó correctamente con el lockfile congelado y quedó
  en 79 MB. La inspección runtime devolvió `runtime-metadata-clean: ok`: NestJS
  permanece resoluble y no están los cachés de Corepack/pnpm, los manifests del
  workspace, TypeScript ni la Demo UI.
- El próximo run es la evidencia definitiva del detalle del hallazgo o del gate
  completamente verde.

### Riesgo y rollback

El escaneo de imagen deja de inferir dependencias desde el lockfile completo del
workspace, que incluía paquetes no instalados en runtime. Esa cobertura no se
elimina: permanece en `Trivy workspace scan` y `pnpm audit:prod`. El escaneo de
imagen conserva OS, paquetes presentes y secretos. El rollback es conservar los
manifests en runtime y aceptar posibles hallazgos ajenos al artefacto instalado.
