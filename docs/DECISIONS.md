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
