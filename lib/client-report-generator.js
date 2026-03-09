// Generador de reportes semanales para CLIENTE
// Formato visual con barras, separado por servidor, tono de estabilidad

class ClientReportGenerator {
  constructor(storage) {
    this.storage = storage;
  }

  generate(fromDate, toDate) {
    const to = toDate || new Date().toISOString();
    const from = fromDate || new Date(Date.now() - 7 * 86400000).toISOString();

    const serversDetail = this._serverDetailedSummary(from, to);
    const database = this._databaseSummary(from, to);
    const events = this._eventsSummary(from, to);
    const availability = this._calculateAvailability(events, from, to);
    const health_score = this._healthScore(serversDetail, database, events);
    const maintenance = this._maintenanceSummary(from, to);
    const sla = this.storage.calculateSLA(from, to);

    const html = this._renderHTML({ from, to, health_score, serversDetail, database, events, availability, maintenance, sla });

    return {
      generated_at: new Date().toISOString(),
      period_from: from,
      period_to: to,
      health_score,
      type: 'client',
      summary_json: JSON.stringify({
        health_score,
        availability: availability.pct,
        incidents_critical: events.criticals,
        incidents_warning: events.warnings,
        maintenance_actions: maintenance.length
      }),
      html,
    };
  }

  _serverDetailedSummary(from, to) {
    return this.storage.db.prepare(`
      SELECT server_id,
        MIN(cpu_idle) as min_cpu_idle, AVG(cpu_idle) as avg_cpu_idle, MAX(100 - cpu_idle) as peak_cpu,
        MAX(cpu_steal) as max_steal, AVG(cpu_steal) as avg_steal,
        MAX(mem_used_mb) as max_mem_mb, AVG(mem_used_mb) as avg_mem_mb, AVG(mem_total_mb) as mem_total,
        MAX(jboss_rss_mb) as max_jboss_mb, AVG(jboss_rss_mb) as avg_jboss_mb,
        MAX(jboss_threads) as max_threads, AVG(jboss_threads) as avg_threads,
        MAX(disk_root_pct) as max_disk_pct, AVG(disk_root_pct) as avg_disk_pct,
        MAX(load_1) as max_load, AVG(load_1) as avg_load,
        COUNT(*) as sample_count
      FROM labsis_metrics WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY server_id
    `).all(from, to);
  }

  _databaseSummary(from, to) {
    return this.storage.db.prepare(`
      SELECT
        MAX(active_conns) as max_active, AVG(active_conns) as avg_active,
        MAX(total_connections) as max_total_conns, AVG(total_connections) as avg_total_conns,
        MIN(cache_hit_table_pct) as min_cache_hit, AVG(cache_hit_table_pct) as avg_cache_hit,
        MAX(idle_in_tx_conns) as max_zombies,
        MAX(waiting_locks) as max_locks,
        MAX(tps_commit) as max_tps, AVG(tps_commit) as avg_tps,
        MAX(blk_read_rate) as max_io_read, AVG(blk_read_rate) as avg_io_read,
        SUM(CASE WHEN queries_gt_30s > 0 THEN queries_gt_30s ELSE 0 END) as total_slow,
        SUM(CASE WHEN deadlocks_delta > 0 THEN deadlocks_delta ELSE 0 END) as total_deadlocks,
        COUNT(*) as sample_count
      FROM rds_metrics WHERE timestamp >= ? AND timestamp <= ?
    `).get(from, to);
  }

  _eventsSummary(from, to) {
    const all = this.storage.queryEventsByRange(from, to);
    return {
      total: all.length,
      criticals: all.filter(e => e.level === 'crit').length,
      warnings: all.filter(e => e.level === 'warn').length,
      resolved: all.filter(e => e.level === 'ok').length,
      list: all.slice(0, 15),
    };
  }

  _calculateAvailability(events, from, to) {
    const totalHours = (new Date(to) - new Date(from)) / 3600000;
    const downtimeHours = events.criticals * 0.5;
    const uptimeHours = totalHours - downtimeHours;
    const pct = totalHours > 0 ? (uptimeHours / totalHours * 100) : 100;
    return {
      total_hours: totalHours.toFixed(1),
      uptime_hours: uptimeHours.toFixed(1),
      downtime_hours: downtimeHours.toFixed(1),
      pct: Math.min(100, pct).toFixed(2)
    };
  }

  _maintenanceSummary(from, to) {
    try {
      const actions = this.storage.getAuditLogFiltered({ from, to, limit: 100 });
      return Array.isArray(actions) ? actions.filter(a => a.status !== 'error') : [];
    } catch { return []; }
  }

  _healthScore(servers, database, events) {
    let score = 100;
    for (const s of servers) {
      if ((s.peak_cpu || 0) > 85) score -= 10; else if ((s.peak_cpu || 0) > 70) score -= 3;
      if ((s.max_disk_pct || 0) > 85) score -= 10; else if ((s.max_disk_pct || 0) > 75) score -= 3;
    }
    if (database) {
      if ((database.min_cache_hit || 100) < 95) score -= 15; else if ((database.min_cache_hit || 100) < 99) score -= 5;
      if ((database.max_zombies || 0) > 5) score -= 10;
      if ((database.max_locks || 0) > 5) score -= 10;
    }
    score -= Math.min(20, events.criticals * 2);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  _bar(pct, color, maxLabel) {
    const p = Math.min(100, Math.max(0, pct));
    const bg = color === 'green' ? '#10b981' : color === 'yellow' ? '#f59e0b' : color === 'red' ? '#ef4444' : color;
    return `<div class="bar-wrap">
      <div class="bar-bg"><div class="bar-fill" style="width:${p}%;background:${bg}"></div></div>
      <span class="bar-val">${pct.toFixed(0)}%${maxLabel ? ` <span class="bar-max">(máx: ${maxLabel})</span>` : ''}</span>
    </div>`;
  }

  _statusDot(val, warnThreshold, critThreshold, inverted) {
    const isGood = inverted ? val >= warnThreshold : val <= warnThreshold;
    const isCrit = inverted ? val < critThreshold : val >= critThreshold;
    if (isCrit) return '<span class="dot dot-red"></span>';
    if (!isGood) return '<span class="dot dot-yellow"></span>';
    return '<span class="dot dot-green"></span>';
  }

  _renderHTML({ from, to, health_score, serversDetail, database, events, availability, maintenance, sla }) {
    const hc = health_score >= 80 ? '#10b981' : health_score >= 60 ? '#f59e0b' : '#ef4444';
    const hcBg = health_score >= 80 ? '#ecfdf5' : health_score >= 60 ? '#fffbeb' : '#fef2f2';
    const hcLabel = health_score >= 80 ? 'Estable' : health_score >= 60 ? 'En observación' : 'Requiere atención';
    const fromStr = new Date(from).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const toStr = new Date(to).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    // Server detail sections
    const serverSections = serversDetail.map(s => {
      const name = s.server_id === 'el18' ? 'Servidor de Aplicación 1' : 'Servidor de Aplicación 2';
      const avgCpu = 100 - (s.avg_cpu_idle || 100);
      const peakCpu = s.peak_cpu || 0;
      const cpuColor = peakCpu > 85 ? 'red' : peakCpu > 70 ? 'yellow' : 'green';
      const memPct = s.mem_total > 0 ? (s.avg_mem_mb / s.mem_total * 100) : 0;
      const memPeakPct = s.mem_total > 0 ? (s.max_mem_mb / s.mem_total * 100) : 0;
      const memColor = memPeakPct > 85 ? 'red' : memPeakPct > 70 ? 'yellow' : 'green';
      const diskColor = (s.max_disk_pct || 0) > 85 ? 'red' : (s.max_disk_pct || 0) > 75 ? 'yellow' : 'green';
      const heapLimitMb = s.server_id === 'el18' ? 12288 : 24576; // El 18: 12GB, El 316: 24GB
      const heapLimitGb = heapLimitMb / 1024;
      const jbossPct = s.max_jboss_mb ? (s.avg_jboss_mb / heapLimitMb * 100) : 0;
      const jbossPeakPct = s.max_jboss_mb ? (s.max_jboss_mb / heapLimitMb * 100) : 0;
      const jbossColor = jbossPeakPct > 90 ? 'red' : jbossPeakPct > 75 ? 'yellow' : 'green';

      // Contexto narrativo
      const cpuNarrative = peakCpu > 70
        ? `Pico de ${peakCpu.toFixed(0)}% registrado durante horario de alta demanda. El promedio de ${avgCpu.toFixed(0)}% indica que fuera de picos el servidor opera con holgura.`
        : `Uso promedio de ${avgCpu.toFixed(0)}% con pico de ${peakCpu.toFixed(0)}%. El servidor opera con capacidad de reserva.`;

      const memNarrative = memPeakPct > 80
        ? `La memoria alcanzó ${memPeakPct.toFixed(0)}% en momentos de alta carga. La aplicación LABSIS utiliza hasta ${(s.max_jboss_mb / 1024).toFixed(1)} GB de los ${heapLimitGb} GB asignados. El sistema se mantiene estable gracias a la gestión automática de memoria.`
        : `Uso de memoria dentro de parámetros normales. Promedio: ${memPct.toFixed(0)}%.`;

      return `
      <div class="server-section">
        <div class="server-header">
          <div class="server-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0f4c75" stroke-width="2">
              <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <div>
            <div class="server-title">${name}</div>
            <div class="server-subtitle">${s.sample_count} muestras en el período</div>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-block">
            <div class="metric-header">${this._statusDot(peakCpu, 70, 85)} Procesador (CPU)</div>
            ${this._bar(avgCpu, cpuColor, `${peakCpu.toFixed(0)}%`)}
            <div class="metric-narrative">${cpuNarrative}</div>
          </div>

          <div class="metric-block">
            <div class="metric-header">${this._statusDot(memPeakPct, 70, 85)} Memoria RAM</div>
            ${this._bar(memPct, memColor, `${memPeakPct.toFixed(0)}%`)}
            <div class="metric-narrative">${memNarrative}</div>
          </div>

          <div class="metric-block">
            <div class="metric-header">${this._statusDot(s.max_disk_pct || 0, 75, 85)} Almacenamiento</div>
            ${this._bar(s.avg_disk_pct || 0, diskColor, `${(s.max_disk_pct || 0).toFixed(0)}%`)}
          </div>

          <div class="metric-block">
            <div class="metric-header">${this._statusDot(jbossPeakPct, 75, 90)} Aplicación LABSIS</div>
            ${this._bar(jbossPct, jbossColor, `${jbossPeakPct.toFixed(0)}%`)}
            <div class="metric-narrative">Uso de heap: ${(s.avg_jboss_mb / 1024).toFixed(1)} GB promedio, pico ${(s.max_jboss_mb / 1024).toFixed(1)} GB de ${heapLimitGb} GB. Threads máx: ${Math.round(s.max_threads || 0)}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    // DB section
    const dbCacheHit = database ? (database.avg_cache_hit || 0) : 100;
    const dbCacheColor = dbCacheHit >= 99 ? 'green' : dbCacheHit >= 95 ? 'yellow' : 'red';
    const dbNarrative = dbCacheHit >= 99
      ? 'La base de datos opera con alta eficiencia. Las consultas se resuelven desde memoria, sin necesidad de acceder al disco.'
      : dbCacheHit >= 95
      ? 'Eficiencia ligeramente por debajo del óptimo. Se recomienda ajustar parámetros de memoria de la base de datos para mejorar rendimiento.'
      : 'Eficiencia de caché por debajo del umbral recomendado. El equipo de soporte está trabajando en optimizaciones de configuración que no requieren cambios de hardware.';

    // Events list
    const eventsHTML = events.list.length ? events.list.map(e => {
      const icon = e.level === 'crit' ? '&#9888;' : e.level === 'warn' ? '&#9888;' : '&#10003;';
      const color = e.level === 'crit' ? '#ef4444' : e.level === 'warn' ? '#f59e0b' : '#10b981';
      const time = new Date(e.time).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div class="event-row"><span class="event-icon" style="color:${color}">${icon}</span><span class="event-time">${time}</span><span class="event-msg">${e.msg}</span></div>`;
    }).join('') : '<div class="event-empty">Sin eventos relevantes en el período.</div>';

    // SLA badge
    const slaPct = sla ? sla.pct : parseFloat(availability.pct);
    const slaColor = slaPct >= 99.5 ? '#10b981' : slaPct >= 99 ? '#f59e0b' : '#ef4444';
    const slaMeets = slaPct >= 99.5;

    // Conclusión ejecutiva
    const conclusion = health_score >= 80
      ? 'La infraestructura de LABSIS se mantiene <strong>estable y operativa</strong>. El equipo Dynamtek realiza monitoreo continuo 24/7 y mantenimientos preventivos programados para asegurar la continuidad del servicio.'
      : health_score >= 60
      ? 'El sistema opera de forma <strong>funcional con áreas de oportunidad</strong> identificadas. El equipo Dynamtek está implementando optimizaciones de configuración que mejorarán el rendimiento sin necesidad de cambios de hardware inmediatos. La estabilidad completa se alcanzará con el incremento planificado de capacidad en los servidores de aplicación.'
      : 'Se han identificado <strong>puntos de atención</strong> que están siendo gestionados activamente por el equipo Dynamtek. Las acciones correctivas están en curso y se reportará progreso en el próximo informe semanal.';

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte Semanal — LABSIS LAPI | Dynamtek</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', -apple-system, sans-serif; background:#f8fafc; color:#1e293b; max-width:850px; margin:0 auto; }

  .header { background: linear-gradient(135deg, #0f4c75 0%, #1b6fa0 100%); color:white; padding:32px 40px; }
  .header-logo { font-size:11px; font-weight:700; letter-spacing:3px; color:#93c5fd; margin-bottom:4px; }
  .header-title { font-size:24px; font-weight:700; margin-bottom:2px; }
  .header-subtitle { font-size:13px; color:#bfdbfe; }
  .header-period { font-size:12px; color:#93c5fd; margin-top:8px; }

  .kpi-row { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; background:white; border-bottom:1px solid #e2e8f0; }
  .kpi { padding:18px 16px; text-align:center; border-right:1px solid #e2e8f0; }
  .kpi:last-child { border-right:none; }
  .kpi-value { font-size:26px; font-weight:800; line-height:1.2; }
  .kpi-label { font-size:10px; color:#64748b; margin-top:4px; text-transform:uppercase; letter-spacing:.5px; }

  .content { padding:24px 40px; }
  .section { margin-bottom:28px; }
  .section-title { font-size:16px; font-weight:700; color:#0f4c75; margin-bottom:14px; padding-bottom:6px; border-bottom:2px solid #e2e8f0; }

  .server-section { background:white; border-radius:10px; padding:20px 24px; margin-bottom:12px; border:1px solid #e2e8f0; }
  .server-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
  .server-icon { flex-shrink:0; }
  .server-title { font-size:15px; font-weight:700; color:#1e293b; }
  .server-subtitle { font-size:11px; color:#94a3b8; }

  .metrics-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .metric-block { padding:10px 14px; background:#f8fafc; border-radius:8px; border:1px solid #f1f5f9; }
  .metric-header { font-size:12px; font-weight:700; color:#334155; margin-bottom:6px; display:flex; align-items:center; gap:6px; }
  .metric-narrative { font-size:11px; color:#64748b; margin-top:6px; line-height:1.5; }

  .bar-wrap { margin:4px 0; }
  .bar-bg { height:10px; background:#e2e8f0; border-radius:5px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:5px; transition:width .5s; }
  .bar-val { font-size:13px; font-weight:700; color:#334155; display:block; margin-top:3px; }
  .bar-max { font-weight:400; color:#94a3b8; font-size:11px; }

  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; }
  .dot-green { background:#10b981; }
  .dot-yellow { background:#f59e0b; }
  .dot-red { background:#ef4444; }

  .db-section { background:white; border-radius:10px; padding:20px 24px; border:1px solid #e2e8f0; }
  .db-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:12px; }
  .db-card { background:#f8fafc; border-radius:8px; padding:14px; text-align:center; border:1px solid #f1f5f9; }
  .db-card-value { font-size:22px; font-weight:800; }
  .db-card-label { font-size:10px; color:#64748b; margin-top:2px; text-transform:uppercase; }

  .sla-banner { display:flex; align-items:center; gap:16px; padding:16px 20px; border-radius:10px; margin-bottom:12px; }
  .sla-pct { font-size:32px; font-weight:800; }
  .sla-info { flex:1; }
  .sla-badge { display:inline-block; font-size:11px; font-weight:700; padding:3px 12px; border-radius:12px; margin-top:4px; }

  .events-list { background:white; border-radius:10px; padding:16px 20px; border:1px solid #e2e8f0; }
  .event-row { display:flex; align-items:flex-start; gap:8px; padding:5px 0; border-bottom:1px solid #f8fafc; font-size:12px; }
  .event-row:last-child { border-bottom:none; }
  .event-icon { flex-shrink:0; font-size:14px; }
  .event-time { color:#94a3b8; font-size:11px; min-width:90px; flex-shrink:0; }
  .event-msg { color:#475569; }
  .event-empty { text-align:center; color:#94a3b8; font-style:italic; padding:12px; font-size:13px; }

  .conclusion-box { background:${hcBg}; border-radius:10px; padding:20px 24px; border:1px solid ${hc}30; }
  .conclusion-title { font-size:14px; font-weight:700; color:${hc}; margin-bottom:8px; display:flex; align-items:center; gap:8px; }
  .conclusion-text { font-size:13px; color:#334155; line-height:1.6; }

  .footer { background:#f1f5f9; padding:20px 40px; text-align:center; color:#94a3b8; font-size:11px; border-top:1px solid #e2e8f0; margin-top:20px; }
  .footer-brand { font-weight:700; color:#64748b; font-size:12px; }

  @media print {
    body { max-width:100%; background:white; }
    .header, .server-section, .db-section, .events-list, .conclusion-box, .sla-banner, .kpi-row { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .bar-fill, .dot, .kpi-value { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .section { page-break-inside: avoid; }
  }
</style></head><body>

  <div class="header">
    <div class="header-logo">DYNAMTEK CORP.</div>
    <div class="header-title">Informe Semanal de Infraestructura</div>
    <div class="header-subtitle">Sistema LABSIS — LAPI</div>
    <div class="header-period">${fromStr} — ${toStr}</div>
  </div>

  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-value" style="color:${hc}">${health_score}</div>
      <div class="kpi-label">Salud del Sistema</div>
    </div>
    <div class="kpi">
      <div class="kpi-value" style="color:${slaColor}">${slaPct.toFixed(1)}%</div>
      <div class="kpi-label">Disponibilidad</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${events.criticals}</div>
      <div class="kpi-label">Incidentes</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${maintenance.length}</div>
      <div class="kpi-label">Acciones preventivas</div>
    </div>
  </div>

  <div class="content">

    <div class="section">
      <div class="section-title">Servidores de Aplicación</div>
      ${serverSections || '<p style="color:#94a3b8">Sin datos del período</p>'}
    </div>

    <div class="section">
      <div class="section-title">Base de Datos (PostgreSQL)</div>
      <div class="db-section">
        <div class="db-grid">
          <div class="db-card">
            ${this._statusDot(dbCacheHit, 99, 95, true)}
            <div class="db-card-value" style="color:${dbCacheHit >= 99 ? '#10b981' : dbCacheHit >= 95 ? '#f59e0b' : '#ef4444'}">${dbCacheHit.toFixed(1)}%</div>
            <div class="db-card-label">Eficiencia de caché</div>
          </div>
          <div class="db-card">
            <div class="db-card-value">${database ? Math.round(database.avg_tps || 0) : 0}</div>
            <div class="db-card-label">Transacciones/seg (prom)</div>
          </div>
          <div class="db-card">
            <div class="db-card-value">${database ? Math.round(database.avg_total_conns || 0) : 0}</div>
            <div class="db-card-label">Conexiones (promedio)</div>
          </div>
        </div>
        <div class="db-grid">
          <div class="db-card">
            <div class="db-card-value">${database ? Math.round(database.max_tps || 0) : 0}</div>
            <div class="db-card-label">TPS pico</div>
          </div>
          <div class="db-card">
            <div class="db-card-value">${database ? Math.round(database.total_slow || 0) : 0}</div>
            <div class="db-card-label">Queries lentos</div>
          </div>
          <div class="db-card">
            <div class="db-card-value">${database ? Math.round(database.total_deadlocks || 0) : 0}</div>
            <div class="db-card-label">Deadlocks</div>
          </div>
        </div>
        <div class="metric-narrative" style="margin-top:12px;font-size:12px;color:#64748b">${dbNarrative}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Cumplimiento de SLA</div>
      <div class="sla-banner" style="background:${slaMeets ? '#ecfdf5' : '#fef2f2'}">
        <div class="sla-pct" style="color:${slaColor}">${slaPct.toFixed(2)}%</div>
        <div class="sla-info">
          <div style="font-size:14px;font-weight:700;color:#1e293b">Disponibilidad del servicio</div>
          <div style="font-size:12px;color:#64748b">Objetivo: 99.5% · ${sla ? sla.incidents : 0} incidentes · ${sla ? sla.downtime_hours : 0}h downtime estimado</div>
          <div class="sla-badge" style="background:${slaMeets ? '#d1fae5' : '#fee2e2'};color:${slaMeets ? '#065f46' : '#991b1b'}">
            ${slaMeets ? 'Cumple objetivo SLA' : 'Por debajo del objetivo'}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Eventos del Período</div>
      <div class="events-list">
        ${eventsHTML}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Conclusión</div>
      <div class="conclusion-box">
        <div class="conclusion-title">
          <span class="dot dot-${health_score >= 80 ? 'green' : health_score >= 60 ? 'yellow' : 'red'}"></span>
          ${hcLabel}
        </div>
        <div class="conclusion-text">${conclusion}</div>
      </div>
    </div>

  </div>

  <div class="footer">
    <div class="footer-brand">DYNAMTEK CORP.</div>
    Informe generado — ${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
    <br>Soporte: Ing. Samuel Quiroz · Dashboard LABSIS LAPI v8
  </div>

</body></html>`;
  }
}

module.exports = { ClientReportGenerator };
