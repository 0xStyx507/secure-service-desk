# DAST con OWASP ZAP

El workflow `Secure CI` ejecuta ZAP contra un stack Docker desechable. El
objetivo es observar la aplicación compilada detrás del proxy Nginx y revisar
el contrato OpenAPI del API sin apuntar a producción.

## Flujo

1. Genera claves RSA y una clave MFA efímeras solo dentro del runner.
2. Levanta MongoDB, Redis, API, worker y frontend con `compose.yml`.
3. Verifica el frontend y el healthcheck del API.
4. Ejecuta `zap-baseline.py` contra `http://web:3001`.
5. Ejecuta `zap-api-scan.py` contra `http://api:3000/api/docs-json`.
6. Publica reportes HTML y JSON como artefacto `zap-reports`.
7. Detiene el stack y elimina sus volúmenes efímeros.

Los escaneos son report-only durante esta fase: `continue-on-error` conserva la
evidencia aunque ZAP encuentre alertas esperadas por controles aún pendientes,
como las cabeceras avanzadas del frontend. Esto no se presenta como ausencia
de vulnerabilidades. El siguiente endurecimiento debe convertir alertas de
riesgo alto en un gate bloqueante y mantener excepciones revisadas para falsos
positivos.

## Ejecución local

Con Docker Desktop y un `.env` válido:

```powershell
$env:COMPOSE_PROJECT_NAME = 'secure-service-desk-dast'
docker compose -f compose.yml up --build --detach --wait
docker run --rm --network secure-service-desk-dast_default `
  -v "${PWD}/artifacts/zap:/zap/wrk/:rw" `
  ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py -t http://web:3001 -m 2 -I -r frontend-baseline.html
docker compose -f compose.yml down --volumes --remove-orphans
```

La imagen ZAP se consume desde el registro oficial; el workflow deja la
referencia visible para que la actualización de la imagen sea una decisión
revisable de supply chain.
