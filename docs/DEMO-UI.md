# Demo UI

La interfaz visual convierte los contratos de Secure Service Desk en una
demostración navegable sin duplicar reglas de negocio en el navegador. Vive en
`apps/web`, usa React, TypeScript y Vite y se entrega como archivos estáticos.

## Alcance implementado

- Login y registro contra `/api/auth`.
- Access token exclusivamente en memoria.
- Rotación de la sesión mediante refresh cookie HttpOnly y double-submit CSRF.
- Identidad y rol visibles sin inferir privilegios nuevos.
- Resumen de la cola autorizada para el actor.
- Listado con búsqueda, filtros, paginación y estados de carga/error/vacío.
- Creación y detalle de tickets contra la API real.
- Resumen de notificaciones persistentes.
- Layout responsive y respeto por `prefers-reduced-motion`.

Adjuntos, comentarios, cambios de workflow, reportes y gobierno permanecen fuera
de este primer corte visual. Sus APIs siguen disponibles en Swagger y pueden
incorporarse sin cambiar la foundation.

## Decisiones UX

- La pantalla de acceso explica controles verificables en lugar de usar textos
  comerciales genéricos.
- El dashboard prioriza el estado operativo y la actividad reciente.
- Las métricas derivadas se etiquetan como valores de la página actual; solo el
  total proviene de la paginación completa.
- Estados, prioridades y errores tienen texto además de color.
- Los formularios conservan las restricciones principales de los DTO para dar
  feedback temprano, pero la validación de NestJS sigue siendo autoritativa.
- No se agregó un design system externo: reduce peso, superficie de supply
  chain y personalización accidental.

## Modelo de sesión

El access token nunca se escribe en almacenamiento web. El token CSRF sí se
mantiene en `sessionStorage`: no es una credencial bearer y permite llamar a
`/auth/refresh` tras recargar la pestaña. La cookie opaca continúa inaccesible a
JavaScript por `HttpOnly`.

El cliente reintenta una petición una sola vez después de una rotación exitosa.
Un segundo `401` cierra la experiencia autenticada. Los errores se presentan a
partir de Problem Details sin mostrar stack traces.

## Ejecución

```powershell
docker compose up -d
pnpm start:dev
pnpm start:worker:dev
pnpm web:dev
```

La UI queda en `http://localhost:3001`; el proxy de Vite conserva `/api` como
ruta de mismo origen durante desarrollo.

## Requisitos para una demo pública

- Servir frontend y API bajo el mismo sitio mediante reverse proxy.
- Aceptar únicamente `/api` como `VITE_API_URL`; el cliente nunca debe enviar el
  JWT a una URL absoluta o a una ruta normalizable hacia otro origen.
- Mantener cookies `Secure`, nombres `__Host-*` y HTTPS.
- Usar datos ficticios y cuentas de demo con privilegios limitados.
- Restablecer periódicamente el entorno sin tocar persistencia productiva.
- Conservar rate limiting, límites de adjuntos y CORS allowlist.
- No publicar contraseñas administrativas ni claves RSA en el bundle.
- Servir los estáticos con CSP estricta (`default-src 'self'`,
  `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'` y
  `frame-ancestors 'none'`), además de Referrer-Policy y Permissions-Policy.
