// Renderizado del tab de Queries Costosos — con paginación, búsqueda y desglose enriquecido

let queriesData = [];
let queriesSortCol = 'total_time_sec';
let queriesSortAsc = false;
let queriesPage = 1;
let queriesPerPage = 15;
let queriesFilter = '';
let queriesRange = '24h'; // '1h', '6h', '24h', '7d', '30d', 'all', 'custom'
let queriesCustomFrom = '';
let queriesCustomTo = '';

const RANGE_MS = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
const RANGE_LABELS = { '1h': 'Última hora', '6h': 'Últimas 6 horas', '24h': 'Últimas 24 horas', '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', 'all': 'Acumulado total', 'custom': 'Rango personalizado' };

function getFilteredAndSorted() {
  let filtered = queriesData;
  if (queriesFilter) {
    const f = queriesFilter.toLowerCase();
    filtered = queriesData.filter(q =>
      (q.tables_involved || '').toLowerCase().includes(f) ||
      (q.query || '').toLowerCase().includes(f)
    );
  }
  return [...filtered].sort((a, b) => {
    let va = a[queriesSortCol], vb = b[queriesSortCol];
    if (queriesSortCol === 'tables_involved') {
      va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase();
      return queriesSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    va = va || 0; vb = vb || 0;
    return queriesSortAsc ? va - vb : vb - va;
  });
}

function renderQueriesTable(queries) {
  if (queries) queriesData = queries;
  const container = document.getElementById('queries-table-container');
  if (!container) return;

  // Actualizar subtítulo
  const subtitle = document.getElementById('queries-subtitle');
  if (subtitle) {
    const isDelta = queriesRange !== 'all';
    subtitle.textContent = isDelta
      ? `Mostrando diferencias (delta) del periodo: ${RANGE_LABELS[queriesRange] || 'Personalizado'}`
      : 'Datos acumulados totales desde el último reset de pg_stat_statements.';
  }

  if (!queriesData.length) {
    container.innerHTML = buildFilterBarHtml() + '<div class="no-data">Sin datos de queries para este periodo.</div>';
    return;
  }

  const sorted = getFilteredAndSorted();
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / queriesPerPage));
  if (queriesPage > totalPages) queriesPage = totalPages;
  const start = (queriesPage - 1) * queriesPerPage;
  const pageItems = sorted.slice(start, start + queriesPerPage);

  const isDelta = queriesRange !== 'all';
  const arrow = queriesSortAsc ? ' ▲' : ' ▼';
  const colHeader = (col, label) => {
    const active = queriesSortCol === col ? arrow : '';
    return `<th class="q-sortable" onclick="sortQueries('${col}')">${label}${active}</th>`;
  };

  // Filter bar + Barra de controles
  let html = buildFilterBarHtml();
  html += `<div class="queries-controls">
    <div class="queries-search-wrap">
      <input type="text" class="queries-search" placeholder="Buscar por tabla o SQL..." value="${queriesFilter.replace(/"/g, '&quot;')}" oninput="filterQueries(this.value)">
    </div>
    <div class="queries-controls-right">
      <span class="queries-info">Mostrando ${totalItems === 0 ? 0 : start + 1}-${Math.min(start + queriesPerPage, totalItems)} de ${totalItems}</span>
      <select class="queries-per-page" onchange="changePerPage(this.value)">
        <option value="15"${queriesPerPage === 15 ? ' selected' : ''}>15 por pág</option>
        <option value="30"${queriesPerPage === 30 ? ' selected' : ''}>30 por pág</option>
        <option value="50"${queriesPerPage === 50 ? ' selected' : ''}>50 por pág</option>
      </select>
    </div>
  </div>`;

  // Tabla
  html += `<table class="queries-table">
    <thead><tr>
      <th>#</th>
      ${colHeader('tables_involved', 'Tablas')}
      ${colHeader('calls', 'Llamadas')}
      ${colHeader('total_time_sec', 'Tiempo Total')}
      ${colHeader('avg_time_sec', 'Promedio')}
      ${colHeader('max_time_sec', 'Máximo')}
      ${colHeader('cache_hit_pct', 'Cache Hit')}
      ${colHeader('rows_per_call', 'Filas/llamada')}
      ${colHeader('temp_blks_written', 'Temp Blocks')}
    </tr></thead><tbody>`;

  pageItems.forEach((q, i) => {
    const globalIdx = start + i + 1;
    const severity = q.avg_time_sec >= 1 ? 'q-red' : q.avg_time_sec >= 0.1 ? 'q-yellow' : 'q-green';
    const cacheSeverity = (q.cache_hit_pct || 0) < 90 ? 'q-red' : (q.cache_hit_pct || 0) < 99 ? 'q-yellow' : 'q-green';
    const queryFull = (q.query || '').replace(/</g, '&lt;');

    // Info de rango y consistencia para el desglose
    const minStr = formatTimeQ(q.min_time_sec || 0);
    const maxStr = formatTimeQ(q.max_time_sec || 0);
    const avgStr = q.avg_time_sec >= 1 ? q.avg_time_sec.toFixed(2) + 's' : (q.avg_time_sec * 1000).toFixed(0) + 'ms';
    let consistencyHtml = '';
    if (q.stddev_time_sec && q.avg_time_sec > 0) {
      const cv = q.stddev_time_sec / q.avg_time_sec;
      if (cv > 2) consistencyHtml = '<span class="q-badge q-badge-red">Muy inconsistente</span>';
      else if (cv > 1) consistencyHtml = '<span class="q-badge q-badge-yellow">Inconsistente</span>';
      else consistencyHtml = '<span class="q-badge q-badge-green">Consistente</span>';
    }

    html += `<tr class="q-row" data-queryid="${q.queryid}" onclick="toggleQueryDetail(this)">
      <td class="q-num">${globalIdx}</td>
      <td class="q-tables">${q.tables_involved || '—'}</td>
      <td class="q-calls">${formatNumQ(q.calls)}</td>
      <td class="q-time ${severity}">${formatTimeQ(q.total_time_sec)}</td>
      <td class="q-time ${severity}">${avgStr}</td>
      <td class="q-time">${formatTimeQ(q.max_time_sec)}</td>
      <td class="${cacheSeverity}">${(q.cache_hit_pct || 0).toFixed(1)}%</td>
      <td>${formatNumQ(q.rows_per_call)}</td>
      <td>${q.temp_blks_written > 0 ? formatNumQ(q.temp_blks_written) : '—'}</td>
    </tr>
    <tr class="q-detail" style="display:none">
      <td colspan="9">
        <div class="q-detail-grid">
          <div class="q-detail-stats">
            <div class="q-stat-row"><span class="q-stat-label">Rango de tiempo:</span> ${minStr} — ${maxStr} ${consistencyHtml}</div>
            <div class="q-stat-row"><span class="q-stat-label">Promedio:</span> ${avgStr}</div>
            <div class="q-stat-row"><span class="q-stat-label">Filas totales procesadas:</span> ${formatNumQ(q.rows_total)}</div>
            <div class="q-stat-row"><span class="q-stat-label">Blocks leídos de disco:</span> ${formatNumQ(q.shared_blks_read)}</div>
            <div class="q-stat-row"><span class="q-stat-label">Blocks en cache:</span> ${formatNumQ(q.shared_blks_hit)}</div>
            ${q.temp_blks_written > 0 ? `<div class="q-stat-row"><span class="q-stat-label">Temp blocks (spill a disco):</span> <span class="q-red">${formatNumQ(q.temp_blks_written)}</span></div>` : ''}
          </div>
          <div class="q-trending" id="trending-${q.queryid}">
            <div class="q-sql-label">Tendencia histórica:</div>
            <div class="q-trending-chart-wrap"><canvas id="chart-trending-${q.queryid}"></canvas></div>
          </div>
        </div>
        <div class="q-sql-label">SQL completo:</div>
        <pre class="q-sql">${queryFull}</pre>
        <div class="q-meta">QueryID: ${q.queryid}</div>
      </td>
    </tr>`;
  });

  html += '</tbody></table>';

  // Paginación
  if (totalPages > 1) {
    html += `<div class="queries-pagination">
      <button class="q-page-btn" onclick="goQueriesPage(${queriesPage - 1})" ${queriesPage <= 1 ? 'disabled' : ''}>« Anterior</button>
      <span class="q-page-info">Página ${queriesPage} de ${totalPages}</span>
      <button class="q-page-btn" onclick="goQueriesPage(${queriesPage + 1})" ${queriesPage >= totalPages ? 'disabled' : ''}>Siguiente »</button>
    </div>`;
  }

  container.innerHTML = html;
}

function sortQueries(col) {
  if (queriesSortCol === col) {
    queriesSortAsc = !queriesSortAsc;
  } else {
    queriesSortCol = col;
    queriesSortAsc = false;
  }
  queriesPage = 1;
  renderQueriesTable();
}

function filterQueries(val) {
  queriesFilter = val || '';
  queriesPage = 1;
  renderQueriesTable();
}

function changePerPage(val) {
  queriesPerPage = parseInt(val) || 15;
  queriesPage = 1;
  renderQueriesTable();
}

function goQueriesPage(page) {
  const sorted = getFilteredAndSorted();
  const totalPages = Math.max(1, Math.ceil(sorted.length / queriesPerPage));
  if (page < 1 || page > totalPages) return;
  queriesPage = page;
  renderQueriesTable();
}

function toggleQueryDetail(row) {
  const detail = row.nextElementSibling;
  if (detail && detail.classList.contains('q-detail')) {
    const show = detail.style.display === 'none';
    detail.style.display = show ? 'table-row' : 'none';
    if (show) {
      const queryid = row.dataset.queryid;
      if (queryid) loadQueryTrending(queryid, detail);
    }
  }
}

function formatNumQ(val) {
  if (!val && val !== 0) return '0';
  if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(1);
}

function formatTimeQ(secs) {
  if (!secs) return '0s';
  if (secs >= 3600) return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  if (secs >= 60) return Math.floor(secs / 60) + 'm ' + Math.floor(secs % 60) + 's';
  if (secs >= 1) return secs.toFixed(1) + 's';
  return (secs * 1000).toFixed(0) + 'ms';
}

function buildFilterBarHtml() {
  const pills = ['1h', '6h', '24h', '7d', '30d', 'all'].map(r => {
    const label = r === 'all' ? 'Todo' : r;
    const active = queriesRange === r ? ' active' : '';
    return `<button class="queries-filter-pill${active}" onclick="setQueriesRange('${r}')">${label}</button>`;
  }).join('');

  const isDelta = queriesRange !== 'all';
  const badgeClass = isDelta ? 'queries-mode-delta' : 'queries-mode-cumulative';
  const badgeText = isDelta ? `DELTA ${queriesRange === 'custom' ? 'CUSTOM' : queriesRange}` : 'ACUMULADO';

  return `<div class="queries-filter-bar">
    <div class="queries-filter-pills">${pills}</div>
    <div class="queries-filter-custom">
      <input type="datetime-local" id="queries-from" value="${queriesCustomFrom ? queriesCustomFrom.slice(0,16) : ''}">
      <span>—</span>
      <input type="datetime-local" id="queries-to" value="${queriesCustomTo ? queriesCustomTo.slice(0,16) : ''}">
      <button onclick="applyQueriesCustomRange()">Aplicar</button>
    </div>
    <span class="queries-mode-badge ${badgeClass}">${badgeText}</span>
  </div>`;
}

function setQueriesRange(mode) {
  queriesRange = mode;
  queriesPage = 1;
  fetchAndRenderQueries();
}

function applyQueriesCustomRange() {
  const fromEl = document.getElementById('queries-from');
  const toEl = document.getElementById('queries-to');
  if (!fromEl || !toEl || !fromEl.value || !toEl.value) return;
  queriesCustomFrom = new Date(fromEl.value).toISOString();
  queriesCustomTo = new Date(toEl.value).toISOString();
  queriesRange = 'custom';
  queriesPage = 1;
  fetchAndRenderQueries();
}

function exportQueries() {
  const now = new Date().toISOString().slice(0, 10);
  window.open(`api/export/queries?from=2020-01-01&to=${now}`, '_blank');
}

const trendingCharts = {};
async function loadQueryTrending(queryid, detailRow) {
  const container = detailRow.querySelector(`#trending-${queryid}`);
  if (!container) return;
  const canvasId = `chart-trending-${queryid}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (trendingCharts[canvasId]) return;

  try {
    const res = await authFetch(`api/queries/${queryid}/history`);
    const history = await res.json();
    if (!history.length) {
      container.innerHTML = '<div class="q-sql-label" style="color:var(--text3);font-style:italic">Sin historial disponible para este query.</div>';
      return;
    }

    const labels = history.map(h => (h.snapshot_time || '').substring(5, 16).replace('T', ' '));
    const avgData = history.map(h => h.avg_time_sec || 0);
    const callsData = history.map(h => h.calls || 0);

    let trendMsg = '';
    if (history.length >= 3) {
      const recent = avgData.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const older = avgData.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (older > 0) {
        const ratio = recent / older;
        if (ratio > 2) trendMsg = `⚠️ Este query se ha hecho ${ratio.toFixed(1)}x más lento`;
        else if (ratio > 1.3) trendMsg = `📈 Tendencia al alza (${ratio.toFixed(1)}x)`;
        else if (ratio < 0.5) trendMsg = `📉 Mejorando (${ratio.toFixed(1)}x más rápido)`;
        else trendMsg = '➡️ Estable';
      }
    }

    if (trendMsg) {
      const trendEl = document.createElement('div');
      trendEl.style.cssText = 'font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text2)';
      trendEl.textContent = trendMsg;
      container.querySelector('.q-sql-label').after(trendEl);
    }

    const _sc = getScaleColors();
    const _yellow = getCSSVar('--yellow') || '#f59e0b';
    const _blue = getCSSVar('--blue') || '#3b82f6';
    trendingCharts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Tiempo promedio (s)', data: avgData, borderColor: _yellow, backgroundColor: hexToRgba(_yellow, .15), fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2, yAxisID: 'y' },
          { label: 'Llamadas', data: callsData, borderColor: _blue, backgroundColor: 'transparent', tension: 0.3, pointRadius: 1, borderWidth: 1.5, borderDash: [4, 4], yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'top', labels: { color: _sc.tickColor, boxWidth: 10, padding: 8, font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: _sc.tickColor, maxTicksLimit: 8, font: { size: 10 } }, grid: { color: _sc.gridColor } },
          y: { position: 'left', ticks: { color: _yellow, font: { size: 10 } }, grid: { color: _sc.gridColor }, title: { display: true, text: 'Tiempo (s)', color: _yellow, font: { size: 10 } } },
          y1: { position: 'right', ticks: { color: _blue, font: { size: 10 } }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Llamadas', color: _blue, font: { size: 10 } } },
        },
      },
    });
  } catch (e) {
    console.error('Error loading trending:', e);
    container.innerHTML = '<div class="q-sql-label" style="color:var(--text3);font-style:italic">Error cargando historial.</div>';
  }
}

async function fetchAndRenderQueries() {
  try {
    let url = 'api/queries';
    if (queriesRange !== 'all') {
      const now = new Date();
      let from, to;
      if (queriesRange === 'custom') {
        from = queriesCustomFrom;
        to = queriesCustomTo || now.toISOString();
      } else {
        from = new Date(now.getTime() - RANGE_MS[queriesRange]).toISOString();
        to = now.toISOString();
      }
      url = `api/queries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
    const res = await authFetch(url);
    const data = await res.json();
    renderQueriesTable(data);
  } catch (e) {
    console.error('Error fetching queries:', e);
  }
}
