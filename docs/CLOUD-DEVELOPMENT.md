# Desarrollo cloud compatible con AWS

El runtime principal sigue usando MongoDB como fuente de verdad, Redis/BullMQ
como infraestructura interna y GridFS para adjuntos. La adaptación cloud es
opcional y se mantiene detrás de ports/adapters.

## Modelo de entornos

```text
DEV local  -> AWS SDK v3 -> Floci externo en Docker
PROD       -> AWS SDK v3 -> AWS real (futuro, no validado)
Runtime    -> MongoDB + Redis + BullMQ + GridFS
```

Los adapters están en `src/infrastructure/cloud/` y se configuran mediante
`AWS_ENDPOINT_URL`, bucket/cola y credenciales del entorno. En desarrollo,
`AWS_ENDPOINT_URL=http://localhost:4566` hace que el código consulte el Floci
externo. Las credenciales `test` solo son válidas para laboratorio local.

## Floci

Floci no es un módulo NestJS ni un servicio de negocio; se levanta por separado:

```powershell
docker compose -f compose.yml -f compose.floci.yml --profile floci up -d floci
```

El perfil no reemplaza MongoDB, Redis, BullMQ ni GridFS. Sirve para smoke tests
de la adaptación S3/SQS y no demuestra IAM, TLS o paridad completa con AWS
administrado.

## Validación y límites

- Unit tests de adapters con `jest.spyOn`, sin red externa.
- Smoke S3/SQS contra Floci con recursos temporales.
- No hay migración automática de adjuntos, eventos o secretos.
- AWS real, permisos IAM, TLS, rotación y rollback por entorno siguen pendientes.
