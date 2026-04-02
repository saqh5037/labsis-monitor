// Servers View — Vista consolidada de servidores con JBoss prominente
// Muestra cards detalladas por servidor con todas las metricas

function renderServersView(data) {
  const container = document.getElementById('servers-view-container');
  if (!container) return;

  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];
  const hasData = servers.some(srv => data[srv.id] && data[srv.id].length);
  if (!hasData) {
    container.innerHTML = '<div class="no-data">Esperando datos de servidores...</div>';
    return;
  }

  container.innerHTML = servers.map(srv => {
    const row = lastItem(data[srv.id]);
    if (!row) return '';

    const cpu = 100 - (row.cpu_idle || 100);
    const mem = row.mem_total_mb > 0 ? (row.mem_used_mb / row.mem_total_mb * 100) : 0;
    const memFreeGB = ((row.mem_total_mb - row.mem_used_mb) / 1024).toFixed(1);
    const jbossGB = ((row.jboss_rss_mb || 0) / 1024).toFixed(1);
    const jbossMax = srv.heapGB || 12;
    const jbossPct = Math.min(((row.jboss_rss_mb || 0) / 1024 / jbossMax) * 100, 100);
    const threads = row.jboss_threads || 0;
    const jbossCpu = row.jboss_cpu_pct || 0;
    const tcp8080 = row.tcp8080_estab || 0;
    const tcpClose = row.tcp8080_closewait || 0;
    const tcp5432 = row.tcp5432_estab || 0;
    const disk = row.disk_root_pct || 0;
    const diskFreeGB = (srv.diskGB * (100 - disk) / 100).toFixed(1);
    const load1 = row.load_1 || 0;
    const load5 = row.load_5 || 0;
    const cores = srv.cpuCores || 4;

    function lvl(v, w, c) { return v >= c ? 'crit' : v >= w ? 'warn' : 'ok'; }
    function dotCls() {
      if (cpu > 85 || mem > 92 || disk >= 85) return 'dot-crit';
      if (cpu > 70 || mem > 85 || disk >= 75) return 'dot-warn';
      return 'dot-ok';
    }

    function metricRow(label, value, unit, level) {
      const cls = level === 'crit' ? 'svm-crit' : level === 'warn' ? 'svm-warn' : 'svm-ok';
      return `<div class="svm-row">
        <span class="svm-label">${label}</span>
        <span class="svm-value ${cls}">${value}</span>
        <span class="svm-unit">${unit}</span>
      </div>`;
    }

    return `
    <div class="srv-detail-card">
      <div class="srv-detail-header">
        <span class="srv-dot ${dotCls()}"></span>
        <div class="srv-detail-title">
          <strong>${srv.name}</strong>
          <span>${srv.host || ''}</span>
        </div>
      </div>

      <div class="srv-detail-sections">
        <details class="srv-section" open>
          <summary class="srv-section-header jboss">
            <i data-lucide="cpu"></i> JBoss / Aplicacion
          </summary>
          <div class="srv-section-body">
            ${metricRow('RSS Memoria', jbossGB, `GB / ${jbossMax} GB`, lvl(jbossPct, 75, 90))}
            ${metricRow('Threads', threads, 'activos', lvl(threads, 200, 300))}
            ${metricRow('CPU Proceso', jbossCpu.toFixed(1), '%', lvl(jbossCpu, 50, 80))}
            ${metricRow('Conexiones HTTP', tcp8080, 'established', lvl(tcp8080, 80, 150))}
            ${metricRow('CLOSE_WAIT', tcpClose, tcpClose > 0 ? 'atoradas' : '', lvl(tcpClose, 5, 20))}
            ${metricRow('Conexiones BD', tcp5432, 'established', lvl(tcp5432, 40, 60))}
          </div>
        </details>

        <details class="srv-section">
          <summary class="srv-section-header system">
            <i data-lucide="activity"></i> Sistema
          </summary>
          <div class="srv-section-body">
            ${metricRow('CPU', cpu.toFixed(0), '%', lvl(cpu, 70, 85))}
            ${metricRow('Memoria', mem.toFixed(0), `% (${memFreeGB} GB libres)`, lvl(mem, 85, 92))}
            ${metricRow('Disco', disk, `% (${diskFreeGB} GB libres)`, lvl(disk, 75, 85))}
            ${metricRow('Load Avg', load1.toFixed(1) + ' / ' + load5.toFixed(1), `(${cores} cores)`, lvl(load1, cores, cores * 2))}
          </div>
        </details>
      </div>
    </div>`;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
}
