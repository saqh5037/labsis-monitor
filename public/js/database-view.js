// Database View — Vista consolidada de BD con metricas + estado
// Muestra health badge BD + metricas detalladas + link a queries

function renderDatabaseView(data) {
  const container = document.getElementById('database-view-container');
  if (!container) return;

  const rds = lastItem(data.rds);
  if (!rds) {
    container.innerHTML = '<div class="no-data">Esperando datos de base de datos...</div>';
    return;
  }

  const cache = rds.cache_hit_table_pct || 0;
  const cacheIdx = rds.cache_hit_index_pct || 0;
  const active = rds.active_conns || 0;
  const idle = rds.idle_conns || 0;
  const idleTx = rds.idle_in_tx_conns || 0;
  const total = rds.total_connections || 0;
  const locks = rds.waiting_locks || 0;
  const tpsCommit = rds.tps_commit || 0;
  const tpsRollback = rds.tps_rollback || 0;
  const slowMax = rds.max_query_duration_sec || 0;
  const slowCount = rds.queries_gt_30s || 0;
  const deadlocks = rds.deadlocks || 0;

  // Health status
  let dbStatus = 'ok';
  const issues = [];
  if (cache < 95) { dbStatus = 'crit'; issues.push('Cache Hit ' + cache.toFixed(1) + '%'); }
  else if (cache < 99) { dbStatus = dbStatus === 'crit' ? 'crit' : 'warn'; }
  if (idleTx >= 5) { dbStatus = 'crit'; issues.push(idleTx + ' zombies'); }
  else if (idleTx >= 1) { dbStatus = dbStatus === 'crit' ? 'crit' : 'warn'; issues.push(idleTx + ' zombie'); }
  if (locks >= 5) { dbStatus = 'crit'; issues.push(locks + ' locks'); }
  else if (locks >= 1) { dbStatus = dbStatus === 'crit' ? 'crit' : 'warn'; }
  if (slowCount > 0) { dbStatus = dbStatus === 'crit' ? 'crit' : 'warn'; issues.push(slowCount + ' slow queries'); }

  const statusMap = {
    ok:   { label: 'BD SALUDABLE', icon: 'check-circle', cls: 'health-ok' },
    warn: { label: 'BD CON ALERTAS', icon: 'alert-triangle', cls: 'health-warn' },
    crit: { label: 'BD CRITICA', icon: 'alert-circle', cls: 'health-crit' },
  };
  const st = statusMap[dbStatus];

  function lvl(v, w, c) { return v >= c ? 'crit' : v >= w ? 'warn' : 'ok'; }
  function lvlInv(v, w, c) { return v < c ? 'crit' : v < w ? 'warn' : 'ok'; }

  function metricRow(label, value, unit, level) {
    const cls = level === 'crit' ? 'svm-crit' : level === 'warn' ? 'svm-warn' : 'svm-ok';
    return `<div class="svm-row">
      <span class="svm-label">${label}</span>
      <span class="svm-value ${cls}">${value}</span>
      <span class="svm-unit">${unit}</span>
    </div>`;
  }

  container.innerHTML = `
    <div class="health-banner ${st.cls}">
      <div class="health-badge-icon"><i data-lucide="${st.icon}"></i></div>
      <div class="health-badge-text">
        <strong>${st.label}</strong>
        <span>PostgreSQL${issues.length ? ' — ' + issues.join(', ') : ''}</span>
      </div>
    </div>

    <div class="golden-signals">
      <div class="golden-card ${lvlInv(cache, 99, 95) === 'ok' ? 'g-good' : lvlInv(cache, 99, 95) === 'warn' ? 'g-warn' : 'g-crit'}">
        <div class="golden-val">${cache.toFixed(1)}%</div>
        <div class="golden-lbl">Cache Hit</div>
      </div>
      <div class="golden-card ${lvl(total, 100, 200) === 'ok' ? 'g-good' : lvl(total, 100, 200) === 'warn' ? 'g-warn' : 'g-crit'}">
        <div class="golden-val">${total}</div>
        <div class="golden-lbl">Conexiones</div>
      </div>
      <div class="golden-card g-good">
        <div class="golden-val">${tpsCommit}</div>
        <div class="golden-lbl">TPS Commit</div>
      </div>
      <div class="golden-card ${lvl(idleTx + locks, 1, 5) === 'ok' ? 'g-good' : lvl(idleTx + locks, 1, 5) === 'warn' ? 'g-warn' : 'g-crit'}">
        <div class="golden-val">${idleTx + locks}</div>
        <div class="golden-lbl">Zombies + Locks</div>
      </div>
    </div>

    <div class="srv-detail-card">
      <div class="srv-detail-sections">
        <details class="srv-section" open>
          <summary class="srv-section-header connections">
            <i data-lucide="plug"></i> Conexiones
          </summary>
          <div class="srv-section-body">
            ${metricRow('Total', total, '', lvl(total, 100, 200))}
            ${metricRow('Activas', active, 'trabajando', lvl(active, 50, 100))}
            ${metricRow('Idle', idle, 'disponibles', 'ok')}
            ${metricRow('Idle in TX', idleTx, idleTx > 0 ? 'ZOMBIE' : '', lvl(idleTx, 1, 5))}
          </div>
        </details>

        <details class="srv-section" open>
          <summary class="srv-section-header performance">
            <i data-lucide="gauge"></i> Performance
          </summary>
          <div class="srv-section-body">
            ${metricRow('Cache Hit Tablas', cache.toFixed(1), '%', lvlInv(cache, 99, 95))}
            ${metricRow('Cache Hit Indices', cacheIdx.toFixed(1), '%', lvlInv(cacheIdx, 99, 95))}
            ${metricRow('TPS Commit', tpsCommit, '/seg', 'ok')}
            ${metricRow('TPS Rollback', tpsRollback, '/seg', lvl(tpsRollback, 5, 20))}
            ${metricRow('Locks', locks, 'bloqueados', lvl(locks, 1, 5))}
            ${metricRow('Deadlocks', deadlocks, '', lvl(deadlocks, 1, 3))}
          </div>
        </details>

        <details class="srv-section">
          <summary class="srv-section-header slow">
            <i data-lucide="clock"></i> Queries Lentas
          </summary>
          <div class="srv-section-body">
            ${metricRow('Query mas lenta', slowMax.toFixed(1), 'seg', lvl(slowMax, 30, 120))}
            ${metricRow('Queries >30s', slowCount, '', lvl(slowCount, 1, 3))}
          </div>
        </details>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
}
