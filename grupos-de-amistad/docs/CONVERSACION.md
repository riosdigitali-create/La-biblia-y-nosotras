# Conversación de acompañamiento

`/acompanamiento/` ayuda a una participante a encontrar un grupo publicado por
código postal y la lleva al registro seguro para solicitar unirse.

## Modo activo: búsqueda guiada

La aplicación no depende de un proveedor de IA para resolver el caso principal:

```text
bienvenida → pedir CP → consultar D1
  ├─ hay grupos → mostrar fichas reales → elegir → /asistir/
  └─ no hay     → ofrecer lista de espera → /asistir/
```

La consulta se ejecuta de nuevo cada vez que se envía un código postal. No hay
una lista incrustada en JavaScript ni resultados de demostración.

## Modo opcional con modelo

Al configurar `CHAT_PROVIDER`, `CHAT_MODEL` y `CHAT_API_KEY`, el orquestador
puede conversar con más libertad. El modelo no recibe acceso a D1: solo propone
herramientas permitidas y el servidor valida y ejecuta cada una.

| El modelo no puede | Garantía |
|---|---|
| Publicar grupos | No existe una herramienta conversacional para publicar. Solo el panel puede aceptar. |
| Inventar resultados | Las fichas se construyen con la respuesta real de `searchPublishedGroups`. |
| Registrar sin consentimiento | El servicio comprueba datos y consentimiento en el servidor. |
| Ver teléfonos completos | Los datos sensibles se enmascaran antes de salir a un proveedor. |
| Elegir un identificador inventado | La elección se valida contra los resultados ofrecidos en esa sesión. |

## Privacidad

- El nombre de quien guía solo aparece cuando fue autorizado.
- La dirección privada, correo y teléfono de la líder nunca salen en la búsqueda.
- El navegador recibe un token opaco de sesión, no el estado interno.
- El hilo conserva como máximo 24 mensajes y la sesión vence a las dos horas.

## Riesgo

Las señales de riesgo se evalúan en el servidor antes de llamar a cualquier
modelo. La respuesta muestra recursos reales de ayuda, marca la sesión para
seguimiento humano y ofrece contacto con el equipo.
