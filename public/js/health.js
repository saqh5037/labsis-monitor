// Panel de Salud del Sistema — tarjetas visuales tipo semáforo

function renderHealthPanel(data) {
  const container = document.getElementById('health-panel');
  if (!container) return;

  const el18 = lastItem(data.el18);
  const el316 = lastItem(data.el316);
  const rds = lastItem(data.rds);

  if (!el18 && !el316 && !rds) {
    container.innerHTML = '<div class="no-data">Esperando datos...</div>';
    return;
  }

  const checks = [];

  // — CPU —
  if (el18) {
    const cpuUsed = 100 - (el18.cpu_idle || 100);
    const steal = el18.cpu_steal || 0;
    let level = 'ok', detail = `${cpuUsed.toFixed(0)}% usado`;
    if (cpuUsed > 85) { level = 'crit'; detail += ' — servidor saturado'; }
    else if (steal > 30) { level = 'crit'; detail += ` — steal ${steal.toFixed(1)}%`; }
    else if (cpuUsed > 70) { level = 'warn'; detail += ' — carga alta'; }
    checks.push({ label: 'CPU El 18', value: cpuUsed.toFixed(0) + '%', level, detail, tab: 'servers', chartId: 'chart-cpu-el18' });
  }
  if (el316) {
    const cpuUsed = 100 - (el316.cpu_idle || 100);
    const steal = el316.cpu_steal || 0;
    let level = 'ok', detail = `${cpuUsed.toFixed(0)}% usado`;
    if (cpuUsed > 85) { level = 'crit'; detail += ' — servidor saturado'; }
    else if (steal > 30) { level = 'crit'; detail += ` — steal ${steal.toFixed(1)}%`; }
    else if (cpuUsed > 70) { level = 'warn'; detail += ' — carga alta'; }
    checks.push({ label: 'CPU El 3', value: cpuUsed.toFixed(0) + '%', level, detail, tab: 'servers', chartId: 'chart-cpu-el316' });
  }

  // — Memoria —
  if (el18) {
    const pct = el18.mem_used_mb / el18.mem_total_mb * 100;
    const freeGB = (el18.mem_free_mb / 1024).toFixed(1);
    let level = 'ok', detail = `${freeGB} GB libres`;
    if (pct > 92) { level = 'crit'; detail += ' — riesgo de inestabilidad'; }
    else if (pct > 85) { level = 'warn'; detail += ' — vigilar'; }
    checks.push({ label: 'Memoria El 18', value: pct.toFixed(0) + '%', level, detail, tab: 'servers', chartId: 'chart-mem-el18' });
  }
  if (el316) {
    const pct = el316.mem_used_mb / el316.mem_total_mb * 100;
    const freeGB = (el316.mem_free_mb / 1024).toFixed(1);
    let level = 'ok', detail = `${freeGB} GB libres`;
    if (pct > 92) { level = 'crit'; detail += ' — riesgo de inestabilidad'; }
    else if (pct > 85) { level = 'warn'; detail += ' — vigilar'; }
    checks.push({ label: 'Memoria El 3', value: pct.toFixed(0) + '%', level, detail, tab: 'servers', chartId: 'chart-mem-el316' });
  }

  // — Disco —
  if (el18) {
    const pct = el18.disk_root_pct || 0;
    const freeGB = (49 * (100 - pct) / 100).toFixed(1);
    let level = 'ok', detail = `${freeGB} GB libres`;
    if (pct >= 85) { level = 'crit'; detail += ' — espacio crítico'; }
    else if (pct >= 75) { level = 'warn'; detail += ' — poco espacio'; }
    checks.push({ label: 'Disco El 18', value: pct + '%', level, detail, tab: 'infra', chartId: 'disk-gauges' });
  }
  if (el316) {
    const pct = el316.disk_root_pct || 0;
    const freeGB = (49 * (100 - pct) / 100).toFixed(1);
    let level = 'ok', detail = `${freeGB} GB libres`;
    if (pct >= 85) { level = 'crit'; detail += ' — espacio crítico'; }
    else if (pct >= 75) { level = 'warn'; detail += ' — poco espacio'; }
    checks.push({ label: 'Disco El 3', value: pct + '%', level, detail, tab: 'infra', chartId: 'disk-gauges' });
  }

  // — JBoss —
  if (el18 || el316) {
    const t18 = el18 ? el18.jboss_threads : 0;
    const t316 = el316 ? el316.jboss_threads : 0;
    const max = Math.max(t18, t316);
    let level = 'ok', detail = `El 18: ${t18}, El 3: ${t316}`;
    if (max > 300) { level = 'crit'; detail += ' — no da abasto'; }
    else if (max > 200) { level = 'warn'; detail += ' — carga alta'; }
    checks.push({ label: 'Threads LABSIS', value: max, level, detail, tab: 'jboss', chartId: 'chart-jboss-threads' });
  }
  if (el18 || el316) {
    const r18 = el18 ? el18.jboss_rss_mb : 0;
    const r316 = el316 ? el316.jboss_rss_mb : 0;
    // Heap: El 18 = 12 GB, El 3 = 24 GB. RSS normal = heap + 1-3 GB
    const warnEl18 = r18 > 15360, warnEl316 = r316 > 27648;
    const critEl18 = r18 > 17408, critEl316 = r316 > 30720;
    let level = 'ok', detail = `El 18: ${(r18/1024).toFixed(1)} GB, El 3: ${(r316/1024).toFixed(1)} GB`;
    if (critEl18 || critEl316) { level = 'crit'; detail += ' — posible memory leak'; }
    else if (warnEl18 || warnEl316) { level = 'warn'; detail += ' — RSS elevado, monitorear'; }
    checks.push({ label: 'Memoria LABSIS', value: (Math.max(r18,r316)/1024).toFixed(1) + ' GB', level, detail, tab: 'jboss', chartId: 'chart-jboss-rss' });
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
  if (el18 || el316) {
    const cw18 = el18 ? el18.tcp8080_closewait || 0 : 0;
    const cw316 = el316 ? el316.tcp8080_closewait || 0 : 0;
    const total = cw18 + cw316;
    let level = 'ok', detail = `El 18: ${cw18}, El 3: ${cw316}`;
    if (total > 20) { level = 'crit'; detail += ' — acumulándose'; }
    else if (total > 5) { level = 'warn'; detail += ' — revisar'; }
    else { detail += ' — limpio'; }
    checks.push({ label: 'TCP atoradas', value: total, level, detail, tab: 'jboss', chartId: 'chart-tcp8080-el18' });
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
