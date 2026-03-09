// Anomaly Detection — baselines estadísticos con detección por desviación estándar

class AnomalyDetector {
  constructor(storage) {
    this.storage = storage;
    this.baselines = {};
    this.lastBuild = 0;
    this.BUILD_INTERVAL = 3600000; // Reconstruir cada hora
    this.cooldowns = {}; // Evitar spam de la misma anomalía
    this.COOLDOWN_MS = 1800000; // 30 min entre anomalías del mismo tipo
  }

  buildBaselines() {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();

    try {
      // Labsis metrics por servidor, día de semana, hora
      const labsis = this.storage.db.prepare(`
        SELECT server_id,
          CAST(strftime('%w', timestamp) AS INTEGER) as dow,
          CAST(strftime('%H', timestamp) AS INTEGER) as hour,
          AVG(cpu_idle) as avg_cpu_idle,
          AVG(cpu_idle * cpu_idle) as avg_cpu_idle_sq,
          AVG(jboss_threads) as avg_threads,
          AVG(jboss_threads * jboss_threads) as avg_threads_sq,
          COUNT(*) as cnt
        FROM labsis_metrics WHERE timestamp >= ?
        GROUP BY server_id, dow, hour
      `).all(from);

      const rds = this.storage.db.prepare(`
        SELECT
          CAST(strftime('%w', timestamp) AS INTEGER) as dow,
          CAST(strftime('%H', timestamp) AS INTEGER) as hour,
          AVG(active_conns) as avg_active,
          AVG(active_conns * active_conns) as avg_active_sq,
          AVG(cache_hit_table_pct) as avg_cache,
          AVG(cache_hit_table_pct * cache_hit_table_pct) as avg_cache_sq,
          AVG(idle_in_tx_conns) as avg_zombies,
          AVG(idle_in_tx_conns * idle_in_tx_conns) as avg_zombies_sq,
          COUNT(*) as cnt
        FROM rds_metrics WHERE timestamp >= ?
        GROUP BY dow, hour
      `).all(from);

      this.baselines = {};

      for (const row of labsis) {
        if (row.cnt < 3) continue;
        const k = `${row.server_id}_${row.dow}_${row.hour}`;
        this.baselines[`cpu_idle_${k}`] = this._stats(row.avg_cpu_idle, row.avg_cpu_idle_sq, row.cnt);
        this.baselines[`threads_${k}`] = this._stats(row.avg_threads, row.avg_threads_sq, row.cnt);
      }

      for (const row of rds) {
        if (row.cnt < 3) continue;
        const k = `rds_${row.dow}_${row.hour}`;
        this.baselines[`active_${k}`] = this._stats(row.avg_active, row.avg_active_sq, row.cnt);
        this.baselines[`cache_${k}`] = this._stats(row.avg_cache, row.avg_cache_sq, row.cnt);
        this.baselines[`zombies_${k}`] = this._stats(row.avg_zombies, row.avg_zombies_sq, row.cnt);
      }

      this.lastBuild = Date.now();
      console.log(`[Anomaly] Baselines: ${Object.keys(this.baselines).length} slots`);
    } catch (err) {
      console.error('[Anomaly] Error building baselines:', err.message);
    }
  }

  _stats(avg, avgSq, cnt) {
    const stddev = Math.sqrt(Math.max(0, avgSq - avg * avg));
    return { mean: avg, stddev, count: cnt };
  }

  detect(data) {
    if (Date.now() - this.lastBuild > this.BUILD_INTERVAL) {
      this.buildBaselines();
    }
    if (Object.keys(this.baselines).length === 0) return [];

    const now = new Date();
    const dow = now.getUTCDay();
    const hour = now.getUTCHours();
    const anomalies = [];

    const el18 = data.el18?.length ? data.el18[data.el18.length - 1] : null;
    const el316 = data.el316?.length ? data.el316[data.el316.length - 1] : null;
    const rds = data.rds?.length ? data.rds[data.rds.length - 1] : null;

    const check = (value, key, label, unit) => {
      const bl = this.baselines[key];
      if (!bl || bl.count < 3 || bl.stddev < 0.01) return;

      const deviation = Math.abs(value - bl.mean) / bl.stddev;
      if (deviation <= 2) return;

      // Cooldown
      if (this.cooldowns[key] && (Date.now() - this.cooldowns[key]) < this.COOLDOWN_MS) return;
      this.cooldowns[key] = Date.now();

      const dir = value > bl.mean ? 'por encima' : 'por debajo';
      const level = deviation > 3 ? 'crit' : 'warn';
      const prefix = level === 'crit' ? 'ANOMALÍA' : 'Anomalía';

      anomalies.push({
        time: now.toISOString(),
        level,
        msg: `${prefix}: ${label} en ${value.toFixed(1)}${unit} — ${deviation.toFixed(1)}σ ${dir} del normal (esperado: ${bl.mean.toFixed(1)}${unit})`,
        category: 'anomaly',
      });
    };

    if (el18) {
      const k18 = `el18_${dow}_${hour}`;
      check(el18.cpu_idle, `cpu_idle_${k18}`, 'CPU idle El 18', '%');
      check(el18.jboss_threads, `threads_${k18}`, 'Threads JBoss El 18', '');
    }

    if (el316) {
      const k316 = `el316_${dow}_${hour}`;
      check(el316.cpu_idle, `cpu_idle_${k316}`, 'CPU idle El 3', '%');
      check(el316.jboss_threads, `threads_${k316}`, 'Threads JBoss El 3', '');
    }

    if (rds) {
      const kr = `rds_${dow}_${hour}`;
      check(rds.active_conns, `active_${kr}`, 'Conexiones activas BD', '');
      check(rds.cache_hit_table_pct, `cache_${kr}`, 'Cache hit BD', '%');
      check(rds.idle_in_tx_conns, `zombies_${kr}`, 'Transacciones zombie', '');
    }

    // Insertar eventos
    for (const a of anomalies) {
      this.storage.insertEvent(a.time, a.level, a.msg, a.category);
    }

    return anomalies;
  }
}

module.exports = { AnomalyDetector };
