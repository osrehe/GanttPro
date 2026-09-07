# Fixtures

Archivos de ejemplo usados por los tests y útiles para probar la importación a mano desde la
interfaz (botón **Importar**).

## `msproject-sample.xml`

Proyecto "Implementación ERP" exportado en formato MS Project XML (MSPDI, esquema
`http://schemas.microsoft.com/project`). Tiene 16 tareas en tres niveles de esquema (más la tarea
raíz UID 0, que se ignora), dos hitos (inicio y salida a producción), 13 vínculos de predecesoras de
tipos FS (uno con desfase de 1 día), SS (con desfase de 2 días) y FF (con desfase de 5 días), 3 recursos con tarifa en pesos y
9 asignaciones. Duraciones en formato `PT40H0M0S` con `MinutesPerDay` = 480 (8 horas por día). El
test `src/lib/import/mspdi.test.ts` comprueba que la importación conserva todas las dependencias y
`src/app/api/import.integration.test.ts` lo importa completo contra la base de datos de prueba.
