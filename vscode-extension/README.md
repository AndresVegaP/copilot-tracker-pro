# IA Credits — Copilot (Chile)

Extensión de VS Code que reparte tu cupo mensual de **AI Credits de GitHub Copilot**
solo entre **días hábiles (L–V)** descontando los **feriados de Chile**, y compara tu
**consumo real** con el tope que *deberías* llevar a la fecha.

- **Barra de estado:** `🚀 IA 30.7% · meta hoy 90.5% ✓` — tu uso real vs. el ritmo recomendado.
- **Panel:** calendario del mes con el % y créditos acumulados permitidos por día.
- **Sin dependencias ni compilación.** JavaScript puro: se ejecuta con F5.

---

## Cómo ejecutarla (modo desarrollo)

1. Abre **esta carpeta** (`vscode-extension`) en VS Code:
   `Archivo → Abrir carpeta…`
2. Presiona **F5** (o *Ejecutar → Iniciar depuración*).
   Se abre una segunda ventana, **Extension Development Host**, con la extensión cargada.
3. Mira la **barra de estado** abajo a la derecha. Haz clic para abrir el panel.

> No necesitas `npm install`: la extensión no usa paquetes externos.

### Instalarla de forma permanente (opcional)

```powershell
npm install -g @vscode/vsce
cd "vscode-extension"
vsce package        # genera ia-credits-0.1.0.vsix
```

Luego en VS Code: *Extensiones → ⋯ → Instalar desde VSIX…* y elige el `.vsix`.

---

## Lectura del consumo real

La extensión intenta dos caminos, en orden:

1. **Automático (recomendado).** Reutiliza tu **sesión de GitHub de VS Code**
   (`Conectar con GitHub`) y consulta el endpoint interno de Copilot
   (`copilot_internal/user`), el mismo que alimenta la barra de estado oficial.
   Entrega cupo, restante y fecha de reinicio — **sin que crees ningún token**.
2. **Token PAT (respaldo).** Si el automático no está disponible, usa un
   *fine-grained token* con permiso **`Plan: read`** (comando
   *IA Credits: Configurar token*). Se guarda cifrado en `SecretStorage` y llama a
   la API REST pública de facturación.

Si ninguno está disponible, la extensión sigue siendo útil en **modo planificación**:
muestra el tope diario y acumulado según tu calendario, sin el consumo real.

> ⚠️ El endpoint automático no está documentado por GitHub y podría cambiar.
> Los datos se refrescan **por intervalos** (por defecto cada 5 min), no segundo a segundo.
> Revisa el canal de salida **IA Credits** (`Ver → Salida`) si algo no cuadra.

---

## Ajustes (`Ctrl+,` → busca "IA Credits")

| Ajuste | Por defecto | Para qué |
|---|---|---|
| `iaCredits.monthlyCredits` | `1500` | Cupo del plan (Pro 1500 · Pro+ 7000). Respaldo si la API no lo entrega. |
| `iaCredits.refreshIntervalSeconds` | `300` | Frecuencia de refresco del consumo real. |
| `iaCredits.autoFetch` | `true` | Intentar leer el consumo real. |
| `iaCredits.holidays` | feriados Chile 2026 | Lista editable (solo restan los que caen en día hábil). |
| `iaCredits.githubUsername` | `""` | Opcional; se detecta solo con token/sesión. |

---

## Comandos (paleta `Ctrl+Shift+P`)

- **IA Credits: Abrir panel**
- **IA Credits: Actualizar ahora**
- **IA Credits: Conectar con GitHub (sesión de VS Code)**
- **IA Credits: Configurar token de GitHub (PAT)**
- **IA Credits: Borrar token guardado**
