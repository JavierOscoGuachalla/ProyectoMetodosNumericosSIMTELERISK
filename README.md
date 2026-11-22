# SIMTELE-RISK

Aplicación web de métodos numéricos con cuatro casos de estudio (detención de emergencia, deterioro y mantenimiento, oscilaciones por viento y reconstrucción de sensores), inspirada en un sistema de transporte por cable. Los escenarios son **hipotéticos** y no describen fallas verificadas de ninguna empresa.

**Arquitectura:** HTML + CSS + JavaScript → **GitHub Pages** (hosting) + **Supabase** (PostgreSQL, autenticación y RLS). Sin servidor propio, sin Python y sin base de datos local. Todos los cálculos numéricos se ejecutan en el navegador (`calculos.js`).

## Archivos
| Archivo | Función |
|---|---|
| `index.html` | Interfaz: inicio, módulos, formularios, detalle, gráficos, historial, inicio de sesión |
| `calculos.js` | Validaciones, valores predefinidos y métodos numéricos (Jacobi, Gauss-Seidel, LU, CG, bisección, Newton, secante, RK2, RK4, referencias analíticas) |
| `config.js` | **Aquí se escriben `SUPABASE_URL` y `SUPABASE_ANON_KEY`** |
| `supabase_schema.sql` | Esquema PostgreSQL (6 tablas, FK, índices, RLS) listo para ejecutar |
| `db/DER.md` | Diagrama entidad–relación |
| `.nojekyll` | Evita que GitHub Pages procese el sitio con Jekyll |

`python/` y `docs/` contienen solo material de documentación del proyecto (no forman parte de la aplicación). Los documentos Word/PDF de `docs/` describen la arquitectura anterior (Python + SQLite) y conviene regenerarlos.

## 1. Configurar Supabase (gratis)
1. Crea un proyecto en <https://supabase.com> (plan Free).
2. Abre **SQL Editor → New query**, pega **todo** el contenido de `supabase_schema.sql` y pulsa **Run**. Es idempotente (puede ejecutarse varias veces).
3. Ve a **Project Settings → API** y copia:
   - **Project URL** → `SUPABASE_URL`
   - clave **anon / publishable** → `SUPABASE_ANON_KEY`
4. Edita `config.js` y pega los dos valores:
   ```js
   window.SIMTELE_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "tu-clave-publica-anon-o-publishable"
   };
   ```
   > Usa **solo** la clave pública. **Nunca** pegues `service_role` ni `secret` en el repositorio. La aplicación rechaza una clave `service_role`/`sb_secret_`.
5. **Authentication → Providers → Email:** activo por defecto.
   - Para pruebas rápidas puedes desactivar *Confirm email*; si lo dejas activo, cada usuario debe confirmar su correo.
   - Si solo quieres usuarios concretos: desactiva *Allow new users to sign up* y crea los usuarios en **Authentication → Users → Add user**.
6. **Authentication → URL Configuration:** en *Site URL* pon la URL de GitHub Pages (paso siguiente), para que los enlaces de confirmación vuelvan a la aplicación.

## 2. Publicar en GitHub Pages
1. Crea un repositorio (por ejemplo `SIMTELE-RISK`) y sube **el contenido de esta carpeta** (`index.html`, `calculos.js`, `config.js`, `supabase_schema.sql`, `.nojekyll`, `db/`, ...).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
3. Espera 1–2 minutos. La aplicación quedará en `https://TU-USUARIO.github.io/SIMTELE-RISK/`.

Todas las rutas son **relativas** (`./config.js`, `./calculos.js`), por lo que funciona dentro de la subruta `/SIMTELE-RISK/`. Si renombras el repositorio, no hay que cambiar nada.

`supabase-js` se carga desde jsDelivr (`@supabase/supabase-js@2.45.4`, versión fija). Para uso local basta cualquier servidor estático (por ejemplo la extensión *Live Server* de VS Code).

## Funcionamiento
- **Lectura pública:** cualquiera puede ver casos, problemas, resultados e historial.
- **Escritura protegida:** crear, editar, eliminar y ejecutar exige iniciar sesión (botón *Iniciar sesión*, arriba a la derecha) y solo afecta a registros **propios**.
- **CRUD** sobre `escenario` + `simulacion` (parámetros en `parametros_json`); al ejecutar se guardan `ejecucion_metodo`, `iteracion_resultado` y `resultado_resumen`. Las conclusiones se guardan en `resultado_resumen.interpretacion` bajo el método `CONCLUSION`.
- **Relanzar** recalcula en JavaScript y compara con lo guardado en la base (verificación de reproducibilidad).
- Alcance numérico (sin cambios respecto de la versión anterior): Módulo 1 (referencia analítica, RK2 y RK4), Módulo 2 (raíces y sistemas lineales), Módulo 3 (parámetros analíticos), Módulo 4 (guarda/edita/elimina; su cálculo de interpolación está pendiente).

## Seguridad (RLS)
RLS está activado en las 6 tablas (`supabase_schema.sql`):
- `anon` solo tiene `SELECT`; `authenticated` puede insertar/actualizar/eliminar, pero las políticas lo limitan a filas cuyo `usuario_id = auth.uid()` (en las tablas hijas, a las de simulaciones propias).
- `caso_estudio` no tiene políticas de escritura: nadie puede modificarla desde la API.
- `usuario_id` se rellena solo (`default auth.uid()`); el cliente no lo envía.

Comprobar RLS con la clave pública (debe fallar con `42501 permission denied`):
```bash
curl -i -X POST "$SUPABASE_URL/rest/v1/escenario" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"caso_id":1,"tipo":"NORMAL","parametros_json":{}}'
```
Y la lectura debe funcionar: `curl "$SUPABASE_URL/rest/v1/caso_estudio?select=*" -H "apikey: $ANON"` → 4 casos. Para comprobar que un usuario no modifica datos de otro, crea dos cuentas, crea un problema con la primera e intenta eliminarlo con la segunda: la aplicación responde «No tiene permiso…» y el registro permanece.

## Límites conocidos
- La lectura es pública por diseño (para que funcione "públicamente"). Para hacerla privada, ver el comentario en `supabase_schema.sql`.
- Ejecutar guarda varias tablas en pasos sucesivos desde el navegador (no en una sola transacción). Si algo falla a mitad, la simulación queda en estado `ERROR` y puede relanzarse.
- Supabase limita a 1000 filas por consulta; la aplicación pagina automáticamente.
- Se guardan hasta 300 iteraciones por método (más la última).
