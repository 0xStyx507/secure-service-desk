# Autenticación y sesiones

La API administra usuarios y sesiones sin un proveedor funcional externo.

## Flujo

1. `POST /api/auth/register` crea un usuario con rol `USER`.
2. `POST /api/auth/login` verifica la contraseña con `scrypt`.
3. La respuesta incluye un access token RS256 de corta duración.
4. El refresh token opaco se entrega únicamente en una cookie HttpOnly.
5. `POST /api/auth/refresh` exige la cookie y el header `x-csrf-token`, rota el
   refresh token y revoca el valor anterior.
6. Si un token rotado vuelve a utilizarse, se revoca su familia de sesiones.
7. `POST /api/auth/logout` revoca la sesión actual y limpia las cookies.

MongoDB guarda el hash SHA-256 del refresh token, nunca el valor reutilizable.

## Crear las claves RS256

Las claves no deben incorporarse a Git. Un ejemplo con OpenSSL:

```powershell
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

[Convert]::ToBase64String([IO.File]::ReadAllBytes('private.pem'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('public.pem'))
```

Copie los valores en:

```env
JWT_KEY_ID=local-development-key
JWT_PRIVATE_KEY_BASE64=
JWT_PUBLIC_KEY_BASE64=
```

Elimine los archivos PEM locales cuando los valores se encuentren en su gestor de
secretos. La API rechaza claves RSA menores de 3072 bits.

En producción son obligatorios `COOKIE_SECURE=true`, nombres de cookie con
prefijo `__Host-`, `rediss://` y una allowlist CORS no vacía.

## Uso del refresh

El cliente conserva el valor `csrfToken` retornado por login/register y lo envía
en cada refresh o logout:

```http
POST /api/auth/refresh
Cookie: service_desk_refresh=...; service_desk_csrf=...
x-csrf-token: ...
```

El access token se envía en los endpoints protegidos:

```http
Authorization: Bearer <access-token>
```

Cada token contiene `authzVersion`. El guard consulta el usuario activo en
MongoDB; un cambio de roles incrementa esa versión e invalida inmediatamente
los access tokens anteriores.

## Administrador inicial

El bootstrap es explícito y de una sola ejecución:

```env
ALLOW_ADMIN_BOOTSTRAP=true
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<mínimo 16 caracteres>
```

MongoDB registra `initial-admin` en `system_bootstrap_state`. La cuenta no se
recreará si se elimina posteriormente. Retire las variables tras el primer
arranque.
