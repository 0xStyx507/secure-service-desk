# Modelo de seguridad

Secure Service Desk implementa la seguridad en NestJS y en los servicios de
dominio. El frontend y Nginx son fronteras de transporte y presentación; no
son la autoridad de autorización.

## Identidad y sesión

- Passwords con `scrypt`.
- Access tokens JWT RS256 con `kid`, issuer, audience y `authzVersion`.
- Refresh tokens opacos, almacenados como hash, rotados por familia y enviados
  mediante cookie HttpOnly.
- CSRF double-submit para operaciones mutantes desde navegador.
- MFA TOTP con challenge de un solo uso, step-up y auditoría.
- Lockout de login y consumo de challenges MFA con operaciones atómicas.

## Autorización y abuso

- Roles `ADMIN`, `SUPPORT` y `USER`.
- Autorización por recurso en servicios, no solo en controllers o frontend.
- Tickets `CLOSED` no aceptan comentarios ni adjuntos nuevos.
- Rate limiting con `TRUST_PROXY_HOPS` explícito.
- Helmet, CORS allowlist, CSP, `nosniff` y DTOs validados.

## Datos, archivos y logs

- MongoDB es la fuente de verdad; Redis es reconstruible.
- Adjuntos limitados por tamaño, firma, MIME, dimensiones, checksum y permiso.
- `CONTENT_VALIDATED` no significa antivirus/CDR.
- Auditoría crítica persistente y sanitización de secretos, tokens, cookies,
  headers de autorización y claves privadas.
- Los errores públicos no exponen stack traces ni credenciales.

## Supply chain y cloud

- Dependabot mantiene dependencias y GitHub Actions visibles.
- Trivy escanea filesystem, dependencias, imágenes y secretos en CI.
- OWASP ZAP ejecuta DAST contra un stack efímero y permanece report-only.
- Floci es un laboratorio aislado de desarrollo. Los adapters AWS-compatible
  solo usan el endpoint configurado y credenciales dummy locales; no se guardan
  secretos reales ni se presenta AWS administrado como validado.

## Riesgos residuales

El MVP es monoinquilino. No existe todavía antivirus/CDR, cuarentena de
adjuntos, transactional outbox estricto, cleanup automático completo de PDFs,
branch protection configurado por GitHub ni rotación solapada obligatoria de
claves. Estos límites no deben ocultarse como controles implementados.
