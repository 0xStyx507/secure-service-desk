# Despliegue

## Desarrollo local

El stack principal es MongoDB, Redis, API, worker y frontend Nginx:

```powershell
docker compose --env-file .env up --build -d
```

La UI se sirve en `http://localhost:3001`, y Nginx enruta `/api` hacia la API
interna. MongoDB y Redis se publican solo en loopback para desarrollo.

## Procesos

- API: `node dist/main.js`.
- Worker: `node dist/worker.js`.
- Frontend: imagen independiente con Nginx.

## Producción

Producción requiere TLS de MongoDB, `rediss://` cuando corresponda, cookies
seguras con prefijo `__Host-`, CORS explícito, claves externas y un reverse
proxy HTTPS que añada HSTS. Las credenciales no se guardan en el repositorio.

Floci no se despliega en producción ni es una dependencia de la API. La futura
adaptación cloud requiere una decisión y una implementación separadas; mientras
tanto, sus contratos se verifican únicamente con mocks.
