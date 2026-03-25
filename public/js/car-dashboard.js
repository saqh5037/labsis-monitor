// car-dashboard.js — Car-style dashboard for individual server

let carGauges = {};
let carServerId = null;
let carSparkCpu = null;
let carSparkRam = null;

function renderCarDashboard(serverId) {
  carServerId = serverId;
  const container = document.getElementById('car-dashboard-container');
  if (!container) return;

  // Find server info
  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];
  const srv = servers.find(s => s.id === serverId);
  const serverName = srv ? srv.name : serverId;
  const serverIP = srv ? (srv.ip || '') : '';

  // Build layout
  let html = '';

  // Header
  html += `<div class="car-header">
    <button class="car-back-btn" onclick="setView('overview')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      Volver
    </button>
    <div class="car-server-info">
      <h2 class="car-server-name">${serverName}</h2>
      ${serverIP ? `<span class="ip-badge">${serverIP}</span>` : ''}
      <span class="car-live-dot" id="car-live-dot" title="Datos en tiempo real"></span>
      <span class="car-uptime" id="car-uptime">—</span>
    </div>
  </div>`;

  // Main content: gauges left + sidebar right
  html += '<div class="car-main-layout">';

  // Left: Gauges 3x2
  html += '<div class="car-gauges-grid">';
  html += '<div class="car-gauge-slot" id="gauge-cpu"></div>';
  html += '<div class="car-gauge-slot" id="gauge-ram"></div>';
  html += '<div class="car-gauge-slot" id="gauge-disk"></div>';
  html += '<div class="car-gauge-slot" id="gauge-load"></div>';
  html += '<div class="car-gauge-slot" id="gauge-threads"></div>';
  html += '<div class="car-gauge-slot" id="gauge-connections"></div>';
  html += '</div>';

  // Right sidebar: sparklines + quick stats stacked
  html += '<div class="car-sidebar">';
  html += '<div class="car-spark-card"><div class="car-spark-title">CPU - Última hora</div><div class="car-spark-wrap"><canvas id="spark-cpu"></canvas></div></div>';
  html += '<div class="car-spark-card"><div class="car-spark-title">RAM - Última hora</div><div class="car-spark-wrap"><canvas id="spark-ram"></canvas></div></div>';
  html += '<div class="car-quick-stats" id="car-quick-stats"></div>';
  html += '</div>';

  html += '</div>'; // car-main-layout

  container.innerHTML = html;

  // Initialize gauges — fixed internal size, CSS handles responsive
  const gaugeSize = 180;

  // Adjust load max based on server cores
  const loadPreset = { ...GAUGE_PRESETS.load };
  if (srv?.cpuCores) {
    const cores = parseInt(srv.cpuCores) || 8;
    loadPreset.max = cores * 2;
    loadPreset.thresholds = [
      { value: cores, color: 'var(--green)' },
      { value: cores * 1.5, color: 'var(--yellow)' },
      { value: cores * 2, color: 'var(--red)' },
    ];
  }

  carGauges = {
    cpu: new SVGGauge('gauge-cpu', { ...GAUGE_PRESETS.cpu, size: gaugeSize }),
    ram: new SVGGauge('gauge-ram', { ...GAUGE_PRESETS.ram, size: gaugeSize }),
    disk: new SVGGauge('gauge-disk', { ...GAUGE_PRESETS.disk, size: gaugeSize }),
    load: new SVGGauge('gauge-load', { ...loadPreset, size: gaugeSize }),
    threads: new SVGGauge('gauge-threads', { ...GAUGE_PRESETS.threads, size: gaugeSize }),
    connections: new SVGGauge('gauge-connections', { ...GAUGE_PRESETS.connections, size: gaugeSize }),
  };

  // Initialize sparkline charts
  initSparklines();
}

function initSparklines() {
  const cpuCanvas = document.getElementById('spark-cpu');
  const ramCanvas = document.getElementById('spark-ram');
  if (!cpuCanvas || !ramCanvas) return;

  const sparkConfig = (label, color) => ({
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: color, borderWidth: 1.5, fill: true, backgroundColor: color + '20', tension: 0.3, pointRadius: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: true, min: 0, max: 100, ticks: { font: { size: 9 }, maxTicksLimit: 3 }, grid: { color: 'var(--border)' } },
      },
    },
  });

  if (carSparkCpu) { carSparkCpu.destroy(); carSparkCpu = null; }
  if (carSparkRam) { carSparkRam.destroy(); carSparkRam = null; }

  carSparkCpu = new Chart(cpuCanvas, sparkConfig('CPU', '#3b82f6'));
  carSparkRam = new Chart(ramCanvas, sparkConfig('RAM', '#8b5cf6'));
}

function updateCarDashboard(serverId, data) {
  if (serverId !== carServerId) return;

  const serverData = data[serverId];
  if (!serverData || !serverData.length) return;

  const latest = serverData[serverData.length - 1];

  // Flash live indicator
  const liveDot = document.getElementById('car-live-dot');
  if (liveDot) {
    liveDot.classList.remove('car-live-flash');
    void liveDot.offsetWidth; // force reflow
    liveDot.classList.add('car-live-flash');
  }

  // Update gauges
  const cpuUsed = 100 - (latest.cpu_idle || 100);
  const memPct = latest.mem_total_mb > 0 ? (latest.mem_used_mb / latest.mem_total_mb * 100) : 0;

  if (carGauges.cpu) carGauges.cpu.setValue(cpuUsed);
  if (carGauges.ram) carGauges.ram.setValue(memPct);
  if (carGauges.disk) carGauges.disk.setValue(latest.disk_root_pct || 0);
  if (carGauges.load) carGauges.load.setValue(latest.load_1 || 0);
  if (carGauges.threads) carGauges.threads.setValue(latest.jboss_threads || 0);
  if (carGauges.connections) carGauges.connections.setValue(latest.tcp8080_estab || 0);

  // Update sparklines (last 12 data points = ~1 hour at 5min intervals)
  const last12 = serverData.slice(-12);
  if (carSparkCpu && last12.length) {
    carSparkCpu.data.labels = last12.map(r => '');
    carSparkCpu.data.datasets[0].data = last12.map(r => 100 - (r.cpu_idle || 100));
    carSparkCpu.update('none');
  }
  if (carSparkRam && last12.length) {
    carSparkRam.data.labels = last12.map(r => '');
    carSparkRam.data.datasets[0].data = last12.map(r => r.mem_total_mb > 0 ? (r.mem_used_mb / r.mem_total_mb * 100) : 0);
    carSparkRam.update('none');
  }

  // Update quick stats
  const statsContainer = document.getElementById('car-quick-stats');
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="car-stat"><span class="car-stat-label">JBoss RSS</span><span class="car-stat-value">${(latest.jboss_rss_mb || 0).toFixed(0)} MB</span></div>
      <div class="car-stat"><span class="car-stat-label">CPU Steal</span><span class="car-stat-value">${(latest.cpu_steal || 0).toFixed(1)}%</span></div>
      <div class="car-stat"><span class="car-stat-label">I/O Wait</span><span class="car-stat-value">${(latest.cpu_iowait || 0).toFixed(1)}%</span></div>
      <div class="car-stat"><span class="car-stat-label">TCP Stuck</span><span class="car-stat-value">${latest.tcp8080_closewait || 0}</span></div>
      <div class="car-stat"><span class="car-stat-label">Disk /tmp</span><span class="car-stat-value">${(latest.disk_tmp_pct || 0).toFixed(0)}%</span></div>
      <div class="car-stat"><span class="car-stat-label">Load 5m</span><span class="car-stat-value">${(latest.load_5 || 0).toFixed(1)}</span></div>
    `;
  }
}

function destroyCarDashboard() {
  carGauges = {};
  carServerId = null;
  if (carSparkCpu) { carSparkCpu.destroy(); carSparkCpu = null; }
  if (carSparkRam) { carSparkRam.destroy(); carSparkRam = null; }
}
