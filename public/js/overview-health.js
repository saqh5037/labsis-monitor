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
    <div class="server-cards">${servers.map(srv => {
      const row = lastItem(data[srv.id]);
      if (!row) return '';
      const cpu = 100 - (row.cpu_idle || 100);
      const mem = row.mem_total_mb > 0 ? (row.mem_used_mb / row.mem_total_mb * 100) : 0;
      const jbossGB = (row.jboss_rss_mb || 0) / 1024;
      const jbossMax = srv.heapGB || 12;
      const jbossPct = Math.min((jbossGB / jbossMax) * 100, 100);
      const threads = row.jboss_threads || 0;
      const tcp = row.tcp8080_estab || 0;
      const disk = row.disk_root_pct || 0;

      function barCls(v, w, c) { return v >= c ? 'bar-crit' : v >= w ? 'bar-warn' : 'bar-good'; }
      function dotCls() {
        if (cpu > 85 || mem > 92) return 'dot-crit';
        if (cpu > 70 || mem > 85) return 'dot-warn';
        return 'dot-ok';
      }

      return `<div class="srv-card">
        <div class="srv-card-header">
          <span class="srv-dot ${dotCls()}"></span>
          <span class="srv-name">${srv.name}</span>
          <span class="srv-ip">${srv.host || ''}</span>
        </div>
        <div class="srv-metrics">
          <div class="srv-metric">
            <div class="srv-bar"><div class="srv-fill ${barCls(cpu,70,85)}" style="width:${cpu.toFixed(0)}%"></div></div>
            <span class="srv-val">${cpu.toFixed(0)}%</span><span class="srv-lbl">CPU</span>
          </div>
          <div class="srv-metric">
            <div class="srv-bar"><div class="srv-fill ${barCls(mem,85,92)}" style="width:${mem.toFixed(0)}%"></div></div>
            <span class="srv-val">${mem.toFixed(0)}%</span><span class="srv-lbl">RAM</span>
          </div>
          <div class="srv-metric">
            <div class="srv-bar"><div class="srv-fill ${barCls(jbossPct,75,90)}" style="width:${jbossPct.toFixed(0)}%"></div></div>
            <span class="srv-val">${jbossGB.toFixed(1)}G</span><span class="srv-lbl">JBoss</span>
          </div>
          <div class="srv-metric">
            <div class="srv-bar"><div class="srv-fill ${barCls(threads,200,300)}" style="width:${Math.min(threads/5, 100).toFixed(0)}%"></div></div>
            <span class="srv-val">${threads}</span><span class="srv-lbl">Threads</span>
          </div>
          <div class="srv-metric">
            <div class="srv-bar"><div class="srv-fill ${barCls(tcp,80,150)}" style="width:${Math.min(tcp/2, 100).toFixed(0)}%"></div></div>
            <span class="srv-val">${tcp}</span><span class="srv-lbl">TCP</span>
          </div>
          <div class="srv-metric">
            <div class="srv-bar"><div class="srv-fill ${barCls(disk,75,85)}" style="width:${disk}%"></div></div>
            <span class="srv-val">${disk}%</span><span class="srv-lbl">Disco</span>
          </div>
        </div>
      </div>`;
    }).join('')}</div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
}
