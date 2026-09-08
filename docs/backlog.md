# Backlog — trabajo consciente fuera de la versión 1.0

Cada ítem se dejó fuera a propósito y está justificado con el código o con una decisión de
arquitectura. No es una lista de deseos: es lo que hoy tiene un límite conocido y a quién le afecta.

Orden sugerido: primero lo que cambia la operación diaria (feriados, correo, UF), después lo que
importa al crecer (rendimiento del PDF, límite de peticiones distribuido) y al final lo que amplía el
alcance funcional.

## Datos y operación

### Feriados de Chile de otros años

**Hoy.** Solo está cargado 2026 (`src/lib/holidays/cl-2026.json`). La página Configuración ofrece el
botón Cargar únicamente para los años disponibles.

**Por qué.** Los feriados chilenos combinan fechas fijas, fechas movibles (Semana Santa, solsticio) y
la ley de traslado de algunos días lunes. Generarlos por cálculo sin verificarlos contra el
calendario oficial habría metido errores silenciosos en la programación de todos los proyectos.

**Impacto.** Un proyecto que cruce 2027 necesita que alguien agregue esos feriados a mano en
Configuración, una vez por proyecto. Mientras no lo haga, esos días se cuentan como hábiles.

**Qué haría falta.** Un `cl-2025.json` y un `cl-2027.json` verificados contra el calendario oficial,
registrados en `src/lib/holidays/index.ts`.

### Envío real de correo para las menciones

**Hoy.** `src/lib/mailer.ts` define la interfaz `Mailer`, el `ConsoleMailer` activo y un `SmtpMailer`
preparado que falla con un mensaje claro si le faltan variables. El código lleva un `TODO v2`.

**Por qué.** Habría exigido una dependencia de envío (nodemailer o Resend) y un servidor de correo
configurado, sin aportar nada al plan que es el objeto de la versión 1.

**Impacto.** Quien es mencionado en un comentario lo ve en la aplicación, pero no recibe aviso fuera
de ella. Las variables `MAIL_*` ya están documentadas en `.env.example`.

**Qué haría falta.** Implementar el envío dentro de `SmtpMailer` y activarlo con
`MAIL_TRANSPORT=smtp`. El resto del código no cambia: la notificación ya es de mejor esfuerzo y
nunca hace fallar una petición.

### Valor de la UF automático

**Hoy.** El valor se ingresa a mano en Configuración. `src/lib/uf-provider.ts` tiene el
`ManualUfProvider` activo y un `MindicadorUfProvider` escrito y sin uso.

**Por qué.** La versión 1 no hace llamadas a servicios externos, para que funcione en una red
cerrada y para no depender de la disponibilidad de terceros.

**Impacto.** Si nadie actualiza el valor, los costos convertidos entre UF y pesos quedan
desactualizados. Cuando falta el valor, la aplicación muestra el monto vacío en vez de una cifra
equivocada.

**Qué haría falta.** Registrar `MindicadorUfProvider` como proveedor activo, con caché diaria y
respaldo en el valor manual cuando el servicio no responda.

## Rendimiento y escala

### Reutilizar el navegador entre exportaciones a PDF

**Hoy.** Cada exportación lanza y cierra Chromium. El proyecto de ejemplo (46 tareas, 9 páginas)
tarda unos 18 segundos en desarrollo.

**Por qué.** Mantener un navegador vivo obliga a gestionar su ciclo de vida, las fugas de memoria y
el cierre por inactividad. Con un uso ocasional no compensaba.

**Impacto.** Exportaciones seguidas o proyectos grandes se sienten lentos; el handler tiene un tope
de 120 segundos.

**Qué haría falta.** Una instancia compartida con cierre tras varios minutos sin uso, como anticipa
[ADR-007](adr/ADR-007-pdf-con-puppeteer.md).

### Límite de peticiones para varias instancias

**Hoy.** `src/lib/rate-limit.ts` cuenta las peticiones en la memoria del proceso, que es lo que
corresponde al despliegue de la versión 1: un contenedor detrás de un proxy.

**Por qué.** Un contador compartido exige Redis o equivalente, o sea otra pieza que operar.

**Impacto.** Si algún día se levantan varias instancias, cada una lleva su propia cuenta y el límite
efectivo se multiplica por el número de instancias.

**Qué haría falta.** Mover el contador a un almacén compartido, manteniendo la misma interfaz.

### Notificación de cambios sin consultas periódicas

**Hoy.** La colaboración consulta el historial cada 1,5 segundos
([ADR-010](adr/ADR-010-colaboracion-por-polling.md)).

**Por qué.** Es simple, no necesita conexiones abiertas y cumple el requisito de ver el cambio ajeno
en menos de tres segundos.

**Impacto.** Con muchos proyectos abiertos a la vez, la consulta constante genera carga que no
aporta cuando nadie está editando.

**Qué haría falta.** Eventos enviados por el servidor sobre el mismo historial, dejando la consulta
periódica como respaldo.

## Alcance funcional

### Importar archivos `.mpp` de Microsoft Project

**Hoy.** Se importa el formato XML (MSPDI); el binario `.mpp` no
([ADR-011](adr/ADR-011-importacion-con-previsualizacion.md)).

**Por qué.** Las librerías disponibles para Node son incompletas o de pago, y Project exporta a XML
sin instalar nada.

**Impacto.** Quien traiga un plan desde Project tiene que hacer un paso extra: "Guardar como" en
formato XML. Está documentado en el manual.

### Nivelación de recursos más completa

**Hoy.** `proposeLeveling` retrasa tareas no críticas, en orden de holgura, hasta liberar el
recurso; nunca mueve tareas críticas ni hitos, y reporta lo que no logró resolver.

**Por qué.** Una nivelación completa (dividir tareas, cambiar dedicaciones, mover la ruta crítica con
recálculo iterativo) es un problema de optimización que excede el alcance de la versión 1.

**Impacto.** En proyectos muy cargados la propuesta puede dejar días sobreasignados. La aplicación lo
dice explícitamente en vez de simular que resolvió.

### Restricciones de fecha distintas de "lo antes posible"

**Hoy.** Todas las tareas se programan lo antes posible y la fecha del usuario funciona como "no
empezar antes de" ([ADR-003](adr/ADR-003-semantica-de-planificacion.md)). Al importar desde Project,
las restricciones se traducen a esa fecha.

**Por qué.** Un solo modo de programación mantiene el motor predecible y hace determinista el
deshacer.

**Impacto.** No se puede fijar una tarea a una fecha inamovible ni programar hacia atrás desde la
fecha de término.

### Dependencias hacia o desde tareas resumen

**Hoy.** No se permiten; la relación se define entre tareas hoja.

**Por qué.** Las fechas de un resumen ya se derivan de sus hijas: una dependencia sobre él crea una
circularidad entre el rollup y la programación.

**Impacto.** Los planes importados que las usaban pierden esos vínculos, con aviso explícito en la
previsualización.

### Cobertura completa de la suite en Firefox

**Hoy.** Los flujos principales (ingreso, tabla, Gantt) se ejecutan también en Firefox; el resto solo
en Chromium, que es el navegador de referencia.

**Por qué.** Los arrastres finos y las descargas de archivos se comportan distinto entre navegadores
y duplicar toda la suite alarga la integración continua sin encontrar defectos nuevos.

**Impacto.** Un defecto que solo aparezca en Firefox y que esté fuera de esos flujos no lo detecta la
suite automática.

### Traducción a otros idiomas

**Hoy.** Los textos están escritos directamente en español de Chile, sin marco de
internacionalización, por decisión de alcance.

**Impacto.** Ofrecer otro idioma exige extraer todos los textos antes de traducir.
