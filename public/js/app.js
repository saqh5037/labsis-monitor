// App — SSE + tabs + filtros de fecha + orquestación + auth

let currentLogType = 'slow';
let currentRange = '24h';
let sseSource = null;
let sseActive = true;
let compareMode = false;
let compareData = null;
window.currentUser = null;

// ── Auth helper ──
function authFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  if (token) {
    options.headers = { ...(options.headers || {}), Authorization: 'Bearer ' + token };
  }
  return fetch(url, options);
}

async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return false; }
  try {
    const res = await fetch('api/me', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { localStorage.removeItem('token'); window.location.href = 'login.html'; return false; }
    window.currentUser = await res.json();
    return true;
  } catch (e) { window.location.href = 'login.html'; return false; }
}

function updateUserBadge() {
  const badge = document.getElementById('user-badge');
  if (!badge || !window.currentUser) return;
  badge.style.display = 'flex';
  document.getElementById('user-name').textContent = window.currentUser.username;
  const roleBadge = document.getElementById('user-role-badge');
  roleBadge.textContent = window.currentUser.role === 'admin' ? 'Admin' : 'Lectura';
  roleBadge.className = 'user-role-badge role-' + window.currentUser.role;
}

function logout() {
  localStorage.removeItem('token');
  document.cookie = 'token=;path=/;max-age=0';
  window.location.href = 'login.html';
}

// ── Theme ──
(function initTheme() {
  const saved = localStorage.getItem('dashboard-theme') || 'light';
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
})();

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  if (newTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('dashboard-theme', newTheme);
  document.getElementById('theme-toggle').innerHTML = newTheme === 'dark' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  // Re-render charts con nuevos colores
  try { refreshChartsTheme(); } catch(e) {}
}

// Tabs
document.addEventListener('DOMContentLoaded', async () => {
  // Auth check
  const ok = await checkAuth();
  if (!ok) return;
  updateUserBadge();

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    const current = localStorage.getItem('dashboard-theme') || 'light';
    themeBtn.innerHTML = current === 'dark' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    themeBtn.addEventListener('click', toggleTheme);
  }

  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      setTimeout(() => {
        Object.values(charts).forEach(c => { try { c.resize(); } catch(e) {} });
      }, 50);
      if (tab.dataset.tab === 'queries') fetchAndRenderQueries();
      if (tab.dataset.tab === 'actions') renderActionsTab();
      if (tab.dataset.tab === 'database') { try { loadHeatmap(); loadDbInsights(); } catch(e) {} }
      if (tab.dataset.tab === 'reports') { try { renderReportsTab(); } catch(e) {} }
    });
  });

  // Filtros de fecha — pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentRange = pill.dataset.range;
      // Limpiar campos custom
      document.getElementById('filter-from').value = '';
      document.getElementById('filter-to').value = '';
      applyFilter();
    });
  });

  // Filtro custom
  document.getElementById('filter-apply-btn').addEventListener('click', () => {
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    if (from && to) {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      currentRange = 'custom';
      applyFilter(from, to);
    }
  });

  // Export button
  document.getElementById('export-btn').addEventListener('click', exportCurrentData);

  // Compare button
  document.getElementById('compare-btn').addEventListener('click', toggleCompareMode);

  // Set default dates
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  document.getElementById('filter-from').value = weekAgo;
  document.getElementById('filter-to').value = today;

  init();
});

async function init() {
  try {
    const res = await authFetch('api/data');
    const data = await res.json();
    updateDashboard(data);
    setStatus('connected');
  } catch (err) {
    console.error('Error:', err);
    setStatus('disconnected');
  }
  connectSSE();
}

function connectSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }
  const token = localStorage.getItem('token') || '';
  sseSource = new EventSource('api/stream?token=' + encodeURIComponent(token));
  sseSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'update' && sseActive) {
        updateDashboard(msg.data);
        setStatus('connected');
      }
    } catch (e) {}
  };
  sseSource.onerror = () => setStatus('disconnected');
}

async function applyFilter(customFrom, customTo) {
  let from, to;

  if (currentRange === '24h') {
    // Modo real-time: usar datos en memoria (sin from/to)
    sseActive = true;
    try {
      const res = await authFetch('api/data');
      const data = await res.json();
      updateDashboard(data);
    } catch (e) { console.error(e); }
    return;
  }

  // Modo histórico: desactivar SSE updates
  sseActive = false;

  const now = new Date();
  to = now.toISOString();

  if (currentRange === '7d') {
    from = new Date(now - 7 * 86400000).toISOString();
  } else if (currentRange === '30d') {
    from = new Date(now - 30 * 86400000).toISOString();
  } else if (currentRange === 'custom' && customFrom && customTo) {
    from = customFrom + 'T00:00:00.000Z';
    to = customTo + 'T23:59:59.999Z';
  }

  try {
    setStatus('loading');
    const res = await authFetch(`api/data?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const data = await res.json();
    updateDashboard(data);
    setStatus('connected');
  } catch (e) {
    console.error(e);
    setStatus('disconnected');
  }
}

function updateDashboard(data) {
  renderCards(data);
  renderHealthPanel(data);
  renderAllCharts(data);
  updateLogs();
  fetchAndRenderTimeline();
  const ts = data.lastUpdate ? new Date(data.lastUpdate).toLocaleTimeString('es-MX') : '—';
  const rangeText = currentRange === '24h' ? ' (tiempo real)' :
                    currentRange === '7d' ? ' (7 días)' :
                    currentRange === '30d' ? ' (30 días)' : ' (rango personalizado)';
  document.getElementById('last-update').textContent = 'Actualizado: ' + ts + rangeText;
}

function setStatus(s) {
  document.getElementById('conn-dot').className = 'status-dot ' + s;
  document.getElementById('conn-text').textContent =
    s === 'connected' ? 'Conectado' : s === 'disconnected' ? 'Sin conexión' : 'Cargando...';
}

async function updateLogs() {
  try {
    const res = await authFetch('api/logs/' + currentLogType);
    const text = await res.text();
    document.getElementById('log-content').textContent = text || 'Sin alertas registradas en este momento.';
  } catch (e) {}
}

function showLog(type, btn) {
  currentLogType = type;
  document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  updateLogs();
}

function exportCurrentData() {
  let from, to;
  const now = new Date();

  if (currentRange === '24h') {
    from = new Date(now - 86400000).toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  } else if (currentRange === '7d') {
    from = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  } else if (currentRange === '30d') {
    from = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  } else {
    from = document.getElementById('filter-from').value;
    to = document.getElementById('filter-to').value;
  }

  if (!from || !to) return;

  // Determinar qué tab está activa para exportar el tipo correcto
  const activeTab = document.querySelector('.nav-tab.active');
  let type = 'el18'; // default
  if (activeTab) {
    const tab = activeTab.dataset.tab;
    if (tab === 'servers') type = 'el18';
    else if (tab === 'database') type = 'rds';
    else if (tab === 'queries') type = 'queries';
    else if (tab === 'health') type = 'events';
    else if (tab === 'infra') type = 'el18';
    else type = 'el18';
  }

  window.open(`api/export/${type}?from=${from}&to=${to}`, '_blank');
}

// ── Comparador de períodos ──
function toggleCompareMode() {
  const btn = document.getElementById('compare-btn');
  if (compareMode) {
    // Desactivar
    compareMode = false;
    compareData = null;
    btn.classList.remove('active');
    btn.textContent = 'Comparar';
    removeComparePanel();
    // Re-renderizar sin comparación
    applyFilter();
  } else {
    // Activar
    compareMode = true;
    btn.classList.add('active');
    btn.textContent = 'Cancelar comparación';
    showComparePanel();
  }
}

function showComparePanel() {
  if (document.getElementById('compare-panel')) return;
  const filterBar = document.querySelector('.filter-bar');
  const panel = document.createElement('div');
  panel.id = 'compare-panel';
  panel.className = 'compare-panel';
  panel.innerHTML = `
    <span style="font-size:12px;font-weight:600;color:var(--text2)">Comparar con:</span>
    <button class="compare-preset" data-preset="yesterday">Ayer</button>
    <button class="compare-preset" data-preset="last-week">Semana anterior</button>
    <button class="compare-preset" data-preset="custom">Rango personalizado</button>
    <div class="compare-custom" id="compare-custom" style="display:none">
      <input type="date" id="compare-from">
      <input type="date" id="compare-to">
      <button class="filter-apply" id="compare-apply-btn">Aplicar</button>
    </div>
  `;
  filterBar.after(panel);

  panel.querySelectorAll('.compare-preset').forEach(p => {
    p.addEventListener('click', () => {
      panel.querySelectorAll('.compare-preset').forEach(b => b.classList.remove('active'));
      p.classList.add('active');
      if (p.dataset.preset === 'custom') {
        document.getElementById('compare-custom').style.display = 'flex';
      } else {
        document.getElementById('compare-custom').style.display = 'none';
        loadCompareData(p.dataset.preset);
      }
    });
  });

  const applyBtn = document.getElementById('compare-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const from = document.getElementById('compare-from').value;
      const to = document.getElementById('compare-to').value;
      if (from && to) loadCompareData('custom', from, to);
    });
  }
}

function removeComparePanel() {
  const panel = document.getElementById('compare-panel');
  if (panel) panel.remove();
}

async function loadCompareData(preset, customFrom, customTo) {
  const now = new Date();
  let from, to;

  if (preset === 'yesterday') {
    const yesterday = new Date(now - 86400000);
    from = yesterday.toISOString().slice(0, 10) + 'T00:00:00.000Z';
    to = yesterday.toISOString().slice(0, 10) + 'T23:59:59.999Z';
  } else if (preset === 'last-week') {
    from = new Date(now - 14 * 86400000).toISOString();
    to = new Date(now - 7 * 86400000).toISOString();
  } else if (preset === 'custom' && customFrom && customTo) {
    from = customFrom + 'T00:00:00.000Z';
    to = customTo + 'T23:59:59.999Z';
  }

  if (!from || !to) return;

  try {
    setStatus('loading');
    const res = await authFetch(`api/data?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    compareData = await res.json();
    compareData._label = preset === 'yesterday' ? 'Ayer' : preset === 'last-week' ? 'Semana anterior' : 'Período comparado';
    // Re-renderizar gráficas con overlay
    renderAllChartsWithCompare();
    setStatus('connected');
  } catch (e) {
    console.error(e);
    setStatus('disconnected');
  }
}

// Agrega datasets de comparación a las gráficas principales
function renderAllChartsWithCompare() {
  if (!compareData) return;
  const prefix = compareData._label || 'Anterior';

  // Overlay en CPU charts
  addCompareOverlay('chart-cpu-el18', compareData.el18, [
    { key: 'cpu_user', label: `${prefix} User`, color: '#94a3b8' },
  ]);
  addCompareOverlay('chart-cpu-el316', compareData.el316, [
    { key: 'cpu_user', label: `${prefix} User`, color: '#94a3b8' },
  ]);

  // Overlay en DB Conns
  addCompareOverlay('chart-db-conns', compareData.rds, [
    { key: 'active_conns', label: `${prefix} Activas`, color: '#94a3b8' },
    { key: 'idle_in_tx_conns', label: `${prefix} Zombie`, color: '#dc2626' },
  ]);

  // Overlay en Cache Hit
  addCompareOverlay('chart-cache-hit', compareData.rds, [
    { key: 'cache_hit_table_pct', label: `${prefix} Cache`, color: '#94a3b8' },
  ]);

  // Overlay en JBoss threads
  addCompareOverlay('chart-jboss-threads', compareData.el18, [
    { key: 'jboss_threads', label: `${prefix} Threads`, color: '#94a3b8' },
  ]);
}

function addCompareOverlay(chartId, rows, fields) {
  const chart = charts[chartId];
  if (!chart || !rows || !rows.length) return;

  fields.forEach(f => {
    // Remover dataset anterior de comparación si existe
    const existIdx = chart.data.datasets.findIndex(d => d.label === f.label);
    if (existIdx >= 0) chart.data.datasets.splice(existIdx, 1);

    chart.data.datasets.push({
      label: f.label,
      data: rows.map(r => r[f.key] || 0),
      borderColor: f.color,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [6, 4],
      tension: 0.35,
      pointRadius: 0,
      fill: false,
    });
  });
  chart.update('none');
}
