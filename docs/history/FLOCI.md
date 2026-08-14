# Laboratorio cloud local con Floci

AWS administrado queda fuera de esta implementación. Floci se incorpora como un
perfil Docker opcional para validar contratos cloud localmente, sin credenciales
reales ni dependencia de una cuenta AWS.

El runtime principal continúa siendo MongoDB + Redis + BullMQ. MongoDB sigue
siendo la fuente de verdad y Redis sigue siendo reconstruible. El perfil Floci
no mueve automáticamente tickets, usuarios o auditoría a un servicio cloud.

La imagen está fijada por digest y expone `http://localhost:4566`. Floci acepta
credenciales dummy (`test`/`test`) y ofrece protocolos compatibles con S3, SQS,
Secrets Manager, KMS y CloudWatch, que son los servicios relevantes para esta
etapa. La referencia de compatibilidad se mantiene en [Floci](https://floci.io/)
y su [guía de inicio](https://floci.io/floci/getting-started/quick-start/).

## Arranque

```powershell
docker compose -f compose.yml -f compose.floci.yml --profile floci up -d
```

Comprobación básica:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:4566/_floci/health
```

El volumen `floci_data` es independiente de MongoDB y Redis. Para detener el
laboratorio sin borrar persistencia:

```powershell
docker compose -f compose.yml -f compose.floci.yml --profile floci down
```

Plan reservado:

1. Crear adaptadores de infraestructura separados de los servicios de negocio.
2. Usar S3 para cuarentena/artefactos solo después de definir el control de
   antivirus/CDR; Floci no constituye un antivirus.
3. Usar SQS/EventBridge únicamente como transporte de integración, sin retirar
   BullMQ hasta demostrar paridad funcional.
4. Validar secretos y rotación con Secrets Manager/KMS localmente sin guardar
   secretos en el repositorio.
5. Publicar métricas y logs de prueba en CloudWatch solo como evidencia de
   observabilidad; el logger JSON de la API continúa siendo la señal primaria.
6. Mantener fallback de MongoDB, Redis y BullMQ hasta cerrar pruebas y rollback.

No se expone el Docker socket ni se sustituyen servicios existentes de forma
automática. Cada adaptador deberá tener contrato, prueba contra Floci, fallback,
riesgos y rollback documentados.

## Estado

- Perfil Docker reproducible: implementado y validado localmente con Docker
  Desktop el 2026-08-13.
- Smoke test S3/SQS: validado con un bucket y una cola locales; los adaptadores
  de negocio siguen propuestos, no implementados.
- Outbox, retención PDF, JWKS/key ring y métricas: implementados en el runtime
  local; no dependen de Floci.
- Antivirus/CDR: pendiente y no simulado por Floci.
