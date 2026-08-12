# Etapa futura: AWS local con Floci

AWS queda fuera de esta implementación. El runtime actual continúa siendo
MongoDB + Redis + BullMQ y no agrega SDKs, credenciales, buckets, colas o
funciones AWS solo para simular una arquitectura productiva.

Floci se mantiene como laboratorio de la siguiente etapa: permite probar
integraciones cloud localmente y sin credenciales reales mediante un endpoint
local compatible con servicios AWS. La referencia oficial y sus límites de
servicios están en [floci.io](https://floci.io/).

Plan reservado:

1. Definir un adaptador de infraestructura, separado de los servicios de
   negocio, para object storage, colas y notificaciones.
2. Crear un perfil Docker Compose/CI explícito para el emulador local.
3. Añadir contratos de integración contra endpoints locales antes de elegir
   servicios AWS administrados.
4. Mantener el fallback actual de MongoDB, Redis y BullMQ hasta demostrar
   paridad funcional y observabilidad.

No se monta automáticamente la imagen de Floci ni se expone el Docker socket:
esa operación requiere revisión independiente porque amplía la autoridad del
entorno de desarrollo.
