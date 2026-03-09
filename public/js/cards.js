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
  const el18 = lastItem(data.el18);
  const el316 = lastItem(data.el316);
  const rds = lastItem(data.rds);
  const cards = [];

  if (el18) {
    const cpuUsed = (100 - el18.cpu_idle).toFixed(1);
    const st = getStatusColor('cpu_idle', el18.cpu_idle);
    cards.push({
      label: 'CPU — El 18',
      value: cpuUsed + '%',
      status: st,
      detail: `Uso: ${el18.cpu_user}% · AWS steal: ${el18.cpu_steal}%`,
      context: st === 'green' ? 'Funcionando bien' : st === 'yellow' ? 'Algo saturado' : 'Muy saturado',
    });
  }

  if (el316) {
    const cpuUsed = (100 - el316.cpu_idle).toFixed(1);
    const st = getStatusColor('cpu_idle', el316.cpu_idle);
    cards.push({
      label: 'CPU — El 3',
      value: cpuUsed + '%',
      status: st,
      detail: `Uso: ${el316.cpu_user}% · AWS steal: ${el316.cpu_steal}%`,
      context: st === 'green' ? 'Funcionando bien' : st === 'yellow' ? 'Algo saturado' : 'Muy saturado',
    });
  }

  if (el18) {
    const pct = ((el18.mem_used_mb / el18.mem_total_mb) * 100).toFixed(0);
    const st = getStatusColor('mem_used_pct', parseFloat(pct));
    cards.push({
      label: 'RAM — El 18',
      value: pct + '%',
      status: st,
      detail: `${formatMB(el18.mem_used_mb)} de ${formatMB(el18.mem_total_mb)}`,
      context: st === 'green' ? 'Suficiente' : st === 'yellow' ? 'Vigilar' : 'Sin margen',
    });
  }

  if (el316) {
    const pct = ((el316.mem_used_mb / el316.mem_total_mb) * 100).toFixed(0);
    const st = getStatusColor('mem_used_pct', parseFloat(pct));
    cards.push({
      label: 'RAM — El 3',
      value: pct + '%',
      status: st,
      detail: `${formatMB(el316.mem_used_mb)} de ${formatMB(el316.mem_total_mb)}`,
      context: st === 'green' ? 'Suficiente' : st === 'yellow' ? 'Vigilar' : 'Sin margen',
    });
  }

  if (rds) {
    const st = getStatusColor('total_connections', rds.total_connections);
    cards.push({
      label: 'Conexiones BD',
      value: rds.total_connections,
      status: st,
      detail: `Trabajando: ${rds.active_conns} · Abandonadas: ${rds.idle_in_tx_conns}`,
      context: `Máx permitido: 839 · Abandonadas debe ser 0`,
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

  if (el18) {
    const st = getStatusColor('disk_pct', el18.disk_root_pct);
    cards.push({
      label: 'Disco — El 18',
      value: el18.disk_root_pct + '%',
      status: st,
      detail: `~${Math.round(32 * (100 - el18.disk_root_pct) / 100)} GB libres`,
      context: st === 'green' ? 'Espacio OK' : st === 'yellow' ? 'Poco espacio' : 'Zona de peligro',
    });
  }

  if (el316) {
    const st = getStatusColor('disk_pct', el316.disk_root_pct);
    cards.push({
      label: 'Disco — El 3',
      value: el316.disk_root_pct + '%',
      status: st,
      detail: `~${Math.round(32 * (100 - el316.disk_root_pct) / 100)} GB libres`,
      context: st === 'green' ? 'Espacio OK' : st === 'yellow' ? 'Poco espacio' : 'Zona de peligro',
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
