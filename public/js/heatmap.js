// Heatmap — patrón de carga semanal via Canvas 2D

const HEATMAP_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun..Dom
const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Métricas donde valor bajo = malo (invertir colores)
const INVERTED_METRICS = ['cache_hit_table_pct'];

function heatmapColor(value, min, max, inverted) {
  if (value === null || value === undefined) return 'rgba(148,163,184,.1)';
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  const r = inverted ? ratio : (1 - ratio);
  // verde (bueno) → amarillo → rojo (malo)
  const red = Math.round(r < 0.5 ? r * 2 * 255 : 255);
  const green = Math.round(r < 0.5 ? 255 : (1 - r) * 2 * 255);
  return `rgba(${red},${green},60,.85)`;
}

async function loadHeatmap() {
  const canvas = document.getElementById('heatmap-canvas');
  if (!canvas) return;
  const select = document.getElementById('heatmap-metric');
  const metric = select ? select.value : 'active_conns';

  try {
    const res = await authFetch(`api/heatmap?metric=${metric}&days=14`);
    const data = await res.json();
    renderHeatmapCanvas(canvas, data, metric);
  } catch (e) {
    console.error('[Heatmap] Error:', e);
  }
}

function renderHeatmapCanvas(canvas, data, metric) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth || 900;
  const h = 280;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const inverted = INVERTED_METRICS.includes(metric);
  const labelW = 40;
  const labelH = 25;
  const cellW = (w - labelW - 10) / 24;
  const cellH = (h - labelH - 10) / 7;

  // Build 7x24 matrix (rows=DOW_ORDER, cols=0-23)
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(null));
  data.forEach(d => {
    const row = DOW_ORDER.indexOf(d.dow);
    if (row >= 0 && d.hour >= 0 && d.hour < 24) matrix[row][d.hour] = d.avg_val;
  });

  const values = data.map(d => d.avg_val).filter(v => v != null);
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;

  const textColor = getCSSVar('--text2') || '#94a3b8';
  const borderColor = getCSSVar('--border') || '#334155';

  // Draw hour labels
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  for (let h = 0; h < 24; h++) {
    ctx.fillText(h.toString().padStart(2, '0'), labelW + h * cellW + cellW / 2, 12);
  }

  // Draw cells and day labels
  for (let row = 0; row < 7; row++) {
    const y = labelH + row * cellH;

    // Day label
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.fillText(DOW_LABELS[row], labelW - 6, y + cellH / 2 + 4);

    for (let col = 0; col < 24; col++) {
      const x = labelW + col * cellW;
      const val = matrix[row][col];

      // Cell background
      ctx.fillStyle = heatmapColor(val, minVal, maxVal, inverted);
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Cell border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Value text (if cells are big enough)
      if (cellW > 30 && val !== null) {
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(val.toFixed(val >= 10 ? 0 : 1), x + cellW / 2, y + cellH / 2 + 3);
      }
    }
  }

  // Tooltip
  setupHeatmapTooltip(canvas, matrix, minVal, maxVal, metric, labelW, labelH, cellW, cellH);
}

function setupHeatmapTooltip(canvas, matrix, minVal, maxVal, metric, labelW, labelH, cellW, cellH) {
  const tooltip = document.getElementById('heatmap-tooltip');
  if (!tooltip) return;

  const METRIC_LABELS = {
    active_conns: 'Conexiones activas',
    total_connections: 'Conexiones totales',
    tps_commit: 'TPS (commits/s)',
    max_query_duration_sec: 'Duración máx query (s)',
    queries_gt_30s: 'Queries >30s',
    cache_hit_table_pct: 'Cache hit %',
    idle_in_tx_conns: 'Transacciones zombie',
    waiting_locks: 'Bloqueos',
    blk_read_rate: 'I/O Lectura BD (bloques/s)',
    blk_write_rate: 'I/O Escritura BD (bloques/s)',
  };

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor((x - labelW) / cellW);
    const row = Math.floor((y - labelH) / cellH);

    if (col >= 0 && col < 24 && row >= 0 && row < 7) {
      const val = matrix[row][col];
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
      tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
      tooltip.innerHTML = `
        <div style="font-weight:600">${DOW_LABELS[row]} ${col.toString().padStart(2, '0')}:00-${col.toString().padStart(2, '0')}:59</div>
        <div>${METRIC_LABELS[metric] || metric}: <strong>${val !== null ? val.toFixed(2) : 'N/A'}</strong></div>
      `;
    } else {
      tooltip.style.display = 'none';
    }
  };

  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}
