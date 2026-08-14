# GitHub y CI/CD

El workflow [`Secure CI`](../.github/workflows/security.yml) ejecuta calidad,
tests, integración, e2e, build, OpenAPI, Trivy y ZAP. Dependabot mantiene
actualizaciones para dependencias, Actions y Docker.

## Configuración manual requerida

GitHub debe configurar branch protection para `main` con:

- Pull request obligatorio.
- `Secure CI / Quality gates` obligatorio.
- `Secure CI / Real infrastructure integration` obligatorio.
- `Secure CI / DAST with OWASP ZAP` obligatorio después del triage inicial.
- Prohibición de push directo y conversaciones resueltas.

Estas reglas no pueden garantizarse desde archivos locales. La identidad de Git
también debe usar el correo que el propietario elija —idealmente un correo
`noreply` de GitHub— antes del siguiente commit público.
