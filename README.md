# Copilot Tracker Pro

Planifica y controla tu cupo mensual de **AI Credits de GitHub Copilot** repartiéndolo
**solo entre días hábiles (L–V)** y descontando los **feriados de Chile** — en lugar de
dividirlo entre todos los días del mes.

Para junio de 2026 (30 días, 22 días L–V, menos el feriado del lunes 29) quedan **21 días
hábiles**: con 40 000 créditos eso es **1 904,8 cr/día (4,76 %)**, y al 25/06 el tope
acumulado es **90,48 % · 36 190,5 cr**.

## Componentes

| Carpeta | Qué es |
|---|---|
| [`index.html`](index.html) | **App web** autónoma (un solo archivo, sin servidor). Calendario del cupo diario/acumulado, créditos editables por mes, registro de uso real y editor de feriados. Ábrela con doble clic. |
| [`vscode-extension/`](vscode-extension/) | **Extensión de VS Code** que muestra el cupo en la barra de estado y lee tu **consumo real** de Copilot (sesión de GitHub de VS Code o token PAT). Ver su [README](vscode-extension/README.md). |

## App web — uso rápido

1. Abre `index.html` en el navegador.
2. Escribe tus créditos del mes y navega entre meses.
3. Cada día hábil muestra el % y los créditos acumulados que puedes usar hasta esa fecha.
4. Registra tu uso real para ver si vas dentro o por sobre el ritmo. Todo se guarda
   localmente en el navegador.

## Extensión de VS Code — uso rápido

1. Abre la carpeta `vscode-extension` en VS Code y presiona **F5** (no requiere `npm install`).
2. Conéctate con GitHub o configura un token para ver tu consumo real.

Detalles completos en [`vscode-extension/README.md`](vscode-extension/README.md).

## Notas

- Los feriados vienen precargados para **Chile 2026** y son editables.
- El consumo real se actualiza por intervalos (no es tiempo real estricto) y el endpoint
  automático de Copilot no está documentado por GitHub, así que podría cambiar.

## Licencia

MIT
