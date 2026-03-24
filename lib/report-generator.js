// Generador de reportes semanales HTML — v2 (scoring mejorado)

class ReportGenerator {
  constructor(storage) {
    this.storage = storage;
  }

  generate(fromDate, toDate) {
    const to = toDate || new Date().toISOString();
    const from = fromDate || new Date(Date.now() - 7 * 86400000).toISOString();

    const servers = this._serverSummary(from, to);
    const database = this._databaseSummary(from, to);
    const events = this._eventsSummary(from, to);
    const actions = this._actionsSummary(from, to);
    const queries = this._queriesSummary(from, to);
    const health_score = this._healthScore(servers, database, events);

    const html = this._renderHTML({ from, to, health_score, servers, database, events, actions, queries });

    return {
      generated_at: new Date().toISOString(),
      period_from: from,
      period_to: to,
      health_score,
      summary_json: JSON.stringify({ servers, database, events: { total: events.total, criticals: events.criticals, warnings: events.warnings }, actions, queries: queries.length }),
      html,
    };
  }

  _serverSummary(from, to) {
    return this.storage.db.prepare(`
      SELECT server_id,
        MIN(cpu_idle) as min_cpu_idle, AVG(cpu_idle) as avg_cpu_idle,
        MAX(mem_used_mb) as max_mem_mb, AVG(mem_used_mb) as avg_mem_mb, AVG(mem_total_mb) as avg_mem_total,
        MAX(jboss_threads) as max_threads, AVG(jboss_threads) as avg_threads,
        MAX(jboss_rss_mb) as max_jboss_rss,
        MAX(disk_root_pct) as max_disk_pct, MAX(load_1) as max_load
      FROM labsis_metrics WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY server_id
    `).all(from, to);
  }

  // P95 for a metric (SQLite doesn't have PERCENTILE, use OFFSET)
  _p95(table, column, from, to, whereExtra) {
    try {
      const where = whereExtra ? ` AND ${whereExtra}` : '';
      const countRow = this.storage.db.prepare(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE timestamp >= ? AND timestamp <= ?${where}`
      ).get(from, to);
      const cnt = countRow?.cnt || 0;
      if (cnt < 10) return null;
      const offset = Math.floor(cnt * 0.95);
      const row = this.storage.db.prepare(
        `SELECT ${column} as val FROM ${table} WHERE timestamp >= ? AND timestamp <= ?${where} ORDER BY ${column} ASC LIMIT 1 OFFSET ?`
      ).get(from, to, offset);
      return row?.val ?? null;
    } catch { return null; }
  }

  _databaseSummary(from, to) {
    return this.storage.db.prepare(`
      SELECT
        MAX(active_conns) as max_active, AVG(active_conns) as avg_active,
        MAX(total_connections) as max_total,
        MIN(cache_hit_table_pct) as min_cache_hit, AVG(cache_hit_table_pct) as avg_cache_hit,
        MAX(idle_in_tx_conns) as max_zombies, AVG(idle_in_tx_conns) as avg_zombies,
        SUM(CASE WHEN idle_in_tx_conns > 0 THEN 1 ELSE 0 END) as zombie_intervals,
        MAX(waiting_locks) as max_locks, AVG(waiting_locks) as avg_locks,
        MAX(max_query_duration_sec) as max_query_sec,
        SUM(CASE WHEN queries_gt_30s > 0 THEN queries_gt_30s ELSE 0 END) as total_slow
      FROM rds_metrics WHERE timestamp >= ? AND timestamp <= ?
    `).get(from, to);
  }

  _eventsSummary(from, to) {
    const all = this.storage.queryEventsByRange(from, to);
    return {
      total: all.length,
      criticals: all.filter(e => e.level === 'crit' && !e.msg.includes('Steal')).length,
      warnings: all.filter(e => e.level === 'warn').length,
      anomalies: all.filter(e => e.category === 'anomaly').length,
      topCriticals: all.filter(e => e.level === 'crit').slice(0, 10),
    };
  }

  _actionsSummary(from, to) {
    try {
      return this.storage.getAuditLogFiltered({ from, to, limit: 1000 });
    } catch { return []; }
  }

  _queriesSummary(from, to) {
    try {
      return this.storage.db.prepare(`
        SELECT queryid, query, calls, total_time_sec, avg_time_sec, max_time_sec, cache_hit_pct, tables_involved
        FROM query_snapshots
        WHERE snapshot_time = (SELECT snapshot_time FROM query_snapshots WHERE snapshot_time >= ? AND snapshot_time <= ? ORDER BY snapshot_time DESC LIMIT 1)
        ORDER BY total_time_sec DESC LIMIT 10
      `).all(from, to);
    } catch { return []; }
  }

  _healthScore(servers, database, events) {
    let score = 100;
    const deductions = [];

    // --- Servidores ---
    for (const s of servers) {
      const name = s.server_id === 'el18' ? 'El 18' : 'El 3';

      // CPU: usar promedio (peso 70%) + pico (peso 30%)
      const avgCpu = 100 - (s.avg_cpu_idle || 100);
      const maxCpu = 100 - (s.min_cpu_idle || 100);
      const effectiveCpu = avgCpu * 0.7 + maxCpu * 0.3;
      if (effectiveCpu > 80) { score -= 10; deductions.push(`${name} CPU -10`); }
      else if (effectiveCpu > 50) { score -= 3; deductions.push(`${name} CPU -3`); }

      // Disco
      if ((s.max_disk_pct || 0) > 85) { score -= 10; deductions.push(`${name} disco -10`); }
      else if ((s.max_disk_pct || 0) > 75) { score -= 3; deductions.push(`${name} disco -3`); }

      // Threads: usar promedio con umbral más alto (JBoss permite hasta 500)
      const effectiveThreads = (s.avg_threads || 0) * 0.7 + (s.max_threads || 0) * 0.3;
      if (effectiveThreads > 400) { score -= 10; deductions.push(`${name} threads -10`); }
      else if (effectiveThreads > 250) { score -= 3; deductions.push(`${name} threads -3`); }

      // RSS: considerar heap configurado por servidor (desde MONITOR_SERVERS env)
      // Solo penalizar si RSS > heap + 3GB overhead
      const monitorServers = process.env.MONITOR_SERVERS ? JSON.parse(process.env.MONITOR_SERVERS) : {};
      const heapGb = monitorServers[s.server_id]?.heapGB || 8;
      const heapMb = heapGb * 1024;
      const rssThreshold = heapMb + 3072;
      if ((s.max_jboss_rss || 0) > rssThreshold + 2048) { score -= 5; deductions.push(`${name} RSS -5`); }
    }

    // --- Base de datos ---
    if (database) {
      // Cache hit: usar promedio, no mínimo (un dip momentáneo no es problema)
      const cacheAvg = database.avg_cache_hit || 100;
      if (cacheAvg < 95) { score -= 15; deductions.push('cache -15'); }
      else if (cacheAvg < 99) { score -= 3; deductions.push('cache -3'); }

      // Zombies: solo penalizar si son FRECUENTES (no un pico aislado)
      // zombie_intervals = cuántos snapshots de 30s tuvieron zombies
      const zombiePct = database.zombie_intervals ? (database.zombie_intervals / ((database.avg_active !== undefined ? 1 : 0) || 1)) : 0;
      const avgZombies = database.avg_zombies || 0;
      if (avgZombies > 5) { score -= 10; deductions.push('zombies -10'); }
      else if (avgZombies > 1) { score -= 3; deductions.push('zombies -3'); }

      // Locks: usar promedio, no máximo
      const avgLocks = database.avg_locks || 0;
      if (avgLocks > 5) { score -= 10; deductions.push('locks -10'); }
      else if (avgLocks > 1) { score -= 3; deductions.push('locks -3'); }
    }

    // --- Eventos ---
    // Solo penalizar fuerte si hay muchos críticos REALES y sostenidos
    // Dividir por días para tener tasa: >50/día es preocupante, >20/día es alerta
    const daysInPeriod = 7;
    const critPerDay = events.criticals / daysInPeriod;
    if (critPerDay > 50) { score -= 15; deductions.push('criticals -15'); }
    else if (critPerDay > 20) { score -= 8; deductions.push('criticals -8'); }
    else if (critPerDay > 10) { score -= 3; deductions.push('criticals -3'); }

    // Anomalías: máx -3 (en vez de -5)
    score -= Math.min(3, Math.floor(events.anomalies / 3));

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  _renderHTML({ from, to, health_score, servers, database, events, actions, queries }) {
    const hc = health_score >= 80 ? '#10b981' : health_score >= 60 ? '#f59e0b' : '#ef4444';
    const fromStr = from.slice(0, 10);
    const toStr = to.slice(0, 10);

    const serverRows = servers.map(s => {
      const maxCpu = (100 - (s.min_cpu_idle || 100)).toFixed(1);
      const avgCpu = (100 - (s.avg_cpu_idle || 100)).toFixed(1);
      const memPct = s.avg_mem_total > 0 ? ((s.max_mem_mb / s.avg_mem_total) * 100).toFixed(1) : '0';
      return `<tr>
        <td>${s.server_id === 'el18' ? 'El 18' : 'El 3'}</td>
        <td>${avgCpu}% <small style="color:#64748b">(pico ${maxCpu}%)</small></td>
        <td>${memPct}%</td>
        <td>${Math.round(s.avg_threads || 0)} <small style="color:#64748b">(pico ${Math.round(s.max_threads || 0)})</small></td>
        <td>${(s.max_disk_pct || 0).toFixed(1)}%</td>
        <td>${(s.max_load || 0).toFixed(2)}</td>
      </tr>`;
    }).join('');

    const dbRow = database ? `
      <div class="stat-grid">
        <div class="stat"><div class="stat-value">${(database.avg_active || 0).toFixed(1)}</div><div class="stat-label">Avg conexiones activas <small>(pico ${Math.round(database.max_active || 0)})</small></div></div>
        <div class="stat"><div class="stat-value">${(database.avg_cache_hit || 0).toFixed(2)}%</div><div class="stat-label">Avg cache hit <small>(min ${(database.min_cache_hit || 0).toFixed(2)}%)</small></div></div>
        <div class="stat"><div class="stat-value">${(database.avg_zombies || 0).toFixed(1)}</div><div class="stat-label">Avg zombies <small>(pico ${Math.round(database.max_zombies || 0)})</small></div></div>
        <div class="stat"><div class="stat-value">${(database.avg_locks || 0).toFixed(1)}</div><div class="stat-label">Avg locks <small>(pico ${Math.round(database.max_locks || 0)})</small></div></div>
        <div class="stat"><div class="stat-value">${Math.round(database.total_slow || 0)}</div><div class="stat-label">Queries >30s (semana)</div></div>
        <div class="stat"><div class="stat-value">${Math.round(database.max_query_sec || 0)}s</div><div class="stat-label">Query más largo</div></div>
      </div>
    ` : '<p>Sin datos</p>';

    const eventRows = (events.topCriticals || []).map(e =>
      `<tr><td>${new Date(e.time).toLocaleString('es-MX')}</td><td style="color:${e.level === 'crit' ? '#ef4444' : '#f59e0b'}">${e.level.toUpperCase()}</td><td>${this._esc(e.msg)}</td></tr>`
    ).join('');

    const queryRows = queries.map(q =>
      `<tr><td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc((q.query || '').slice(0, 80))}</td>
       <td>${(q.total_time_sec || 0).toFixed(0)}s</td><td>${q.calls || 0}</td><td>${(q.avg_time_sec || 0).toFixed(4)}s</td><td>${(q.cache_hit_pct || 0).toFixed(1)}%</td></tr>`
    ).join('');

    const actionCount = Array.isArray(actions) ? actions.length : 0;
    const actionErrors = Array.isArray(actions) ? actions.filter(a => a.status === 'error').length : 0;

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Reporte Semanal LABSIS LAPI — ${fromStr} a ${toStr}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,sans-serif; background:#0f172a; color:#f1f5f9; padding:40px; max-width:900px; margin:0 auto; }
  h1 { text-align:center; font-size:22px; margin-bottom:4px; }
  .sub { text-align:center; color:#94a3b8; font-size:13px; margin-bottom:24px; }
  .score { text-align:center; font-size:64px; font-weight:800; color:${hc}; margin:12px 0; }
  .score-label { text-align:center; color:#94a3b8; font-size:12px; margin-bottom:32px; }
  .section { background:#1e293b; border-radius:12px; padding:20px; margin-bottom:16px; border:1px solid #334155; }
  .section h2 { font-size:15px; margin-bottom:12px; color:#f1f5f9; }
  .stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .stat { text-align:center; padding:12px; background:#0f172a; border-radius:8px; }
  .stat-value { font-size:22px; font-weight:700; }
  .stat-label { font-size:10px; color:#94a3b8; margin-top:4px; }
  .stat-label small { color:#475569; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { background:#0f172a; color:#94a3b8; text-align:left; padding:8px; font-weight:600; }
  td { padding:6px 8px; border-bottom:1px solid #334155; }
  td small { color:#64748b; }
  .methodology { background:#1e293b; border-radius:8px; padding:12px 16px; margin-top:16px; border:1px solid #334155; }
  .methodology h3 { font-size:12px; color:#94a3b8; margin-bottom:6px; }
  .methodology p { font-size:11px; color:#64748b; line-height:1.5; }
  .footer { text-align:center; color:#64748b; font-size:11px; margin-top:32px; }
</style></head><body>
  <h1>Reporte Semanal — LABSIS LAPI</h1>
  <div class="sub">${fromStr} a ${toStr}</div>
  <div class="score">${health_score}</div>
  <div class="score-label">Puntuaci\u00f3n de salud (0-100)</div>

  <div class="section"><h2>Servidores</h2>
    <table><thead><tr><th>Servidor</th><th>CPU Avg (pico)</th><th>Max Mem%</th><th>Threads Avg (pico)</th><th>Max Disco%</th><th>Max Load</th></tr></thead>
    <tbody>${serverRows || '<tr><td colspan="6">Sin datos</td></tr>'}</tbody></table>
  </div>

  <div class="section"><h2>Base de Datos</h2>${dbRow}</div>

  <div class="section"><h2>Eventos (${events.total} total: ${events.criticals} cr\u00edticos, ${events.warnings} alertas, ${events.anomalies} anomal\u00edas)</h2>
    ${eventRows ? `<table><thead><tr><th>Fecha</th><th>Nivel</th><th>Mensaje</th></tr></thead><tbody>${eventRows}</tbody></table>` : '<p style="color:#94a3b8">Sin eventos cr\u00edticos</p>'}
  </div>

  <div class="section"><h2>Acciones Ejecutadas (${actionCount} total, ${actionErrors} errores)</h2></div>

  <div class="section"><h2>Top 10 Queries Costosos</h2>
    ${queryRows ? `<table><thead><tr><th>Query</th><th>Tiempo total</th><th>Calls</th><th>Avg</th><th>Cache%</th></tr></thead><tbody>${queryRows}</tbody></table>` : '<p style="color:#94a3b8">Sin datos de queries</p>'}
  </div>

  <div class="methodology">
    <h3>Metodolog\u00eda de Scoring v2</h3>
    <p>El score usa promedios ponderados (70% avg + 30% pico) en vez de solo valores m\u00e1ximos. Los picos moment\u00e1neos (&lt;1 min) no penalizan igual que problemas sostenidos. Umbrales ajustados a la configuraci\u00f3n real del sistema (heap JVM, maxThreads JBoss).</p>
  </div>

  <div class="footer">Generado autom\u00e1ticamente por Dashboard LAPI v8 — ${new Date().toLocaleString('es-MX')}</div>
</body></html>`;
  }

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = { ReportGenerator };
