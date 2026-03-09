// Charts — tamaño legible con umbrales claros

// Colores dinámicos (leen CSS variables para soportar light/dark)
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getC() {
  const v = typeof getCSSVar === 'function' ? getCSSVar : (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const blue = v('--blue') || '#3b82f6', green = v('--green') || '#10b981', yellow = v('--yellow') || '#f59e0b';
  const red = v('--red') || '#ef4444', purple = v('--purple') || '#8b5cf6', cyan = v('--cyan') || '#06b6d4', orange = v('--orange') || '#f97316';
  return {
    blue, green, yellow, red, purple, cyan, orange,
    blueA: hexToRgba(blue, .2), greenA: hexToRgba(green, .2),
    yellowA: hexToRgba(yellow, .2), redA: hexToRgba(red, .2),
    purpleA: hexToRgba(purple, .2), cyanA: hexToRgba(cyan, .2),
    orangeA: hexToRgba(orange, .2),
  };
}
// Lazy-init para que funcione antes de DOMContentLoaded
let C = { blue: '#3b82f6', green: '#059669', yellow: '#d97706', red: '#dc2626', purple: '#8b5cf6', cyan: '#06b6d4', orange: '#f97316', blueA: 'rgba(59,130,246,.2)', greenA: 'rgba(5,150,105,.2)', yellowA: 'rgba(217,119,6,.2)', redA: 'rgba(220,38,38,.2)', purpleA: 'rgba(139,92,246,.2)', cyanA: 'rgba(6,182,212,.2)', orangeA: 'rgba(249,115,22,.2)' };

function getScaleColors() {
  const v = typeof getCSSVar === 'function' ? getCSSVar : (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const tickColor = v('--text3') || '#64748b';
  const gridColor = hexToRgba(tickColor, .1);
  return { tickColor, gridColor };
}

function getScaleX() { const s = getScaleColors(); return { ticks: { color: s.tickColor, maxTicksLimit: 10, font: { size: 11 } }, grid: { color: s.gridColor } }; }
function getScaleY() { const s = getScaleColors(); return { ticks: { color: s.tickColor, font: { size: 11 } }, grid: { color: s.gridColor } }; }
// Compat aliases
let scaleX = getScaleX();
let scaleY = getScaleY();

function opts(scalesOverride, annotations) {
  const sc = getScaleColors();
  const sx = getScaleX();
  const sy = getScaleY();
  const o = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { position: 'top', labels: { color: sc.tickColor, boxWidth: 10, padding: 8, font: { size: 11 } } },
    },
    scales: { x: { ...sx }, y: { ...sy }, ...scalesOverride },
  };
  if (annotations) o.plugins.annotation = { annotations };
  return o;
}

// Refresh colors + re-render all existing charts
function refreshChartsTheme() {
  C = getC();
  scaleX = getScaleX();
  scaleY = getScaleY();
  // Update each chart's scale/legend colors in-place
  for (const [id, chart] of Object.entries(charts)) {
    const sc = getScaleColors();
    if (chart.options.scales) {
      for (const axis of Object.values(chart.options.scales)) {
        if (axis.ticks) axis.ticks.color = sc.tickColor;
        if (axis.grid) axis.grid.color = sc.gridColor;
        if (axis.title) axis.title.color = sc.tickColor;
      }
    }
    if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
      chart.options.plugins.legend.labels.color = sc.tickColor;
    }
    chart.update('none');
  }
}

function tl(y, color, label, side) {
  const pos = side === 'end' ? 'end' : 'start';
  const adj = side === 'below' ? 14 : -14;
  return { type: 'line', yMin: y, yMax: y, borderColor: color, borderWidth: 1.5, borderDash: [5, 3],
    label: { display: true, content: label, position: pos, backgroundColor: hexToRgba(typeof getCSSVar === 'function' ? (getCSSVar('--bg') || '#0f172a') : '#0f172a', .9), color, font: { size: 10, weight: 'bold' }, padding: { top: 2, bottom: 2, left: 6, right: 6 }, yAdjust: adj }
  };
}

const charts = {};
const chartConfigs = {}; // Guardar config para recrear en modal
function lbl(rows) { return rows.map(r => (r.timestamp || '').substring(11, 16)); }
function mk(id, cfg) {
  const el = document.getElementById(id);
  if (!el) return;
  chartConfigs[id] = cfg; // Guardar para expandir
  if (charts[id]) { charts[id].data = cfg.data; charts[id].options = cfg.options; charts[id].update('none'); }
  else charts[id] = new Chart(el, cfg);
  // Agregar botón expandir si no existe
  addExpandBtn(id);
}

// Agrega botón de expandir al chart-card
function addExpandBtn(chartId) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  const wrap = canvas.closest('.chart-wrap');
  if (!wrap || wrap.querySelector('.chart-expand-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'chart-expand-btn';
  btn.innerHTML = '⤢';
  btn.title = 'Expandir gráfica';
  btn.onclick = (e) => { e.stopPropagation(); openChartModal(chartId); };
  wrap.appendChild(btn);
}

let modalChart = null;
function openChartModal(chartId) {
  const cfg = chartConfigs[chartId];
  if (!cfg) return;

  const modal = document.getElementById('chart-modal');
  modal.style.display = 'flex';

  // Obtener título de la chart-card
  const canvas = document.getElementById(chartId);
  const card = canvas ? canvas.closest('.chart-card') : null;
  const titleEl = card ? card.querySelector('.chart-title') : null;
  document.getElementById('modal-title').textContent = titleEl ? titleEl.textContent : chartId;

  // Copiar diagnóstico
  const diagEl = card ? card.querySelector('.chart-diag') : null;
  document.getElementById('modal-diag').innerHTML = diagEl ? diagEl.outerHTML : '';

  // Crear gráfica con más interacción
  const modalCfg = JSON.parse(JSON.stringify(cfg));
  // Habilitar interactividad en el modal
  modalCfg.options.animation = { duration: 300 };
  if (modalCfg.options.plugins) {
    modalCfg.options.plugins.tooltip = { enabled: true, mode: 'index', intersect: false };
  }
  // Más ticks en el modal (más espacio)
  if (modalCfg.options.scales && modalCfg.options.scales.x) {
    modalCfg.options.scales.x.ticks = { ...modalCfg.options.scales.x.ticks, maxTicksLimit: 24, font: { size: 12 } };
  }

  const modalCanvas = document.getElementById('modal-chart');
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  modalChart = new Chart(modalCanvas, modalCfg);

  // Cerrar con Escape
  document.addEventListener('keydown', modalEscHandler);
}

function closeChartModal(event) {
  if (event && event.target !== event.currentTarget) return; // Solo cerrar si click en overlay
  const modal = document.getElementById('chart-modal');
  modal.style.display = 'none';
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  document.removeEventListener('keydown', modalEscHandler);
}

function modalEscHandler(e) {
  if (e.key === 'Escape') closeChartModal();
}

// ── Diagnóstico banner — muestra mensaje claro arriba de la gráfica ──
// runbookType: clave opcional de RUNBOOKS para mostrar botón "¿Qué hacer?"
function setDiag(chartId, level, msg, runbookType) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  const wrap = canvas.closest('.chart-card');
  if (!wrap) return;
  let banner = wrap.querySelector('.chart-diag');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'chart-diag';
    const header = wrap.querySelector('.chart-header');
    if (header) header.after(banner);
    else wrap.prepend(banner);
  }
  const colors = { ok: C.green, warn: C.yellow, crit: C.red };
  const icons = { ok: '✅', warn: '⚠️', crit: '🔺' };
  const bgColors = { ok: hexToRgba(C.green, .1), warn: hexToRgba(C.yellow, .12), crit: hexToRgba(C.red, .12) };
  banner.style.cssText = `padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:8px;border-left:4px solid ${colors[level]};background:${bgColors[level]};color:${colors[level]}`;
  let html = `${icons[level]} ${msg}`;
  // Agregar botón de runbook si hay guía disponible y el nivel no es "ok"
  if (runbookType && level !== 'ok' && typeof renderRunbookHTML === 'function') {
    html += `<button class="rb-btn" onclick="toggleRunbook(this)">¿Qué hacer?</button>`;
    html += renderRunbookHTML(runbookType);
  }
  banner.innerHTML = html;
}

function fmtDuration(secs) {
  if (secs >= 3600) return (secs / 3600).toFixed(1) + ' horas';
  if (secs >= 60) return Math.round(secs / 60) + ' minutos';
  return Math.round(secs) + ' segundos';
}
function ds(label, data, color, colorA, extra) {
  return { label, data, borderColor: color, backgroundColor: colorA || 'transparent', fill: !!colorA, tension: 0.35, pointRadius: 0, borderWidth: 2, ...extra };
}

// ── CPU ──
function renderCpuChart(id, rows) {
  if (!rows.length) return;
  mk(id, { type: 'line',
    data: { labels: lbl(rows), datasets: [
      ds('User', rows.map(r => r.cpu_user), C.blue, C.blueA),
      ds('System', rows.map(r => r.cpu_sys), C.purple, C.purpleA),
      ds('I/O Wait', rows.map(r => r.cpu_iowait), C.yellow, C.yellowA),
      ds('Steal', rows.map(r => r.cpu_steal), C.red, C.redA),
    ]},
    options: opts({ y: { ...scaleY, stacked: true, max: 100 } }, {
      warn: tl(70, C.yellow, '⚠ Alerta: 70%'),
      crit: tl(85, C.red, '⛔ Crítico: 85%', 'end'),
    })
  });
  // Diagnóstico
  const last = rows[rows.length - 1];
  const total = (last.cpu_user || 0) + (last.cpu_sys || 0) + (last.cpu_iowait || 0) + (last.cpu_steal || 0);
  const steal = last.cpu_steal || 0;
  if (total > 85) setDiag(id, 'crit', `CPU al ${total.toFixed(0)}% — servidor saturado. Los usuarios experimentan lentitud.`, 'high_cpu');
  else if (steal > 30) setDiag(id, 'crit', `CPU Steal en ${steal.toFixed(1)}% — Amazon le quita recursos al servidor. Necesita más capacidad (upgrade EC2).`, 'high_cpu');
  else if (steal > 15) setDiag(id, 'warn', `CPU Steal en ${steal.toFixed(1)}% — normal en instancias t2. Monitorear si sube.`, 'high_cpu');
  else if (total > 70) setDiag(id, 'warn', `CPU al ${total.toFixed(0)}% — carga alta. Funciona pero sin margen para picos.`, 'high_cpu');
  else setDiag(id, 'ok', `CPU al ${total.toFixed(0)}% — carga normal. Steal: ${steal.toFixed(1)}%.`);
}

// ── Memory ──
function renderMemChart(id, rows) {
  if (!rows.length) return;
  const total = rows[0].mem_total_mb;
  mk(id, { type: 'line',
    data: { labels: lbl(rows), datasets: [
      ds('Usada', rows.map(r => r.mem_used_mb), C.red, C.redA),
      ds('Buff/Cache', rows.map(r => r.mem_bufcache_mb), C.cyan, C.cyanA),
      ds('Libre', rows.map(r => r.mem_free_mb), C.green, C.greenA),
    ]},
    options: opts({ y: { ...scaleY, stacked: true, max: total } }, {
      warn: tl(total * .70, C.yellow, '⚠ Alerta: 70%'),
      crit: tl(total * .85, C.red, '⛔ Crítico: 85%', 'end'),
    })
  });
  // Diagnóstico
  const last = rows[rows.length - 1];
  const usedPct = (last.mem_used_mb / total * 100);
  const freeGB = (last.mem_free_mb / 1024).toFixed(1);
  if (usedPct > 85) setDiag(id, 'crit', `Memoria al ${usedPct.toFixed(0)}% — solo ${freeGB} GB libres. El servidor puede volverse inestable.`, 'high_memory');
  else if (usedPct > 70) setDiag(id, 'warn', `Memoria al ${usedPct.toFixed(0)}% — ${freeGB} GB libres. Funciona pero sin mucho margen.`, 'high_memory');
  else setDiag(id, 'ok', `Memoria al ${usedPct.toFixed(0)}% — ${freeGB} GB libres. Suficiente espacio.`);
}

// ── JBoss RSS ──
function renderJbossRss(el18, el316) {
  // RSS siempre es mayor que heap (incluye metaspace, librerias nativas, etc.)
  // Heap reservado: El 18 = 12 GB, El 3 = 24 GB
  // RSS normal = heap + 1-3 GB overhead. Alarma solo si crece mucho mas alla.
  const HEAP_EL18 = 12288, HEAP_EL316 = 24576;
  const RSS_WARN_EL18 = 15360, RSS_WARN_EL316 = 27648;
  const RSS_CRIT_EL18 = 17408, RSS_CRIT_EL316 = 30720;
  mk('chart-jboss-rss', { type: 'line',
    data: { labels: lbl(el18.length >= el316.length ? el18 : el316), datasets: [
      ds('El 18', el18.map(r => r.jboss_rss_mb), C.blue),
      ds('El 3', el316.map(r => r.jboss_rss_mb), C.orange),
    ]},
    options: opts({}, {
      heapEl316: tl(HEAP_EL316, C.red + '44', 'Heap El 3: 24 GB', 'end'),
      heapEl18: tl(HEAP_EL18, C.blue + '44', 'Heap El 18: 12 GB', 'end'),
    })
  });
  const r18 = el18.length ? el18[el18.length - 1].jboss_rss_mb : 0;
  const r316 = el316.length ? el316[el316.length - 1].jboss_rss_mb : 0;
  if (r18 > RSS_CRIT_EL18 || r316 > RSS_CRIT_EL316) setDiag('chart-jboss-rss', 'crit', `LABSIS: El 18 ${(r18/1024).toFixed(1)} GB, El 3 ${(r316/1024).toFixed(1)} GB. RSS muy alto — posible memory leak.`);
  else if (r18 > RSS_WARN_EL18 || r316 > RSS_WARN_EL316) setDiag('chart-jboss-rss', 'warn', `LABSIS: El 18 ${(r18/1024).toFixed(1)} GB, El 3 ${(r316/1024).toFixed(1)} GB. RSS elevado — monitorear.`);
  else setDiag('chart-jboss-rss', 'ok', `LABSIS: El 18 ${(r18/1024).toFixed(1)} GB (heap 12 GB), El 3 ${(r316/1024).toFixed(1)} GB (heap 24 GB). Memoria estable.`);
}


// ── JBoss Threads ──
function renderJbossThreads(el18, el316) {
  mk('chart-jboss-threads', { type: 'line',
    data: { labels: lbl(el18.length >= el316.length ? el18 : el316), datasets: [
      ds('El 18', el18.map(r => r.jboss_threads), C.blue),
      ds('El 3', el316.map(r => r.jboss_threads), C.orange),
    ]},
    options: opts({}, {
      warn: tl(200, C.yellow, '⚠ Alerta: 200'),
      crit: tl(300, C.red, '⛔ Crítico: 300', 'end'),
    })
  });
  const t18 = el18.length ? el18[el18.length - 1].jboss_threads : 0;
  const t316 = el316.length ? el316[el316.length - 1].jboss_threads : 0;
  const max = Math.max(t18, t316);
  if (max > 300) setDiag('chart-jboss-threads', 'crit', `${max} threads — el servidor no puede atender a todos. Usuarios experimentan errores o timeouts.`);
  else if (max > 200) setDiag('chart-jboss-threads', 'warn', `${max} threads — carga alta. El 18: ${t18}, El 3: ${t316}. Si sube más, habrá problemas.`);
  else setDiag('chart-jboss-threads', 'ok', `El 18: ${t18} threads, El 3: ${t316} threads. Carga normal de usuarios.`);
}

// ── TCP 8080 ──
function renderTcp8080(id, rows) {
  if (!rows.length) return;
  mk(id, { type: 'bar',
    data: { labels: lbl(rows), datasets: [
      { label: 'Activas', data: rows.map(r => r.tcp8080_estab), backgroundColor: C.green, borderRadius: 2 },
      { label: 'Cerrándose', data: rows.map(r => r.tcp8080_timewait), backgroundColor: C.yellow, borderRadius: 2 },
      { label: 'Atoradas (problema)', data: rows.map(r => r.tcp8080_closewait), backgroundColor: C.red, borderRadius: 2 },
    ]},
    options: opts({ x: { ...scaleX, stacked: true }, y: { ...scaleY, stacked: true } })
  });
}

// ── DB Connections ──
function renderDbConns(rows) {
  if (!rows.length) return;
  mk('chart-db-conns', { type: 'line',
    data: { labels: lbl(rows), datasets: [
      ds('Activas', rows.map(r => r.active_conns), C.green, C.greenA),
      ds('Disponibles (normal)', rows.map(r => r.idle_conns), C.blue, C.blueA),
      ds('Abandonadas (bloquean)', rows.map(r => r.idle_in_tx_conns), C.red, C.redA),
    ]},
    options: opts({ y: { ...scaleY, stacked: true } }, {
      warn: tl(5, C.orange, '⚠ Más de 5 = problema'),
    })
  });
  // Diagnóstico
  const last = rows[rows.length - 1];
  const idleTx = last.idle_in_tx_conns || 0;
  const total = last.total_connections || 0;
  if (idleTx >= 5) setDiag('chart-db-conns', 'crit', `${idleTx} conexiones abandonadas bloqueando la BD. Necesitan ser terminadas.`, 'zombie_transaction');
  else if (idleTx >= 1) setDiag('chart-db-conns', 'warn', `${idleTx} conexión abandonada detectada (idle in transaction). La aplicación no cerró la transacción.`, 'zombie_transaction');
  else if (total > 120) setDiag('chart-db-conns', 'warn', `${total} conexiones totales — acercándose al límite. Verificar si hay datasources mal configurados.`, 'high_connections');
  else setDiag('chart-db-conns', 'ok', `${total} conexiones, ${idleTx} abandonadas. Todo normal.`);
}

// ── Cache Hit ──
function renderCacheHit(rows) {
  if (!rows.length) return;
  mk('chart-cache-hit', { type: 'line',
    data: { labels: lbl(rows), datasets: [
      ds('Tablas (actual)', rows.map(r => r.cache_hit_table_pct), C.blue, null, { borderWidth: 3 }),
      ds('Índices', rows.map(r => r.cache_hit_index_pct), C.green),
    ]},
    options: opts({ y: { ...scaleY, min: 85, max: 100 } }, {
      target: tl(99, C.green, '✅ Meta: 99%', 'end'),
      warn: tl(95, C.yellow, '⚠ Bajo 95% = lento'),
    })
  });
  // Diagnóstico
  const last = rows[rows.length - 1];
  const tbl = last.cache_hit_table_pct || 0;
  const idx = last.cache_hit_index_pct || 0;
  if (tbl < 95) setDiag('chart-cache-hit', 'crit', `Cache de tablas en ${tbl.toFixed(1)}% — la BD lee del disco en vez de memoria. Muy lento. Revisar shared_buffers o falta de índices.`, 'low_cache_hit');
  else if (tbl < 99) setDiag('chart-cache-hit', 'warn', `Cache en ${tbl.toFixed(1)}% — aceptable pero debería estar arriba de 99%. Algunos queries no aprovechan la memoria.`, 'low_cache_hit');
  else setDiag('chart-cache-hit', 'ok', `Cache en ${tbl.toFixed(1)}% — excelente. La BD responde desde memoria casi siempre.`);
}

// ── Slow Queries ──
function renderSlowQueries(rows) {
  if (!rows.length) return;

  const last = rows[rows.length - 1];
  const maxSec = last.max_query_duration_sec || 0;
  const slowCount = last.queries_gt_30s || 0;
  const hasZombie = maxSec >= 3600;

  // Totales del período
  const totalSlow = rows.reduce((s, r) => s + (r.queries_gt_30s || 0), 0);
  const peakSlow = Math.max(...rows.map(r => r.queries_gt_30s || 0));
  const peakRow = rows.find(r => (r.queries_gt_30s || 0) === peakSlow);
  const peakTime = peakRow ? new Date(peakRow.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';

  if (hasZombie) {
    // MODO ZOMBIE: reemplazar gráfica con panel de stats (la gráfica temporal
    // solo muestra ceros y un spike — no aporta). El zombie se explica en el banner.
    const zombieHrs = (maxSec / 3600).toFixed(1);
    const wrap = document.getElementById('chart-slow-queries');
    if (wrap) {
      wrap.style.display = 'none';
      const card = wrap.closest('.chart-card');
      if (card) {
        let summary = card.querySelector('.slow-summary');
        if (!summary) {
          summary = document.createElement('div');
          summary.className = 'slow-summary';
          wrap.parentNode.insertBefore(summary, wrap);
        }
        summary.innerHTML = `
          <div class="slow-summary-grid">
            <div class="slow-stat slow-stat-crit">
              <div class="slow-stat-value">${zombieHrs}h</div>
              <div class="slow-stat-label">Zombie activo</div>
            </div>
            <div class="slow-stat">
              <div class="slow-stat-value">${slowCount}</div>
              <div class="slow-stat-label">Lentas ahora</div>
            </div>
            <div class="slow-stat">
              <div class="slow-stat-value">${totalSlow}</div>
              <div class="slow-stat-label">Total período</div>
            </div>
            <div class="slow-stat">
              <div class="slow-stat-value">${peakSlow}</div>
              <div class="slow-stat-label">Pico a las ${peakTime}</div>
            </div>
          </div>
        `;
      }
    }
  } else {
    // MODO NORMAL: restaurar gráfica + barras + línea de duración
    const wrap = document.getElementById('chart-slow-queries');
    if (wrap) {
      wrap.style.display = '';
      const card = wrap.closest('.chart-card');
      if (card) { const s = card.querySelector('.slow-summary'); if (s) s.remove(); }
    }
    const durMin = rows.map(r => Math.round((r.max_query_duration_sec || 0) / 60 * 10) / 10);
    mk('chart-slow-queries', { type: 'bar',
      data: { labels: lbl(rows), datasets: [
        { label: 'Ops lentas (>30s)', data: rows.map(r => r.queries_gt_30s), backgroundColor: C.red, borderRadius: 3, yAxisID: 'y', barPercentage: 0.6 },
        { label: 'Más lenta (min)', data: durMin, borderColor: C.yellow, backgroundColor: C.yellowA, type: 'line', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2, yAxisID: 'y1' },
      ]},
      options: opts({
        y: { ...scaleY, position: 'left', beginAtZero: true, title: { display: true, text: 'Cantidad', color: getScaleColors().tickColor, font: { size: 11 } } },
        y1: { ...scaleY, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Minutos', color: C.yellow, font: { size: 11 } } }
      }, { thresh: tl(30, C.yellow, '⚠ 30 min', 'end') })
    });
  }

  // Diagnóstico
  if (hasZombie) {
    setDiag('chart-slow-queries', 'crit',
      `TRANSACCIÓN ZOMBIE: Hay una operación atorada hace ${fmtDuration(maxSec)} sin hacer nada. ` +
      `Consume una conexión y puede causar bloqueos en cascada. ` +
      `Acción inmediata: matar con pg_terminate_backend().`, 'zombie_transaction');
  } else if (maxSec >= 300) {
    setDiag('chart-slow-queries', 'warn', `La operación más lenta lleva ${fmtDuration(maxSec)}. ${slowCount} operaciones llevan más de 30s. Revisar qué queries están tardando.`, 'slow_queries');
  } else if (slowCount > 0) {
    setDiag('chart-slow-queries', 'warn', `${slowCount} operaciones lentas (>30s), la más lenta: ${fmtDuration(maxSec)}. No es crítico pero hay queries por optimizar.`, 'slow_queries');
  } else {
    setDiag('chart-slow-queries', 'ok', `Sin operaciones lentas. La operación más lenta tomó ${fmtDuration(maxSec)}. Todo bien.`);
  }
}

// ── Locks ──
function renderLocks(rows) {
  if (!rows.length) return;
  mk('chart-locks', { type: 'bar',
    data: { labels: lbl(rows), datasets: [
      { label: 'Operaciones bloqueadas', data: rows.map(r => r.waiting_locks), backgroundColor: C.red, borderRadius: 2, barPercentage: 0.7 },
      { label: 'Transacciones abandonadas', data: rows.map(r => r.idle_in_tx_conns), backgroundColor: C.yellow, borderRadius: 2, barPercentage: 0.7 },
    ]},
    options: opts({ y: { ...scaleY, beginAtZero: true } }, { ok: tl(0, C.green, '✅ Ideal: 0') })
  });
  // Diagnóstico
  const last = rows[rows.length - 1];
  const locks = last.waiting_locks || 0;
  const idleTx = last.idle_in_tx_conns || 0;
  if (locks >= 5) setDiag('chart-locks', 'crit', `${locks} operaciones bloqueadas ahora mismo. Los usuarios están esperando. Posible deadlock o transacción zombie causando el bloqueo.`, 'waiting_locks');
  else if (locks >= 1) setDiag('chart-locks', 'warn', `${locks} operación bloqueada. ${idleTx > 0 ? `Hay ${idleTx} transacción abandonada que puede ser la causa.` : 'Monitorear si se repite.'}`, 'waiting_locks');
  else if (idleTx >= 1) setDiag('chart-locks', 'warn', `Sin bloqueos activos, pero hay ${idleTx} transacción abandonada (la app no cerró la conexión correctamente). Puede causar bloqueos en cualquier momento.`, 'zombie_transaction');
  else setDiag('chart-locks', 'ok', 'Sin bloqueos ni transacciones abandonadas. Todo limpio.');
}

// ── TPS ──
function renderTps(rows) {
  if (!rows.length) return;
  mk('chart-tps', { type: 'line',
    data: { labels: lbl(rows), datasets: [
      ds('Exitosas/segundo', rows.map(r => r.tps_commit || 0), C.green),
      ds('Fallidas/segundo', rows.map(r => r.tps_rollback || 0), C.red),
    ]},
    options: opts({})
  });
  // Diagnóstico
  const last = rows[rows.length - 1];
  const commits = last.tps_commit || 0;
  const rollbacks = last.tps_rollback || 0;
  const total = commits + rollbacks;
  const rollPct = total > 0 ? (rollbacks / total * 100) : 0;
  if (rollPct > 10) setDiag('chart-tps', 'crit', `${rollPct.toFixed(0)}% de operaciones fallan (${rollbacks.toFixed(0)} rollbacks/s vs ${commits.toFixed(0)} commits/s). Algo está causando muchos errores.`, 'high_rollbacks');
  else if (rollPct > 2) setDiag('chart-tps', 'warn', `${commits.toFixed(0)} ops/s exitosas, ${rollbacks.toFixed(1)} fallidas/s (${rollPct.toFixed(1)}% de fallo). Revisar logs de la aplicación.`, 'high_rollbacks');
  else setDiag('chart-tps', 'ok', `${commits.toFixed(0)} operaciones/s exitosas, tasa de fallo mínima. Rendimiento normal.`);
}

// ── TCP 5432 ──
function renderTcp5432(el18, el316) {
  mk('chart-tcp5432', { type: 'line',
    data: { labels: lbl(el18.length >= el316.length ? el18 : el316), datasets: [
      ds('El 18', el18.map(r => r.tcp5432_estab), C.blue),
      ds('El 3', el316.map(r => r.tcp5432_estab), C.orange),
    ]},
    options: opts({}, {
      warn: tl(60, C.yellow, '⚠ Alerta: 60'),
      crit: tl(100, C.red, '⛔ Crítico: 100', 'end'),
    })
  });
  // Diagnóstico
  const l18 = el18.length ? el18[el18.length - 1].tcp5432_estab : 0;
  const l316 = el316.length ? el316[el316.length - 1].tcp5432_estab : 0;
  const total = l18 + l316;
  if (total > 100) setDiag('chart-tcp5432', 'crit', `${total} conexiones a la BD (El 18: ${l18}, El 3: ${l316}). Demasiadas — hay riesgo de saturar la base de datos.`);
  else if (l18 > 60 || l316 > 60) setDiag('chart-tcp5432', 'warn', `Un servidor usa muchas conexiones (El 18: ${l18}, El 3: ${l316}). Revisar configuración de datasources.`);
  else setDiag('chart-tcp5432', 'ok', `El 18: ${l18} conexiones, El 3: ${l316} conexiones. Dentro del rango normal.`);
}

// ── Load Average ──
function renderLoad(el18, el316) {
  mk('chart-load', { type: 'line',
    data: { labels: lbl(el18.length >= el316.length ? el18 : el316), datasets: [
      ds('El 18 (1 min)', el18.map(r => r.load_1), C.blue),
      ds('El 18 (5 min)', el18.map(r => r.load_5), C.blue, null, { borderDash: [4,4], borderWidth: 1 }),
      ds('El 3 (1 min)', el316.map(r => r.load_1), C.orange),
      ds('El 3 (5 min)', el316.map(r => r.load_5), C.orange, null, { borderDash: [4,4], borderWidth: 1 }),
    ]},
    options: opts({}, {
      cores: tl(8, C.yellow, '⚠ 8 = capacidad máxima'),
      crit: tl(16, C.red, '⛔ 16 = saturación severa', 'end'),
    })
  });
  const l18 = el18.length ? el18[el18.length - 1].load_1 : 0;
  const l316 = el316.length ? el316[el316.length - 1].load_1 : 0;
  const max = Math.max(l18, l316);
  if (max > 16) setDiag('chart-load', 'crit', `Carga en ${max.toFixed(1)} — saturación severa (capacidad: 8). Las tareas se acumulan en cola y el servidor no alcanza.`);
  else if (max > 8) setDiag('chart-load', 'warn', `Carga en ${max.toFixed(1)} — por encima de la capacidad (8 cores). El 18: ${l18.toFixed(1)}, El 3: ${l316.toFixed(1)}.`);
  else setDiag('chart-load', 'ok', `El 18: ${l18.toFixed(1)}, El 3: ${l316.toFixed(1)}. Dentro de la capacidad del servidor (8 cores).`);
}

// ── Disk Gauges (visual intuitivo) ──
function renderDiskGauges(el18, el316) {
  const disks = [
    { label: 'El 18 — Disco Principal', pct: el18 ? el18.disk_root_pct : 0 },
    { label: 'El 18 — /tmp', pct: el18 ? el18.disk_tmp_pct : 0 },
    { label: 'El 3 — Disco Principal', pct: el316 ? el316.disk_root_pct : 0 },
    { label: 'El 3 — /tmp', pct: el316 ? el316.disk_tmp_pct : 0 },
  ];

  const container = document.getElementById('disk-gauges');
  if (!container) return;

  container.innerHTML = disks.map(d => {
    const color = d.pct >= 85 ? C.red : d.pct >= 75 ? C.yellow : C.green;
    const status = d.pct >= 85 ? 'CRÍTICO' : d.pct >= 75 ? 'ALERTA' : 'OK';
    const freeGB = (32 * (100 - d.pct) / 100).toFixed(1);
    return `
      <div class="gauge-card">
        <div class="gauge-label">${d.label}</div>
        <div class="gauge-bar-bg">
          <div class="gauge-bar-fill" style="width:${d.pct}%; background:${color}"></div>
          <div class="gauge-bar-mark" style="left:75%; background:${C.yellow}"></div>
          <div class="gauge-bar-mark" style="left:85%; background:${C.red}"></div>
        </div>
        <div class="gauge-value" style="color:${color}">${d.pct}%</div>
        <div class="gauge-detail">~${freeGB} GB libres · <b style="color:${color}">${status}</b></div>
      </div>
    `;
  }).join('');
}

// ── JBoss CPU % ──
function renderJbossCpu(el18, el316) {
  mk('chart-jboss-cpu', { type: 'line',
    data: { labels: lbl(el18.length >= el316.length ? el18 : el316), datasets: [
      ds('El 18', el18.map(r => r.jboss_cpu_pct || 0), C.blue, C.blueA),
      ds('El 3', el316.map(r => r.jboss_cpu_pct || 0), C.orange, C.orangeA),
    ]},
    options: opts({ y: { ...scaleY, max: 100 } }, {
      warn: tl(70, C.yellow, '⚠ Alerta: 70%'),
      crit: tl(90, C.red, '⛔ Crítico: 90%', 'end'),
    })
  });
  const c18 = el18.length ? el18[el18.length - 1].jboss_cpu_pct || 0 : 0;
  const c316 = el316.length ? el316[el316.length - 1].jboss_cpu_pct || 0 : 0;
  const max = Math.max(c18, c316);
  const t18 = el18.length ? el18[el18.length - 1].jboss_threads || 0 : 0;
  const t316 = el316.length ? el316[el316.length - 1].jboss_threads || 0 : 0;
  const maxThreads = Math.max(t18, t316);
  if (max > 90) setDiag('chart-jboss-cpu', 'crit', `LABSIS consume ${max.toFixed(0)}% del CPU — la aplicación está saturada.`, 'high_cpu');
  else if (max > 70) setDiag('chart-jboss-cpu', 'warn', `LABSIS consume ${max.toFixed(0)}% del CPU. El 18: ${c18.toFixed(0)}%, El 3: ${c316.toFixed(0)}%.`, 'high_cpu');
  else if (maxThreads > 150 && max < 30) setDiag('chart-jboss-cpu', 'warn', `CPU de LABSIS bajo (${max.toFixed(0)}%) pero threads altos (${maxThreads}). Los threads están esperando I/O de la base de datos.`);
  else setDiag('chart-jboss-cpu', 'ok', `El 18: ${c18.toFixed(0)}%, El 3: ${c316.toFixed(0)}%. Uso normal del procesador por la aplicación.`);
}

// ── Disk I/O ──
function renderDiskIO(el18, el316) {
  // Convertir sectores (512 bytes) a MB
  const toMB = v => (v * 512) / (1024 * 1024);
  mk('chart-disk-io', { type: 'line',
    data: { labels: lbl(el18.length >= el316.length ? el18 : el316), datasets: [
      ds('El 18 Lectura', el18.map(r => toMB(r.diskio_read_delta || 0)), C.blue),
      ds('El 18 Escritura', el18.map(r => toMB(r.diskio_write_delta || 0)), C.cyan),
      ds('El 3 Lectura', el316.map(r => toMB(r.diskio_read_delta || 0)), C.orange),
      ds('El 3 Escritura', el316.map(r => toMB(r.diskio_write_delta || 0)), C.yellow),
    ]},
    options: opts({ y: { ...scaleY, beginAtZero: true, title: { display: true, text: 'MB', color: getScaleColors().tickColor, font: { size: 11 } } } })
  });
  const r18 = el18.length ? toMB((el18[el18.length-1].diskio_read_delta||0) + (el18[el18.length-1].diskio_write_delta||0)) : 0;
  const r316 = el316.length ? toMB((el316[el316.length-1].diskio_read_delta||0) + (el316[el316.length-1].diskio_write_delta||0)) : 0;
  const max = Math.max(r18, r316);
  if (max > 500) setDiag('chart-disk-io', 'crit', `Actividad de disco en ${max.toFixed(0)} MB — posible backup o query pesado leyendo mucha data.`);
  else if (max > 100) setDiag('chart-disk-io', 'warn', `Actividad de disco en ${max.toFixed(0)} MB. El 18: ${r18.toFixed(0)} MB, El 3: ${r316.toFixed(0)} MB.`);
  else setDiag('chart-disk-io', 'ok', `Actividad de disco normal. El 18: ${r18.toFixed(1)} MB, El 3: ${r316.toFixed(1)} MB.`);
}

// ── Network ──
function renderNetwork(el18, el316) {
  // Convertir bytes a Mbps (asumiendo intervalo de ~5 min = 300s)
  const toMbps = v => (v * 8) / (300 * 1000000);
  mk('chart-network', { type: 'line',
    data: { labels: lbl(el18.length >= el316.length ? el18 : el316), datasets: [
      ds('El 18 Entrada', el18.map(r => toMbps(r.net_rx_delta || 0)), C.blue, C.blueA),
      ds('El 18 Salida', el18.map(r => toMbps(r.net_tx_delta || 0)), C.cyan),
      ds('El 3 Entrada', el316.map(r => toMbps(r.net_rx_delta || 0)), C.orange, C.orangeA),
      ds('El 3 Salida', el316.map(r => toMbps(r.net_tx_delta || 0)), C.yellow),
    ]},
    options: opts({ y: { ...scaleY, beginAtZero: true, title: { display: true, text: 'Mbps', color: getScaleColors().tickColor, font: { size: 11 } } } })
  });
  const rx18 = el18.length ? toMbps(el18[el18.length-1].net_rx_delta||0) : 0;
  const rx316 = el316.length ? toMbps(el316[el316.length-1].net_rx_delta||0) : 0;
  const max = Math.max(rx18, rx316);
  if (max > 100) setDiag('chart-network', 'crit', `Tráfico de red en ${max.toFixed(0)} Mbps — posible transfer masivo o ataque.`);
  else if (max > 50) setDiag('chart-network', 'warn', `Tráfico alto: El 18: ${rx18.toFixed(1)} Mbps, El 3: ${rx316.toFixed(1)} Mbps.`);
  else setDiag('chart-network', 'ok', `Tráfico normal. El 18: ${rx18.toFixed(1)} Mbps, El 3: ${rx316.toFixed(1)} Mbps.`);
}

// ── Deadlocks ──
function renderDeadlocks(rows) {
  if (!rows.length) return;
  mk('chart-deadlocks', { type: 'bar',
    data: { labels: lbl(rows), datasets: [
      { label: 'Deadlocks', data: rows.map(r => r.deadlocks_delta || 0), backgroundColor: C.red, borderRadius: 3, barPercentage: 0.6 },
    ]},
    options: opts({ y: { ...scaleY, beginAtZero: true } }, { ok: tl(0, C.green, '✅ Ideal: 0') })
  });
  const last = rows[rows.length - 1];
  const dl = last.deadlocks_delta || 0;
  const total = rows.reduce((s, r) => s + (r.deadlocks_delta || 0), 0);
  if (dl > 0) setDiag('chart-deadlocks', 'crit', `${dl} deadlock(s) en el último intervalo. Total en período: ${total}. Hay bugs de concurrencia que el equipo de desarrollo debe corregir.`);
  else if (total > 0) setDiag('chart-deadlocks', 'warn', `Sin deadlocks ahora, pero hubo ${total} en el período mostrado. Revisar qué transacciones colisionan.`);
  else setDiag('chart-deadlocks', 'ok', 'Sin deadlocks. Las transacciones no están entrando en conflicto.');
}

// ── Temp Files ──
function renderTempFiles(rows) {
  if (!rows.length) return;
  const toMB = v => v / (1024 * 1024);
  mk('chart-temp-files', { type: 'bar',
    data: { labels: lbl(rows), datasets: [
      { label: 'Archivos temporales', data: rows.map(r => r.temp_files_delta || 0), backgroundColor: C.orange, borderRadius: 3, barPercentage: 0.6, yAxisID: 'y' },
      { label: 'Tamaño (MB)', data: rows.map(r => toMB(r.temp_bytes_delta || 0)), borderColor: C.purple, backgroundColor: C.purpleA, type: 'line', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: 'y1' },
    ]},
    options: opts({
      y: { ...scaleY, position: 'left', beginAtZero: true, title: { display: true, text: 'Archivos', color: getScaleColors().tickColor, font: { size: 11 } } },
      y1: { ...scaleY, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'MB', color: C.purple, font: { size: 11 } } }
    })
  });
  const last = rows[rows.length - 1];
  const tf = last.temp_files_delta || 0;
  const tb = toMB(last.temp_bytes_delta || 0);
  if (tb > 100) setDiag('chart-temp-files', 'crit', `${tf} archivos temporales generados (${tb.toFixed(0)} MB). Queries están usando disco en vez de memoria. Aumentar work_mem.`, 'high_temp_files');
  else if (tf > 0) setDiag('chart-temp-files', 'warn', `${tf} archivos temporales (${tb.toFixed(1)} MB). Algunos queries no caben en work_mem.`, 'high_temp_files');
  else setDiag('chart-temp-files', 'ok', 'Sin archivos temporales. Los queries caben en la memoria asignada.');
}

function renderAllCharts(data) {
  renderCpuChart('chart-cpu-el18', data.el18);
  renderCpuChart('chart-cpu-el316', data.el316);
  renderMemChart('chart-mem-el18', data.el18);
  renderMemChart('chart-mem-el316', data.el316);
  renderJbossRss(data.el18, data.el316);
  renderJbossThreads(data.el18, data.el316);
  renderJbossCpu(data.el18, data.el316);
  renderTcp8080('chart-tcp8080-el18', data.el18);
  renderTcp8080('chart-tcp8080-el316', data.el316);
  renderDbConns(data.rds);
  renderCacheHit(data.rds);
  renderSlowQueries(data.rds);
  renderLocks(data.rds);
  renderTps(data.rds);
  renderDeadlocks(data.rds);
  renderTempFiles(data.rds);
  renderTcp5432(data.el18, data.el316);
  renderLoad(data.el18, data.el316);
  renderDiskGauges(lastItem(data.el18), lastItem(data.el316));
  renderDiskIO(data.el18, data.el316);
  renderNetwork(data.el18, data.el316);
}
