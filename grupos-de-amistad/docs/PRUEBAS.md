# Pruebas

Ejecutar:

```bash
npm run typecheck
npm test
```

La suite automatizada cubre 158 comprobaciones:

- 67 del recorrido de líder, moderación, publicación, búsqueda, cupos y unión.
- 40 de sesión conversacional, consentimiento, riesgo, seguridad y herramientas.
- 51 de círculos, normalización de iglesias, alertas y resumen del panel.

## Verificación de producción realizada

El 12 de agosto de 2026 se comprobó sobre `lbyn-grupos.pages.dev`:

1. La portada, registro, conversación, formulario para unirse y panel responden.
2. El chat consulta D1 con un CP real y ofrece lista de espera si no hay grupo.
3. El PIN abre una sesión administrativa con CSRF.
4. Una solicitud temporal aceptada se convirtió en grupo `PUBLISHED`.
5. Ese grupo apareció inmediatamente en `/api/groups/search?cp=04100`.
6. Una segunda solicitud temporal fue rechazada con motivo.
7. Se retiraron los datos temporales y D1 quedó con cero solicitudes y grupos.

## Revisión manual antes de campaña

- Completar un registro con Turnstile desde un navegador real.
- Confirmar en el panel que todos los datos esperados aparecen.
- Aceptar y buscar por el mismo código postal.
- Completar el formulario de participante y solicitar unirse.
- Rechazar otra solicitud y revisar que el motivo quede visible.
- Recorrer móvil, teclado y lector de pantalla en las rutas públicas.
