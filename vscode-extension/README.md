# IA Credits — Copilot (Chile)

Extensión de VS Code que reparte tu cupo mensual de **AI Credits de GitHub Copilot**
solo entre **días hábiles (L–V)** descontando los **feriados de Chile** (y tus vacaciones),
y compara tu **consumo real** con el tope que *deberías* llevar a la fecha.

- **Barra de estado:** `🚀 IA 30.7% · meta hoy 90.5% ✓` — tu uso real vs. el ritmo recomendado.
- **Panel:** calendario del mes con el % y créditos acumulados permitidos por día, y un chip
  que muestra tu **plan y cupo detectados automáticamente** (p. ej. `Copilot Free · 200 cr/mes`).
- **Vacaciones:** marca días libres (rango o clic en 🌴 sobre un día); se descuentan del cupo
  como un feriado y suben tu cupo diario.
- **Externa a tus repos:** una vez instalada corre en **cualquier ventana** de VS Code y **no
  escribe nada en tus proyectos** — su configuración vive en tus ajustes de usuario.
- **Sin dependencias ni compilación** (JavaScript puro).

---

## Instalación (uso normal)

Así se usa de verdad: se instala **una vez** y queda disponible en todas tus ventanas de
VS Code, abras el repo que abras (o ninguno).

**Si ya tienes el `.vsix`:**

```powershell
code --install-extension ia-credits-0.1.1.vsix --force
```

o desde la UI: *Extensiones* (`Ctrl+Shift+X`) → menú **⋯** → **Instalar desde VSIX…**

**Si partes del código fuente**, primero empaquétalo:

```powershell
cd vscode-extension
npx @vscode/vsce package --no-dependencies      # genera ia-credits-0.1.1.vsix
code --install-extension ia-credits-0.1.1.vsix --force
```

Luego **recarga VS Code** (`Ctrl+Shift+P` → *Developer: Reload Window*). Verás **IA Credits**
en la barra de estado.

> No toca ningún repositorio: tus créditos, feriados y vacaciones se guardan en tus **ajustes
> de usuario** de VS Code y el token en `SecretStorage`. Nada se escribe en tus workspaces.

**Actualizar a una versión nueva:** vuelve a empaquetar e instala con `--force`.

---

## Primer uso

1. `Ctrl+Shift+P` → **IA Credits: Conectar con GitHub** (elige la cuenta que tiene Copilot).
2. Haz clic en **IA Credits** en la barra de estado para abrir el panel.

### ¿Tengo que iniciar sesión cada vez o pegar un token?

**No.** La extensión usa la **API oficial de autenticación de VS Code** (`vscode.authentication`);
no extrae tokens de ningún lado ni accede a credenciales de otras extensiones:

- **La primera vez** debes **autorizarla una sola vez** con *IA Credits: Conectar con GitHub*.
  VS Code muestra un diálogo pidiéndote permiso para que la extensión use tu cuenta de GitHub.
  Si ya usas Copilot, **no es un login nuevo** (ya tienes sesión): solo concedes el permiso con un clic.
- **A partir de ahí** lee tu consumo **automáticamente y en silencio** en cada sesión —
  sin volver a pedirte nada y **sin que pegues ningún token**.
- El **token PAT es solo un respaldo opcional** para casos donde el modo automático no aplica
  (p. ej. una cuenta gestionada por empresa cuyo endpoint interno no entrega datos por usuario).

Nada de esto ocurre sin tu consentimiento explícito: VS Code te pide permiso y tú decides.

---

## Lectura del consumo real

La extensión intenta dos caminos, en orden:

1. **Automático (recomendado).** Reutiliza tu **sesión de GitHub de VS Code** y consulta el
   endpoint interno de Copilot (`copilot_internal/user`), el mismo que alimenta el contador
   oficial. De ahí toma el bloque de cuota que corresponde a tu plan y **detecta tu cupo solo**:
   - **Free** → bloque `chat` (p. ej. 200 créditos).
   - **Pro / Pro+ / Business / Enterprise** → bloque `premium_interactions` (1500 / 7000 / …).

   Entrega cupo, restante y fecha de reinicio — **sin que crees ningún token**.
2. **Token PAT (respaldo).** Si el automático no está disponible, usa un *fine-grained token*
   con permiso **`Plan: read`** (*IA Credits: Configurar token*), cifrado en `SecretStorage`.
   Solo aplica a planes personales (Pro/Pro+).

Si ninguno está disponible, la extensión sigue siendo útil en **modo planificación**: muestra
el tope diario y acumulado según tu calendario, sin el consumo real (el chip pasa a ámbar y
usa `monthlyCredits` como respaldo).

> ⚠️ El endpoint automático no está documentado por GitHub y podría cambiar. Los datos se
> refrescan **por intervalos** (por defecto cada 5 min). Revisa **Ver → Salida → "IA Credits"**
> si algo no cuadra: verás una línea tipo `… cuota=chat 0/200`.

---

## Ajustes (`Ctrl+,` → busca "IA Credits")

| Ajuste | Por defecto | Para qué |
|---|---|---|
| `iaCredits.monthlyCredits` | `1500` | **Respaldo** si la API no entrega tu cupo. Con lectura automática, la extensión detecta el real (Free 200, Pro 1500, Pro+ 7000, …) y este valor se ignora. |
| `iaCredits.refreshIntervalSeconds` | `300` | Frecuencia de refresco del consumo real. |
| `iaCredits.autoFetch` | `true` | Intentar leer el consumo real. |
| `iaCredits.holidays` | feriados Chile 2026 | Lista editable (solo restan los que caen en día hábil). |
| `iaCredits.vacations` | `[]` | Tus días libres (`YYYY-MM-DD`). Solo restan los que caen en día hábil. |
| `iaCredits.githubUsername` | `""` | Opcional; se detecta solo con token/sesión. |

---

## Comandos (paleta `Ctrl+Shift+P`)

- **IA Credits: Abrir panel**
- **IA Credits: Actualizar ahora**
- **IA Credits: Conectar con GitHub (sesión de VS Code)**
- **IA Credits: Configurar token de GitHub (PAT)**
- **IA Credits: Borrar token guardado**
- **IA Credits: Agregar vacaciones (rango)**
- **IA Credits: Limpiar vacaciones**

---

## Desarrollo (solo para modificar la extensión)

No hace falta para *usarla* — es únicamente para editar su código:

1. Abre **esta carpeta** (`vscode-extension`) en VS Code.
2. Presiona **F5** → se abre una ventana **Extension Development Host** con la extensión cargada
   desde el código fuente (no requiere `npm install`).
3. Tras cambiar el código, recarga esa ventana (`Ctrl+R`) o reinicia la depuración.

Cuando esté listo, empaqueta el `.vsix` (ver *Instalación*) para usarla de forma permanente.
