// Renderizado de cards BGWriter y WAL en tab Base de Datos

function formatLargeNum(val) {
  if (!val && val !== 0) return '0';
  if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  return val.toString();
}

async function renderBgwriterCard() {
  const el = document.getElementById('bgwriter-card');
  if (!el) return;

  try {
    const res = await authFetch('api/bgwriter-stats');
    const d = await res.json();
    if (!d || !d.checkpoints_timed) {
      el.innerHTML = '<div style="color:var(--text3)">Sin datos de bgwriter disponibles</div>';
      return;
    }

    const totalCp = d.checkpoints_timed + d.checkpoints_req;
    const reqPct = d.checkpoints_req_pct || 0;
    const reqColor = reqPct > 10 ? 'var(--red, #ef4444)' : reqPct > 5 ? 'var(--yellow, #f59e0b)' : 'var(--green, #10b981)';

    const totalBuf = d.buffers_checkpoint + d.buffers_clean + d.buffers_backend;
    const backendPct = totalBuf > 0 ? ((d.buffers_backend / totalBuf) * 100).toFixed(1) : 0;
    const backendColor = backendPct > 20 ? 'var(--red, #ef4444)' : backendPct > 5 ? 'var(--yellow, #f59e0b)' : 'var(--green, #10b981)';

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Checkpoints</div>
          <div style="font-size:22px;font-weight:700;color:var(--text1)">${formatLargeNum(totalCp)}</div>
          <div style="font-size:12px;margin-top:4px">
            <span style="color:var(--green, #10b981)">${formatLargeNum(d.checkpoints_timed)} programados</span>
            <span style="margin-left:8px;color:${reqColor}">${formatLargeNum(d.checkpoints_req)} forzados (${reqPct}%)</span>
          </div>
          ${reqPct > 5 ? '<div style="font-size:11px;color:var(--yellow);margin-top:6px">Considerar aumentar max_wal_size</div>' : ''}
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Buffers escritos</div>
          <div style="font-size:22px;font-weight:700;color:var(--text1)">${formatLargeNum(totalBuf)}</div>
          <div style="font-size:12px;margin-top:4px">
            <span>Checkpoint: ${formatLargeNum(d.buffers_checkpoint)}</span>
            <span style="margin-left:8px">Clean: ${formatLargeNum(d.buffers_clean)}</span>
            <span style="margin-left:8px;color:${backendColor}">Backend: ${formatLargeNum(d.buffers_backend)} (${backendPct}%)</span>
          </div>
          ${backendPct > 20 ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Backends escriben mucho a disco — bgwriter no alcanza</div>' : ''}
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:10px;text-align:right">Stats acumulados desde hace ${d.hours_since_reset.toFixed(0)}h</div>
    `;
  } catch (e) {
    el.innerHTML = '<div style="color:var(--text3)">Error cargando bgwriter stats</div>';
  }
}

async function renderWalCard() {
  const el = document.getElementById('wal-card');
  if (!el) return;

  try {
    const res = await authFetch('api/wal-stats');
    const d = await res.json();
    if (!d || !d.wal_records) {
      el.innerHTML = '<div style="color:var(--text3)">Sin datos de WAL disponibles (requiere PG14+)</div>';
      return;
    }

    const syncColor = d.wal_sync_time_ms > 60000 ? 'var(--red)' : d.wal_sync_time_ms > 10000 ? 'var(--yellow)' : 'var(--green)';
    const fpiPct = d.wal_records > 0 ? ((d.wal_fpi / d.wal_records) * 100).toFixed(2) : 0;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">WAL Total / Tasa</div>
          <div style="font-size:22px;font-weight:700;color:var(--text1)">${d.wal_gb} GB</div>
          <div style="font-size:14px;color:var(--blue, #3b82f6);margin-top:2px">${d.wal_mb_per_hour} MB/hora</div>
          <div style="font-size:12px;color:var(--text3);margin-top:4px">${formatLargeNum(d.wal_records)} registros WAL</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Performance I/O</div>
          <div style="font-size:12px;margin-top:4px">
            <div style="margin-bottom:4px">Write time: <span style="font-weight:600">${(d.wal_write_time_ms / 1000).toFixed(1)}s</span></div>
            <div style="margin-bottom:4px">Sync time: <span style="font-weight:600;color:${syncColor}">${(d.wal_sync_time_ms / 1000).toFixed(1)}s</span></div>
            <div style="margin-bottom:4px">Full Page Images: <span style="font-weight:600">${formatLargeNum(d.wal_fpi)}</span> (${fpiPct}%)</div>
            <div>Buffer overflows: <span style="font-weight:600;color:${d.wal_buffers_full > 0 ? 'var(--yellow)' : 'var(--green)'}">${formatLargeNum(d.wal_buffers_full)}</span></div>
          </div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:10px;text-align:right">Stats acumulados desde hace ${d.hours_since_reset.toFixed(0)}h</div>
    `;
  } catch (e) {
    el.innerHTML = '<div style="color:var(--text3)">Error cargando WAL stats</div>';
  }
}

// Cargar cuando se muestra el tab de BD
function loadDbInsights() {
  renderBgwriterCard();
  renderWalCard();
}
