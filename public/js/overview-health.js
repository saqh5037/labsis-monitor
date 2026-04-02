// Overview Health Badge + Golden Signals
// Renders at top of Overview view using same data as health.js

function renderOverviewHealth(data) {
  const container = document.getElementById('overview-health');
  if (!container) return;

  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];
  const rds = lastItem(data.rds);
  const hasData = servers.some(srv => data[srv.id] && data[srv.id].length);
  if (!hasData && !rds) return;

  // Compute status
  let worstLevel = 'ok'; // ok | warn | crit
  const issues = [];

  servers.forEach(srv => {
    const row = lastItem(data[srv.id]);
    if (!row) return;
    const cpuUsed = 100 - (row.cpu_idle || 100);
    if (cpuUsed > 85) { worstLevel = 'crit'; issues.push('CPU ' + srv.name + ' ' + cpuUsed.toFixed(0) + '%'); }
    else if (cpuUsed > 70 && worstLevel !== 'crit') { worstLevel = 'warn'; }
    const memPct = row.mem_total_mb > 0 ? (row.mem_used_mb / row.mem_total_mb * 100) : 0;
    if (memPct > 92) { worstLevel = 'crit'; issues.push('RAM ' + srv.name + ' ' + memPct.toFixed(0) + '%'); }
    else if (memPct > 85 && worstLevel !== 'crit') { worstLevel = 'warn'; }
  });

  if (rds) {
    if (rds.cache_hit_table_pct < 95) { worstLevel = 'crit'; issues.push('Cache Hit ' + rds.cache_hit_table_pct.toFixed(1) + '%'); }
    else if (rds.cache_hit_table_pct < 99 && worstLevel !== 'crit') { worstLevel = 'warn'; }
    if (rds.idle_in_tx_conns >= 5) { worstLevel = 'crit'; issues.push(rds.idle_in_tx_conns + ' zombies'); }
    else if (rds.idle_in_tx_conns >= 1 && worstLevel !== 'crit') { worstLevel = 'warn'; }
    if (rds.waiting_locks >= 5) { worstLevel = 'crit'; }
    else if (rds.waiting_locks >= 1 && worstLevel !== 'crit') { worstLevel = 'warn'; }
  }

  const statusMap = {
    ok:   { label: 'OPERATIONAL', icon: 'check-circle', cls: 'health-ok' },
    warn: { label: 'DEGRADED',   icon: 'alert-triangle', cls: 'health-warn' },
    crit: { label: 'CRITICAL',   icon: 'alert-circle', cls: 'health-crit' },
  };
  const st = statusMap[worstLevel];

  // Golden signal values
  const cpuAvg = servers.length ? (servers.reduce((sum, srv) => {
    const r = lastItem(data[srv.id]);
    return sum + (r ? 100 - (r.cpu_idle || 100) : 0);
  }, 0) / servers.length) : 0;

  const cacheHit = rds ? (rds.cache_hit_table_pct || 0) : 0;
  const dbConns = rds ? (rds.total_connections || 0) : 0;
  const locks = rds ? ((rds.waiting_locks || 0) + (rds.idle_in_tx_conns || 0)) : 0;

  function goldenCls(val, warnThresh, critThresh, invert) {
    if (invert) return val < critThresh ? 'g-crit' : val < warnThresh ? 'g-warn' : 'g-good';
    return val >= critThresh ? 'g-crit' : val >= warnThresh ? 'g-warn' : 'g-good';
  }

  const siteName = window.SITE_CONFIG ? window.SITE_CONFIG.siteName : 'LABSIS';

  container.innerHTML = `
    <div class="health-banner ${st.cls}">
      <div class="health-badge-icon"><i data-lucide="${st.icon}"></i></div>
      <div class="health-badge-text">
        <strong>${st.label}</strong>
        <span>${siteName} — ${servers.length} servidores${issues.length ? ' — ' + issues.join(', ') : ''}</span>
      </div>
    </div>
    <div class="golden-signals">
      <div class="golden-card ${goldenCls(cpuAvg, 70, 85, false)}">
        <div class="golden-val">${cpuAvg.toFixed(0)}%</div>
        <div class="golden-lbl">CPU Promedio</div>
      </div>
      <div class="golden-card ${goldenCls(cacheHit, 99, 95, true)}">
        <div class="golden-val">${cacheHit.toFixed(1)}%</div>
        <div class="golden-lbl">Cache Hit BD</div>
      </div>
      <div class="golden-card ${goldenCls(dbConns, 100, 200, false)}">
        <div class="golden-val">${dbConns}</div>
        <div class="golden-lbl">Conexiones BD</div>
      </div>
      <div class="golden-card ${goldenCls(locks, 1, 5, false)}">
        <div class="golden-val">${locks}</div>
        <div class="golden-lbl">Locks + Zombies</div>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
}
