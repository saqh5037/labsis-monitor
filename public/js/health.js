// Panel de Salud del Sistema — tarjetas visuales tipo semáforo

function renderHealthPanel(data) {
  const container = document.getElementById('health-panel');
  if (!container) return;

  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];
  const rds = lastItem(data.rds);

  // Check if we have any data
  const hasServerData = servers.some(srv => data[srv.id] && data[srv.id].length);
  if (!hasServerData && !rds) {
    container.innerHTML = '<div class="no-data">Esperando datos...</div>';
    return;
  }

  const checks = [];

  // — Per-server checks: CPU, Memoria, Disco —
  servers.forEach((srv, i) => {
    const row = lastItem(data[srv.id]);
    if (!row) return;

    // CPU
    const cpuUsed = 100 - (row.cpu_idle || 100);
    const steal = row.cpu_steal || 0;
    let cpuLevel = 'ok', cpuDetail = `${cpuUsed.toFixed(0)}% usado`;
    if (cpuUsed > 85) { cpuLevel = 'crit'; cpuDetail += ' — saturado'; }
    else if (steal > 30) { cpuLevel = 'crit'; cpuDetail += ` — steal ${steal.toFixed(1)}%`; }
    else if (cpuUsed > 70) { cpuLevel = 'warn'; cpuDetail += ' — carga alta'; }
    checks.push({ label: `CPU ${srv.name}`, value: cpuUsed.toFixed(0) + '%', level: cpuLevel, detail: cpuDetail, tab: 'servers', chartId: `chart-cpu-${i}` });

    // Memoria
    const memPct = row.mem_used_mb / row.mem_total_mb * 100;
    const freeGB = (row.mem_free_mb / 1024).toFixed(1);
    let memLevel = 'ok', memDetail = `${freeGB} GB libres`;
    if (memPct > 92) { memLevel = 'crit'; memDetail += ' — riesgo de inestabilidad'; }
    else if (memPct > 85) { memLevel = 'warn'; memDetail += ' — vigilar'; }
    checks.push({ label: `Memoria ${srv.name}`, value: memPct.toFixed(0) + '%', level: memLevel, detail: memDetail, tab: 'servers', chartId: `chart-mem-${i}` });

    // Disco
    const diskPct = row.disk_root_pct || 0;
    const diskFreeGB = (srv.diskGB * (100 - diskPct) / 100).toFixed(1);
    let diskLevel = 'ok', diskDetail = `${diskFreeGB} GB libres`;
    if (diskPct >= 85) { diskLevel = 'crit'; diskDetail += ' — espacio crítico'; }
    else if (diskPct >= 75) { diskLevel = 'warn'; diskDetail += ' — poco espacio'; }
    checks.push({ label: `Disco ${srv.name}`, value: diskPct + '%', level: diskLevel, detail: diskDetail, tab: 'infra', chartId: 'disk-gauges' });
  });

  // — JBoss (multi-server) —
  const serverRows = servers.map(srv => lastItem(data[srv.id])).filter(Boolean);
  if (serverRows.length) {
    const threadVals = servers.map(srv => { const r = lastItem(data[srv.id]); return { name: srv.name, val: r ? r.jboss_threads : 0 }; });
    const maxThreads = Math.max(...threadVals.map(t => t.val));
    let tLevel = 'ok', tDetail = threadVals.map(t => `${t.name}: ${t.val}`).join(', ');
    if (maxThreads > 300) { tLevel = 'crit'; tDetail += ' — no da abasto'; }
    else if (maxThreads > 200) { tLevel = 'warn'; tDetail += ' — carga alta'; }
    checks.push({ label: 'Threads LABSIS', value: maxThreads, level: tLevel, detail: tDetail, tab: 'jboss', chartId: 'chart-jboss-threads' });

    const rssVals = servers.map(srv => { const r = lastItem(data[srv.id]); return { name: srv.name, rss: r ? r.jboss_rss_mb : 0, heapGB: srv.heapGB }; });
    const maxRss = Math.max(...rssVals.map(r => r.rss));
    let rLevel = 'ok', rDetail = rssVals.map(r => `${r.name}: ${(r.rss/1024).toFixed(1)} GB`).join(', ');
    const anyCrit = rssVals.some(r => r.rss > r.heapGB * 1024 * 1.4);
    const anyWarn = rssVals.some(r => r.rss > r.heapGB * 1024 * 1.25);
    if (anyCrit) { rLevel = 'crit'; rDetail += ' — posible memory leak'; }
    else if (anyWarn) { rLevel = 'warn'; rDetail += ' — RSS elevado'; }
    checks.push({ label: 'Memoria LABSIS', value: (maxRss/1024).toFixed(1) + ' GB', level: rLevel, detail: rDetail, tab: 'jboss', chartId: 'chart-jboss-rss' });
  }

  // — Base de Datos —
  if (rds) {
    const ch = rds.cache_hit_table_pct || 0;
    let level = 'ok', detail = `Tablas: ${ch.toFixed(1)}%`;
    if (ch < 95) { level = 'crit'; detail += ' — BD lee disco'; }
    else if (ch < 99) { level = 'warn'; detail += ' — debería ser >99%'; }
    else { detail += ' — excelente'; }
    checks.push({ label: 'Cache Hit BD', value: ch.toFixed(1) + '%', level, detail, tab: 'database', chartId: 'chart-cache-hit' });
  }
  if (rds) {
    const idleTx = rds.idle_in_tx_conns || 0;
    const maxDur = rds.max_query_duration_sec || 0;
    let level = 'ok', detail = `${idleTx} abandonadas`;
    if (maxDur >= 3600) {
      level = 'crit';
      const hrs = (maxDur / 3600).toFixed(1);
      detail = `ZOMBIE de ${hrs}h — matar`;
    } else if (idleTx >= 5) {
      level = 'crit'; detail += ' — bloqueando BD';
    } else if (idleTx >= 1) {
      level = 'warn'; detail += ' — app no cerró conexión';
    }
    checks.push({ label: 'Tx Zombie', value: idleTx, level, detail, tab: 'database', chartId: 'chart-slow-queries' });
  }
  if (rds) {
    const locks = rds.waiting_locks || 0;
    let level = 'ok', detail = 'Sin bloqueos';
    if (locks >= 5) { level = 'crit'; detail = `${locks} bloqueadas`; }
    else if (locks >= 1) { level = 'warn'; detail = `${locks} bloqueada`; }
    checks.push({ label: 'Bloqueos BD', value: locks, level, detail, tab: 'database', chartId: 'chart-locks' });
  }
  if (rds) {
    const slow = rds.queries_gt_30s || 0;
    let level = 'ok', detail = 'Sin operaciones lentas';
    if (slow >= 3) { level = 'crit'; detail = `${slow} ops >30s`; }
    else if (slow >= 1) { level = 'warn'; detail = `${slow} op >30s`; }
    checks.push({ label: 'Queries lentas', value: slow, level, detail, tab: 'database', chartId: 'chart-slow-queries' });
  }
  if (rds) {
    const total = rds.total_connections || 0;
    const active = rds.active_conns || 0;
    let level = 'ok', detail = `${active} activas de ${total}`;
    if (total > 200) { level = 'crit'; detail += ' — demasiadas'; }
    else if (total > 100) { level = 'warn'; detail += ' — revisar'; }
    checks.push({ label: 'Conexiones BD', value: total, level, detail, tab: 'database', chartId: 'chart-db-conns' });
  }

  // — Conexiones TCP atoradas —
  if (serverRows.length) {
    const tcpVals = servers.map(srv => { const r = lastItem(data[srv.id]); return { name: srv.name, val: r ? r.tcp8080_closewait || 0 : 0 }; });
    const totalCw = tcpVals.reduce((s, v) => s + v.val, 0);
    let tcpLevel = 'ok', tcpDetail = tcpVals.map(v => `${v.name}: ${v.val}`).join(', ');
    if (totalCw > 20) { tcpLevel = 'crit'; tcpDetail += ' — acumulándose'; }
    else if (totalCw > 5) { tcpLevel = 'warn'; tcpDetail += ' — revisar'; }
    else { tcpDetail += ' — limpio'; }
    checks.push({ label: 'TCP atoradas', value: totalCw, level: tcpLevel, detail: tcpDetail, tab: 'jboss', chartId: 'chart-tcp8080-0' });
  }

  // — Anomalías recientes —
  if (data.events) {
    const recentAnomalies = (data.events || []).filter(e => e.category === 'anomaly' && Date.now() - new Date(e.time).getTime() < 3600000);
    const count = recentAnomalies.length;
    let level = 'ok', detail = 'Sin anomalías en la última hora';
    if (count >= 5) { level = 'crit'; detail = `${count} desviaciones estadísticas`; }
    else if (count >= 1) { level = 'warn'; detail = `${count} desviación(es) detectada(s)`; }
    checks.push({ label: 'Anomalías', value: count, level, detail, tab: 'health', chartId: 'health-timeline' });
  }

  // Contar problemas
  const crits = checks.filter(c => c.level === 'crit').length;
  const warns = checks.filter(c => c.level === 'warn').length;

  let summaryLevel = 'ok';
  let summaryMsg = 'Todos los indicadores están normales';
  if (crits > 0) {
    summaryLevel = 'crit';
    summaryMsg = `${crits} problema${crits > 1 ? 's' : ''} crítico${crits > 1 ? 's' : ''}`;
    if (warns > 0) summaryMsg += ` y ${warns} alerta${warns > 1 ? 's' : ''}`;
  } else if (warns > 0) {
    summaryLevel = 'warn';
    summaryMsg = `${warns} alerta${warns > 1 ? 's' : ''} por revisar`;
  }

  const _g = getCSSVar('--green') || '#10b981', _y = getCSSVar('--yellow') || '#f59e0b', _r = getCSSVar('--red') || '#ef4444';
  const colors = { ok: _g, warn: _y, crit: _r };
  const iconsSvg = {
    ok: '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#ecfdf5;flex-shrink:0;box-shadow:0 2px 6px rgba(5,150,105,0.15)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>',
    warn: '<span class="status-icon-warn" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#fffbeb;flex-shrink:0;box-shadow:0 2px 6px rgba(217,119,6,0.15)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><circle cx="12" cy="16" r="0.5" fill="#d97706"/></svg></span>',
    crit: '<span class="status-icon-crit" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#fef2f2;flex-shrink:0;box-shadow:0 2px 6px rgba(220,38,38,0.15)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg></span>',
  };
  const icons = iconsSvg;
  const bgColors = { ok: hexToRgba(_g, .08), warn: hexToRgba(_y, .08), crit: hexToRgba(_r, .08) };

  let html = `
    <div class="health-summary" style="background:${bgColors[summaryLevel]};border:1px solid ${colors[summaryLevel]};border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:18px;font-weight:700;color:${colors[summaryLevel]};margin-bottom:4px">
        ${icons[summaryLevel]} ${summaryMsg}
      </div>
      <div style="font-size:12px;color:var(--text2)">
        ${checks.length} indicadores monitoreados · ${new Date().toLocaleTimeString('es-MX')}
      </div>
    </div>
    <div class="health-cards-grid">
  `;

  checks.forEach(c => {
    const borderColor = c.level === 'ok' ? 'var(--border)' : colors[c.level];
    html += `
      <div class="health-card health-card-${c.level}" onclick="goToChart('${c.tab}','${c.chartId}')" title="Click para ver detalle">
        <div class="health-card-header">
          <span class="health-card-icon">${icons[c.level]}</span>
          <span class="health-card-label">${c.label}</span>
        </div>
        <div class="health-card-value" style="color:${colors[c.level]}">${c.value}</div>
        <div class="health-card-detail">${c.detail}</div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// Navega al tab y hace scroll + highlight a la gráfica específica
function goToChart(tabName, chartId) {
  // 1. Cambiar de tab
  const tab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (tab) tab.click();

  // 2. Esperar a que el tab se renderice y buscar el elemento
  setTimeout(() => {
    const target = document.getElementById(chartId);
    if (!target) return;
    const card = target.closest('.chart-card') || target.closest('.gauge-card') || target;

    // 3. Scroll suave al elemento
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 4. Highlight temporal (flash)
    card.classList.add('chart-highlight');
    setTimeout(() => card.classList.remove('chart-highlight'), 2000);
  }, 100);
}

function goToTab(tabName) {
  const tab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (tab) tab.click();
}
