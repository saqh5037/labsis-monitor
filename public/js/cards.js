// Tarjetas resumen con semáforos + texto de estado claro

const STATUS_TEXT = {
  green: '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;background:#ecfdf5;color:#059669;letter-spacing:.3px">OK</span>',
  yellow: '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;background:#fffbeb;color:#d97706;letter-spacing:.3px">ALERTA</span>',
  red: '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;background:#fef2f2;color:#dc2626;letter-spacing:.3px">CRÍTICO</span>',
};

function getStatusCSS() {
  return {
    green: `color: ${getCSSVar('--green') || '#10b981'}`,
    yellow: `color: ${getCSSVar('--yellow') || '#f59e0b'}`,
    red: `color: ${getCSSVar('--red') || '#ef4444'}`,
  };
}
const STATUS_CSS = getStatusCSS();

function renderCards(data) {
  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];
  const rds = lastItem(data.rds);
  const cards = [];

  // Per-server cards: CPU, RAM, Disco
  servers.forEach(srv => {
    const row = lastItem(data[srv.id]);
    if (!row) return;

    // CPU
    const cpuUsed = (100 - row.cpu_idle).toFixed(1);
    const cpuSt = getStatusColor('cpu_idle', row.cpu_idle);
    cards.push({
      label: `CPU — ${srv.name}`,
      value: cpuUsed + '%',
      status: cpuSt,
      detail: `Uso: ${row.cpu_user}% · Steal: ${row.cpu_steal}%`,
      context: cpuSt === 'green' ? 'Funcionando bien' : cpuSt === 'yellow' ? 'Algo saturado' : 'Muy saturado',
    });

    // RAM
    const memPct = ((row.mem_used_mb / row.mem_total_mb) * 100).toFixed(0);
    const memSt = getStatusColor('mem_used_pct', parseFloat(memPct));
    cards.push({
      label: `RAM — ${srv.name}`,
      value: memPct + '%',
      status: memSt,
      detail: `${formatMB(row.mem_used_mb)} de ${formatMB(row.mem_total_mb)}`,
      context: memSt === 'green' ? 'Suficiente' : memSt === 'yellow' ? 'Vigilar' : 'Sin margen',
    });

    // Disco
    const diskSt = getStatusColor('disk_pct', row.disk_root_pct);
    cards.push({
      label: `Disco — ${srv.name}`,
      value: row.disk_root_pct + '%',
      status: diskSt,
      detail: `~${Math.round(srv.diskGB * (100 - row.disk_root_pct) / 100)} GB libres`,
      context: diskSt === 'green' ? 'Espacio OK' : diskSt === 'yellow' ? 'Poco espacio' : 'Zona de peligro',
    });
  });

  // BD cards
  if (rds) {
    const st = getStatusColor('total_connections', rds.total_connections);
    cards.push({
      label: 'Conexiones BD',
      value: rds.total_connections,
      status: st,
      detail: `Trabajando: ${rds.active_conns} · Abandonadas: ${rds.idle_in_tx_conns}`,
      context: `Abandonadas debe ser 0`,
    });
  }

  if (rds) {
    const st = getStatusColor('cache_hit_table_pct', rds.cache_hit_table_pct);
    cards.push({
      label: 'Cache Hit',
      value: rds.cache_hit_table_pct + '%',
      status: st,
      detail: `Eficiencia de índices: ${rds.cache_hit_index_pct}%`,
      context: st === 'green' ? 'Velocidad óptima (>99%)' : 'Lento — debe ser >99%',
    });
  }

  const grid = document.getElementById('cards-grid');
  grid.innerHTML = cards.map(c => `
    <div class="card">
      <div class="card-header">
        <div class="card-dot ${c.status}"></div>
        <div class="card-label">${c.label}</div>
        <div class="card-status" style="${STATUS_CSS[c.status]}">${STATUS_TEXT[c.status]}</div>
      </div>
      <div class="card-value">${c.value}</div>
      <div class="card-detail">${c.detail}</div>
      <div class="card-context">${c.context}</div>
    </div>
  `).join('');

  if (!cards.length) {
    grid.innerHTML = '<div class="no-data" style="grid-column:1/-1">Esperando datos...</div>';
  }
}
