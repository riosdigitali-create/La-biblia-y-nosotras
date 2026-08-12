# Pendientes externos

Estado revisado el 12 de agosto de 2026. La aplicación, D1, Turnstile, panel y
búsqueda por código postal ya están desplegados.

## Antes de recibir registros públicos

| Prioridad | Decisión externa |
|---|---|
| Alta | Aprobar el texto definitivo del aviso de privacidad. La versión actual guardada con cada consentimiento es `2026-08-v1`. |
| Alta | Aprobar el acuerdo para líderes mostrado al final de `/registrar/`. |
| Media | Decidir si se conservará `lbyn-grupos.pages.dev` o si se creará `grupos.labibliaynosotras.com`. |
| Media | Definir el tiempo que el equipo comunicará para revisar solicitudes. |

## Integraciones opcionales

- Correo: elegir proveedor, verificar el dominio y activar `EMAIL_ENABLED`.
- WhatsApp Cloud API: configurar Meta y aprobar plantillas. El enlace humano a
  WhatsApp sí funciona; la mensajería automática permanece apagada.
- Modelo conversacional: elegir proveedor/modelo y añadir `CHAT_API_KEY`. Sin
  modelo, el chat ya resuelve el caso principal mediante un flujo guiado que
  consulta grupos reales por código postal.
- Cloudflare Access: puede sustituir el PIN compartido si el equipo requiere
  identidad individual en la auditoría.

## Operación actual

- D1 no contiene grupos ni solicitudes de prueba.
- Aceptar una solicitud crea y publica el grupo inmediatamente.
- Rechazar exige un motivo y no borra la solicitud.
- El panel actualiza sus datos cada cinco segundos mientras está visible.
- Las pruebas automatizadas cubren registro, moderación, búsqueda, cupos,
  conversación y círculos.

## Seguridad heredada

Los dos webhooks antiguos de Make que alguna vez estuvieron en el historial del
repositorio público deben considerarse expuestos y rotarse, aunque la portada
actual ya no los utilice.
