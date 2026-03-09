// Sistema de Acciones — UI de ejecución, confirmación y resultados

const RISK_LABELS = { safe: 'Segura', moderate: 'Moderada', danger: 'Peligrosa' };
function getRiskColors() { return { safe: getCSSVar('--green') || '#10b981', moderate: getCSSVar('--yellow') || '#f59e0b', danger: getCSSVar('--red') || '#ef4444' }; }
let RISK_COLORS = getRiskColors();
const RISK_ICONS = { safe: '▶', moderate: '⚠', danger: '🔺' };

// ── Resúmenes legibles para equipos no técnicos ──
const SUMMARIZERS = {
  view_top(output) {
    if (!output || typeof output !== 'string') return null;
    const lines = output.split('\n');
    const items = [];
    // CPU line
    const cpuLine = lines.find(l => l.includes('%Cpu'));
    if (cpuLine) {
      const idle = parseFloat((cpuLine.match(/([\d.]+)\s*id/) || [])[1]) || 0;
      const used = (100 - idle).toFixed(0);
      const steal = parseFloat((cpuLine.match(/([\d.]+)\s*st/) || [])[1]) || 0;
      items.push(indicator(used, [70, 85], `CPU: ${used}% en uso`, steal > 30 ? ` (steal ${steal}% — problema AWS)` : ''));
    }
    // Memory line
    const memLine = lines.find(l => l.includes('MiB Mem'));
    if (memLine) {
      const total = parseFloat((memLine.match(/([\d.]+)\s*total/) || [])[1]) || 1;
      const free = parseFloat((memLine.match(/([\d.]+)\s*free/) || [])[1]) || 0;
      const pct = ((1 - free / total) * 100).toFixed(0);
      items.push(indicator(pct, [70, 85], `Memoria: ${pct}% usada (${(free/1024).toFixed(1)} GB libres)`));
    }
    // Load line
    const loadLine = lines.find(l => l.includes('load average'));
    if (loadLine) {
      const loads = (loadLine.match(/load average:\s*([\d.]+)/) || [])[1];
      if (loads) items.push(indicator(parseFloat(loads), [2, 4], `Carga: ${loads}`));
    }
    // Tasks
    const taskLine = lines.find(l => l.includes('Tasks:'));
    if (taskLine) {
      const running = (taskLine.match(/([\d]+)\s*running/) || [])[1] || '0';
      items.push({ level: 'info', text: `${running} proceso(s) activo(s)` });
    }
    return items.length ? items : null;
  },
  view_memory(output) {
    if (!output || typeof output !== 'string') return null;
    const items = [];
    const lines = output.split('\n');
    const memLine = lines.find(l => l.startsWith('Mem:'));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      items.push({ level: 'info', text: `RAM Total: ${parts[1]}, Usado: ${parts[2]}, Libre: ${parts[3]}` });
    }
    // Top processes
    const topLines = lines.filter(l => /^\S+\s+\d+/.test(l)).slice(0, 3);
    topLines.forEach(l => {
      const parts = l.split(/\s+/);
      const mem = parts[3]; const cmd = parts[10] || parts[parts.length - 1];
      if (parseFloat(mem) > 5) items.push(indicator(parseFloat(mem), [20, 50], `${cmd}: ${mem}% memoria`));
      else items.push({ level: 'info', text: `${cmd}: ${mem}% memoria` });
    });
    return items.length ? items : null;
  },
  view_disk(output) {
    if (!output || typeof output !== 'string') return null;
    const items = [];
    const lines = output.split('\n');
    lines.forEach(l => {
      const m = l.match(/(\d+)%\s+(\S+)/);
      if (m && m[2] === '/') {
        const pct = parseInt(m[1]);
        items.push(indicator(pct, [75, 85], `Disco raíz: ${pct}% usado`));
      }
    });
    // Directories
    const dirLines = lines.filter(l => /^\d/.test(l) && !l.includes('Filesystem'));
    dirLines.forEach(l => {
      const parts = l.split(/\s+/);
      if (parts.length >= 2) items.push({ level: 'info', text: `${parts[1]}: ${parts[0]}` });
    });
    return items.length ? items : null;
  },
  view_jboss(output) {
    if (!output || typeof output !== 'string') return null;
    if (output.includes('no encontrado')) return [{ level: 'crit', text: 'JBoss no está corriendo' }];
    const items = [];
    const lines = output.split('\n').filter(l => l.trim() && !l.includes('PID') && !l.includes('---') && !l.includes('Uptime'));
    lines.forEach(l => {
      const parts = l.trim().split(/\s+/);
      if (parts.length >= 5) {
        const rssKb = parseInt(parts[1]) || 0;
        const rssMb = rssKb / 1024;
        const cpu = parseFloat(parts[3]) || 0;
        const threads = parseInt(parts[4]) || 0;
        items.push(indicator(rssMb, [15000, 18000], `RAM JBoss: ${(rssMb/1024).toFixed(1)} GB`));
        items.push(indicator(threads, [200, 300], `Threads: ${threads}`));
        items.push(indicator(cpu, [70, 85], `CPU: ${cpu}%`));
      }
    });
    // Uptime
    const uptimeLine = output.split('\n').find(l => l.includes('Uptime:'));
    if (uptimeLine) items.push({ level: 'info', text: uptimeLine.trim() });
    return items.length ? items : null;
  },
  view_connections(rows) {
    if (!Array.isArray(rows)) return null;
    const total = rows.length;
    const active = rows.filter(r => r.state === 'active').length;
    const idle = rows.filter(r => r.state === 'idle').length;
    const zombie = rows.filter(r => r.state === 'idle in transaction').length;
    const items = [];
    items.push({ level: 'info', text: `Total: ${total} conexiones` });
    items.push(indicator(active, [20, 40], `Activas: ${active}`));
    items.push(indicator(idle, [50, 80], `Inactivas (idle): ${idle}`));
    items.push(indicator(zombie, [1, 3], `Zombies: ${zombie}`, zombie > 0 ? ' — requieren atención' : ''));
    return items;
  },
  view_zombies(rows) {
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return [{ level: 'ok', text: 'Sin transacciones zombie. Todo limpio.' }];
    const items = [indicator(rows.length, [1, 3], `${rows.length} transacción(es) zombie detectada(s)`)];
    rows.forEach(r => {
      items.push({ level: 'crit', text: `PID ${r.pid}: ${r.duracion || r.duracion_tx || '?'} — ${(r.query || '').slice(0, 60)}...` });
    });
    return items;
  },
  view_locks(rows) {
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return [{ level: 'ok', text: 'Sin bloqueos activos. Todo limpio.' }];
    const items = [indicator(rows.length, [1, 3], `${rows.length} bloqueo(s) activo(s)`)];
    rows.forEach(r => {
      items.push({ level: 'warn', text: `PID ${r.pid_bloqueado} bloqueado por PID ${r.pid_bloqueador} (${r.estado_bloqueador})` });
    });
    return items;
  },
  view_tcp_stuck(output) {
    if (!output || typeof output !== 'string') return null;
    const totalMatch = output.match(/(\d+)\s*$/);
    const count = totalMatch ? parseInt(totalMatch[1]) : 0;
    return [indicator(count, [5, 20], `TCP atoradas (CLOSE-WAIT): ${count}`, count === 0 ? ' — limpio' : '')];
  },
};

function indicator(value, thresholds, text, suffix) {
  const [warnAt, critAt] = thresholds;
  const n = typeof value === 'number' ? value : parseFloat(value) || 0;
  let level = 'ok';
  if (n >= critAt) level = 'crit';
  else if (n >= warnAt) level = 'warn';
  return { level, text: text + (suffix || '') };
}

function renderSummary(items) {
  const icons = { ok: '✅', warn: '⚠️', crit: '🔺', info: 'ℹ️' };
  const colors = { ok: getCSSVar('--green') || '#10b981', warn: getCSSVar('--yellow') || '#f59e0b', crit: getCSSVar('--red') || '#ef4444', info: getCSSVar('--text3') || '#94a3b8' };
  return '<div class="action-summary">' +
    items.map(i => `<div class="action-summary-item" style="color:${colors[i.level] || colors.info}">${icons[i.level] || 'ℹ️'} ${i.text}</div>`).join('') +
    '</div>';
}

// ── Ejecutar acción segura (sin confirmación) ──
async function runSafeAction(actionName, params, resultContainerId) {
  const container = resultContainerId
    ? document.getElementById(resultContainerId)
    : createInlineResult(event?.target);

  if (!container) return;
  container.innerHTML = '<div class="action-loading">Ejecutando...</div>';
  container.style.display = 'block';

  try {
    const res = await authFetch(`api/actions/${actionName}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (data.ok) {
      container.innerHTML = formatOutput(data.output, data.duration_ms, data.action);
    } else {
      container.innerHTML = `<div class="action-error">${data.error}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="action-error">Error de conexión: ${err.message}</div>`;
  }
}

// ── Solicitar confirmación para acción moderada/peligrosa ──
async function confirmAction(actionName, params) {
  // Primero, obtener preview
  try {
    const res = await authFetch(`api/actions/${actionName}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const preview = await res.json();
    if (!preview.ok) {
      alert('Error: ' + preview.error);
      return;
    }
    showConfirmModal(preview, params);
  } catch (err) {
    alert('Error de conexión: ' + err.message);
  }
}

// ── Modal de confirmación ──
function showConfirmModal(preview, params) {
  const existing = document.getElementById('action-confirm-modal');
  if (existing) existing.remove();

  const isDanger = preview.risk === 'danger';
  const color = RISK_COLORS[preview.risk];
  const icon = RISK_ICONS[preview.risk];

  let previewHTML = '';
  if (preview.previewData && preview.previewData.length) {
    previewHTML = `<div class="action-preview-data">
      <div class="action-preview-label">Estado actual:</div>
      ${formatOutput(preview.previewData)}
    </div>`;
  }

  let commandHTML = '';
  if (preview.query) {
    commandHTML = `<div class="action-command"><code>${preview.query}</code></div>`;
  } else if (preview.command) {
    commandHTML = `<div class="action-command"><code>${preview.command}</code><div class="action-command-target">En: ${preview.server}</div></div>`;
  }

  const modal = document.createElement('div');
  modal.id = 'action-confirm-modal';
  modal.className = 'action-modal-overlay';
  modal.innerHTML = `
    <div class="action-modal">
      <div class="action-modal-header" style="border-color:${color}">
        <span class="action-modal-icon">${icon}</span>
        <span class="action-modal-title">${preview.label}</span>
        <span class="action-modal-risk" style="background:${color}">${RISK_LABELS[preview.risk]}</span>
      </div>
      <div class="action-modal-body">
        <p class="action-modal-desc">${preview.description}</p>
        ${commandHTML}
        ${previewHTML}
        ${preview.riskDetail ? `<div class="action-risk-detail"><strong>Riesgo:</strong> ${preview.riskDetail}</div>` : ''}
        ${isDanger ? `
          <label class="action-checkbox">
            <input type="checkbox" id="action-confirm-check" />
            <span>Entiendo los riesgos y quiero proceder</span>
          </label>
        ` : ''}
      </div>
      <div class="action-modal-footer">
        <button class="action-btn-cancel" onclick="closeActionModal()">Cancelar</button>
        <button class="action-btn-confirm" id="action-confirm-btn" style="background:${color}"
          ${isDanger ? 'disabled' : ''}
          onclick="executeConfirmed('${preview.action}')">
          ${isDanger ? '🔺 Ejecutar' : '⚠ Confirmar y ejecutar'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Guardar params para usarlos al confirmar
  modal._params = params;

  // Para peligrosas, habilitar botón solo con checkbox
  if (isDanger) {
    const check = document.getElementById('action-confirm-check');
    const btn = document.getElementById('action-confirm-btn');
    check.addEventListener('change', () => {
      btn.disabled = !check.checked;
    });
  }

  // Cerrar con Escape
  modal._escHandler = (e) => { if (e.key === 'Escape') closeActionModal(); };
  document.addEventListener('keydown', modal._escHandler);

  // Cerrar al hacer click fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeActionModal();
  });
}

function closeActionModal() {
  const modal = document.getElementById('action-confirm-modal');
  if (modal) {
    document.removeEventListener('keydown', modal._escHandler);
    modal.remove();
  }
}

async function executeConfirmed(actionName) {
  const modal = document.getElementById('action-confirm-modal');
  if (!modal) return;
  const params = modal._params;
  const btn = document.getElementById('action-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Ejecutando...';

  try {
    const res = await authFetch(`api/actions/${actionName}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    closeActionModal();
    showResultModal(data);
  } catch (err) {
    closeActionModal();
    showResultModal({ ok: false, error: err.message });
  }
}

// ── Modal de resultado ──
function showResultModal(data) {
  const existing = document.getElementById('action-result-modal');
  if (existing) existing.remove();

  const ok = data.ok;
  const color = ok ? (getCSSVar('--green') || '#10b981') : (getCSSVar('--red') || '#ef4444');
  const icon = ok ? '✅' : '❌';

  const modal = document.createElement('div');
  modal.id = 'action-result-modal';
  modal.className = 'action-modal-overlay';
  modal.innerHTML = `
    <div class="action-modal">
      <div class="action-modal-header" style="border-color:${color}">
        <span class="action-modal-icon">${icon}</span>
        <span class="action-modal-title">${ok ? 'Acción completada' : 'Error al ejecutar'}</span>
        ${data.duration_ms ? `<span style="color:var(--text3);font-size:12px">${data.duration_ms}ms</span>` : ''}
      </div>
      <div class="action-modal-body">
        ${ok ? formatOutput(data.output, data.duration_ms, data.action) : `<div class="action-error">${data.error}</div>`}
      </div>
      <div class="action-modal-footer">
        <button class="action-btn-cancel" onclick="closeResultModal()">Cerrar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal._escHandler = (e) => { if (e.key === 'Escape') closeResultModal(); };
  document.addEventListener('keydown', modal._escHandler);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeResultModal(); });
}

function closeResultModal() {
  const modal = document.getElementById('action-result-modal');
  if (modal) {
    document.removeEventListener('keydown', modal._escHandler);
    modal.remove();
  }
}

// ── Formatear output con resumen opcional ──
function formatOutput(output, durationMs, actionName) {
  if (!output) return '<div class="action-output-empty">Sin output</div>';

  let summaryHtml = '';
  // Intentar generar resumen legible
  if (actionName && SUMMARIZERS[actionName]) {
    const items = SUMMARIZERS[actionName](output);
    if (items) summaryHtml = renderSummary(items);
  }

  // Array de objetos (resultado PG)
  if (Array.isArray(output)) {
    if (!output.length) return summaryHtml || '<div class="action-output-empty">Sin resultados (0 filas)</div>';
    const keys = Object.keys(output[0]);
    let html = summaryHtml;
    html += '<details class="action-raw-toggle"><summary>Ver datos completos</summary>';
    html += '<div class="action-table-wrap"><table class="action-table"><thead><tr>';
    keys.forEach(k => { html += `<th>${k}</th>`; });
    html += '</tr></thead><tbody>';
    output.forEach(row => {
      html += '<tr>';
      keys.forEach(k => { html += `<td>${row[k] ?? ''}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table></div></details>';
    if (durationMs) html += `<div class="action-timing">${output.length} fila(s) · ${durationMs}ms</div>`;
    return html;
  }

  // String (output SSH)
  let html = summaryHtml;
  html += `<details class="action-raw-toggle"${summaryHtml ? '' : ' open'}><summary>Ver salida de consola</summary><pre class="action-output">${escapeHtml(output)}</pre></details>`;
  if (durationMs) html += `<div class="action-timing">${durationMs}ms</div>`;
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Helper: crear resultado inline después de un botón ──
function createInlineResult(btn) {
  if (!btn) return null;
  let container = btn.parentElement.querySelector('.action-inline-result');
  if (!container) {
    container = document.createElement('div');
    container.className = 'action-inline-result';
    btn.parentElement.appendChild(container);
  }
  return container;
}

// ── Tab de Acciones: render catálogo + auditoría ──
async function renderActionsTab() {
  const container = document.getElementById('actions-catalog');
  const auditContainer = document.getElementById('actions-audit');
  if (!container) return;

  try {
    const [actionsRes, auditRes] = await Promise.all([
      authFetch('api/actions'),
      authFetch('api/audit?limit=30'),
    ]);
    const actions = await actionsRes.json();
    const audit = await auditRes.json();

    renderCatalog(container, actions);
    renderAuditLog(auditContainer, audit);
  } catch (err) {
    container.innerHTML = `<div class="action-error">Error cargando acciones: ${err.message}</div>`;
  }
}

function renderCatalog(container, grouped) {
  const sections = [
    { key: 'safe', title: 'Acciones seguras — Solo lectura', icon: '🟢', desc: 'Se ejecutan directo sin confirmación' },
    { key: 'moderate', title: 'Acciones moderadas — Requieren confirmación', icon: '🟡', desc: 'Afectan una conexión o proceso específico' },
    { key: 'danger', title: 'Acciones peligrosas — Confirmación doble', icon: '🔺', desc: 'Afectan el servicio completo' },
  ];

  const ACTION_ICONS = {
    view_top: '📊', view_memory: '💾', view_disk: '💿', view_connections: '🔌',
    view_locks: '🔒', view_zombies: '👻', view_jboss: '☕', view_tcp_stuck: '🔗',
    kill_zombie: '💀', cancel_query: '⏹', kill_idle_old: '🧹',
    clean_logs: '🗑', clean_tmp: '📁', drop_caches: '🧊', restart_jboss: '🔄',
  };

  let html = '';
  sections.forEach(sec => {
    const items = grouped[sec.key] || [];
    if (!items.length) return;

    html += `<div class="action-section">
      <h3 class="action-section-title">${sec.icon} ${sec.title}</h3>
      <div class="action-cards">`;

    items.forEach(action => {
      const serverNameMap = {};
      if (window.SITE_CONFIG) window.SITE_CONFIG.servers.forEach(s => { serverNameMap[s.id] = s.name; });
      const paramsHTML = action.params.map(p => {
        if (p.type === 'enum') {
          const options = p.values.map(v => `<option value="${v}">${serverNameMap[v] || v}</option>`).join('');
          return `<select class="action-param" data-param="${p.name}">${options}</select>`;
        }
        return `<input class="action-param" data-param="${p.name}" type="number" placeholder="${p.label}" min="${p.min || ''}" max="${p.max || ''}" value="${p.default || ''}">`;
      }).join('');

      const btnClass = `action-btn-${action.risk}`;
      const icon = ACTION_ICONS[action.name] || RISK_ICONS[action.risk];
      const riskBadge = `action-card-risk-${action.risk}`;
      const targetLabel = action.target === 'ssh' ? 'Servidor' : 'Base de datos';

      // Readonly users can only execute safe actions
      const isReadonly = window.currentUser && window.currentUser.role === 'readonly';
      const blocked = isReadonly && action.risk !== 'safe';
      const btnDisabled = blocked ? ' disabled title="Requiere rol admin"' : '';
      const blockedLabel = blocked ? '<div class="action-blocked-hint">🔒 Solo admin</div>' : '';

      html += `
        <div class="action-card action-card-${action.risk}${blocked ? ' action-card-blocked' : ''}">
          <div class="action-card-top">
            <div class="action-card-header">
              <span class="action-card-label"><span class="action-card-icon">${icon}</span>${action.label}</span>
              <span class="action-card-risk ${riskBadge}">${targetLabel}</span>
            </div>
            <div class="action-card-desc">${action.description}</div>
            ${action.riskDetail ? `<div class="action-card-risk-detail">${action.riskDetail}</div>` : ''}
          </div>
          <div class="action-card-footer" data-action="${action.name}">
            ${paramsHTML}
            <button class="${btnClass}"${btnDisabled} onclick="handleActionClick('${action.name}', '${action.risk}', this)">
              ${RISK_ICONS[action.risk]} Ejecutar
            </button>
            ${blockedLabel}
          </div>
          <div class="action-inline-result" style="display:none"></div>
        </div>`;
    });

    html += '</div></div>';
  });

  container.innerHTML = html;
}

function handleActionClick(actionName, risk, btn) {
  const footer = btn.closest('.action-card-footer');
  const params = {};
  footer.querySelectorAll('.action-param').forEach(el => {
    params[el.dataset.param] = el.value;
  });

  const resultDiv = footer.closest('.action-card').querySelector('.action-inline-result');

  if (risk === 'safe') {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="action-loading">Ejecutando...</div>';
    authFetch(`api/actions/${actionName}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    .then(r => r.json())
    .then(data => {
      resultDiv.innerHTML = data.ok
        ? formatOutput(data.output, data.duration_ms, data.action)
        : `<div class="action-error">${data.error}</div>`;
    })
    .catch(err => {
      resultDiv.innerHTML = `<div class="action-error">${err.message}</div>`;
    });
  } else {
    confirmAction(actionName, params);
  }
}

let auditAllData = [];
let auditFilters = { risk: 'all', status: 'all' };

function renderAuditFilters() {
  const filtersEl = document.getElementById('audit-filters');
  if (!filtersEl) return;
  filtersEl.innerHTML = `
    <select onchange="auditFilters.risk=this.value;filterAndRenderAudit()">
      <option value="all">Todos los riesgos</option>
      <option value="safe">Seguras</option>
      <option value="moderate">Moderadas</option>
      <option value="danger">Peligrosas</option>
    </select>
    <select onchange="auditFilters.status=this.value;filterAndRenderAudit()">
      <option value="all">Todos los estados</option>
      <option value="ok">Exitosas</option>
      <option value="error">Con error</option>
    </select>
  `;
}

function filterAndRenderAudit() {
  let filtered = auditAllData;
  if (auditFilters.risk !== 'all') filtered = filtered.filter(r => r.risk_level === auditFilters.risk);
  if (auditFilters.status !== 'all') filtered = filtered.filter(r => r.status === auditFilters.status);
  const container = document.getElementById('actions-audit');
  renderAuditRows(container, filtered);
}

function renderAuditLog(container, audit) {
  auditAllData = audit || [];
  renderAuditFilters();
  renderAuditRows(container, auditAllData);
}

function renderAuditRows(container, audit) {
  if (!container || !audit.length) {
    if (container) container.innerHTML = '<div class="action-output-empty">Sin ejecuciones registradas</div>';
    return;
  }

  RISK_COLORS = getRiskColors();
  let html = '<div class="action-table-wrap"><table class="action-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Riesgo</th><th>Estado</th><th>Duración</th></tr></thead><tbody>';
  audit.forEach((row, i) => {
    const color = RISK_COLORS[row.risk_level] || '#94a3b8';
    const statusIcon = row.status === 'ok' ? '✅' : '❌';
    const time = new Date(row.ts).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
    const user = row.user_name || 'system';
    const rowClass = `audit-row-${row.risk_level || 'safe'}`;
    html += `<tr class="${rowClass}" style="cursor:pointer" onclick="toggleAuditDetail('audit-detail-${i}')">
      <td>${time}</td>
      <td class="audit-user">${user}</td>
      <td>${row.action_name}</td>
      <td style="color:${color}">${RISK_LABELS[row.risk_level] || row.risk_level}</td>
      <td>${statusIcon}</td>
      <td>${row.duration_ms}ms</td>
    </tr>
    <tr id="audit-detail-${i}" class="audit-expandable-row" style="display:none">
      <td colspan="6" style="padding:0">
        <div class="audit-expandable show" style="display:block">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Params: <code>${escapeHtml(row.params_json || '{}')}</code></div>
          ${row.output_preview ? `<pre class="action-output" style="max-height:150px;font-size:10px">${escapeHtml(row.output_preview)}</pre>` : ''}
        </div>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function toggleAuditDetail(id) {
  const row = document.getElementById(id);
  if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}
