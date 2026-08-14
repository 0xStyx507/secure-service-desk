# Registro de decisiones técnicas

Este documento explica qué se decidió, por qué y en qué estado se encuentra. La
arquitectura objetivo única es [RESTRUCTURING-V2.md](RESTRUCTURING-V2.md).

## ADR-001 — Reescritura en TypeScript y NestJS

- **Estado:** aceptado e implementado en la base.
- **Decisión:** el runtime activo vive en `src/`, usa TypeScript estricto y módulos
  de NestJS. El CRUD Express original se conserva solo en `legacy/`.
- **Motivo:** separar contratos, infraestructura y dominio facilita las pruebas,
  el mantenimiento y la explicación del proyecto en el portafolio.
- **Consecuencia:** no existe compatibilidad activa con `/api/autos`.

## ADR-002 — Arquitectura modular

- **Estado:** aceptado.
- **Decisión:** cada capacidad del service desk tendrá su propio módulo
  (`auth`, `users`, `tickets`, `attachments`, `audit`, `notifications` y
  `reports`).
- **Motivo:** evitar módulos genéricos y mantener las reglas de negocio cerca de
  sus controladores, DTO, servicios y esquemas.

## ADR-003 — MongoDB como fuente de verdad

- **Estado:** aceptado e implementado en la base.
- **Decisión:** usar Mongoose para datos de negocio y GridFS para adjuntos.
- **Motivo:** mantener persistencia durable, metadatos y archivos bajo una misma
  estrategia transaccional y operativa.
- **Consecuencia:** Redis será acelerador y transporte de colas; nunca la fuente
  primaria. No se borran colecciones históricas durante la reestructuración.

## ADR-004 — Autenticación propia con JWT RS256

- **Estado:** implementado.
- **Decisión:** usuarios, contraseñas y sesiones se administran en código propio.
  Las contraseñas usan `scrypt`; los access tokens usan RS256 y expiración corta.
- **Motivo:** demostrar directamente el diseño y las pruebas de seguridad en el
  proyecto, sin delegar la capacidad central a Keycloak.
- **Consecuencia:** las claves RSA se inyectan por variables de entorno y nunca
  se versionan.

## ADR-005 — Refresh token opaco en cookie HttpOnly

- **Estado:** implementado.
- **Decisión:** emitir un valor aleatorio, persistir solo su SHA-256, rotarlo en
  cada uso y detectar reutilización por familia.
- **Motivo:** limitar el impacto de XSS y de una filtración de la base de datos.
- **Controles adicionales:** cookie `SameSite=Strict`, `Secure` obligatorio en
  producción y double-submit CSRF en refresh/logout.

## ADR-006 — Roles y autorización por recurso

- **Estado:** implementado para el MVP monoinquilino.
- **Decisión:** usar `ADMIN`, `SUPPORT` y `USER`. Los roles habilitan acciones
  generales. `USER` se limita a requester/watcher; `SUPPORT` opera la cola
  completa y `ADMIN` añade gobierno.
- **Motivo:** RBAC por sí solo no impide que un usuario consulte tickets ajenos.

## ADR-007 — Sin integraciones funcionales externas

- **Estado:** aceptado.
- **Decisión:** retirar Keycloak, RapidAPI y el dominio activo de autos. Tickets,
  comentarios, adjuntos, auditoría, notificaciones y reportes serán capacidades
  propias.
- **Motivo:** conservar un alcance coherente de service desk y evitar que una API
  de terceros determine la disponibilidad de la demostración.
- **Excepción:** MongoDB y Redis son infraestructura interna desplegable, no APIs
  funcionales SaaS.

## ADR-008 — Redis y BullMQ para trabajo derivado

- **Estado:** implementado.
- **Decisión:** Redis almacenará caché reconstruible y respaldará colas BullMQ
  para notificaciones y reportes PDF.
- **Motivo:** sacar tareas lentas del ciclo HTTP.
- **Resiliencia:** reintentos con backoff, idempotencia y dead-letter handling
  básico. Los estados pendientes se reconcilian desde MongoDB y los workers se
  ejecutan fuera del proceso HTTP.

## ADR-009 — Seguridad y cadena de suministro

- **Estado:** base implementada.
- **Decisión:** DTO estrictos, Problem Details, Helmet, CORS restringido, rate
  limiting, logs estructurados, Trivy y Dependabot.
- **Motivo:** cubrir tanto el runtime como dependencias e imágenes.

## ADR-010 — Calidad y trazabilidad

- **Estado:** activo.
- **Decisión:** cada incremento debe incluir código tipado, pruebas Jest/Supertest,
  Swagger y actualización de esta bitácora.
- **Motivo:** el portafolio debe mostrar no solo el resultado, sino las razones y
  la evidencia verificable de cada cambio.

## ADR-011 — MVP monoinquilino

- **Estado:** aceptado.
- **Decisión:** `SUPPORT` y `ADMIN` acceden a la cola completa.
- **Motivo:** el proyecto no modela organizaciones ni equipos todavía; afirmar
  multi-tenancy sin `tenantId` sería un control ficticio.
- **Evolución:** incorporar tenant a tokens, documentos, queries, caché, jobs,
  auditoría y pruebas BOLA antes de ofrecer múltiples organizaciones.

## ADR-012 — Workers separados y recuperación desde MongoDB

- **Estado:** implementado.
- **Decisión:** `main.ts` sirve HTTP y `worker.ts` procesa colas. MongoDB conserva
  estados `PENDING`/`QUEUED`; un reconciliador reencola si Redis falló.
- **Motivo:** permitir escalado independiente y evitar pérdida silenciosa.
- **Riesgo residual:** no hay transactional outbox; la consistencia estricta
  documento-evento requerirá replica set y transacción/outbox.

## ADR-013 — Política de adjuntos limitada

- **Estado:** implementado con riesgo residual.
- **Decisión:** aceptar solo JPEG/PNG de hasta 5 MB, validar firma/MIME/dimensiones,
  almacenar checksum y descargar como attachment.
- **Motivo:** cubrir imágenes de tickets sin depender de almacenamiento SaaS.
- **Riesgo:** no existe antivirus/CDR; `CONTENT_VALIDATED` no significa libre de
  malware.

## ADR-014 — Privilegios JWT versionados

- **Estado:** implementado.
- **Decisión:** incluir `authzVersion` en el JWT y contrastarlo con el usuario
  activo en cada request.
- **Motivo:** un rol retirado no debe conservar privilegios hasta expirar el
  access token.

## ADR-015 — Pruebas de composición sin infraestructura externa

- **Estado:** implementado.
- **Decisión:** compilar `AppModule` y `WorkerAppModule` completos sustituyendo
  únicamente la conexión MongoDB, el caché Redis y las colas por dobles de
  prueba.
- **Motivo:** detectar dependencias NestJS rotas que las pruebas aisladas de
  controladores no pueden observar, sin abrir conexiones ni necesitar secretos.
- **Alternativa descartada:** usar mocks automáticos para cualquier provider
  faltante; habría permitido que un grafo inválido pasara inadvertido.
- **Límite:** esta prueba valida composición e inyección de dependencias, no
  reemplaza la integración real con MongoDB, Redis, GridFS y BullMQ.

## ADR-016 — Integración real con infraestructura desechable

- **Estado:** implementado.
- **Decisión:** ejecutar API y worker contra contenedores exclusivos de MongoDB
  y Redis creados por Testcontainers. Cada ejecución usa una base con nombre
  aleatorio y una pareja RSA efímera, se serializa en un solo proceso Jest y
  detiene los contenedores al finalizar.
- **Motivo:** verificar persistencia, GridFS, caché, semántica BullMQ,
  reintentos, dead-letter y recuperación desde MongoDB sin depender del entorno
  local del desarrollador ni tocar sus volúmenes.
- **Alternativas descartadas:** reutilizar `docker compose` habría mezclado
  estado de desarrollo con pruebas; sustituir MongoDB/Redis por implementaciones
  en memoria no ejercitaría índices, GridFS ni comportamiento real de colas.
- **Controles:** no se ejecutan `dropDatabase`, `deleteMany` ni `flushall`; las
  credenciales y claves existen solo durante el proceso de prueba. Las imágenes
  y GitHub Actions están fijadas por digest/SHA y Dependabot propone sus
  actualizaciones.
- **Lifecycle:** además de los contextos NestJS, la suite construye y ejecuta
  `dist/main.js` y `dist/worker.js`, valida readiness y terminación por señal.
- **Límite:** la suite no simula TLS, red distribuida ni servicios administrados
  de producción.

## ADR-017 — SPA de demostración separada y ligera

- **Estado:** primer corte implementado.

## ADR-020 - Separacion entre password validado y autenticacion completada

- **Estado:** implementado y validado.
- **Decision:** `AuthService` solo registra `registerSuccessfulLogin` y el
  evento de login exitoso despues de crear la sesion. En cuentas sin MFA, el
  flujo es password valida -> sesion -> login exitoso. En cuentas con MFA, la
  password valida solo crea un challenge; la sesion y el login exitoso se
  registran unicamente despues de validar el codigo MFA.
- **Motivo:** validar una password no equivale a completar la autenticacion
  cuando existe un segundo factor. Registrar `lastLoginAt` o un evento exitoso
  antes del MFA producia una senal de auditoria incorrecta.
- **Alternativas descartadas:** registrar el login al validar la password;
  considerar la creacion del challenge como login exitoso; delegar el estado al
  frontend.
- **Archivos afectados:** `src/modules/auth/auth.service.ts`,
  `src/modules/auth/auth.service.spec.ts` y la documentacion de trazabilidad.
- **Validacion:** typecheck, build, 20 suites unitarias/43 tests, 5 suites
  e2e/17 tests y 7 pruebas de integracion reales con MongoDB, Redis, GridFS y
  BullMQ: PASS.
- **Riesgo residual:** la sesion se crea antes de actualizar `lastLoginAt` y
  los contadores de login. Si esa actualizacion falla, puede existir una sesion
  valida sin que el metadato de ultimo login se haya persistido.
- **Rollback:** restaurar el orden anterior en `AuthService` y retirar las
  pruebas asociadas; no requiere migracion ni operacion destructiva sobre
  MongoDB.

## ADR-021 - Step-up authentication para configuracion de MFA

- **Estado:** implementado y validado.
- **Decision:** el inicio y la confirmacion del alta de MFA requieren la
  contrasena actual ademas del access token. La baja mantiene contrasena mas
  TOTP. No se agrega un proveedor externo ni se crea una sesion paralela.
- **Motivo:** un access token robado no debe permitir generar o confirmar un
  segundo factor. La revalidacion de la contrasena reduce el impacto de una
  sesion bearer comprometida sin cambiar el modelo de identidad propio.
- **Alternativas descartadas:** confiar solo en el JWT; exigir TOTP para
  iniciar el alta cuando el usuario aun no lo tiene; integrar Keycloak u otro
  proveedor. La primera no es step-up y las otras agregan dependencia o hacen
  imposible el alta inicial.
- **Archivos afectados:** `src/modules/auth/mfa.service.ts`,
  `src/modules/auth/mfa.controller.ts`, los DTOs de MFA, cliente y panel web,
  pruebas HTTP/integracion y `docs/AUTHENTICATION.md`.
- **Validacion:** typecheck backend/frontend, build API/web, 20 suites
  unitarias/45 tests y 6 suites e2e/19 tests: PASS. La integracion real de
  Testcontainers cubre contrasena incorrecta en inicio y confirmacion.
- **Riesgo residual:** la proteccion depende de la contrasena actual y no de una
  prueba de posesion independiente; el endpoint debe conservar rate limiting y
  auditoria. La auditoria critica durable queda en el punto 6 pendiente.
- **Rollback:** restaurar los DTOs, firmas y llamadas anteriores; no requiere
  migracion ni operacion destructiva sobre MongoDB.

## ADR-022 - Maquina de estados idempotente para acciones MCP

- **Estado:** implementado y validado.
- **Decision:** cada accion MCP mutante se persiste con estado explicito
  `PENDING`, `EXECUTING`, `COMPLETED`, `FAILED` o `CANCELLED`. La confirmacion
  reclama el token con una actualizacion atomica antes de llamar a
  `TicketsService`; el resultado de la mutacion determina la transicion final.
- **Motivo:** marcar `confirmedAt` antes de ejecutar podia consumir el token y
  dejar una mutacion fallida sin estado recuperable. El claim condicional evita
  dobles confirmaciones entre solicitudes o instancias.
- **Alternativas descartadas:** mantener `confirmedAt` como unico indicador;
  bloquear en memoria; ejecutar primero y actualizar el estado despues sin
  claim atomico. Las alternativas no protegen contra concurrencia o pierden la
  trazabilidad del fallo.
- **Archivos afectados:** `src/modules/mcp/mcp-action-status.enum.ts`,
  `src/modules/mcp/mcp-action.service.ts`,
  `src/modules/governance/schemas/mcp-pending-action.schema.ts`, pruebas MCP y
  `INTEGRATIONS.md`.
- **Validacion:** typecheck y pruebas unitarias del servicio MCP: PASS. La
  suite cubre doble confirmacion, claim atomico, fallo de mutacion y cancelacion.
- **Riesgo residual:** la persistencia del cambio de estado posterior a una
  mutacion exitosa no es una transaccion MongoDB con la mutacion de ticket;
  auditoria critica durable y recovery de acciones quedan para el punto 6.
- **Rollback:** restaurar el servicio y esquema anteriores; no requiere
  migracion destructiva. Los documentos nuevos con estado explicito deben
  conservarse o migrarse de forma compatible antes de revertir en produccion.

## ADR-023 - Auditoria critica durable y telemetria opcional

- **Estado:** implementado y validado.
- **Decision:** `AuditService` expone `recordCritical()` para una lista explicita
  de acciones sensibles. Este metodo persiste directamente en `audit_events` y
  propaga errores de MongoDB; no permite que el llamador los convierta en un
  exito silencioso. `record()` permanece para telemetria no critica y conserva
  la tolerancia de sus llamadores.
- **Acciones criticas:** cambio de roles, activacion/desactivacion MFA,
  lifecycle de confirmacion MCP, refresh token reuse y reprocesamiento de dead
  letters.
- **Motivo:** un `.catch(() => undefined)` en una accion de seguridad podia
  ocultar la perdida de evidencia. La escritura durable en MongoDB hace que el
  fallo sea visible para el caller y mantiene el evento consultable por
  gobernanza.
- **Alternativas descartadas:** tratar toda auditoria como opcional; registrar
  solo en logs; introducir un outbox separado sin consumidor de auditoria. El
  primer enfoque pierde evidencia, el segundo no ofrece persistencia operativa
  y el tercero agregaria una cola sin completar su ciclo de entrega.
- **Archivos afectados:** `src/modules/audit/audit.service.ts`, sus pruebas y
  los consumidores criticos de auth, MFA, MCP y governance.
- **Validacion:** typecheck, build, 22 suites unitarias/51 tests, 6 suites
  e2e/19 tests y 8 pruebas de integracion reales con MongoDB, Redis, GridFS y
  BullMQ: PASS.
- **Riesgo residual:** la escritura del evento y la mutacion de dominio no
  forman una transaccion MongoDB unica; puede existir una mutacion completada
  si la auditoria posterior falla. La sanitizacion recursiva comun queda para
  el punto 7.
- **Rollback:** restaurar los llamadores a `record()` y retirar
  `recordCritical()`; no requiere migracion ni operacion destructiva.
- **Decisión:** mantener una SPA React/TypeScript en `apps/web`, compilada por
  Vite y consumiendo exclusivamente los contratos HTTP existentes.
- **Motivo:** hacer demostrables los flujos de seguridad y tickets sin acoplar
  presentación al monolito NestJS ni introducir otro backend.
- **UI:** componentes y estilos propios, sin design system externo; navegación,
  iconos SVG y estados responsive se mantienen dentro del paquete web.
- **Sesión:** access token en memoria, refresh token solo en cookie HttpOnly y
  token CSRF en `sessionStorage` para restaurar la pestaña.
- **Alternativas descartadas:** renderizado server-side no aporta valor al
  dashboard autenticado; un modo mock podría mostrar una experiencia que no
  ejerce las garantías reales de la API.
- **Límite:** la demo inicial cubre autenticación, dashboard y tickets; no
  presenta todavía adjuntos, comentarios, reportes o gobierno.

## ADR-018 — Contador atómico de intentos fallidos de login

- **Estado:** implementado y validado.
- **Decisión:** reemplazar la mutación en memoria seguida de `save()` por un
  `findOneAndUpdate` con pipeline de MongoDB. El filtro solo acepta cuentas sin
  bloqueo vigente; el incremento, el umbral y el bloqueo temporal se resuelven
  dentro de la misma operación atómica.
- **Motivo:** varios intentos simultáneos podían leer el mismo valor y perder
  incrementos, debilitando el bloqueo temporal.
- **Alternativas descartadas:** mantener `user.save()` sobre el documento
  hidratado; usar un contador en Redis; realizar un incremento y un bloqueo en
  operaciones separadas. Las dos primeras no garantizan consistencia con la
  fuente de verdad y la última deja una ventana de carrera.
- **Archivos afectados:** `src/modules/users/users.service.ts`,
  `src/modules/users/users.service.spec.ts` y
  `test/integration/lifecycle.integration-spec.ts`.
- **Validación:** typecheck, build, 20 suites unitarias/40 tests, 5 suites
  e2e/17 tests y la integración real de MongoDB/Redis: PASS. La suite de
  integración verificó ocho llamadas concurrentes y el bloqueo al quinto
  intento.
- **Riesgo residual:** el bloqueo temporal sigue dependiendo de la hora del
  servidor y de la disponibilidad de MongoDB; no se presenta como una defensa
  contra ataques distribuidos sin controles perimetrales adicionales.
- **Rollback:** restaurar `registerFailedLogin` desde el commit anterior y
  retirar las pruebas asociadas; no requiere migración ni operación destructiva
  sobre MongoDB.

## ADR-019 — Reclamo atómico de intentos MFA y consumo de challenge

- **Estado:** implementado y validado.
- **Decisión:** `MfaService.completeChallenge` reclama un intento mediante
  `findOneAndUpdate` condicionado a `usedAt` ausente, `expiresAt` futuro y
  `attempts < maxAttempts`. Un código inválido en el último intento marca el
  challenge como usado; un código correcto lo consume con otra actualización
  condicional que exige que siga vigente y sin uso.
- **Motivo:** el flujo anterior leía `attempts`, lo incrementaba en memoria y
  guardaba el challenge completo, permitiendo que solicitudes simultáneas
  perdieran incrementos o superaran el límite.
- **Alternativas descartadas:** usar `challenge.save()` sobre el documento
  leído; bloquear en memoria; consumir el challenge antes de validar el código.
  Las alternativas no son seguras entre instancias o podrían invalidar un
  código correcto.
- **Archivos afectados:** `src/modules/auth/mfa.service.ts`,
  `src/modules/auth/mfa.service.spec.ts` y
  `test/integration/lifecycle.integration-spec.ts`.
- **Validación:** typecheck, build, 20 suites unitarias/40 tests, 5 suites
  e2e/17 tests y 7 pruebas de integración reales: PASS. La integración
  ejerció ocho códigos incorrectos simultáneos y confirmó `attempts = 5` con
  `usedAt` persistido.
- **Riesgo residual:** el endpoint conserva throttling HTTP; respuestas `429`
  pueden impedir que una solicitud llegue al challenge, por lo que la
  protección de MongoDB no reemplaza el rate limiting.
- **Rollback:** restaurar `completeChallenge` y retirar sus pruebas; no
  requiere migración ni operación destructiva sobre MongoDB.

## ADR-024 - Sanitizador recursivo común para superficies operativas

- **Estado:** implementado y validado.
- **Decisión:** centralizar la limpieza de datos sensibles en
  `sanitizeSensitiveData()` y `sanitizeSensitiveRecord()`. El componente
  elimina recursivamente propiedades cuyo nombre contiene `password`, `token`,
  `cookie`, `authorization`, `secret` o `privateKey`/`private_key`, redacta
  credenciales embebidas en strings y controla profundidad, propiedades,
  longitud y ciclos.
- **Motivo:** auditoría y dead letters solo filtraban el primer nivel, mientras
  el logger dependía de un replacer JSON y expresiones regulares separadas.
  Un contrato común reduce divergencias y evita persistir secretos anidados en
  MongoDB o emitirlos por stdout.
- **Alternativas descartadas:** mantener sanitizadores privados por módulo;
  usar solo `JSON.stringify` con replacer; rechazar el evento completo cuando
  contiene una propiedad sensible. La primera alternativa duplica controles,
  la segunda no resuelve ciclos ni límites y la tercera pierde evidencia útil.
- **Archivos afectados:** `src/common/security/sanitize-sensitive-data.ts`,
  sus pruebas, `src/modules/audit/audit.service.ts`,
  `src/modules/jobs/dead-letter.service.ts` y
  `src/common/logging/structured.logger.ts`.
- **Validación:** typecheck, build, lint web y 23 suites unitarias/56 tests:
  PASS. Las pruebas cubren objetos anidados, arrays, límites, strings con
  credenciales y referencias cíclicas.
- **Riesgo residual:** el sanitizador no es un antivirus ni sustituye la
  validación de adjuntos; además, valores sensibles incluidos dentro de
  formatos no reconocidos pueden requerir reglas específicas posteriores.
- **Rollback:** restaurar los sanitizadores locales y retirar el componente
  común y sus pruebas; no requiere migración ni operación destructiva.

## ADR-025 - Claim atomico e idempotencia del worker de reportes

- **Estado:** implementado y validado.
- **Decisión:** el worker reclama un reporte con
  `findOneAndUpdate({_id, status: QUEUED})`, lo mueve a `PROCESSING` y guarda
  el `jobId` estable como ownership interno. Solo el worker que obtiene el
  claim consulta tickets, genera el PDF y puede completar el reporte. Un job
  duplicado que pierde el claim no genera otro documento; si el reporte ya
  está `COMPLETED`, devuelve el `fileId` existente.
- **Motivo:** leer el reporte y después hacer `save()` permitía que dos
  workers observaran `QUEUED` y generaran PDFs concurrentemente. El claim
  condicional hace que la decisión ocurra en MongoDB, fuente de verdad del
  estado.
- **Alternativas descartadas:** bloqueo en memoria, usar Redis como lock o
  confiar únicamente en el `jobId` de BullMQ. Las primeras dos no son
  consistentes entre instancias y la última no protege una invocación
  duplicada que ya haya llegado al worker.
- **Archivos afectados:** `src/modules/reports/report.worker.ts`,
  `src/modules/reports/report.worker.spec.ts` y
  `src/modules/reports/schemas/report.schema.ts`.
- **Validación:** typecheck y build PASS; 24 suites unitarias/60 tests, 6
  suites e2e/19 tests y 8 pruebas de integración reales con MongoDB, Redis,
  GridFS y BullMQ PASS.
- **Riesgo residual:** si el proceso termina abruptamente después del claim y
  antes de notificar el fallo, el reporte puede quedar en `PROCESSING`; una
  política posterior de recuperación de claims expirados debe tratar ese caso
  explícitamente. El rollback es solo de código y no requiere migración.
- **Rollback:** retirar `processingJobId`/`processingAt`, restaurar el flujo
  previo del worker y eliminar las pruebas de claim; no requiere operación
  destructiva sobre MongoDB.

## ADR-026 - Retencion de reportes con fallo recuperable

- **Estado:** implementado y validado.
- **Decisión:** `ReportRetentionService` solo marca un reporte como `PURGED`
  después de que `GridFSBucket.delete()` termina correctamente y la referencia
  sigue coincidiendo en MongoDB. Si el borrado falla, conserva `status=COMPLETED`
  y `fileId`, guarda un error sanitizado y deja el reporte elegible para un
  nuevo intento.
- **Motivo:** ignorar el rechazo de GridFS y limpiar `fileId` producía un
  registro que afirmaba purga aunque el archivo todavía existiera, perdiendo la
  capacidad de reintento y la referencia operativa.
- **Alternativas descartadas:** marcar `PURGED` siempre; borrar primero la
  referencia MongoDB; reintentar en un loop bloqueante. Esas opciones pierden
  consistencia, dificultan la recuperación o pueden mantener el worker ocupado
  indefinidamente.
- **Archivos afectados:** `src/modules/reports/report-retention.service.ts` y
  `src/modules/reports/report-retention.service.spec.ts`.
- **Validación:** pruebas dirigidas de fallo GridFS, purga exitosa y ciclos
  solapados: 3 tests PASS; 25 suites unitarias/63 tests, 6 suites e2e/19
  tests y 8 pruebas de integración reales mantienen los gates del proyecto.
- **Riesgo residual:** un error permanente de GridFS permanece elegible y
  puede generar logs periódicos hasta que infraestructura o retención se
  corrijan; no se oculta ni se marca como éxito falso.
- **Rollback:** restaurar la lógica anterior solo mediante código; no requiere
  migración ni operación destructiva sobre MongoDB.

## ADR-027 - Reglas de dominio para CLOSED, watchers y notificaciones

- **Estado:** implementado y validado.
- **Decisión:** un ticket `CLOSED` se puede leer, pero no admite comentarios ni
  nuevos adjuntos. La reapertura debe ocurrir antes mediante la transición
  explícita existente `CLOSED → IN_PROGRESS`. Watchers se gestionan mediante
  operaciones autenticadas para `ADMIN`/`SUPPORT`, solo aceptan usuarios
  activos, evitan duplicados y se reflejan en la autorización de lectura.
- **Política de notificaciones:** `TicketNotificationPolicy` centraliza los
  destinatarios. Un cambio relevante puede notificar al nuevo assignee, al
  requester y a watchers, sin duplicar usuarios. Los comentarios públicos
  incluyen watchers; las notas internas conservan la audiencia de soporte.
- **Motivo:** el esquema ya tenía `watcherIds`, pero faltaban operaciones y una
  política consistente. Permitir contenido nuevo en `CLOSED` rompía la
  semántica de cierre y la notificación repartida en el servicio favorecía
  divergencias entre casos de uso.
- **Alternativas descartadas:** eliminar `watcherIds`; permitir que cualquier
  requester cambie watchers sin validar usuarios; bloquear todo cambio sobre
  `CLOSED`, incluida la reapertura; enviar notificaciones desde controller o
  frontend. Esas alternativas pierden capacidad operativa, seguridad o
  coherencia de dominio.
- **Archivos afectados:** `TicketsService`, `TicketsController`,
  `TicketAccessService`, `TicketNotificationPolicy`, DTO de watcher,
  `AttachmentsService`, pruebas y `docs/openapi.json`.
- **Validación:** typecheck/build, OpenAPI export, 26 suites unitarias/66 tests,
  6 suites e2e/19 tests, 8 pruebas de integración reales y lint frontend PASS.
- **Riesgo residual:** la política de notificaciones sigue siendo asíncrona y
  durable vía outbox; un fallo de Redis no debe ocultar el registro MongoDB.
  La autorización no es multi-tenant en este MVP.
- **Rollback:** retirar endpoints/DTO de watchers y restaurar la notificación
  previa; no requiere migración destructiva. Los `watcherIds` existentes se
  conservan.

## ADR-028 - Fachada compatible y servicios especializados de tickets

- **Estado:** implementado y validado.
- **Decisión:** separar `TicketsService` en una fachada compatible y tres
  responsabilidades: `TicketsQueryService` para listados, lectura, paginación,
  caché y comentarios; `TicketCommandService` para creación, actualización y
  watchers; y `TicketCommentsService` para validar y crear comentarios.
  `TicketAccessService`, `TicketWorkflowService` y
  `TicketNotificationPolicy` permanecen como límites explícitos del dominio.
- **Motivo:** el servicio principal concentraba persistencia, autorización,
  caché, workflow, notificaciones, comentarios y watchers en un archivo de
  más de 450 líneas. La fachada mantiene los contratos usados por HTTP, MCP y
  adjuntos mientras reduce la superficie de cada caso de uso.
- **Alternativas descartadas:** reescribir en Clean Architecture completa;
  cambiar contratos de MCP/adjuntos; mover métodos sin separar dependencias.
  Las primeras dos agregan riesgo y la última no reduce responsabilidades
  reales.
- **Archivos afectados:** `tickets.service.ts`,
  `tickets-query.service.ts`, `ticket-command.service.ts`,
  `ticket-comments.service.ts`, `tickets.module.ts` y pruebas relacionadas.
- **Validación:** typecheck/build, 26 suites unitarias/66 tests, 6 suites
  e2e/19 tests, 8 pruebas de integración reales con MongoDB, Redis, GridFS y
  BullMQ, y lint frontend: PASS.
- **Riesgo residual:** la fachada todavía es un punto de compatibilidad y
  podría reducirse más cuando los consumidores adopten los servicios por caso
  de uso; no se presenta como una arquitectura hexagonal completa.
- **Rollback:** restaurar `TicketsService` monolítico y retirar los tres
  servicios nuevos; no requiere migración de datos.

## ADR-029 - Separación de sesiones en autenticación

- **Estado:** implementado y validado.
- **Decisión:** extraer la emisión, rotación, revocación de familia, logout y
  detección de reuse de refresh tokens a `SessionService`. `AuthService` queda
  como orquestador de registro, password, MFA y eventos de autenticación.
  Refresh tokens siguen siendo opacos, almacenados como hash y enviados por la
  cookie HttpOnly gestionada por el controller.
- **Motivo:** `AuthService` mezclaba credenciales, MFA, JWT y ciclo de vida de
  sesiones. La separación reduce responsabilidades reales sin cambiar el
  contrato HTTP ni introducir un proveedor de identidad externo.
- **Alternativas descartadas:** dejar el servicio monolítico; crear un módulo
  de identidad externo; mover solamente métodos privados sin cambiar
  dependencias. Las alternativas no mejoran la prueba o agregan alcance.
- **Archivos afectados:** `auth.service.ts`, `session.service.ts`,
  `auth.module.ts`, pruebas de auth/sesiones y documentación de decisiones.
- **Validación:** typecheck/build, 27 suites unitarias/68 tests, 6 suites
  e2e/19 tests, 8 pruebas de integración reales con MongoDB, Redis, GridFS y
  BullMQ, y lint frontend: PASS.
- **Riesgo residual:** la rotación sigue dependiendo de la disponibilidad de
  MongoDB; no se presenta como una transacción distribuida con emisión JWT.
- **Rollback:** restaurar `AuthService` y retirar `SessionService`; no requiere
  migración de sesiones ni operación destructiva.

## ADR-030 - Workspace frontend por feature y componentes

- **Estado:** implementado y validado.
- **Decisión:** dividir `Workspace.tsx` en un shell de composición, hooks de
  datos y componentes pequeños por superficie: resumen, cola, tabla, detalle,
  creación y notificaciones. El shell conserva navegación, estado y las
  integraciones de seguridad/MCP; `useTickets` y `useNotifications` concentran
  carga, concurrencia y mutaciones de cada recurso.
- **Motivo:** el componente de workspace mezclaba layout, estado remoto,
  formularios, detalle y presentación en 792 líneas. La separación reduce
  responsabilidades, evita estados duplicados y permite probar cada superficie
  sin cambiar el contrato público `Workspace`.
- **Alternativas descartadas:** crear un store global; dividir solo por
  archivos visuales manteniendo estado remoto duplicado; migrar a otro
  framework. Esas alternativas agregan estado compartido o alcance fuera del
  punto actual.
- **Archivos afectados:** `Workspace.tsx`, `WorkspaceShell.tsx`, `Overview.tsx`,
  `TicketQueue.tsx`, `TicketTable.tsx`, `TicketDetail.tsx`,
  `CreateTicketDialog.tsx`, `NotificationPopover.tsx` y hooks de tickets y
  notificaciones.
- **Validación:** lint frontend PASS, build Vite PASS, 4 suites web/17 tests
  PASS y `git diff --check` PASS.
- **Riesgo residual:** `api.ts` todavía es una fachada transversal; su
  separación por dominio corresponde al siguiente punto del plan. El frontend
  no constituye una frontera de autorización: la seguridad permanece en el
  backend.
- **Rollback:** restaurar `Workspace.tsx` monolítico y retirar los componentes
  nuevos; no requiere migración ni cambios de datos.

## ADR-031 - APIs frontend por dominio y sesión centralizada

- **Estado:** implementado y validado.
- **Decisión:** separar el transporte en `lib/http/HttpClient`, el ciclo de
  vida de sesión en `SessionManager` y los contratos operativos en APIs de
  auth, tickets, notificaciones y MCP. Mantener `lib/api.ts` como fachada de
  compatibilidad para consumidores existentes y migrar el código nuevo a las
  APIs de feature.
- **Motivo:** `ApiClient` mezclaba transporte, refresh, autenticación, MFA,
  tickets, notificaciones y MCP. La separación hace visible cada frontera,
  mantiene el access token en memoria, conserva CSRF en session storage y
  centraliza la rotación HttpOnly-backed.
- **Alternativas descartadas:** dejar el cliente monolítico; crear un store
  global de sesión; guardar el access token en storage para simplificar
  imports. Las alternativas aumentan acoplamiento o exposición de credenciales.
- **Archivos afectados:** `apps/web/src/lib/http/*`, APIs de
  `features/auth`, `features/tickets`, `features/notifications` y
  `features/mcp`, consumidores de frontend, `lib/api.ts` y pruebas.
- **Validación:** lint frontend PASS, build Vite PASS, 4 suites web/17 tests
  PASS, incluyendo sesión/refresh y regresión del Workspace.
- **Riesgo residual:** la fachada de compatibilidad sigue existiendo hasta que
  terceros adopten las APIs por dominio; no se presenta como una eliminación
  completa del acoplamiento histórico.
- **Rollback:** restaurar imports a `lib/api.ts` y retirar los módulos HTTP y
  APIs de feature; no requiere cambios de datos ni de sesiones persistidas.

## ADR-032 - Lint real, typecheck separado y formato verificable

- **Estado:** implementado y validado.
- **Decisión:** separar pnpm lint como ESLint flat config de pnpm typecheck, y
  añadir format/format:check con Prettier. ESLint cubre backend, tests y
  frontend con reglas TypeScript, React Hooks, complejidad máxima 12 y avisos
  de funciones mayores de 60 líneas o archivos mayores de 300 líneas. Tests,
  código binario y configuración reciben solo excepciones justificadas.
- **Motivo:** lint solo ejecutaba TypeScript y no detectaba reglas de calidad
  o hooks de React. Separar señales permite saber si falla el contrato tipado,
  la calidad estática o el formato.
- **Alternativas descartadas:** activar reglas agresivas como errores desde el
  primer día; usar solo Prettier; mantener lint como alias de typecheck. Eso
  produciría ruido, no cubriría comportamiento React o mantendría la
  ambigüedad existente.
- **Archivos afectados:** eslint.config.mjs, package.json, apps/web/package.json,
  pnpm-lock.yaml y archivos de código normalizados por Prettier.
- **Validación:** ESLint backend/frontend PASS con advertencias no bloqueantes,
  typecheck PASS, format:check PASS, build API/web PASS, 27 suites/68 tests
  backend PASS, 6 suites/19 e2e PASS y 4 suites/17 tests web PASS.
- **Riesgo residual:** quedan advertencias deliberadas en funciones grandes o
  complejas; representan deuda visible para refactors posteriores y no se
  presentan como resueltas.
- **Rollback:** restaurar scripts/configuración anteriores y revertir el
  formato; no requiere cambios de datos ni de runtime.

## ADR-033 - Cobertura gradual orientada a reglas críticas

- **Estado:** implementado y validado.
- **Decisión:** mantener Jest como gate de cobertura del backend, publicar
  reportes text/text-summary/LCOV/JSON y establecer umbrales graduales globales
  junto con umbrales específicos para autenticación, MFA, sesiones, acceso y
  workflow de tickets, MCP, recuperación de colas, reportes, auditoría y
  sanitización de datos sensibles.
- **Motivo:** la cobertura debe proteger reglas de negocio y seguridad, no
  premiar cantidad de líneas ni exigir 100 % en módulos de infraestructura que
  requieren integración real. La línea base ejecutada fue 37.95 % statements,
  37.87 % branches, 31.09 % functions y 37.95 % lines.
- **Alternativas descartadas:** exigir 100 % desde ahora; usar solo un
  porcentaje global; omitir cobertura por la dificultad de probar workers y
  adaptadores. Esas opciones ocultan regresiones o generan una barrera sin
  valor proporcional.
- **Archivos afectados:** `jest.config.js` y la documentación de decisiones y
  ejecución.
- **Validación:** 27 suites y 68 tests con cobertura PASS; los umbrales
  globales y específicos se cumplen. El gate cubre el backend y deja el
  coverage del frontend como evolución posterior de su toolchain Vitest.
- **Riesgo residual:** existen rutas de controllers, adaptadores e
  infraestructura con cobertura baja; no se presentan como cubiertas. Los
  próximos incrementos deben elevar thresholds con evidencia, priorizando
  workers/recovery, refresh/reuse, MFA, MCP y concurrencia.
- **Rollback:** retirar `coverageReporters` y `coverageThreshold` de Jest;
  no requiere cambios de datos ni de runtime.

## ADR-034 - DAST sobre stack efímero con OWASP ZAP

- **Estado:** implementado; pendiente de endurecer a gate bloqueante después
  de resolver y revisar las alertas del primer baseline.
- **Decisión:** agregar un job `dast` a Secure CI que genere claves efímeras,
  levante `compose.yml`, ejecute ZAP baseline contra el frontend/proxy y ZAP
  API scan contra `/api/docs-json`, publique HTML/JSON y destruya el stack al
  terminar.
- **Motivo:** probar la aplicación compilada y sus límites HTTP aporta señales
  que no obtiene el análisis estático ni Trivy, sin usar producción ni
  introducir un proveedor externo en runtime.
- **Alternativas descartadas:** ejecutar ZAP contra producción; apuntar solo al
  API sin probar Nginx; usar un escaneo manual no reproducible. Las primeras
  exponen datos o pierden la frontera del frontend y la última no deja
  evidencia CI.
- **Archivos afectados:** `.github/workflows/security.yml`, `docs/DAST.md` y
  documentación de decisiones y ejecución.
- **Validación:** sintaxis revisada del workflow y guía reproducible local;
  la ejecución remota del job queda a cargo de GitHub Actions por requerir
  Docker y el runner efímero.
- **Riesgo residual:** los escaneos son report-only mediante `continue-on-error`
  mientras se completan headers del frontend y el triage de alertas. No se
  presenta como un gate de seguridad bloqueante ni como ausencia de hallazgos.
- **Rollback:** retirar el job `dast` y `docs/DAST.md`; no requiere cambios de
  datos ni de runtime.

## ADR-035 - Métricas protegidas y labels de baja cardinalidad

- **Estado:** implementado y validado.
- **Decisión:** deshabilitar `/api/metrics` por defecto y habilitarlo solo con
  `METRICS_ENABLED=true` y un `METRICS_TOKEN` de al menos 32 caracteres. El
  guard acepta el token en `X-Metrics-Token` o como Bearer y compara digests de
  forma constante. Las solicitudes sin ruta NestJS usan `unmatched`, nunca la
  URL arbitraria del cliente.
- **Motivo:** las métricas contienen información operativa y un endpoint
  público facilita reconocimiento; usar paths dinámicos como labels puede
  provocar cardinalidad ilimitada y consumo de memoria.
- **Alternativas descartadas:** dejar el endpoint público; protegerlo solo con
  una ruta no documentada; usar `request.path` como label de fallback. No
  ofrecen una frontera explícita ni controlan cardinalidad.
- **Archivos afectados:** `environment.validation.ts`, `.env.example`,
  `metrics-access.guard.ts`, `metrics.controller.ts`, `health.module.ts`,
  `main.ts` y pruebas de configuración/guard.
- **Validación:** typecheck PASS, lint PASS con warnings existentes, 28 suites y
  71 tests PASS, formato PASS y Compose config PASS.
- **Riesgo residual:** el token es un secreto estático de servicio; la
  rotación y allowlist de red quedan para el despliegue cloud. El contador de
  latencia continúa siendo acumulativo, no un histograma Prometheus completo.
- **Rollback:** retirar el guard y las variables de configuración y restaurar
  el fallback anterior; no requiere cambios de datos.

## ADR-036 - Trust proxy explícito para rate limiting

- **Estado:** implementado y validado.
- **Decisión:** configurar Express con `TRUST_PROXY_HOPS`, cuyo valor por
  defecto es `0`. Solo una instalación detrás de un proxy controlado debe
  configurarlo, por ejemplo `1` para un único Nginx/ALB. La aplicación no
  confía en `X-Forwarded-For` de forma implícita.
- **Motivo:** `@nestjs/throttler` usa la IP de la request; el número de saltos
  confiables debe ser explícito para que el rate limiting vea al cliente real
  sin permitir spoofing cuando el API está expuesto directamente.
- **Alternativas descartadas:** activar `trust proxy=true` globalmente; tomar
  siempre el primer valor de `X-Forwarded-For`; confiar en una variable booleana
  sin expresar la topología. Todas amplían la superficie de spoofing.
- **Archivos afectados:** `environment.validation.ts`, `.env.example`,
  `main.ts` y pruebas de validación.
- **Validación:** typecheck, lint, unitarias, e2e y build deben ejecutarse con
  el mismo gate del cambio; la prueba de configuración cubre default `0`, un
  salto explícito y rechazo de valores negativos.
- **Riesgo residual:** la topología real del balanceador debe documentarse al
  desplegar; un número incorrecto de saltos puede identificar al proxy en lugar
  del cliente o permitir spoofing.
- **Rollback:** retirar la configuración `trust proxy`; no requiere cambios de
  datos.

## ADR-037 - Hardening de MongoDB, Redis y exposición local

- **Estado:** implementado y validado.
- **Decisión:** exigir TLS en `MONGODB_URI` cuando `NODE_ENV=production`,
  conservar `rediss://` como requisito de Redis en producción y publicar los
  puertos de desarrollo solo en `127.0.0.1`. La red interna de Compose sigue
  siendo el canal entre API, worker, MongoDB y Redis.
- **Motivo:** separar seguridad de producción de conveniencia local y evitar
  que servicios de datos de desarrollo queden expuestos a toda la red local.
- **Alternativas descartadas:** permitir MongoDB sin TLS en producción; usar
  `0.0.0.0` para facilitar clientes externos; reemplazar la persistencia por
  memoria. Las dos primeras amplían exposición y la tercera rompe la fuente de
  verdad MongoDB.
- **Archivos afectados:** `environment.validation.ts`, pruebas, `compose.yml`
  y documentación de decisiones/ejecución.
- **Validación:** Compose config PASS; la suite de configuración cubre TLS
  MongoDB y el gate completo se ejecuta antes del commit.
- **Riesgo residual:** certificados, CA y credenciales siguen siendo
  responsabilidad del despliegue; el Compose local no simula TLS de datos.
- **Rollback:** restaurar los bindings locales o la validación según entorno;
  no requiere cambios de datos.

## ADR-038 - Cabeceras de seguridad del frontend Nginx

- **Estado:** implementado y validado en configuración; HSTS queda reservado
  al reverse proxy HTTPS de producción.
- **Decisión:** añadir CSP sin fuentes externas, `frame-ancestors 'none'`,
  `Referrer-Policy`, `Permissions-Policy`, `nosniff` y `X-Frame-Options: DENY`
  en Nginx. No añadir HSTS al Compose HTTP local para no fijar HTTPS en
  `localhost`; la configuración HTTPS de producción debe añadirlo.
- **Motivo:** el frontend es una frontera de navegador y debe declarar sus
  permisos y orígenes permitidos sin romper el proxy same-origin `/api`.
- **Alternativas descartadas:** CSP permisiva con `*`; `unsafe-inline`; HSTS
  siempre en el entorno HTTP de demo. Esas opciones pierden control o rompen
  el flujo local.
- **Archivos afectados:** `apps/web/nginx.conf`, documentación y workflow de
  DAST que escanea esta frontera.
- **Validación:** formato y build web; el primer artefacto ZAP debe confirmar
  la conducta del header en el runner.
- **Riesgo residual:** HSTS y configuración TLS dependen del proxy HTTPS de
  producción; CSP puede requerir ajuste si se añaden recursos externos.
- **Rollback:** retirar los `add_header` de Nginx; no requiere cambios de datos.

## ADR-039 - Límite honesto de validación de adjuntos

- **Estado:** documentado y validado; antivirus/CDR no implementado.
- **Decisión:** conservar validación de tamaño, firma, MIME, dimensiones,
  checksum, autorización y `nosniff`, pero mantener `CONTENT_VALIDATED` como
  formato validado, nunca como archivo libre de malware.
- **Motivo:** incorporar un escáner sin una infraestructura de cuarentena y
  políticas de fallo produciría una falsa sensación de seguridad.
- **Alternativas descartadas:** marcar archivos como seguros sin escaneo;
  integrar un proveedor externo en el runtime; eliminar adjuntos del MVP.
- **Archivos afectados:** documentación de arquitectura, README y contrato de
  seguridad de adjuntos; no se modifica el flujo funcional existente.
- **Validación:** pruebas actuales de firma/MIME/dimensiones y revisión de
  documentación; el riesgo queda visible para evolución posterior.
- **Riesgo residual:** no existe malware scanning, quarantine ni CDR. Para
  producción se requiere un pipeline asíncrono antes de permitir descargas.
- **Rollback:** retirar únicamente la documentación nueva; no hay migración.

## ADR-040 - CI explícito y contrato de runtime

- **Estado:** implementado y validado.
- **Decisión:** Secure CI ejecuta `format:check`, `lint` y `typecheck` como
  señales separadas antes de pruebas y build. El paquete declara Node `22.x` y
  pnpm `11.8.0`, alineados con Docker y el runner.
- **Motivo:** un pipeline de portafolio debe mostrar dónde falla formato,
  tipos o reglas estáticas, y evitar que el runtime local difiera del artefacto
  CI.
- **Alternativas descartadas:** depender solo del script agregado `lint`;
  permitir cualquier versión mayor de Node; ocultar el typecheck dentro de
  otro gate. Reducen trazabilidad y reproducibilidad.
- **Archivos afectados:** `package.json`, `.github/workflows/security.yml` y
  documentación de decisiones/ejecución.
- **Validación:** format, lint, typecheck, tests, e2e, builds y OpenAPI se
  ejecutan en el pipeline; el export OpenAPI debe permanecer secuencial después
  de build.
- **Riesgo residual:** branch protection y reglas de merge son configuración de
  GitHub y no pueden quedar garantizadas solo desde el repositorio.
- **Rollback:** retirar los steps y `engines`; no requiere cambios de datos.

## ADR-041 - Adapters AWS-compatible opcionales y desacoplados

- **Estado:** implementado y validado unitariamente; integración real contra
  Floci/AWS queda pendiente del entorno cloud.
- **Decisión:** añadir ports para almacenamiento de adjuntos, publicación de
  eventos, secretos y métricas, con adapters AWS SDK v3 para S3, SQS, Secrets
  Manager y CloudWatch. El `CloudModule` se carga como infraestructura opcional
  y no reemplaza MongoDB, Redis, BullMQ ni GridFS.
- **Motivo:** el dominio debe depender de capacidades, no del nombre Floci ni
  de un proveedor concreto. `AWS_ENDPOINT_URL` permite apuntar el mismo cliente
  a un laboratorio AWS-compatible sin introducir un `FlociService`.
- **Alternativas descartadas:** integrar llamadas AWS en controllers; mover
  adjuntos o colas fuera de MongoDB/BullMQ de una vez; implementar firmas HTTP
  propias; acoplar los ports al emulador local.
- **Archivos afectados:** `src/infrastructure/cloud/`,
  `src/infrastructure/infrastructure.module.ts`,
  `src/config/environment.validation.ts`, `.env.example`, `package.json` y
  `pnpm-lock.yaml`.
- **Validación:** typecheck PASS; 12 pruebas dirigidas PASS; los clientes no
  realizan llamadas de red durante el arranque. El smoke real contra Floci y
  pruebas de contrato cloud quedan como siguiente gate.
- **Riesgo residual:** bucket, cola, permisos IAM, TLS y credenciales dependen
  del despliegue. Los adapters todavía no son el camino de producción para
  tickets, adjuntos o notificaciones.
- **Rollback:** retirar `CloudModule`, `src/infrastructure/cloud/` y las cuatro
  dependencias AWS; no requiere migraciones ni cambios destructivos de datos.

## ADR-043 - Remediacion de warnings ESLint mediante descomposicion segura

- **Estado:** implementado y validado.
- **Decision:** reducir los 28 warnings de complejidad/tamano mediante helpers,
  hooks y componentes con responsabilidades pequenas, manteniendo DTOs,
  respuestas HTTP, reglas de autenticacion y contratos de la UI.
- **Motivo:** el proyecto es una pieza de portafolio y debe mostrar clean code,
  tipado estricto y una deuda estatica visible igual a cero, sin desactivar
  reglas ni hacer cambios cosmeticos que oculten problemas.
- **Alternativas descartadas:** agregar `eslint-disable`, aumentar limites de
  complejidad, ignorar `apps/web` o reescribir modulos completos sin cobertura.
  Esas opciones reducen la senal de calidad o elevan el riesgo de regresion.
- **Archivos afectados:** validacion de entorno, bootstrap HTTP, sanitizacion,
  adjuntos, MCP, jobs/workers, tickets y las vistas/hooks principales de
  autenticacion, MFA y workspace.
- **Validacion:** lint PASS sin warnings; typecheck PASS; 30 suites/80 tests
  backend PASS; 4 archivos/17 tests frontend PASS; 6 suites/19 tests e2e
  PASS; build API y web PASS; format check PASS; diff check PASS.
- **Riesgo residual:** la reduccion de complejidad no sustituye nuevas pruebas
  de integracion cloud ni los pendientes de producto ya registrados.
- **Rollback:** revertir los cambios de descomposicion por grupo de modulo;
  no requiere migraciones ni acciones destructivas sobre MongoDB.
