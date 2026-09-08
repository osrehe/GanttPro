# Lighthouse — vista Gantt

Medición del Paso 11 sobre la vista Gantt del proyecto sembrado (46 tareas, 34 dependencias), contra
el build de producción (`npm run build && npm run start`), con sesión iniciada.

Cómo repetirla:

```powershell
npm run build
npm run start          # en otra consola
npm run lighthouse
```

El script `scripts/lighthouse.mjs` inicia sesión con Playwright, toma la cookie de la sesión y se la
pasa a Lighthouse; el informe completo queda en `docs/qa/lighthouse.html`.

## Resultado del 2026-09-08

| Categoría     | Puntaje | Umbral del plan |
| ------------- | ------- | --------------- |
| Rendimiento   | 100     | ≥ 90            |
| Accesibilidad | 100     | ≥ 90            |

Condiciones: escritorio, 1440 × 900, sin estrangulamiento de CPU, red simulada de 10 Mbps con 40 ms
de latencia. URL analizada: `/projects/<id del proyecto sembrado>/gantt`.

El puntaje de accesibilidad complementa la revisión con axe de `e2e/a11y.spec.ts`, que recorre
Proyectos, Tabla, Gantt, Recursos y Configuración y falla ante cualquier violación grave o crítica.
