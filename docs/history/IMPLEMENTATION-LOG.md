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

## 2026-08-03 — Contrato OpenAPI versionado

### Motivo

Swagger UI ya estaba disponible en `/docs`, pero el contrato solo existía como
un documento generado en memoria al arrancar la API. Para un proyecto de
portafolio se necesita una especificación revisable, descargable y verificable
en CI.

### Decisión y cambio

- Mantener NestJS Swagger como fuente de metadata para no duplicar rutas, DTO y
  esquemas manualmente en YAML.
- Extraer la configuración a `src/openapi.ts`, compartida por Swagger UI y el
  exportador estático.
- Versionar `docs/openapi.json` y comprobar con `git diff --exit-code` que no esté
  desactualizado después de generar el documento.
- Declarar en el contrato el bearer JWT, la cookie de refresh y el header CSRF.

### Validación

`pnpm build`, `pnpm openapi:export` y la comprobación de diff deben pasar antes
de publicar cambios de controladores o DTO. El exportador usa un módulo NestJS
aislado con los mismos controladores y decorators, por lo que no requiere
MongoDB, Redis ni BullMQ durante el gate de calidad. El endpoint interactivo
`/docs` y el archivo versionado provienen de la misma función
`createOpenApiDocument`.

El primer run `30835171239` demostró que arrancar `AppModule` en el exportador
abría conexiones externas y agotaba el timeout del job. Ese enfoque se retiró;
el exportador aislado se valida localmente con build y generación determinista.

### Riesgo y rollback

El contrato puede cambiar cuando cambien decorators o DTO. El gate de diff hace
visible esa modificación y obliga a versionarla junto al código. El rollback es
restaurar el archivo generado y retirar el paso de exportación, manteniendo
Swagger UI en runtime.

## 2026-07-31 — Retiro de npm del runtime

### Motivo

El run `30655660928` validó el enforcement visible y reportó seis
vulnerabilidades dentro del `npm` incluido por `node:22-alpine`: cinco `HIGH` y
una `CRITICAL` en dependencias internas `brace-expansion`, `picomatch`,
`sigstore` y `tar`. No pertenecen al grafo productivo instalado por la API.

### Decisión y cambio

- Retirar del stage runtime los paquetes globales de npm y Corepack, junto con
  sus ejecutables, después de completar la instalación productiva.
- Conservar únicamente `node`, `dist`, `package.json` y las dependencias de
  producción necesarias para ejecutar `node dist/main.js`.
- No ignorar CVE ni reducir severidades: el mismo gate debe demostrar que la
  remediación eliminó los componentes vulnerables.

Se descartó actualizar dependencias internas de npm de forma manual: alterar su
árbol vendorizado crea un runtime difícil de mantener y npm no es necesario para
arrancar ni operar el servicio.

### Validación

- Quality gates, Trivy workspace e integración real pasaron en el run
  `30655660928`.
- El scan de imagen identificó `CVE-2026-13149`, `CVE-2026-14257`,
  `CVE-2026-33671`, `CVE-2026-48815`, `CVE-2026-59873` y `CVE-2026-59874`.
- El build, la resolución de NestJS, la ausencia de npm/Corepack y el nuevo gate
  de imagen se validan antes de cerrar el cambio.

### Riesgo y rollback

No se podrán ejecutar `npm`, `npx` ni gestores de paquetes dentro del contenedor
en producción; es una restricción intencional para un artefacto inmutable. Node
y las dependencias instaladas permanecen disponibles. El rollback es restaurar
los paquetes globales de la imagen base y aceptar nuevamente su superficie de
ataque y sus hallazgos.

## 2026-08-03 — CI verde con contrato OpenAPI y runtime mínimo

El run `30835848475` sobre el commit `3e19b41` confirmó el estado integrado:

- Quality gates pasó incluyendo `pnpm openapi:export` y el diff del contrato.
- La integración real de MongoDB, Redis, GridFS y BullMQ pasó.
- Trivy workspace pasó y publicó SARIF.
- La imagen Docker construyó y el escaneo Trivy de vulnerabilidades pasó después
  de retirar npm/Corepack del runtime.
- El SARIF de imagen, el secret scan y la limpieza del job pasaron.

Este run es la evidencia de referencia para el hardening de la imagen y el
contrato OpenAPI versionado.

## 2026-08-13 — Perfil Floci para evolución cloud local

### Motivo

Los siete pendientes de evolución requieren validar almacenamiento, transporte,
secretos y observabilidad cloud sin introducir credenciales reales ni afirmar
que AWS productivo está desplegado.

### Decisión

Se añadió `compose.floci.yml` como perfil opcional y reproducible. Floci queda
aislado de la ejecución normal: MongoDB sigue siendo la fuente de verdad, Redis
y BullMQ siguen procesando el runtime actual, y ningún módulo de negocio accede
directamente al emulador.

### Alternativas consideradas

- Montar Floci en el compose principal y hacerlo obligatorio.
- Reemplazar GridFS, Redis o BullMQ antes de demostrar paridad.
- Simular antivirus/CDR con una respuesta positiva fija.
- Exponer el Docker socket para que Floci cree contenedores.

### Archivos afectados

`compose.floci.yml`, `.env.example`, `FLOCI.md`, `README.md`.

### Validación

La imagen oficial fue fijada por digest consultado en el registry. La
configuración YAML, el endpoint `/_floci/health` y el healthcheck de Docker
fueron validados localmente. El primer healthcheck usaba `wget`, que no existe
en la imagen; se corrigió a `curl` y el contenedor quedó `healthy`. S3 y SQS
respondieron usando credenciales dummy y el volumen `floci_data`.

### Riesgos y rollback

El emulador no demuestra disponibilidad, seguridad ni paridad completa de AWS
administrado. El rollback consiste en no activar el perfil o retirar
`compose.floci.yml` y sus variables; el stack principal no depende de él.

### Estado

Implementado como foundation de laboratorio; adaptadores cloud todavía no
implementados.

## 2026-08-13 — Outbox durable, retención, JWKS y métricas

### Motivo

Cerrar los pendientes que podían implementarse dentro del runtime sin afirmar
multi-tenancy, antivirus/CDR ni disponibilidad administrada de AWS.

### Decisiones y cambio

- Las notificaciones escriben un evento en `outbox_events` y el reconciliador
  publica eventos pendientes con IDs idempotentes en BullMQ. La atomicidad
  estricta documento-evento queda condicionada a MongoDB replica set y no se
  presenta como activa en el compose actual.
- Los reportes incorporan `expiresAt`; el worker retira el archivo GridFS
  expirado y conserva el registro como `PURGED`.
- JWT conserva compatibilidad con las variables individuales y acepta un anillo
  JSON de claves públicas/privadas. El `kid` activo firma y todos los miembros
  vigentes validan; JWKS solo expone material público.
- `/api/metrics` ofrece contadores Prometheus de baja cardinalidad sin datos de
  identidad, tokens ni identificadores de recursos.

### Alternativas descartadas

- Borrar documentos de reportes junto con el PDF, porque elimina trazabilidad.
- Hacer obligatorio el replica set sin adaptar la integración existente.
- Simular un antivirus/CDR con una respuesta fija.
- Poner `tenantId` opcional y llamarlo aislamiento multi-tenant.

### Archivos afectados

`src/modules/jobs`, `src/modules/notifications`, `src/modules/reports`,
`src/modules/auth`, `src/infrastructure/observability`, `src/modules/health`,
`.env.example`, `docs/openapi.json`.

### Validación

`pnpm lint`, `pnpm test`, `pnpm build` y `pnpm openapi:export` pasaron. La
validación contra Floci confirmó health, S3 y SQS, pero no sustituye la
validación de AWS administrado.

### Riesgos y rollback

El outbox no tiene atomicidad estricta mientras MongoDB opere sin replica set;
la recuperación desde estados pendientes permanece como fallback. El rollback
consiste en desactivar el anillo, conservar el campo de retención por defecto y
no activar adaptadores externos; no se requiere borrar datos.

## 2026-08-13 — Imágenes Docker separadas y demo web ejecutable

### Motivo

La SPA debe poder demostrarse desde Docker sin mezclarse con el proceso API, y
cada superficie debe tener una imagen escaneable y un healthcheck coherente.

### Decisiones y cambio

- `secure-service-desk-api:local` se usa para API y worker; `worker` desactiva el
  healthcheck HTTP heredado porque no sirve tráfico web.
- `secure-service-desk-web:local` compila React/Vite y sirve los estáticos con
  Nginx en el puerto 3001. Nginx enruta `/api` al servicio `api:3000`.
- La resolución del upstream se difiere a petición para que la imagen web no
  muera al ejecutarse fuera de la red Compose durante un smoke test estático.
- Ambas imágenes tienen healthcheck; la API conserva usuario runtime `node`.

### Validación

Las dos imágenes construyeron correctamente. El stack Compose quedó con API y
frontend `healthy`; `GET http://localhost:3001/` respondió `200` y
`GET http://localhost:3001/api/health/live` atravesó el reverse proxy y respondió
`200`. El baseline ZAP fue intentado contra el frontend, pero no terminó dentro
del límite de cinco minutos por la descarga/ejecución lenta de la imagen ZAP.

### Riesgos y rollback

La imagen web requiere la red Compose para que `/api` alcance al backend; fuera
de ella puede servir estáticos, pero las llamadas API fallarán. El rollback es
retirar el `resolver`/variable de Nginx y los healthchecks, sin tocar datos.

## 2026-08-12 — MFA, SonarCloud y MCP

### Motivo

El plan de portafolio requería demostrar controles de identidad reforzados,
análisis estático y una interfaz MCP que no pudiera convertir una instrucción
ambigua en una mutación silenciosa del service desk.

### Decisiones y cambio

- MFA usa TOTP RFC 6238 propio sobre `node:crypto`; el secreto se cifra con
  AES-256-GCM y la clave se configura fuera del repositorio.
- El login con MFA se divide en password + desafío opaco de un solo uso; activar
  o desactivar MFA incrementa `authzVersion` para invalidar sesiones antiguas.
- SonarCloud es opt-in mediante `SONAR_TOKEN`, `SONAR_ORGANIZATION` y
  `SONAR_PROJECT_KEY`, para no bloquear forks sin credenciales.
- MCP usa el SDK TypeScript oficial, bearer JWT y los servicios de dominio. Las
  herramientas de mutación solo preparan intenciones temporales hasta recibir
  confirmación explícita del mismo usuario.
- AWS no se añadió al runtime. Floci queda documentado como laboratorio de una
  etapa posterior, sin montar Docker socket ni introducir credenciales.

### Validación

`pnpm lint`, las pruebas dirigidas de configuración/auth, `pnpm build` y
`pnpm openapi:export` deben pasar. El contrato versionado incluye las rutas MFA
y MCP.

## 2026-08-14 — Concurrencia atómica de login

### Orden de revisión

- **Technical orchestrator:** delimitó el punto 1 de Notion, sus criterios de
  aceptación, riesgo y rollback.
- **Fullstack web engineer:** aplicó la lógica en `UsersService` usando la
  persistencia MongoDB existente, sin agregar Redis como fuente de verdad.
- **QA engineer:** añadió prueba unitaria del pipeline y prueba de integración
  con ocho intentos concurrentes contra MongoDB real.
- **AppSec reviewer:** verificó que el bloqueo no dependa del frontend, que el
  filtro no revele existencia de usuarios y que los intentos posteriores al
  bloqueo no incrementen el contador.

### Cambio y motivo

`registerFailedLogin` ya no modifica `failedLoginAttempts` en un documento
hidratado para luego guardarlo. Ahora utiliza una actualización atómica
condicional: incrementa el contador, aplica el umbral y establece
`lockedUntil` en un pipeline de MongoDB. Si otra solicitud ya activó el bloqueo,
la operación no encuentra una cuenta elegible y no altera el estado.

### Validación

- Typecheck: PASS.
- Build NestJS: PASS.
- Unitarias: 19 suites, 38 tests PASS.
- E2E HTTP: 5 suites, 17 tests PASS.
- Integración Testcontainers: PASS — la suite real verificó login y MFA
  concurrentes junto con MongoDB, Redis, GridFS y BullMQ.

### Riesgos y rollback

El comportamiento contra MongoDB real debe confirmarse en Docker Desktop o CI.
La reversión es solo de código y pruebas; no hay cambios destructivos ni
migraciones de datos.

## 2026-08-14 — Concurrencia atómica de MFA

### Orden de revisión

- **Technical orchestrator:** tomó el punto 2 vigente de Notion y definió el
  límite entre reclamo de intento, validación TOTP y consumo del challenge.
- **Fullstack web engineer:** cambió `MfaService` para usar operaciones
  condicionales de MongoDB y mantuvo la fuente de verdad en MongoDB.
- **QA engineer:** añadió pruebas de pipeline, consumo único y ocho intentos
  concurrentes contra la integración real.
- **AppSec reviewer:** verificó expiración, replay, máximo de intentos y que el
  throttling no sea reemplazado por lógica en frontend.

### Cambio y motivo

El challenge MFA ahora reclama un intento de forma atómica antes de validar el
código. Los challenges expirados, usados o agotados no pueden reclamar nuevos
intentos. El consumo correcto exige una segunda condición atómica de challenge
vigente y no usado; el quinto código incorrecto deja el challenge consumido.

### Validación

- Typecheck: PASS.
- Build NestJS: PASS.
- Unitarias: 20 suites, 40 tests PASS.
- E2E HTTP: 5 suites, 17 tests PASS.
- Integración real: 7 tests PASS con MongoDB, Redis, GridFS y BullMQ.

### Riesgos y rollback

El throttling HTTP puede producir `429` antes de llegar a MongoDB y debe
conservarse como capa complementaria. El rollback es solo de código y pruebas;
no hay migraciones ni operaciones destructivas.

## 2026-08-14 - Login exitoso solo despues de autenticacion completa

### Orden de revision

- **Technical orchestrator:** delimito el punto 3 de Notion y separo los
  criterios de password validada, challenge MFA, sesion y login exitoso.
- **Fullstack web engineer:** ajusto `AuthService` para registrar el exito
  despues de crear la sesion, manteniendo el challenge como estado intermedio.
- **QA engineer:** cubrio los tres caminos con pruebas unitarias y ejecuto la
  regresion HTTP e integracion con infraestructura real.
- **AppSec reviewer:** verifico que una password correcta no genere una senal
  de login exitoso ni actualice `lastLoginAt` cuando MFA aun esta pendiente.

### Cambio y motivo

Cuando MFA esta activo, el login con password valida crea unicamente un
challenge. `registerSuccessfulLogin` y el evento de auditoria se ejecutan
despues de emitir la sesion solo en el flujo password-only o tras completar
correctamente el MFA. Esto evita presentar una autenticacion incompleta como
exitosa.

### Validacion

- Typecheck: PASS.
- Build NestJS: PASS.
- Unitarias: 20 suites, 43 tests PASS.
- E2E HTTP: 5 suites, 17 tests PASS.
- Integracion Testcontainers: 7 tests PASS con MongoDB, Redis, GridFS y
  BullMQ.

### Riesgos y rollback

La sesion y la actualizacion de metadatos no forman una transaccion unica; una
falla posterior puede dejar una sesion creada sin `lastLoginAt` actualizado.
El rollback es solo de codigo y pruebas; no hay migraciones ni operaciones
destructivas.

## 2026-08-14 - Auditoria critica durable y telemetria opcional

### Orden de revision

- **Technical orchestrator:** tomo el punto 6 de Notion y clasifico los
  eventos criticos frente a la telemetria no critica.
- **Fullstack web engineer:** agrego `AuditService.recordCritical()` y lo aplico
  a roles, MFA, refresh reuse, MCP y reprocesamiento de dead letters.
- **QA engineer:** cubrio clasificacion, persistencia y propagacion de fallos,
  y ejecuto la regresion HTTP e integracion con infraestructura real.
- **AppSec reviewer:** verifico que los eventos criticos no se silencien y que
  un error de persistencia sea visible para el caller; la sanitizacion
  recursiva se mantiene como siguiente punto.

### Cambio y motivo

La auditoria critica ahora tiene un contrato separado. `recordCritical()` solo
acepta acciones clasificadas, escribe en MongoDB y propaga errores. Los eventos
de login general, preparacion MCP y telemetria de dominio no critica conservan
`record()` y su tolerancia operacional.

### Validacion

- Typecheck y build API: PASS.
- Unitarias: 22 suites, 51 tests PASS.
- E2E HTTP: 6 suites, 19 tests PASS.
- Integracion Testcontainers: 8 tests PASS con MongoDB, Redis, GridFS y
  BullMQ.

### Riesgos y rollback

La auditoria y la mutacion de negocio aun no comparten una transaccion unica;
un outbox o transaccion MongoDB seria una evolucion posterior si el nivel de
consistencia lo exige. La sanitizacion profunda se implementara en el punto 7.
El rollback es solo de codigo, sin operaciones destructivas sobre MongoDB.

## 2026-08-14 - Maquina de estados idempotente para acciones MCP

### Orden de revision

- **Technical orchestrator:** tomo el punto 5 de Notion y definio los estados
  validos y las transiciones permitidas.
- **Fullstack web engineer:** reemplazo el claim basado en `confirmedAt` por
  una reclamacion atomica `PENDING -> EXECUTING` y persistio el resultado final.
- **QA engineer:** cubrio doble confirmacion, error durante la mutacion y
  cancelacion mediante pruebas unitarias del servicio.
- **AppSec reviewer:** verifico ownership del token, expiracion, RBAC y que el
  error persistido no revele detalles sensibles.

### Cambio y motivo

Las acciones MCP nuevas nacen en `PENDING`. Solo una solicitud puede reclamar
el token y pasar a `EXECUTING`; despues de ejecutar `TicketsService` se marca
`COMPLETED` o, si falla, `FAILED` con codigo y mensaje generico. Cancelar solo
es posible desde `PENDING` y produce `CANCELLED`. Se conserva compatibilidad
de lectura para documentos historicos sin estado explicito.

### Validacion

- Typecheck: PASS.
- Pruebas dirigidas MCP: 3 tests PASS.
- El contrato de estados y la decision se documentaron en `INTEGRATIONS.md`
  y `docs/DECISIONS.md`.

### Riesgos y rollback

La mutacion del ticket y el cambio de estado MCP no forman una transaccion
unica; si falla la persistencia final puede requerir recovery posterior. La
auditoria critica durable se aborda en el punto 6. El rollback es de codigo y
esquema, sin operaciones destructivas sobre MongoDB.

## 2026-08-14 - Step-up authentication para configurar MFA

### Orden de revision

- **Technical orchestrator:** tomo el punto 4 de Notion y eligio contrasena
  actual como step-up explicito para inicio y confirmacion del alta.
- **Fullstack web engineer:** agrego DTOs, verificacion con el hasher existente,
  cambios de controller, cliente API y formulario visual.
- **QA engineer:** cubrio rechazos por password ausente/incorrecta en HTTP,
  unitarias y la integracion real con MongoDB.
- **AppSec reviewer:** verifico que un bearer robado no pueda generar ni
  confirmar el secreto MFA, y que la baja siga exigiendo password + TOTP.

### Cambio y motivo

`POST /api/auth/mfa/setup` y `POST /api/auth/mfa/verify-setup` ahora exigen la
contrasena actual ademas del access token. El servicio reutiliza
`PasswordHasherService`; no guarda la password ni incorpora un proveedor
externo. La baja conserva password + TOTP y los eventos de alta/baja.

### Validacion

- Typecheck backend/frontend: PASS.
- Build API y web: PASS.
- Unitarias: 20 suites, 45 tests PASS.
- E2E HTTP: 6 suites, 19 tests PASS.
- Integracion Testcontainers: step-up real con MongoDB, Redis, GridFS y BullMQ.

### Riesgos y rollback

La defensa depende de la password actual y debe mantenerse junto con rate
limiting. La auditoria critica durable se implementara en el punto 6. El
rollback es solo de codigo y pruebas; no hay migraciones ni operaciones
destructivas.

## 2026-08-14 - Sanitizador recursivo común para auditoria, logs y dead letters

### Orden de revision

- **Technical orchestrator:** tomo el punto 7 y definio un contrato comun con
  limites explícitos para profundidad, propiedades, strings y ciclos.
- **Fullstack web engineer:** implemento la utilidad reusable y la conecto a
  auditoria, `StructuredLogger` y captura de dead letters.
- **QA engineer:** agrego pruebas de objetos anidados, arrays, truncado,
  referencias cíclicas y credenciales embebidas en strings.
- **AppSec reviewer:** verifico que las claves sensibles se eliminen del
  resultado y que los logs no expongan bearer tokens ni secretos por texto.

### Cambio y motivo

`sanitizeSensitiveData()` recorre valores anidados de forma segura, evita
recursión infinita con `WeakSet`, limita la cantidad de elementos y el tamaño
de strings, y elimina las claves sensibles. `sanitizeSensitiveRecord()` ofrece
la forma compatible con payloads de auditoria y dead letter. Los tres
consumidores usan ahora el mismo contrato.

### Validacion

- Typecheck: PASS.
- Build NestJS: PASS.
- Lint web: PASS.
- Unitarias: 23 suites, 56 tests PASS.

### Riesgos y rollback

La sanitización protege superficies operativas, pero no valida archivos ni
reemplaza controles de secretos en origen. El rollback es solo de código y
pruebas, sin migraciones ni operaciones destructivas sobre MongoDB.

## 2026-08-14 - Idempotencia del worker de reportes

### Orden de revision

- **Technical orchestrator:** tomo el punto 8 y definio el claim MongoDB como
  fuente de verdad del estado del reporte.
- **Fullstack web engineer:** implemento `QUEUED -> PROCESSING` con
  `findOneAndUpdate`, ownership por `jobId` y finalizacion condicionada del
  reporte antes de emitir efectos secundarios.
- **QA engineer:** cubrio jobs duplicados, reporte ya completado y retorno a
  `QUEUED` durante reintentos.
- **AppSec reviewer:** verifico que solo el worker ganador genere el PDF y que
  los errores persistidos en el reporte pasen por sanitizacion de strings.

### Cambio y motivo

El worker ya no lee un reporte `QUEUED` y lo guarda posteriormente. Reclama
atómicamente el documento en MongoDB, genera el PDF solo con ese claim y actualiza
`COMPLETED` exigiendo el mismo `processingJobId`. Los jobs duplicados se
consideran no-op mientras el primero procesa, y los reintentos liberan el claim
para volver a encolar el trabajo.

### Validacion

- Typecheck: PASS.
- Build NestJS: PASS.
- Pruebas dirigidas del worker: 3 tests PASS.
- E2E HTTP: 6 suites, 19 tests PASS.
- Integracion Testcontainers: 8 tests PASS con MongoDB, Redis, GridFS y BullMQ.

### Riesgos y rollback

Un apagado abrupto puede dejar un claim en `PROCESSING`; la recuperación de
claims expirados queda como evolución explícita. El rollback es solo de código
y esquema compatible, sin operaciones destructivas sobre MongoDB.

## 2026-08-14 - Retencion segura y recuperable de reportes

### Orden de revision

- **Technical orchestrator:** tomo el punto 9 y separo el éxito de GridFS de la
  transición de estado en MongoDB.
- **Fullstack web engineer:** añadió guardas de concurrencia, reintento natural
  por estado y limpieza del `fileId` solo después de un delete exitoso.
- **QA engineer:** cubrió fallo de GridFS, purga exitosa y dos ciclos
  solapados en la misma instancia.
- **AppSec reviewer:** verificó que el error persistido y el log no expongan
  credenciales.

### Cambio y motivo

La retención conserva `COMPLETED` y `fileId` cuando GridFS falla, registra un
error sanitizado y permite que el siguiente ciclo reintente. Solo después del
borrado exitoso una actualización condicional marca `PURGED` y elimina la
referencia. Un `purgeInFlight` evita ejecuciones solapadas por instancia.

### Validacion

- Typecheck y build NestJS: PASS.
- Pruebas dirigidas de retención: 3 tests PASS.
- Unitarias: 25 suites, 63 tests PASS.
- E2E HTTP: 6 suites, 19 tests PASS.
- Integración Testcontainers: 8 tests PASS con MongoDB, Redis, GridFS y BullMQ.

### Riesgos y rollback

Los fallos permanentes de GridFS pueden generar reintentos periódicos y quedan
visibles para diagnóstico. El rollback es solo de código y pruebas, sin
migraciones ni operaciones destructivas sobre MongoDB.

## 2026-08-14 - Reglas CLOSED, watchers y politica de notificaciones

### Orden de revision

- **Technical orchestrator:** tomo el punto 10 y fijo la regla de contenido
  inmutable en `CLOSED`, además de una política explícita para watchers.
- **Fullstack web engineer:** añadió endpoints de alta/baja de watchers,
  validación de usuarios activos, autorización `ADMIN`/`SUPPORT` y
  `TicketNotificationPolicy`.
- **QA engineer:** cubrió destinatarios sin duplicados, comentarios públicos
  frente a notas internas y rechazo de mutaciones de contenido cerrado.
- **AppSec reviewer:** verificó defensa en servicio, no solo controller, y que
  un watcher inactivo o no autorizado no pueda incorporarse.

### Cambio y motivo

Los comentarios y uploads consultan una única regla de dominio que rechaza
`CLOSED`. Watchers se agregan/eliminan por rutas autenticadas, con usuarios
activos y sin duplicados. La política de notificación decide assignee,
requester y watchers, y los efectos siguen el outbox existente.

### Validacion

- Typecheck y build NestJS: PASS.
- OpenAPI export: PASS.
- Unitarias: 26 suites, 66 tests PASS.
- E2E HTTP: 6 suites, 19 tests PASS.
- Lint frontend: PASS.
- Integracion Testcontainers: 8 tests PASS con MongoDB, Redis, GridFS y BullMQ.

### Riesgos y rollback

El modelo sigue siendo monoinquilino y las notificaciones dependen de la
entrega asíncrona. El rollback es solo de código y pruebas; no hay migraciones
destructivas.

## 2026-08-14 - Refactor modular de TicketsService

### Orden de revision

- **Technical orchestrator:** definió una extracción incremental sin cambiar
  los contratos que consumen MCP, adjuntos o controllers.
- **Fullstack web engineer:** separó query, command y comments, dejando una
  fachada `TicketsService` compatible y registrando los nuevos providers en el
  módulo.
- **QA engineer:** ejecutó unitarias, e2e e integración real después del cambio
  de composición NestJS.
- **AppSec reviewer:** revisó que autorización, optimistic concurrency,
  workflow y regla `CLOSED` permanecieran en servicios, no en frontend.

### Cambio y motivo

`TicketsQueryService` concentra listados, filtros, paginación, caché y lectura;
`TicketCommandService` concentra mutaciones y watchers; y
`TicketCommentsService` concentra comentarios. `TicketsService` solo delega y
mantiene la compatibilidad de los consumidores existentes.

### Validacion

- Typecheck y build NestJS: PASS.
- Unitarias: 26 suites, 66 tests PASS.
- E2E HTTP: 6 suites, 19 tests PASS.
- Integracion Testcontainers: 8 tests PASS con MongoDB, Redis, GridFS y BullMQ.
- Lint frontend: PASS.

### Riesgos y rollback

La fachada conserva una dependencia de compatibilidad para consumidores
existentes; puede eliminarse en una evolución posterior. El rollback es solo
de código, sin migraciones ni operaciones destructivas.

## 2026-08-14 - Refactor de sesiones de autenticacion

### Orden de revision

- **Technical orchestrator:** confirmó que el límite útil era el ciclo de vida
  de refresh sessions, no una reescritura de identidad.
- **Fullstack web engineer:** extrajo `SessionService` y dejó `AuthService`
  enfocado en registro, password, MFA y orquestación.
- **QA engineer:** añadió pruebas de hash opaco y reuse, y ejecutó la regresión
  HTTP e integración real.
- **AppSec reviewer:** verificó rotación condicional, revocación de familia y
  auditoría crítica de reuse.

### Cambio y motivo

`SessionService` concentra emisión de access/refresh, persistencia del hash,
rotación, logout y revocación de familia. `AuthService` delega esas acciones y
conserva el significado de autenticación completa con MFA.

### Validacion

- Typecheck y build NestJS: PASS.
- Unitarias: 27 suites, 68 tests PASS.
- E2E HTTP: 6 suites, 19 tests PASS.
- Integracion Testcontainers: 8 tests PASS con MongoDB, Redis, GridFS y BullMQ.
- Lint frontend: PASS.

### Riesgos y rollback

La emisión de sesión y el JWT no forman una transacción única; se conserva el
riesgo documentado del diseño. El rollback es solo de código, sin migraciones.

## 2026-08-14 - Refactor modular del Workspace frontend

### Orden de revisión

- **Technical orchestrator:** mantuvo `Workspace` como contrato de entrada y
  definió cortes por feature sin cambiar el flujo de demo.
- **Fullstack web engineer:** separó shell, hooks y componentes de resumen,
  cola, tabla, detalle, creación y notificaciones; el estado remoto quedó en
  `useTickets` y `useNotifications`.
- **QA engineer:** conservó las pruebas de concurrencia, creación, detalle
  autorizado, error/reintento de notificaciones y lectura de campana.
- **AppSec reviewer:** verificó que el refactor no mueva autorización al
  cliente, no persista access tokens y mantenga el backend como límite de
  seguridad.

### Cambio y motivo

`Workspace.tsx` pasó de concentrar layout, datos y presentación a orquestar
estado y callbacks mediante `WorkspaceShell`. Las partes visuales son
componentes pequeños y los efectos de red viven en hooks específicos. Se
preserva el flujo existente de tickets, detalle autorizado, notificaciones,
MFA y MCP.

### Validación

- Lint frontend: PASS.
- Build Vite: PASS.
- Suite web: 4 suites, 17 tests PASS.
- `git diff --check`: PASS.

### Riesgos y rollback

El cliente conserva una fachada `api.ts` transversal hasta el punto 14; no se
presenta como completado. El rollback es solo de código y no requiere cambios
en MongoDB, Redis ni sesiones.

## 2026-08-14 - APIs frontend por dominio y sesión centralizada

### Orden de revisión

- **Technical orchestrator:** definió `HttpClient`, `SessionManager` y la
  fachada de compatibilidad como cortes incrementales.
- **Fullstack web engineer:** creó APIs tipadas para auth, tickets,
  notificaciones y MCP, y migró los consumidores de frontend a sus dominios.
- **QA engineer:** adaptó los mocks al contrato por feature y conservó las
  pruebas de refresh, sesión expirada, concurrencia y flujos del Workspace.
- **AppSec reviewer:** verificó access token en memoria, CSRF persistente,
  refresh con cookie HttpOnly y autorización mantenida en backend.

### Cambio y motivo

El transporte y manejo de errores viven en `HttpClient`; la sesión concentra
access token, CSRF, refresh concurrente, expiración y logout; cada feature
expone únicamente sus operaciones. `lib/api.ts` delega para no romper
consumidores existentes, pero el frontend nuevo ya usa APIs por dominio.

### Validación

- Lint frontend: PASS.
- Build Vite: PASS.
- Suite web: 4 suites, 17 tests PASS.
- Tests de sesión y refresh incluidos: PASS.

### Riesgos y rollback

La fachada histórica permanece temporalmente por compatibilidad. No se agregan
secretos ni persistencia de access tokens. El rollback es solo de código.

## 2026-08-14 - Lint real, typecheck separado y formato verificable

### Orden de revisión

- **Technical orchestrator:** separó lint, typecheck y formato, y definió reglas
  graduales con advertencias de complejidad.
- **Fullstack web engineer:** integró ESLint flat config para NestJS, tests,
  React/Vite y React Hooks.
- **QA engineer:** verificó scripts, formato, compilación, unitarias, e2e y
  regresión web.
- **AppSec reviewer:** revisó que las excepciones fueran explícitas y que la
  regla de regex binaria no debilitara validaciones de archivos.

### Cambio y motivo

pnpm lint ejecuta ESLint real; pnpm typecheck conserva el chequeo de
TypeScript; pnpm format:check verifica Prettier. Se normalizó el formato de
fuentes, tests y configuraciones existentes. Las advertencias de tamaño y
complejidad quedan visibles para próximas iteraciones.

### Validación

- ESLint backend/frontend: PASS, 0 errores y advertencias no bloqueantes.
- Typecheck: PASS.
- Format check: PASS.
- Build API y web: PASS.
- Unitarias: 27 suites, 68 tests PASS.
- E2E: 6 suites, 19 tests PASS.
- Frontend: 4 suites, 17 tests PASS.

### Riesgos y rollback

La normalización de formato aumenta el diff mecánico, pero no cambia contratos
ni comportamiento intencional. Las advertencias existentes se mantienen como
deuda trazable. El rollback es solo de scripts, configuración y formato.

## 2026-08-14 - Coverage gradual orientada a reglas críticas

### Orden de revisión

- **Technical orchestrator:** definió umbrales graduales a partir de la línea
  base, separando el mínimo global de los módulos de mayor riesgo.
- **Fullstack/backend:** mantuvo Jest como contrato de pruebas del backend y
  habilitó reportes text-summary, LCOV y JSON para inspección local y CI.
- **QA engineer:** verificó las 27 suites y 68 tests, incluyendo auth, MFA,
  sesiones, tickets, MCP, workers, auditoría y sanitización.
- **AppSec reviewer:** comprobó que los umbrales específicos cubren controles
  de identidad, autorización, refresh/reuse, acciones MCP y datos sensibles sin
  confundir cobertura con validación de seguridad completa.

### Cambio y motivo

`jest.config.js` ahora publica cobertura en cuatro formatos y bloquea
regresiones mediante umbrales globales y por archivo. Los mínimos se basan en
la evidencia actual; no se elevan artificialmente a 100 %.

### Validación

- Coverage gate: PASS.
- Unitarias: 27 suites, 68 tests PASS.
- Línea base: 37.95 % statements, 37.87 % branches, 31.09 % functions y
  37.95 % lines.

### Riesgos y rollback

La cobertura de controllers, adaptadores y parte de infraestructura permanece
por debajo del objetivo futuro y queda registrada como deuda. No implica que
esas rutas estén sin probar en e2e/integración; significa que el gate unitario
no las cubre suficientemente. El rollback es solo de configuración Jest.

## 2026-08-14 - DAST con OWASP ZAP sobre stack efímero

### Orden de revisión

- **Technical orchestrator:** definió un job aislado que usa el compose real y
  elimina sus volúmenes al finalizar.
- **Fullstack/backend:** mantuvo la prueba contra la frontera Nginx y el
  documento OpenAPI publicado por NestJS.
- **QA engineer:** añadió smoke checks, baseline frontend, API scan y artefactos
  HTML/JSON para reproducir y revisar hallazgos.
- **AppSec reviewer:** verificó claves efímeras, ausencia de producción en el
  flujo, cleanup con `always()` y la declaración explícita de report-only.

### Cambio y motivo

`.github/workflows/security.yml` ahora tiene el job `dast`: crea configuración
local temporal, levanta MongoDB/Redis/API/worker/web, escanea `web:3001` y
`api:3000/api/docs-json`, publica `zap-reports` y apaga el stack. `docs/DAST.md`
describe el contrato operativo y la ejecución local.

### Validación

- Revisión estática de workflow y comandos Docker: PASS.
- Smoke checks definidos para frontend y healthcheck del API.
- Los reportes quedan como artefacto aunque ZAP devuelva alertas.
- La ejecución efectiva requiere GitHub Actions/Docker y debe verificarse en el
  próximo run del workflow.

### Riesgos y rollback

Durante esta fase ZAP no bloquea CI; las alertas se deben revisar antes de
promoverlo a gate. La imagen se consume desde el registro oficial y su
actualización queda como decisión de supply chain. El rollback es solo de
workflow y documentación.

## 2026-08-14 - Métricas protegidas y labels de baja cardinalidad

### Orden de revisión

- **Technical orchestrator:** eligió una protección explícita por configuración
  sin acoplar el endpoint a un proveedor de identidad externo.
- **Fullstack/backend:** añadió `MetricsAccessGuard`, variables documentadas y
  mantuvo el formato Prometheus existente.
- **QA engineer:** cubrió endpoint deshabilitado, token ausente/incorrecto y
  token válido por header dedicado o Bearer.
- **AppSec reviewer:** verificó comparación constante, secreto mínimo,
  default cerrado y ausencia de fallback con paths arbitrarios.

### Cambio y motivo

`/api/metrics` devuelve 404 cuando está deshabilitado y exige un token de
servicio cuando se habilita. El label `route` usa la ruta normalizada de
NestJS o `unmatched`, evitando cardinalidad controlada por el cliente.

### Validación

- Typecheck: PASS.
- Lint: PASS, 0 errores y warnings de deuda ya documentados.
- Unitarias: 28 suites, 71 tests PASS.
- Format check y Compose config: PASS.

### Riesgos y rollback

El despliegue debe gestionar `METRICS_TOKEN` fuera del repositorio y definir una
rotación. La métrica de latencia aún no es un histograma completo. El rollback
es solo de código/configuración.

## 2026-08-14 - Trust proxy explícito para rate limiting

### Orden de revisión

- **Technical orchestrator:** eligió un conteo de saltos explícito y seguro por
  defecto para soportar Nginx/ALB sin cambiar el runtime local.
- **Fullstack/backend:** conectó `TRUST_PROXY_HOPS` con la instancia Express
  antes de procesar solicitudes.
- **QA engineer:** añadió validación de default, configuración de un salto y
  rechazo de valores negativos.
- **AppSec reviewer:** verificó que el API directo no confíe en headers
  reenviados y que la topología confiable quede bajo control del despliegue.

### Cambio y motivo

Express usa `trust proxy = 0` por defecto en la aplicación. El operador puede
configurar el número exacto de proxies confiables; así el throttling puede usar
la IP real detrás de un único proxy sin aceptar indiscriminadamente
`X-Forwarded-For`.

### Validación

- Prettier de los archivos modificados: PASS.
- La suite de configuración cubre default, hop explícito y rechazo negativo.
- Debe repetirse el gate completo antes del commit de la siguiente tanda.

### Riesgos y rollback

El valor debe coincidir con la topología real; se documenta como configuración
de despliegue, no como una garantía automática. El rollback es solo de código y
configuración.

## 2026-08-14 - Hardening de datos, headers frontend y límite de adjuntos

### Orden de revisión

- **Technical orchestrator:** separó endurecimiento local, producción y
  browser boundary sin cambiar MongoDB como fuente de verdad.
- **Fullstack/backend:** exigió TLS MongoDB en producción, dejó Redis bajo
  `rediss://` en producción y fijó puertos locales a loopback.
- **QA engineer:** añadió casos de configuración MongoDB y conservó gates de
  build/contrato; el Compose sigue validable en red interna.
- **AppSec reviewer:** revisó CSP, `nosniff`, framing, permisos, HSTS fuera del
  HTTP local y la diferencia entre formato validado y antivirus.

### Cambio y motivo

`compose.yml` ya no publica MongoDB/Redis a toda la interfaz. La validación de
entorno bloquea MongoDB sin TLS en producción. Nginx declara cabeceras de
seguridad compatibles con el demo same-origin. La documentación mantiene
explícito que no hay antivirus/CDR ni cuarentena.

### Validación

- Compose config: PASS.
- Prettier en configuración/código: PASS.
- La suite de validación cubre TLS MongoDB, configuración de proxy y casos
  existentes de adjuntos.
- Build web/API y ZAP deben confirmar la configuración completa en CI.

### Riesgos y rollback

La configuración TLS real depende de certificados/CA del despliegue. HSTS queda
para HTTPS de producción y el escaneo antivirus/CDR sigue pendiente. El
rollback es de configuración y documentación, sin cambios de datos.

## 2026-08-14 - CI explícito y contrato de runtime

### Orden de revisión

- **Technical orchestrator:** alineó el contrato Node/pnpm con Docker y el
  orden de gates del workflow.
- **Fullstack/backend:** no cambió comportamiento funcional; dejó las señales
  de calidad separadas y reproducibles.
- **QA engineer:** verificó que format, lint, typecheck, pruebas, e2e, build y
  OpenAPI sean pasos observables.
- **AppSec reviewer:** confirmó que el pipeline conserva Dependabot, Trivy,
  ZAP y checks de secretos, sin introducir credenciales.

### Cambio y motivo

`package.json` declara Node 22.x y pnpm 11.8.0. `security.yml` ejecuta
`format:check` y `typecheck` explícitamente antes de los tests y el build.

### Validación

- Format check: PASS.
- Typecheck: PASS.
- Lint: PASS sin errores; warnings de deuda visibles.
- Unitarias: 28 suites, 73 tests PASS.
- E2E: 6 suites, 19 tests PASS.
- Build API/web: PASS.
- Export OpenAPI: PASS en orden secuencial después del build.

### Riesgos y rollback

Branch protection y requisitos de merge siguen siendo configuración de GitHub.
Los adapters AWS no se presentan como implementados. El rollback es solo de
workflow y metadata del paquete.

## 2026-08-14 - Ports y adapters AWS-compatible opcionales

### Orden de revisión

- **Technical orchestrator:** mantuvo MongoDB como fuente de verdad y separó
  capacidades cloud mediante ports.
- **Fullstack/backend:** implementó adapters S3, SQS, Secrets Manager y
  CloudWatch con AWS SDK v3 y configuración `AWS_ENDPOINT_URL` opcional.
- **QA engineer:** cubrió comandos, límites de payload/key, secretos binarios,
  métricas y configuración inválida.
- **AppSec reviewer:** verificó que no se registren secretos, que existan
  límites de entrada y que Floci no sea una dependencia de runtime.

### Cambio y motivo

Se añadió `src/infrastructure/cloud/` con `AttachmentStoragePort`,
`EventPublisherPort`, `SecretsProviderPort` y `ObservabilityPort`, junto a sus
implementaciones AWS-compatible. El módulo no mueve automáticamente datos ni
jobs existentes; permite probar infraestructura incrementalmente.

### Validación

- Typecheck: PASS.
- Pruebas dirigidas de adapters y environment validation: 12 tests PASS.
- Lint: PASS sin errores; permanecen 28 warnings de deuda ya registrados.
- Smoke contra Floci/AWS real: pendiente de ejecutarse en un entorno cloud
  disponible; no se presenta como validado.

### Riesgos y rollback

El runtime funcional continúa dependiendo de MongoDB, Redis, BullMQ y GridFS.
La configuración de bucket, cola, IAM/TLS y endpoint es responsabilidad del
despliegue. El rollback es retirar el módulo, adapters y dependencias AWS; no
requiere cambios de datos.
