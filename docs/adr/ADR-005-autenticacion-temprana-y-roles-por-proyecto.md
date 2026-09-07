# ADR-005 — Autenticación mínima temprana y roles por proyecto

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La spec original dejaba la autenticación para el penúltimo paso, pero exigía desde el primer
endpoint que toda mutación registrara en `AuditLog` "quién, qué, antes/después". Sin sesión no hay
"quién": habría que inventar un usuario ficticio y reemplazarlo después en la API, en los tests de
integración y en los e2e, con el riesgo de dejar rutas sin proteger. Además, la spec hablaba de
"roles (admin, editor, lector)" sin decir si eran globales o por proyecto; en una herramienta donde
una persona puede administrar un proyecto y solo leer otro, la diferencia importa.

## Decisión

1. **Autenticación mínima en el Paso 4**, junto con el schema Prisma: Auth.js con proveedor de
   credenciales (email + contraseña, hash bcrypt en `User.passwordHash`), sesión JWT, página
   `/login` y un usuario administrador creado por el seed (`admin@ganttpro.local`).
2. **`middleware.ts`** protege todo `/(app)` y `/api/**` salvo `/health`, `/api/auth/**`, `/login` y,
   desde el Paso 10, `/share/[token]`. Una petición sin sesión recibe 401 en la API y redirección a
   `/login` en páginas.
3. **`getSessionUser()`** en `src/lib/auth` es la única forma de obtener el usuario en Route Handlers
   y Server Components. Lanza si no hay sesión, por lo que `AuditLog.userId` nunca puede ser nulo.
4. **Roles por proyecto, no globales:** la entidad `ProjectMember` con `role`
   (`ADMIN`, `EDITOR`, `VIEWER`) enlaza `User` y `Project`. El creador del proyecto es `ADMIN`
   automáticamente. Un usuario sin fila en `ProjectMember` no ve el proyecto.
   - `VIEWER`: lectura de todo el proyecto, exportaciones, comentarios propios.
   - `EDITOR`: además, toda edición del plan, recursos, asignaciones e importaciones.
   - `ADMIN`: además, miembros, baselines, archivar/duplicar, enlaces compartidos, configuración del
     proyecto.
5. Hasta el Paso 10, el seed crea al admin como `ADMIN` del proyecto de ejemplo y la API ya verifica
   pertenencia (`ProjectMember` existe) en cada handler; la distinción fina entre `EDITOR` y `VIEWER`
   en la UI y en la API se completa en el Paso 10, junto con Google como proveedor opcional y
   `ShareLink` para lectura anónima por token.

## Consecuencias

Positivas:

- La API nace protegida y auditada; los tests de integración se escriben desde el principio con una
  sesión real, no con un mock que luego hay que quitar.
- El modelo de permisos por proyecto cubre el caso real de una consultora: distintos clientes,
  distintos equipos.
- `ShareLink` encaja como un `VIEWER` anónimo con alcance de un solo proyecto.

Negativas:

- El Paso 4 crece (Auth.js, bcrypt, middleware, página de login, e2e de login) respecto a la spec
  original. Se compensa porque el Paso 10 se reduce a roles finos, Google y enlaces.
- Los tests de integración deben crear usuarios y membresías en el setup. Se resuelve con una
  factoría `createTestUser({ role })` en `src/test/`.
- No hay roles globales: quién puede crear proyectos es, en v1, cualquier usuario autenticado. El
  registro de usuarios lo hace un administrador por seed o script hasta que exista una pantalla en
  v2.

## Alternativas descartadas

- **Usuario de desarrollo fijo hasta el Paso 10.** Más rápido al principio, pero implica retocar cada
  handler, cada test y cada e2e después, con alta probabilidad de dejar una ruta abierta.
- **Roles globales (`User.role`).** No modela "admin de un proyecto, lector de otro".
- **Autorización basada en políticas (CASL, Oso).** Tres roles y un recurso (proyecto) no justifican
  un motor de reglas; una función `assertProjectRole(userId, projectId, minRole)` basta.

## Cómo verificarla

- e2e Playwright (Paso 4): login correcto entra a `/proyectos`; login incorrecto muestra error en
  español; `GET /proyectos` sin sesión redirige a `/login`; `GET /api/projects` sin sesión responde
  401 con `{ error: { code: "UNAUTHORIZED" } }`.
- Test de integración (Paso 5): un usuario sin `ProjectMember` en el proyecto recibe 403
  `FORBIDDEN` en `GET /api/projects/:id`.
- Toda fila de `AuditLog` tiene `userId` no nulo: la columna es `NOT NULL` en el schema.
