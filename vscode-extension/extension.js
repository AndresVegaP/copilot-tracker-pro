// IA Credits — Copilot (Chile)
// Extensión de VS Code en JavaScript puro (sin build ni dependencias).
// Reparte el cupo mensual de AI Credits solo entre días hábiles (L-V) menos
// feriados de Chile, y lo compara con tu consumo real de Copilot.

const vscode = require('vscode');
const https = require('https');

const SECRET_KEY = 'iaCredits.githubToken';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

let statusBar;
let output;
let panel = null;
let refreshTimer = null;
let lastModel = null;   // último { M, usage } calculado

/* ───────────────────────── helpers ───────────────────────── */
const pad = n => String(n).padStart(2, '0');
const dKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const isWeekend = (y, m, d) => { const x = new Date(y, m, d).getDay(); return x === 0 || x === 6; };
const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v); return isFinite(n) ? n : null;
};
function fmt(v, dec) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const f = Math.abs(v).toFixed(dec);
  let [i, d] = f.split('.');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '-' : '') + (d ? i + '.' + d : i);
}
function cfg() {
  const c = vscode.workspace.getConfiguration('iaCredits');
  return {
    monthlyCredits: c.get('monthlyCredits', 1500),
    githubUsername: (c.get('githubUsername', '') || '').trim(),
    refreshIntervalSeconds: Math.max(30, c.get('refreshIntervalSeconds', 300)),
    autoFetch: c.get('autoFetch', true),
    holidays: c.get('holidays', [])
  };
}
function log(msg) {
  if (!output) return;
  const t = new Date().toISOString().slice(11, 19);
  output.appendLine(`[${t}] ${msg}`);
}

/* ─────────────────────── cálculo del mes ─────────────────────── */
function computeMonth(year, month, credits, holidays) {
  const holiSet = new Set((holidays || []).map(h => (typeof h === 'string' ? h : h.date)));
  const holiName = {};
  (holidays || []).forEach(h => { if (h && typeof h !== 'string') holiName[h.date] = h.name; });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let totalWork = 0, weekdays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (!isWeekend(year, month, d)) { weekdays++; if (!holiSet.has(dKey(year, month, d))) totalWork++; }
  }
  const daily = totalWork ? credits / totalWork : 0;
  const dailyPct = totalWork ? 100 / totalWork : 0;

  const now = new Date();
  const isThisMonth = now.getFullYear() === year && now.getMonth() === month;
  const todayD = now.getDate();

  let work = 0, workToToday = 0;
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const we = isWeekend(year, month, d);
    const ho = !we && holiSet.has(dKey(year, month, d));
    const wk = !we && !ho;
    if (wk) work++;
    if (wk && (!isThisMonth || d <= todayD)) workToToday = work;
    days.push({
      d, weekend: we, holiday: ho, working: wk,
      dow: new Date(year, month, d).getDay(),
      cumPct: wk ? work / totalWork * 100 : null,
      cumCred: wk ? work / totalWork * credits : null,
      holiName: ho ? (holiName[dKey(year, month, d)] || 'Feriado') : null
    });
  }
  const todayPct = totalWork ? workToToday / totalWork * 100 : 0;
  const capToday = totalWork ? workToToday / totalWork * credits : 0;
  return {
    year, month, daysInMonth, credits, totalWork, weekdays,
    holidaysOnWeekday: weekdays - totalWork, daily, dailyPct, days,
    isThisMonth, todayD, workToToday, todayPct, capToday
  };
}

/* ─────────────────────── lectura de la API ─────────────────────── */
function httpsGetJson(url, token) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject({ status: 0, error: 'URL inválida' }); }
    const headers = {
      'User-Agent': 'ia-credits-vscode',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers['Authorization'] = 'token ' + token;
    const req = https.request(
      { method: 'GET', hostname: u.hostname, path: u.pathname + u.search, headers },
      res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => {
          let json = null;
          try { json = body ? JSON.parse(body) : null; } catch (e) { /* no-json */ }
          const out = { status: res.statusCode, json, body };
          (res.statusCode >= 200 && res.statusCode < 300) ? resolve(out) : reject(out);
        });
      }
    );
    req.on('error', e => reject({ status: 0, error: e.message }));
    req.setTimeout(15000, () => req.destroy({ message: 'timeout' }));
    req.end();
  });
}

// Lee el snapshot de cuota del endpoint interno de Copilot (el que alimenta
// la barra de estado oficial). No documentado: parsing defensivo.
function parseQuota(json) {
  if (!json) return null;
  const qs = json.quota_snapshots || json.quotaSnapshots || null;
  let snap = null;
  if (qs && typeof qs === 'object') {
    snap = qs.premium_interactions || qs.premiumInteractions || qs.premium || null;
    if (!snap) {
      for (const k of Object.keys(qs)) {
        const v = qs[k];
        if (v && typeof v === 'object' && !v.unlimited &&
          (num(v.entitlement) !== null || num(v.remaining) !== null)) { snap = v; break; }
      }
    }
  }
  if (!snap) return null;
  const entitlement = num(snap.entitlement);
  const remaining = num(snap.remaining);
  const pctRem = num(snap.percent_remaining !== undefined ? snap.percent_remaining : snap.percentRemaining);
  let used = null, total = entitlement;
  if (entitlement !== null && remaining !== null) used = Math.max(0, entitlement - remaining);
  else if (entitlement !== null && pctRem !== null) used = entitlement * (1 - pctRem / 100);
  return {
    used, total, remaining,
    unlimited: !!snap.unlimited,
    resetDate: json.quota_reset_date || json.quotaResetDate || null
  };
}

async function getSessionToken(createIfNone) {
  try {
    const s = await vscode.authentication.getSession('github', ['read:user'],
      createIfNone ? { createIfNone: true } : { createIfNone: false, silent: true });
    return s ? { token: s.accessToken, login: s.account && s.account.label } : null;
  } catch (e) { log('getSession: ' + (e && e.message)); return null; }
}

async function fetchRestUsage(token, username, year, month) {
  let login = username;
  if (!login) {
    const u = await httpsGetJson('https://api.github.com/user', token);
    login = u.json && u.json.login;
  }
  if (!login) return null;
  const url = `https://api.github.com/users/${login}/settings/billing/usage?year=${year}&month=${month}`;
  const r = await httpsGetJson(url, token);
  log('REST billing/usage -> ' + r.status);
  const items = (r.json && (r.json.usageItems || r.json.usage_items)) || [];
  let used = 0, found = false;
  for (const it of items) {
    const prod = String(it.product || it.sku || '').toLowerCase();
    if (prod.includes('copilot')) {
      const q = num(it.grossQuantity !== undefined ? it.grossQuantity : it.quantity);
      if (q !== null) { used += q; found = true; }
    }
  }
  // Si no hallamos ítems de Copilot, devolvemos null (modo planificación) en vez de
  // un "0 usado" que daría una falsa sensación de margen. El payload queda en el log.
  return found ? { used, total: null, remaining: null, resetDate: null, login } : null;
}

async function gatherUsage(secrets, year, month) {
  const c = cfg();
  if (!c.autoFetch) return { source: 'off' };

  // 1) Modo automático: sesión de GitHub de VS Code -> endpoint interno de Copilot.
  const sess = await getSessionToken(false);
  if (sess && sess.token) {
    try {
      const r = await httpsGetJson('https://api.github.com/copilot_internal/user', sess.token);
      log('copilot_internal/user -> ' + r.status);
      if (r.json) log('payload: ' + JSON.stringify(r.json).slice(0, 1200));
      const q = parseQuota(r.json);
      if (q && q.used !== null) return Object.assign({ source: 'auto', login: sess.login }, q);
      log('No se pudo parsear quota_snapshots; intento PAT/REST.');
    } catch (e) { log('internal err ' + JSON.stringify(e).slice(0, 300)); }
  }

  // 2) Respaldo: PAT con permiso "Plan" -> REST billing documentada.
  const pat = await secrets.get(SECRET_KEY);
  if (pat) {
    try {
      const r = await fetchRestUsage(pat, c.githubUsername, year, month);
      if (r) return Object.assign({ source: 'pat' }, r);
    } catch (e) {
      log('REST err ' + JSON.stringify(e).slice(0, 300));
      return { source: 'error', status: e && e.status };
    }
  }
  return { source: 'none' };
}

/* ─────────────────────── estado de "ritmo" ─────────────────────── */
function paceOf(M, usage) {
  if (!usage || usage.used === null || usage.used === undefined) return null;
  const over = usage.used > M.capToday + 1e-6;
  return { over, diff: usage.used - M.capToday };
}

/* ─────────────────────── render: barra de estado ─────────────────────── */
function renderStatusBar(M, usage) {
  const pace = paceOf(M, usage);
  let text, tip;
  const metaTxt = M.isThisMonth ? `meta hoy ${fmt(M.todayPct, 1)}%` : `mes ${fmt(100, 0)}%`;

  if (pace) {
    const total = (usage.total && usage.total > 0) ? usage.total : M.credits;
    const pctUsed = total ? usage.used / total * 100 : null;
    const icon = pace.over ? '$(warning)' : '$(check)';
    text = `$(rocket) IA ${fmt(pctUsed, 1)}% · ${metaTxt} ${icon}`;
    statusBar.backgroundColor = pace.over
      ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  } else {
    text = `$(calendar) IA · ${metaTxt}`;
    statusBar.backgroundColor = undefined;
  }
  statusBar.text = text;

  const md = new vscode.MarkdownString('', true);
  md.appendMarkdown(`**IA Credits — ${MONTHS[M.month]} ${M.year}**\n\n`);
  md.appendMarkdown(`- Días hábiles: **${M.totalWork}**  _(${M.weekdays} L–V − ${M.holidaysOnWeekday} feriado${M.holidaysOnWeekday === 1 ? '' : 's'})_\n`);
  md.appendMarkdown(`- Cupo diario: **${fmt(M.daily, 1)}** cr · **${fmt(M.dailyPct, 2)}%**\n`);
  md.appendMarkdown(`- Tope ${M.isThisMonth ? 'a hoy' : 'del mes'}: **${fmt(M.todayPct, 2)}%** → **${fmt(M.capToday, 1)}** cr\n`);
  if (pace) {
    md.appendMarkdown(`- Consumo real: **${fmt(usage.used, 1)}** cr`);
    if (usage.total) md.appendMarkdown(` / ${fmt(usage.total, 1)} (${fmt(usage.used / usage.total * 100, 1)}%)`);
    md.appendMarkdown(`\n`);
    md.appendMarkdown(pace.over
      ? `- ⚠️ **${fmt(pace.diff, 1)} cr por sobre** el ritmo recomendado\n`
      : `- ✅ **${fmt(-pace.diff, 1)} cr de margen** respecto al ritmo\n`);
    if (usage.resetDate) md.appendMarkdown(`- Reinicio de cuota: ${usage.resetDate}\n`);
    md.appendMarkdown(`\n_fuente: ${usage.source === 'auto' ? 'sesión de VS Code' : 'token PAT'}_`);
  } else {
    md.appendMarkdown(`\n_Sin consumo real: conéctate con GitHub o configura un token (clic para abrir)._`);
  }
  md.appendMarkdown(`\n\nClic para abrir el panel.`);
  statusBar.tooltip = md;
}

/* ─────────────────────── ciclo de actualización ─────────────────────── */
async function refresh(secrets) {
  const c = cfg();
  const now = new Date();
  const usage = await gatherUsage(secrets, now.getFullYear(), now.getMonth() + 1);

  // Si la API entrega el cupo total, úsalo; si no, usa el configurado.
  const credits = (usage && usage.total && usage.total > 0) ? usage.total : c.monthlyCredits;
  const M = computeMonth(now.getFullYear(), now.getMonth(), credits, c.holidays);

  lastModel = { M, usage };
  renderStatusBar(M, usage);
  if (panel) panel.webview.html = getWebviewHtml(M, usage);
  return lastModel;
}

function scheduleRefresh(secrets) {
  if (refreshTimer) clearInterval(refreshTimer);
  const ms = cfg().refreshIntervalSeconds * 1000;
  refreshTimer = setInterval(() => { refresh(secrets).catch(e => log('refresh: ' + e)); }, ms);
}

/* ─────────────────────── panel (webview) ─────────────────────── */
function openPanel(secrets) {
  if (panel) { panel.reveal(vscode.ViewColumn.Active); return; }
  panel = vscode.window.createWebviewPanel(
    'iaCredits', 'IA Credits', vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.onDidDispose(() => { panel = null; });
  panel.webview.onDidReceiveMessage(async msg => {
    if (msg.cmd === 'refresh') await refresh(secrets);
    else if (msg.cmd === 'connect') vscode.commands.executeCommand('iaCredits.connect');
    else if (msg.cmd === 'token') vscode.commands.executeCommand('iaCredits.setToken');
    else if (msg.cmd === 'settings') vscode.commands.executeCommand('workbench.action.openSettings', 'iaCredits');
  });
  if (lastModel) panel.webview.html = getWebviewHtml(lastModel.M, lastModel.usage);
  else refresh(secrets);
}

function getWebviewHtml(M, usage) {
  const pace = paceOf(M, usage);
  const hasReal = !!pace;
  const total = hasReal ? ((usage.total && usage.total > 0) ? usage.total : M.credits) : null;
  const pctUsed = hasReal && total ? usage.used / total * 100 : null;

  // celdas del calendario
  const firstDow = new Date(M.year, M.month, 1).getDay();
  const offset = (firstDow + 6) % 7;
  let cells = '';
  for (let i = 0; i < offset; i++) cells += `<div class="cell blank"></div>`;
  for (const day of M.days) {
    const isToday = M.isThisMonth && day.d === M.todayD;
    let cls = 'cell ' + (day.working ? 'work' : day.holiday ? 'holiday' : 'weekend') + (isToday ? ' today' : '');
    let inner = `<div class="dnum"><span>${day.d}</span><span class="dl">${DOW_SHORT[day.dow]}</span></div>`;
    if (isToday) inner += `<div class="pin">HOY</div>`;
    if (day.working) {
      inner += `<div class="big">${fmt(day.cumPct, 2)}%</div>`;
      inner += `<div class="cred">${fmt(day.cumCred, 1)} cr</div>`;
      inner += `<div class="bar"><i style="width:${Math.min(100, day.cumPct).toFixed(2)}%"></i></div>`;
    } else if (day.holiday) {
      inner += `<div class="tag">Feriado<br>${escapeHtml(day.holiName)}</div>`;
    } else {
      inner += `<div class="tag">Fin de semana</div>`;
    }
    cells += `<div class="${cls}">${inner}</div>`;
  }

  // tarjeta de consumo real
  let realCard;
  if (hasReal) {
    const cl = pace.over ? 'rose' : 'green';
    const pill = pace.over
      ? `<div class="pill over">▲ ${fmt(pace.diff, 1)} cr sobre el ritmo</div>`
      : `<div class="pill ok">✓ ${fmt(-pace.diff, 1)} cr de margen</div>`;
    realCard = `<div class="card ${cl}">
        <div class="k">Consumo real ${usage.source === 'auto' ? '· sesión VS Code' : '· PAT'}</div>
        <div class="v">${fmt(usage.used, 1)} <small>cr</small></div>
        <div class="sub">${pctUsed !== null ? fmt(pctUsed, 1) + '% de ' + fmt(total, 0) + ' cr' : ''}${usage.resetDate ? ' · reinicia ' + usage.resetDate : ''}</div>
        ${pill}
      </div>`;
  } else {
    const why = usage && usage.source === 'error' ? `Error de API (${usage.status || '—'}).` :
      usage && usage.source === 'off' ? 'Lectura automática desactivada.' :
        'Aún sin datos reales.';
    realCard = `<div class="card">
        <div class="k">Consumo real</div>
        <div class="v" style="font-size:22px">— </div>
        <div class="sub">${why}</div>
        <div class="actions">
          <button onclick="send('connect')">Conectar GitHub</button>
          <button class="ghost" onclick="send('token')">Usar token</button>
        </div>
      </div>`;
  }

  const todayLabel = M.isThisMonth ? `Tope a hoy (día ${M.workToToday}/${M.totalWork})` : 'Tope fin de mes';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline';">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--gold:#e9b15a;--gold-soft:#f0c789;--gold-deep:#b07d2e;--green:#7fc6a0;--rose:#d97a6e;
    --line:#2c2833;--ink:#efe9e0;--muted:#9b93a6;--panel:#1a181f;--panel2:#211e27;--bg2:#141218;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'IBM Plex Mono',ui-monospace,monospace;color:var(--ink);
    background:radial-gradient(900px 500px at 90% -10%,rgba(233,177,90,.10),transparent 55%),#0f0e12;
    padding:22px 24px 40px}
  h1{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:30px;letter-spacing:-.01em}
  h1 em{font-style:italic;color:var(--gold-soft)}
  .head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px}
  .toolbar{display:flex;gap:8px}
  button{background:var(--gold);color:#1a140a;border:none;border-radius:8px;font-family:inherit;
    font-size:12px;font-weight:600;padding:8px 13px;cursor:pointer}
  button:hover{background:var(--gold-soft)}
  button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  @media(max-width:820px){.stats{grid-template-columns:repeat(2,1fr)}}
  .card{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:14px;
    padding:16px 17px;overflow:hidden}
  .card::after{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,var(--gold),transparent)}
  .card.green::after{background:linear-gradient(90deg,var(--green),transparent)}
  .card.rose::after{background:linear-gradient(90deg,var(--rose),transparent)}
  .card .k{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
  .card .v{font-family:'Fraunces',serif;font-size:30px;font-weight:600;margin-top:8px}
  .card .v small{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-soft)}
  .card .sub{font-size:11px;color:var(--ink);opacity:.85;margin-top:6px}
  .pill{display:inline-block;font-size:11px;margin-top:9px;padding:3px 9px;border-radius:999px;border:1px solid var(--line)}
  .pill.ok{color:var(--green);border-color:#2f5d46}
  .pill.over{color:var(--rose);border-color:#5a2f2c}
  .actions{display:flex;gap:7px;margin-top:10px}
  .actions button{padding:6px 10px;font-size:11px}
  h2{font-family:'Fraunces',serif;font-size:19px;font-weight:600;margin-bottom:12px}
  .dow{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:6px}
  .dow div{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding-left:3px}
  .grid{display:grid;grid-template-columns:repeat(7,1fr);gap:7px}
  .cell{position:relative;min-height:88px;border-radius:11px;border:1px solid #241f2b;background:var(--panel);padding:8px 9px}
  .cell.blank{background:transparent;border:none}
  .dnum{display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:var(--ink);opacity:.85}
  .dnum .dl{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .cell.work{background:linear-gradient(165deg,rgba(233,177,90,.10),rgba(233,177,90,.02));border-color:rgba(176,125,46,.4)}
  .cell.work .big{font-family:'Fraunces',serif;font-size:21px;font-weight:600;color:var(--gold-soft);margin-top:8px}
  .cell.work .cred{font-size:10px;color:var(--muted);margin-top:2px}
  .bar{height:3px;border-radius:3px;background:#2c2833;margin-top:6px;overflow:hidden}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-deep),var(--gold-soft))}
  .cell.weekend{background:var(--bg2)}.cell.weekend .dnum{color:var(--muted)}
  .cell.holiday{background:linear-gradient(165deg,rgba(217,122,110,.12),rgba(217,122,110,.02));border-color:#5a2f2c}
  .cell.holiday .dnum{color:var(--rose)}
  .cell .tag{font-size:9.5px;color:var(--muted);margin-top:12px;line-height:1.3}
  .cell.holiday .tag{color:var(--rose)}
  .cell.today{box-shadow:0 0 0 1.5px var(--gold),0 0 0 4px rgba(233,177,90,.12)}
  .pin{position:absolute;top:-7px;right:8px;font-size:8.5px;letter-spacing:.12em;background:var(--gold);color:#1a140a;padding:1px 6px;border-radius:5px;font-weight:600}
  .note{margin-top:22px;font-size:11px;color:var(--muted);line-height:1.6}
</style></head><body>
  <div class="head">
    <h1>IA <em>Credits</em> · ${MONTHS[M.month]} ${M.year}</h1>
    <div class="toolbar">
      <button onclick="send('refresh')">↻ Actualizar</button>
      <button class="ghost" onclick="send('settings')">⚙ Ajustes</button>
    </div>
  </div>
  <div class="stats">
    <div class="card">
      <div class="k">Días hábiles</div>
      <div class="v">${M.totalWork}</div>
      <div class="sub">${M.weekdays} L–V · −${M.holidaysOnWeekday} feriado${M.holidaysOnWeekday === 1 ? '' : 's'}</div>
    </div>
    <div class="card">
      <div class="k">Cupo diario</div>
      <div class="v">${fmt(M.daily, 1)} <small>cr</small></div>
      <div class="sub">${fmt(M.dailyPct, 2)}% por día hábil</div>
    </div>
    <div class="card green">
      <div class="k">${todayLabel}</div>
      <div class="v">${fmt(M.todayPct, 2)}<small>%</small></div>
      <div class="sub">${fmt(M.capToday, 1)} cr acumulados</div>
    </div>
    ${realCard}
  </div>
  <h2>Calendario del cupo</h2>
  <div class="dow"><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div></div>
  <div class="grid">${cells}</div>
  <p class="note">
    El cupo se reparte solo entre días hábiles (L–V) descontando feriados de Chile.
    El consumo real proviene de tu cuenta de Copilot${hasReal ? (usage.source === 'auto' ? ' vía la sesión de GitHub de VS Code' : ' vía token PAT') : ''} y se actualiza por intervalos (no es tiempo real estricto).
    Edita tu plan y feriados en Ajustes (⚙).
  </p>
<script>
  const vscode = acquireVsCodeApi();
  function send(cmd){ vscode.postMessage({cmd}); }
</script>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ─────────────────────── activación ─────────────────────── */
function activate(context) {
  output = vscode.window.createOutputChannel('IA Credits');
  const secrets = context.secrets;

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'iaCredits.openPanel';
  statusBar.text = '$(loading~spin) IA Credits';
  statusBar.show();
  context.subscriptions.push(statusBar, output);

  context.subscriptions.push(
    vscode.commands.registerCommand('iaCredits.openPanel', () => openPanel(secrets)),
    vscode.commands.registerCommand('iaCredits.refresh', () => refresh(secrets)),
    vscode.commands.registerCommand('iaCredits.connect', async () => {
      const s = await getSessionToken(true);
      if (s) { vscode.window.showInformationMessage(`IA Credits: conectado como ${s.login || 'GitHub'}.`); refresh(secrets); }
      else vscode.window.showWarningMessage('IA Credits: no se pudo conectar con GitHub.');
    }),
    vscode.commands.registerCommand('iaCredits.setToken', async () => {
      const token = await vscode.window.showInputBox({
        title: 'Token de GitHub (PAT con permiso "Plan: read")',
        prompt: 'Se guarda cifrado en SecretStorage. Crea uno en github.com/settings/tokens (fine-grained, permiso Plan).',
        password: true, ignoreFocusOut: true
      });
      if (token && token.trim()) {
        await secrets.store(SECRET_KEY, token.trim());
        vscode.window.showInformationMessage('IA Credits: token guardado.');
        refresh(secrets);
      }
    }),
    vscode.commands.registerCommand('iaCredits.clearToken', async () => {
      await secrets.delete(SECRET_KEY);
      vscode.window.showInformationMessage('IA Credits: token borrado.');
      refresh(secrets);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('iaCredits')) {
        scheduleRefresh(secrets);
        refresh(secrets);
      }
    })
  );

  scheduleRefresh(secrets);
  refresh(secrets).catch(e => log('init: ' + e));
}

function deactivate() {
  if (refreshTimer) clearInterval(refreshTimer);
}

module.exports = { activate, deactivate };
