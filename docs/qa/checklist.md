# Checklist de QA — GanttPro v1.0.0

Treinta verificaciones ordenadas por flujo, desde el ingreso hasta la entrega. Se ejecutan con
Playwright (`npx playwright test e2e/qa-checklist.spec.ts`), que deja una captura por verificación en
[`evidencia/`](evidencia/). Cada fila indica además qué prueba automatizada cubre el caso en
profundidad, para no confundir "se ve bien" con "está probado".

Cómo repetirlo desde cero:

```powershell
docker compose up -d
npm run db:migrate
npm run db:seed
npx playwright test e2e/qa-checklist.spec.ts
```

Estado de la última ejecución: **2026-09-07**, Chromium, servidor de desarrollo, base sembrada.

| #   | Verificación                                                                   | Resultado | Evidencia                                         | Prueba que la cubre en profundidad          |
| --- | ------------------------------------------------------------------------------ | --------- | ------------------------------------------------- | ------------------------------------------- |
| 1   | El ingreso con contraseña incorrecta muestra "Correo o contraseña incorrectos" | Correcto  | [qa-01](evidencia/qa-01-login-incorrecto.png)     | `e2e/auth.spec.ts`                          |
| 2   | El ingreso correcto lleva al listado de proyectos y muestra al usuario         | Correcto  | [qa-02](evidencia/qa-02-listado-proyectos.png)    | `e2e/auth.spec.ts`                          |
| 3   | Una ruta protegida sin sesión redirige al ingreso                              | Correcto  | [qa-03](evidencia/qa-03-ruta-protegida.png)       | `e2e/auth.spec.ts`                          |
| 4   | Se crea un proyecto con nombre y fecha de inicio                               | Correcto  | [qa-04](evidencia/qa-04-proyecto-creado.png)      | `src/app/api/api.integration.test.ts`       |
| 5   | Duplicar un proyecto copia tareas, dependencias y recursos                     | Correcto  | [qa-05](evidencia/qa-05-proyecto-duplicado.png)   | `src/app/api/api.integration.test.ts`       |
| 6   | La WBS se construye solo con el teclado y numera 1, 1.1, 1.2                   | Correcto  | [qa-06](evidencia/qa-06-tabla-wbs.png)            | `e2e/table.spec.ts`                         |
| 7   | Cambiar la duración recalcula fechas y el resumen las hereda                   | Correcto  | [qa-07](evidencia/qa-07-duraciones.png)           | `packages/engine/tests/schedule.test.ts`    |
| 8   | Una dependencia FS reprograma la sucesora                                      | Correcto  | [qa-08](evidencia/qa-08-dependencia-fs.png)       | `src/app/api/api.integration.test.ts`       |
| 9   | Una predecesora inexistente muestra un error accionable                        | Correcto  | [qa-09](evidencia/qa-09-predecesora-invalida.png) | `src/lib/predecessors.test.ts`              |
| 10  | Un hito se crea con duración cero                                              | Correcto  | [qa-10](evidencia/qa-10-hito.png)                 | `packages/engine/tests/schedule.test.ts`    |
| 11  | Deshacer y rehacer devuelven el estado anterior                                | Correcto  | [qa-11](evidencia/qa-11-deshacer-rehacer.png)     | `src/stores/history.test.ts`                |
| 12  | El Gantt dibuja barras, hitos y la ruta crítica                                | Correcto  | [qa-12](evidencia/qa-12-gantt.png)                | `e2e/gantt.spec.ts`                         |
| 13  | El Gantt cambia de escala y se ajusta al proyecto                              | Correcto  | [qa-13](evidencia/qa-13-gantt-escalas.png)        | `packages/engine/tests/layout.test.ts`      |
| 14  | El Gantt se recorre con el teclado                                             | Correcto  | [qa-14](evidencia/qa-14-gantt-teclado.png)        | `e2e/a11y.spec.ts`                          |
| 15  | Se crea un recurso y queda disponible para asignar                             | Correcto  | [qa-15](evidencia/qa-15-recurso-creado.png)       | `e2e/table.spec.ts`                         |
| 16  | El histograma de carga muestra capacidad y sobreasignación                     | Correcto  | [qa-16](evidencia/qa-16-histograma.png)           | `packages/engine/tests/resources.test.ts`   |
| 17  | La fecha de estado agrega avance esperado y desviación a la tabla              | Correcto  | [qa-17](evidencia/qa-17-fecha-de-estado.png)      | `e2e/tracking.spec.ts`                      |
| 18  | Guardar una línea base deja la comparativa en cero                             | Correcto  | [qa-18](evidencia/qa-18-linea-base.png)           | `e2e/tracking.spec.ts`                      |
| 19  | El dashboard muestra KPIs y curva S                                            | Correcto  | [qa-19](evidencia/qa-19-dashboard.png)            | `packages/engine/tests/dashboard.test.ts`   |
| 20  | El dashboard del proyecto sembrado refleja sus 46 tareas                       | Correcto  | [qa-20](evidencia/qa-20-dashboard-seed.png)       | `packages/engine/tests/dashboard.test.ts`   |
| 21  | La auditoría lista las acciones con su autor                                   | Correcto  | [qa-21](evidencia/qa-21-auditoria.png)            | `e2e/tracking.spec.ts`                      |
| 22  | La exportación a Excel descarga el libro con sus cinco hojas                   | Correcto  | [qa-22](evidencia/qa-22-exportar-excel.png)       | `e2e/export-import.spec.ts`                 |
| 23  | El diálogo de PDF ofrece orientación, tamaño, escala y columnas                | Correcto  | [qa-23](evidencia/qa-23-exportar-pdf.png)         | `e2e/export-pdf.spec.ts`                    |
| 24  | La exportación a PNG descarga la imagen del Gantt visible                      | Correcto  | [qa-24](evidencia/qa-24-exportar-png.png)         | `e2e/export-import.spec.ts`                 |
| 25  | La importación previsualiza el archivo y bloquea si hay errores                | Correcto  | [qa-25](evidencia/qa-25-importacion.png)          | `src/lib/import/rows.test.ts`               |
| 26  | La plantilla de importación se descarga y se puede reimportar                  | Correcto  | [qa-26](evidencia/qa-26-plantilla.png)            | `src/lib/import/excel.test.ts`              |
| 27  | La configuración guarda el valor de la UF                                      | Correcto  | [qa-27](evidencia/qa-27-configuracion.png)        | `src/app/api/api.integration.test.ts`       |
| 28  | El enlace de solo lectura se comparte y se abre sin sesión                     | Correcto  | [qa-28](evidencia/qa-28-enlace-compartido.png)    | `e2e/roles.spec.ts`                         |
| 29  | El rol lector no puede editar                                                  | Correcto  | [qa-29](evidencia/qa-29-rol-lector.png)           | `e2e/roles.spec.ts`, `security.integration` |
| 30  | El panel de atajos y el tema oscuro funcionan                                  | Correcto  | [qa-30](evidencia/qa-30-atajos-y-tema.png)        | `e2e/a11y.spec.ts`                          |

## Fuera de este recorrido

Estas comprobaciones tienen su propia suite porque necesitan datos o mediciones especiales:

- **Rendimiento del Gantt** con 1.110 tareas: `npm run test:e2e:perf` (requiere `npm run db:seed:perf`).
- **Colaboración entre dos sesiones**: `e2e/collaboration.spec.ts`.
- **Accesibilidad con axe**: `e2e/a11y.spec.ts`.
- **Lighthouse**: `npm run lighthouse` (ver los números en [`lighthouse.md`](lighthouse.md)).
