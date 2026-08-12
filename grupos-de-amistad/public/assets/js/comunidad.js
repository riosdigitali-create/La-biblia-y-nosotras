/* Archivo retirado el 2026-08-06.

   Manejaba /registrar-comunidad/, una maqueta paralela de /registrar/
   que duplicaba el formulario de líderes y entregaba por WhatsApp en
   lugar de guardar. Se conservó /registrar/, que escribe en
   `group_applications` con Turnstile y revisión administrativa.

   Los campos que solo existían en la maqueta —pastores, red a la que
   pertenecen, tiempo en la red, fotografía— siguen pendientes de
   definir: requieren migración y, la foto, un bucket con política de
   retención. Está anotado en docs/PENDIENTES.md.

   Ningún HTML lo carga. Se puede borrar sin consecuencias. */
