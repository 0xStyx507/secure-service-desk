# ADR-040 — CI y contrato de runtime

- **Estado:** implementado y validado.
- **Decisión:** Secure CI separa format, lint, typecheck, tests, integración,
  e2e, build y OpenAPI. Node 22.x y pnpm 11.8.0 quedan alineados con Docker.
- **Motivo:** hacer cada fallo observable y mantener reproducibilidad entre
  desarrollo, CI y runtime.
- **Alternativas:** depender de un único lint ambiguo o permitir versiones
  diferentes de Node.
- **Validación:** gates locales y workflow revisados; OpenAPI se exporta luego
  del build.
- **Riesgo:** branch protection sigue siendo configuración de GitHub.
- **Rollback:** retirar los steps y la restricción de engines.
