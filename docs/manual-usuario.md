# Manual de usuario — GanttPro

Este manual está escrito para quien planifica un proyecto, no para quien programa. Explica cómo
armar el plan, mantenerlo al día y compartirlo.

Si algo del texto no calza con lo que ves en pantalla, manda el detalle a quien administra la
aplicación: la interfaz y este manual se mantienen juntos.

## Índice

1. [Ingresar](#ingresar)
2. [Crear un proyecto](#crear-un-proyecto) · [Eliminar un proyecto](#eliminar-un-proyecto)
3. [Armar la estructura de trabajo](#armar-la-estructura-de-trabajo)
4. [Fechas y duraciones](#fechas-y-duraciones)
5. [Dependencias](#dependencias)
6. [Hitos y tareas resumen](#hitos-y-tareas-resumen)
7. [Recursos, asignaciones y costos](#recursos-asignaciones-y-costos)
8. [Calendario laboral y feriados](#calendario-laboral-y-feriados)
9. [Avance y fecha de estado](#avance-y-fecha-de-estado)
10. [Líneas base](#líneas-base)
11. [Dashboard y curva S](#dashboard-y-curva-s)
12. [Carga de recursos y nivelación](#carga-de-recursos-y-nivelación)
13. [Exportar](#exportar)
14. [Importar](#importar)
15. [Compartir y trabajar con otras personas](#compartir-y-trabajar-con-otras-personas)
16. [Comentarios y menciones](#comentarios-y-menciones)
17. [Historial de cambios](#historial-de-cambios)
18. [Atajos de teclado](#atajos-de-teclado)
19. [Preguntas frecuentes](#preguntas-frecuentes)

## Ingresar

Abre la dirección de la aplicación y escribe tu correo y contraseña. Si tu organización habilitó el
ingreso con Google, verás además el botón correspondiente; en ese caso tu correo de Google ya debe
estar registrado, porque GanttPro no crea cuentas por su cuenta.

Arriba a la derecha están el botón de atajos de teclado y el selector de tema (claro, oscuro o
automático, que sigue la preferencia del sistema). Tu elección se recuerda en ese navegador.

## Crear un proyecto

En **Proyectos**, el botón **Nuevo proyecto** pide nombre, descripción, fecha de inicio y cómo
ponderar el avance de las tareas resumen (por duración o por esfuerzo). Cada proyecto aparece como
una tarjeta con sus fechas, la cantidad de tareas, el avance y tu rol.

Desde la tarjeta también puedes **Duplicar** el proyecto (copia tareas, dependencias, recursos y
calendario) y **Archivar** o restaurar. Un proyecto archivado queda de solo lectura y se esconde
hasta que marques **Mostrar archivados**.

Al abrir un proyecto aparecen las vistas en la parte superior: **Tabla**, **Gantt**, **Recursos**,
**Dashboard**, **Líneas base** y **Auditoría**.

### Eliminar un proyecto

Archivar esconde el proyecto y lo deja de solo lectura, pero no lo pierde. **Eliminar** sí: borra el
proyecto con sus tareas, dependencias, recursos, líneas base, comentarios, enlaces compartidos y su
historial de cambios, y no hay forma de recuperarlo desde la aplicación.

Solo quien es administrador del proyecto ve el botón habilitado. El diálogo enumera lo que se va a
perder, ofrece **Descargar una copia en Excel antes de borrar** y pide escribir el nombre exacto del
proyecto: hasta que coincida, el botón sigue apagado. Después del borrado queda un registro interno
con el nombre, quién lo eliminó, cuándo y cuánto contenía, para poder responder más adelante qué
pasó con ese proyecto.

## Armar la estructura de trabajo

La vista **Tabla** es una grilla con las columnas WBS, Nombre, Inicio, Fin, Duración, % Avance,
Recursos, Predecesoras, Estado, Esperado y Desv.

Puedes construir todo el plan sin soltar el teclado:

- **Insert** crea una tarea debajo de la seleccionada; **Shift + Insert**, una subtarea.
- **Enter** o **F2** editan la celda con el foco. También basta con empezar a escribir.
- **Tab** indenta la tarea (la convierte en hija de la anterior) y **Shift + Tab** la desindenta.
- **Alt + ↑** y **Alt + ↓** la suben o bajan entre sus hermanas.
- **Supr** la elimina, con confirmación.
- **Espacio** abre el panel de detalle.

Los códigos WBS se renumeran solos cada vez que mueves algo: nunca tendrás que escribir un "1.2.3".

El panel de detalle tiene las pestañas **Campos**, **Dependencias**, **Recursos**, **Notas** y
**Comentarios**.

Cualquier cambio se puede deshacer con **Ctrl + Z** y rehacer con **Ctrl + Y**. El historial guarda
la secuencia completa de lo que hiciste en la sesión, incluidas las eliminaciones: deshacer una
tarea borrada recupera también sus subtareas.

## Fechas y duraciones

Las tareas se programan **lo antes posible**. Esto significa que la fecha que tú fijas funciona como
un "no empezar antes de": si la tarea no depende de nadie, empieza ahí; si tiene predecesoras,
empieza cuando estas lo permitan, nunca antes de tu fecha.

La duración se cuenta en **días hábiles** según el calendario del proyecto. Si una tarea de cinco
días empieza un jueves y el fin de semana no es laborable, termina el miércoles siguiente.

En la vista **Gantt**, arrastrar una barra cambia esa fecha de "no empezar antes de" y reprograma
todo lo que dependa de ella. Arrastrar el borde derecho cambia la duración, y el triángulo bajo la
barra ajusta el avance. Mientras arrastras ves una previsualización; el plan se recalcula al soltar.

Las tareas resumen no se arrastran: sus fechas son el resultado de sus hijas.

## Dependencias

Hay cuatro tipos:

| Tipo | Significado                                                     |
| ---- | --------------------------------------------------------------- |
| FS   | Fin a inicio: la sucesora empieza cuando termina la predecesora |
| SS   | Inicio a inicio: ambas empiezan juntas                          |
| FF   | Fin a fin: ambas terminan juntas                                |
| SF   | Inicio a fin: la sucesora termina cuando empieza la predecesora |

Se crean de tres maneras:

1. **Escribiendo en la columna Predecesoras.** El formato es el código WBS, opcionalmente el tipo y
   opcionalmente el desfase en días hábiles: `3` equivale a `3FS+0d`; `1.2FS+2d` espera dos días
   hábiles después de terminar la 1.2; `5SS` arranca junto con la 5; `4FS-1d` se adelanta un día.
   Separa varias con punto y coma: `1.2FS+2d; 5SS`.
2. **Desde el panel de detalle**, en la pestaña Dependencias.
3. **Arrastrando** en el Gantt desde el conector redondo de una barra hasta otra. El tipo se deduce
   de qué extremos uniste. Al hacer clic en una flecha puedes cambiar el tipo, el desfase o
   eliminarla.

Si una dependencia crearía un ciclo, GanttPro la rechaza y te muestra el camino que lo produce
("1.2 → 2.1 → 1.2"). Las tareas resumen no admiten dependencias: la relación va entre las tareas
hoja que hacen el trabajo.

Al quitar una dependencia, la tarea vuelve a la fecha que tú le habías puesto.

## Hitos y tareas resumen

Un **hito** es una tarea de duración cero: marca una fecha relevante (una aprobación, una entrega) y
se dibuja como un rombo. Se crea desde la barra de la tabla o poniendo la duración en cero.

Una **tarea resumen** es cualquier tarea que tenga hijas. Sus fechas van desde el inicio más temprano
hasta el fin más tardío de sus descendientes, y su avance es el promedio ponderado por duración (o
por esfuerzo, si así lo configuraste al crear el proyecto). No se editan a mano: son un reflejo.

## Recursos, asignaciones y costos

En la vista **Recursos** se crean las personas, equipos y materiales del proyecto: nombre, tipo,
correo, tarifa por hora, moneda (UF o pesos), capacidad en horas por día y color.

Las asignaciones se hacen desde la pestaña Recursos del panel de detalle de cada tarea, indicando el
porcentaje de dedicación. Con eso GanttPro calcula:

- **Horas** = duración en días hábiles × horas por día del calendario × dedicación.
- **Costo** = horas × tarifa del recurso.

Los costos se muestran en la moneda que elegiste en Configuración. Para convertir entre UF y pesos
hace falta el valor de la UF, que se ingresa a mano en Configuración; mientras no esté, los montos en
la otra moneda aparecen vacíos en vez de mostrar una cifra inventada.

## Calendario laboral y feriados

En **Configuración** eliges el proyecto y defines sus días laborables, las horas por día hábil y los
feriados. Puedes agregar feriados uno a uno (fecha y nombre) o usar **Cargar** para traer los
feriados de Chile de un año disponible.

Al guardar, el proyecto se reprograma completo y GanttPro te dice cuántas tareas se movieron. Solo
está cargado el año 2026; para otros años agrega los feriados a mano.

## Avance y fecha de estado

La **Fecha de estado** es el día al que está actualizada la información. Se fija desde la barra de la
tabla o desde el Dashboard, y aparece como una línea vertical en el Gantt.

Con ella, la tabla muestra dos columnas más:

- **Esperado**: qué porcentaje debería llevar la tarea a esa fecha si fuera parejo en el tiempo.
- **Desv.**: la diferencia con el avance real. Las tareas atrasadas llevan un triángulo de alerta.

El botón **Avance a fecha** pone el avance esperado a la tarea seleccionada y sus subtareas (o a todo
el proyecto si no hay ninguna seleccionada). Nunca baja un avance ya informado, y se puede deshacer
con Ctrl + Z como cualquier otro cambio.

## Líneas base

Una línea base es una fotografía del plan. En la vista **Líneas base**, **Guardar línea base** la
crea con el nombre que le des; se pueden guardar hasta cinco por proyecto.

La tabla comparativa muestra, tarea por tarea, el inicio y el fin de la línea base junto a los
actuales y la desviación en días hábiles, además de la diferencia de avance. Las tareas que se
crearon después aparecen como nuevas y las que ya no existen, como eliminadas.

En el Gantt puedes elegir una línea base en la barra de herramientas para verla como una barra gris
bajo cada tarea.

## Dashboard y curva S

El **Dashboard** resume el proyecto a la fecha de estado: avance real contra avance esperado,
cantidad de tareas atrasadas, hitos de los próximos 15 días, costo planificado y consumido, y fecha
de fin estimada comparada con la línea base que elijas.

La **curva S** compara el avance acumulado planificado con el real a lo largo del tiempo. Si la
curva real va por debajo de la planificada, el proyecto está atrasado respecto de lo previsto.

## Carga de recursos y nivelación

En la vista **Recursos**, el histograma muestra las horas asignadas por día o por semana frente a la
capacidad de cada recurso. Las barras que superan la capacidad se marcan en rojo; al hacer clic en
una se listan las tareas que la componen.

El botón **Nivelar** propone retrasar tareas para eliminar la sobreasignación. La propuesta se
muestra antes de aplicarse: qué tarea se movería, a qué fecha y cuántos días de retraso implica.
Nunca mueve tareas de la ruta crítica ni hitos, así que puede quedar sobreasignación que no logra
resolver, y te lo dice. Aplicar la propuesta es un cambio más: se deshace con Ctrl + Z.

## Exportar

El botón **Exportar** del encabezado ofrece:

- **Libro Excel (Gantt por día)** y **Libro Excel (Gantt por semana)**: un archivo con cinco hojas.
  Tareas (con la jerarquía agrupada, fechas y formatos), Gantt (una columna por día o por semana, con
  las barras pintadas, los no laborables sombreados y los hitos como ◆), Recursos, Dependencias y
  Resumen.
- **PDF del Gantt…**: abre un diálogo con las opciones de impresión, que se explican abajo.
- **PNG del Gantt visible**: descarga una imagen de lo que estás viendo, al doble de resolución. Solo
  está disponible mientras estás en la vista Gantt.

El diálogo del PDF permite elegir título, escala de tiempo (día, semana, mes o trimestre),
orientación, tamaño de papel (A4, A3 o Carta), línea base, rango de fechas, qué columnas de la tabla
incluir, y si se resalta la ruta crítica, se agrega la leyenda y se pone el logo configurado. Si el
Gantt no cabe en una hoja, se reparte en varias páginas: la tabla se repite a la izquierda de cada
una y el pie indica "Página X de Y". El texto del PDF es seleccionable, no es una imagen.

## Importar

El botón **Importar** acepta tres formatos y siempre trabaja en dos tiempos: primero analiza el
archivo y te muestra qué encontró, y solo escribe cuando tú confirmas.

**Desde plantilla Excel o CSV.** Usa **Descargar plantilla** para obtener el libro con las columnas
esperadas (WBS, Nombre, Duración, Inicio, Fin, Hito, Avance %, Predecesoras, Recursos y Notas), una
hoja de recursos y una de instrucciones. La jerarquía sale del código WBS y las dependencias usan el
mismo formato de texto que la columna Predecesoras. Si dejas la duración en blanco pero pones Inicio
y Fin, la duración se calcula sola.

**Desde Microsoft Project.** GanttPro lee el formato XML (MSPDI). En Project usa "Guardar como" y
elige XML: el archivo `.mpp` binario no se puede leer. Se importan la jerarquía, los vínculos con su
tipo y desfase, los recursos y las asignaciones. Los vínculos que salen de una tarea resumen se
descartan con un aviso, porque el modelo no los admite.

La previsualización lista las tareas y marca los problemas fila por fila: nombres vacíos, fechas
inválidas, predecesoras que no existen, ciclos, saltos en la jerarquía. Si hay algún error, el botón
Importar queda deshabilitado hasta que corrijas el archivo. Los avisos (por ejemplo, un recurso
mencionado que no estaba declarado y se creará vacío) no bloquean nada.

Puedes importar a un **proyecto nuevo**, **agregar al proyecto actual** o **reemplazar las tareas del
proyecto actual**. La última opción borra el plan vigente, así que pide una confirmación explícita.

Las fechas del archivo se toman como "no empezar antes de": el plan final lo calcula GanttPro con el
calendario del proyecto, no el archivo de origen.

## Compartir y trabajar con otras personas

Cada proyecto tiene tres roles:

| Rol           | Puede                                                                |
| ------------- | -------------------------------------------------------------------- |
| Administrador | Todo, incluidos miembros, enlaces compartidos y archivar el proyecto |
| Editor        | Crear y modificar el plan, recursos, líneas base e importar          |
| Lector        | Ver el proyecto y comentar; no puede modificar nada                  |

Desde la tarjeta del proyecto, **Miembros y compartir** abre el diálogo donde un administrador agrega
personas por correo, les cambia el rol o las quita. Siempre debe quedar al menos un administrador.

En el mismo diálogo, **Crear enlace** genera una dirección de solo lectura que puedes **Copiar** y
enviar a alguien sin cuenta en GanttPro. El enlace muestra la tabla y la carta Gantt, sin datos de
las personas del proyecto y sin ninguna opción de edición. Puedes darle un **Vencimiento** o
**Revocar** en cualquier momento; a partir de ahí quien lo abra verá un aviso de que el enlace no
está disponible.

Cuando varias personas trabajan en el mismo proyecto, GanttPro consulta los cambios cada segundo y
medio: verás un aviso del tipo "Ana Pérez modificó la tarea 1.2" y la pantalla se actualiza sola en
menos de tres segundos. Si dos personas editan lo mismo, gana la última en guardar.

## Comentarios y menciones

En la pestaña **Comentarios** del panel de detalle puedes conversar sobre una tarea. Escribiendo `@`
aparece la lista de miembros del proyecto: al elegir a alguien queda mencionado y recibe un aviso.

En esta versión los avisos se registran en el servidor y no se envían por correo todavía; la
integración con un servidor de correo está preparada pero inactiva.

Puedes editar o borrar tus propios comentarios. Un administrador del proyecto también puede borrar
comentarios ajenos. Todo queda en el historial.

## Historial de cambios

La vista **Auditoría** muestra quién hizo qué y cuándo, con filtros por tarea, por persona y por
rango de fechas. Cada acción se describe en palabras ("movió la tarea 1.2 al 15-03-2026"), y las
operaciones que afectan a varias tareas a la vez aparecen agrupadas.

## Atajos de teclado

Pulsa **?** en cualquier momento para abrir la lista completa. Los principales:

| Contexto | Atajo                           | Acción                                    |
| -------- | ------------------------------- | ----------------------------------------- |
| General  | `?`                             | Abrir y cerrar la ayuda                   |
| General  | `Ctrl + Z`                      | Deshacer                                  |
| General  | `Ctrl + Y` · `Ctrl + Shift + Z` | Rehacer                                   |
| General  | `Esc`                           | Cerrar el panel o cancelar la edición     |
| Tabla    | Flechas                         | Mover el foco entre celdas                |
| Tabla    | `Enter` · `F2`                  | Editar la celda                           |
| Tabla    | `Insert`                        | Nueva tarea debajo                        |
| Tabla    | `Shift + Insert`                | Nueva subtarea                            |
| Tabla    | `Supr`                          | Eliminar la tarea seleccionada            |
| Tabla    | `Tab` · `Shift + Tab`           | Indentar y desindentar                    |
| Tabla    | `Alt + ↑` · `Alt + ↓`           | Subir y bajar la tarea                    |
| Gantt    | `↑` · `↓`                       | Seleccionar la tarea anterior o siguiente |
| Gantt    | `Enter`                         | Abrir el detalle de la tarea              |
| Gantt    | `Ctrl + →` · `Ctrl + ←`         | Mover la tarea un día hábil               |
| Gantt    | `Ctrl + rueda`                  | Acercar y alejar                          |
| Gantt    | `Espacio`                       | Contraer o expandir un resumen            |

## Preguntas frecuentes

**¿Puedo fijar una tarea a una fecha exacta, pase lo que pase?** No en esta versión. Todas las tareas
se programan lo antes posible y la fecha que fijas es un mínimo, no una obligación. Si una
predecesora se atrasa, la tarea se corre.

**¿Por qué no puedo poner una dependencia sobre una tarea resumen?** Porque sus fechas ya dependen de
sus hijas y la relación se volvería circular. Pon la dependencia en la tarea hoja correspondiente.

**¿Por qué el costo aparece vacío?** Porque el recurso tiene su tarifa en una moneda distinta a la
que estás mostrando y falta el valor de la UF. Ingrésalo en Configuración.

**¿Puedo cargar los feriados de otro año?** Están cargados los de 2026. Para otros años agrégalos a
mano en Configuración; quedan guardados en el calendario del proyecto.

**¿Puedo importar un archivo .mpp de Microsoft Project?** No directamente. Ábrelo en Project y usa
"Guardar como" con el formato XML.

**¿Las menciones envían correo?** Todavía no. Quedan registradas en el servidor y visibles en el
comentario.

**¿Qué pasa si dos personas editan la misma tarea al mismo tiempo?** Gana quien guarde último. El
resto ve el cambio en menos de tres segundos con un aviso de quién lo hizo.

**¿Cuántas tareas aguanta un proyecto?** Se probó con 1.110 tareas y 1.500 dependencias: la carta
Gantt se dibuja en menos de un segundo y el arrastre se mantiene fluido. La importación acepta hasta
5.000 tareas por archivo.
