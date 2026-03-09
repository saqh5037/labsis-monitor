// Persistencia SQLite para datos históricos del dashboard

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'dashboard.db');

class Storage {
  constructor() {
    this.db = null;
  }

  init() {
    // Crear directorio data/ si no existe
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS labsis_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        cpu_user REAL, cpu_sys REAL, cpu_iowait REAL, cpu_steal REAL, cpu_idle REAL,
        load_1 REAL, load_5 REAL, load_15 REAL,
        mem_total_mb REAL, mem_used_mb REAL, mem_free_mb REAL, mem_available_mb REAL, mem_bufcache_mb REAL,
        jboss_rss_mb REAL, jboss_vsz_mb REAL, jboss_cpu_pct REAL, jboss_threads REAL,
        disk_root_pct REAL, disk_tmp_pct REAL,
        tcp8080_estab REAL, tcp8080_timewait REAL, tcp8080_closewait REAL,
        tcp5432_estab REAL, tcp5432_timewait REAL,
        UNIQUE(server_id, timestamp)
      );

      CREATE TABLE IF NOT EXISTS rds_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL UNIQUE,
        total_connections REAL, active_conns REAL, idle_conns REAL, idle_in_tx_conns REAL,
        waiting_locks REAL,
        cache_hit_table_pct REAL, cache_hit_index_pct REAL,
        tps_commit REAL, tps_rollback REAL,
        deadlocks_delta REAL, temp_files_delta REAL,
        blk_read_rate REAL, blk_write_rate REAL,
        max_query_duration_sec REAL, queries_gt_30s REAL
      );

      CREATE TABLE IF NOT EXISTS query_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_time TEXT NOT NULL,
        queryid TEXT,
        query TEXT,
        calls INTEGER,
        total_time_sec REAL,
        avg_time_sec REAL,
        max_time_sec REAL,
        min_time_sec REAL,
        rows_total INTEGER,
        rows_per_call REAL,
        cache_hit_pct REAL,
        shared_blks_hit INTEGER,
        shared_blks_read INTEGER,
        temp_blks_written INTEGER,
        tables_involved TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time TEXT NOT NULL,
        level TEXT NOT NULL,
        msg TEXT NOT NULL,
        category TEXT
      );

      CREATE TABLE IF NOT EXISTS action_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL DEFAULT (datetime('now')),
        action_name TEXT NOT NULL,
        params_json TEXT,
        risk_level TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        duration_ms INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_labsis_ts ON labsis_metrics(server_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_rds_ts ON rds_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_qs_time ON query_snapshots(snapshot_time);
      CREATE INDEX IF NOT EXISTS idx_qs_queryid ON query_snapshots(queryid, snapshot_time);
      CREATE INDEX IF NOT EXISTS idx_events_time ON events(time);
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON action_audit(ts);

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'readonly',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT
      );

      CREATE TABLE IF NOT EXISTS weekly_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        generated_at TEXT NOT NULL,
        period_from TEXT NOT NULL,
        period_to TEXT NOT NULL,
        health_score INTEGER,
        summary_json TEXT,
        html TEXT,
        UNIQUE(period_from, period_to)
      );

      CREATE INDEX IF NOT EXISTS idx_reports_date ON weekly_reports(generated_at);
    `);

    // Migraciones: agregar columnas si no existen
    try { this.db.exec('ALTER TABLE action_audit ADD COLUMN user_name TEXT DEFAULT \'system\''); } catch (e) { /* ya existe */ }
    try { this.db.exec('ALTER TABLE action_audit ADD COLUMN user_ip TEXT DEFAULT \'\''); } catch (e) { /* ya existe */ }

    this._prepareStatements();
    console.log('[Storage] SQLite inicializado en', DB_PATH);
  }

  _prepareStatements() {
    this._insertLabsis = this.db.prepare(`
      INSERT OR IGNORE INTO labsis_metrics (
        server_id, timestamp,
        cpu_user, cpu_sys, cpu_iowait, cpu_steal, cpu_idle,
        load_1, load_5, load_15,
        mem_total_mb, mem_used_mb, mem_free_mb, mem_available_mb, mem_bufcache_mb,
        jboss_rss_mb, jboss_vsz_mb, jboss_cpu_pct, jboss_threads,
        disk_root_pct, disk_tmp_pct,
        tcp8080_estab, tcp8080_timewait, tcp8080_closewait,
        tcp5432_estab, tcp5432_timewait
      ) VALUES (
        @server_id, @timestamp,
        @cpu_user, @cpu_sys, @cpu_iowait, @cpu_steal, @cpu_idle,
        @load_1, @load_5, @load_15,
        @mem_total_mb, @mem_used_mb, @mem_free_mb, @mem_available_mb, @mem_bufcache_mb,
        @jboss_rss_mb, @jboss_vsz_mb, @jboss_cpu_pct, @jboss_threads,
        @disk_root_pct, @disk_tmp_pct,
        @tcp8080_estab, @tcp8080_timewait, @tcp8080_closewait,
        @tcp5432_estab, @tcp5432_timewait
      )
    `);

    this._insertRds = this.db.prepare(`
      INSERT OR IGNORE INTO rds_metrics (
        timestamp,
        total_connections, active_conns, idle_conns, idle_in_tx_conns,
        waiting_locks,
        cache_hit_table_pct, cache_hit_index_pct,
        tps_commit, tps_rollback,
        deadlocks_delta, temp_files_delta,
        blk_read_rate, blk_write_rate,
        max_query_duration_sec, queries_gt_30s
      ) VALUES (
        @timestamp,
        @total_connections, @active_conns, @idle_conns, @idle_in_tx_conns,
        @waiting_locks,
        @cache_hit_table_pct, @cache_hit_index_pct,
        @tps_commit, @tps_rollback,
        @deadlocks_delta, @temp_files_delta,
        @blk_read_rate, @blk_write_rate,
        @max_query_duration_sec, @queries_gt_30s
      )
    `);

    this._insertQuery = this.db.prepare(`
      INSERT INTO query_snapshots (
        snapshot_time, queryid, query, calls,
        total_time_sec, avg_time_sec, max_time_sec, min_time_sec,
        rows_total, rows_per_call, cache_hit_pct,
        shared_blks_hit, shared_blks_read, temp_blks_written,
        tables_involved
      ) VALUES (
        @snapshot_time, @queryid, @query, @calls,
        @total_time_sec, @avg_time_sec, @max_time_sec, @min_time_sec,
        @rows_total, @rows_per_call, @cache_hit_pct,
        @shared_blks_hit, @shared_blks_read, @temp_blks_written,
        @tables_involved
      )
    `);
  }

  insertLabsis(serverId, rows) {
    const insert = this.db.transaction((rows) => {
      for (const row of rows) {
        if (!row.timestamp) continue;
        this._insertLabsis.run({
          server_id: serverId,
          timestamp: row.timestamp,
          cpu_user: row.cpu_user || 0,
          cpu_sys: row.cpu_sys || 0,
          cpu_iowait: row.cpu_iowait || 0,
          cpu_steal: row.cpu_steal || 0,
          cpu_idle: row.cpu_idle || 0,
          load_1: row.load_1 || 0,
          load_5: row.load_5 || 0,
          load_15: row.load_15 || 0,
          mem_total_mb: row.mem_total_mb || 0,
          mem_used_mb: row.mem_used_mb || 0,
          mem_free_mb: row.mem_free_mb || 0,
          mem_available_mb: row.mem_available_mb || 0,
          mem_bufcache_mb: row.mem_bufcache_mb || 0,
          jboss_rss_mb: row.jboss_rss_mb || 0,
          jboss_vsz_mb: row.jboss_vsz_mb || 0,
          jboss_cpu_pct: row.jboss_cpu_pct || 0,
          jboss_threads: row.jboss_threads || 0,
          disk_root_pct: row.disk_root_pct || 0,
          disk_tmp_pct: row.disk_tmp_pct || 0,
          tcp8080_estab: row.tcp8080_estab || 0,
          tcp8080_timewait: row.tcp8080_timewait || 0,
          tcp8080_closewait: row.tcp8080_closewait || 0,
          tcp5432_estab: row.tcp5432_estab || 0,
          tcp5432_timewait: row.tcp5432_timewait || 0,
        });
      }
    });
    insert(rows);
  }

  insertRds(rows) {
    const insert = this.db.transaction((rows) => {
      for (const row of rows) {
        if (!row.timestamp) continue;
        this._insertRds.run({
          timestamp: row.timestamp,
          total_connections: row.total_connections || 0,
          active_conns: row.active_conns || 0,
          idle_conns: row.idle_conns || 0,
          idle_in_tx_conns: row.idle_in_tx_conns || 0,
          waiting_locks: row.waiting_locks || 0,
          cache_hit_table_pct: row.cache_hit_table_pct || 0,
          cache_hit_index_pct: row.cache_hit_index_pct || 0,
          tps_commit: row.tps_commit || 0,
          tps_rollback: row.tps_rollback || 0,
          deadlocks_delta: row.deadlocks_delta || 0,
          temp_files_delta: row.temp_files_delta || 0,
          blk_read_rate: row.blk_read_rate || 0,
          blk_write_rate: row.blk_write_rate || 0,
          max_query_duration_sec: row.max_query_duration_sec || 0,
          queries_gt_30s: row.queries_gt_30s || 0,
        });
      }
    });
    insert(rows);
  }

  insertQuerySnapshot(snapshotTime, queries) {
    const insert = this.db.transaction((queries) => {
      for (const q of queries) {
        this._insertQuery.run({
          snapshot_time: snapshotTime,
          queryid: q.queryid || '',
          query: q.query || '',
          calls: q.calls || 0,
          total_time_sec: q.total_time_sec || 0,
          avg_time_sec: q.avg_time_sec || 0,
          max_time_sec: q.max_time_sec || 0,
          min_time_sec: q.min_time_sec || 0,
          rows_total: q.rows_total || 0,
          rows_per_call: q.rows_per_call || 0,
          cache_hit_pct: q.cache_hit_pct || 0,
          shared_blks_hit: q.shared_blks_hit || 0,
          shared_blks_read: q.shared_blks_read || 0,
          temp_blks_written: q.temp_blks_written || 0,
          tables_involved: q.tables_involved || '',
        });
      }
    });
    insert(queries);
  }

  queryLabsis(serverId, from, to) {
    return this.db.prepare(`
      SELECT * FROM labsis_metrics
      WHERE server_id = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(serverId, from, to);
  }

  queryRds(from, to) {
    return this.db.prepare(`
      SELECT * FROM rds_metrics
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(from, to);
  }

  querySnapshots(from, to) {
    return this.db.prepare(`
      SELECT * FROM query_snapshots
      WHERE snapshot_time >= ? AND snapshot_time <= ?
      ORDER BY snapshot_time DESC, total_time_sec DESC
    `).all(from, to);
  }

  queryDeltaSnapshots(from, to) {
    const rows = this.db.prepare(`
      WITH boundaries AS (
        SELECT queryid,
          MIN(snapshot_time) as first_time,
          MAX(snapshot_time) as last_time,
          COUNT(DISTINCT snapshot_time) as snap_count
        FROM query_snapshots
        WHERE snapshot_time >= @from AND snapshot_time <= @to
        GROUP BY queryid
      ),
      first_snap AS (
        SELECT qs.* FROM query_snapshots qs
        INNER JOIN boundaries b ON qs.queryid = b.queryid AND qs.snapshot_time = b.first_time
      ),
      last_snap AS (
        SELECT qs.* FROM query_snapshots qs
        INNER JOIN boundaries b ON qs.queryid = b.queryid AND qs.snapshot_time = b.last_time
      ),
      max_in_range AS (
        SELECT queryid, MAX(max_time_sec) as period_max
        FROM query_snapshots
        WHERE snapshot_time >= @from AND snapshot_time <= @to
        GROUP BY queryid
      )
      SELECT
        l.queryid, l.query, l.tables_involved, b.snap_count,
        CASE WHEN b.snap_count = 1 THEN l.calls
             ELSE MAX(0, l.calls - f.calls) END as calls,
        CASE WHEN b.snap_count = 1 THEN l.total_time_sec
             ELSE MAX(0, l.total_time_sec - f.total_time_sec) END as total_time_sec,
        CASE WHEN b.snap_count = 1 THEN l.rows_total
             ELSE MAX(0, l.rows_total - f.rows_total) END as rows_total,
        CASE WHEN b.snap_count = 1 THEN l.shared_blks_hit
             ELSE MAX(0, l.shared_blks_hit - f.shared_blks_hit) END as shared_blks_hit,
        CASE WHEN b.snap_count = 1 THEN l.shared_blks_read
             ELSE MAX(0, l.shared_blks_read - f.shared_blks_read) END as shared_blks_read,
        CASE WHEN b.snap_count = 1 THEN l.temp_blks_written
             ELSE MAX(0, l.temp_blks_written - f.temp_blks_written) END as temp_blks_written,
        m.period_max as max_time_sec, l.min_time_sec
      FROM last_snap l
      INNER JOIN boundaries b ON l.queryid = b.queryid
      LEFT JOIN first_snap f ON l.queryid = f.queryid
      LEFT JOIN max_in_range m ON l.queryid = m.queryid
    `).all({ from, to });

    return rows
      .map(r => ({
        queryid: r.queryid,
        query: r.query,
        tables_involved: r.tables_involved,
        calls: r.calls,
        total_time_sec: r.total_time_sec,
        avg_time_sec: r.calls > 0 ? Math.round((r.total_time_sec / r.calls) * 10000) / 10000 : 0,
        max_time_sec: r.max_time_sec,
        min_time_sec: r.min_time_sec,
        rows_total: r.rows_total,
        rows_per_call: r.calls > 0 ? Math.round((r.rows_total / r.calls) * 10) / 10 : 0,
        cache_hit_pct: (r.shared_blks_hit + r.shared_blks_read) > 0
          ? Math.round((r.shared_blks_hit / (r.shared_blks_hit + r.shared_blks_read)) * 10000) / 100
          : 100,
        shared_blks_hit: r.shared_blks_hit,
        shared_blks_read: r.shared_blks_read,
        temp_blks_written: r.temp_blks_written,
        snap_count: r.snap_count,
        is_delta: true,
      }))
      .filter(r => r.calls > 0)
      .sort((a, b) => b.total_time_sec - a.total_time_sec);
  }

  getLatestSnapshot() {
    const row = this.db.prepare(`
      SELECT snapshot_time FROM query_snapshots ORDER BY snapshot_time DESC LIMIT 1
    `).get();
    if (!row) return [];
    return this.db.prepare(`
      SELECT * FROM query_snapshots WHERE snapshot_time = ? ORDER BY total_time_sec DESC
    `).all(row.snapshot_time);
  }

  // Eventos
  insertEvent(time, level, msg, category) {
    this.db.prepare(`
      INSERT INTO events (time, level, msg, category) VALUES (?, ?, ?, ?)
    `).run(time, level, msg, category || '');
  }

  queryEvents(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM events ORDER BY time DESC LIMIT ?
    `).all(limit);
  }

  queryEventsByRange(from, to) {
    return this.db.prepare(`
      SELECT * FROM events WHERE time >= ? AND time <= ? ORDER BY time DESC
    `).all(from, to);
  }

  // Historial de un query específico (trending)
  queryHistory(queryid) {
    return this.db.prepare(`
      SELECT snapshot_time, avg_time_sec, total_time_sec, calls, max_time_sec, cache_hit_pct
      FROM query_snapshots
      WHERE queryid = ?
      ORDER BY snapshot_time ASC
    `).all(queryid);
  }

  // Auditoría de acciones
  logAction(data) {
    this.db.prepare(`
      INSERT INTO action_audit (ts, action_name, params_json, risk_level, status, output, duration_ms, user_name, user_ip)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.action_name, data.params_json, data.risk_level, data.status, data.output, data.duration_ms,
           data.user_name || 'system', data.user_ip || '');
  }

  getAuditLog(limit = 50, action = null) {
    if (action) {
      return this.db.prepare(`
        SELECT * FROM action_audit WHERE action_name = ? ORDER BY ts DESC LIMIT ?
      `).all(action, limit);
    }
    return this.db.prepare(`
      SELECT * FROM action_audit ORDER BY ts DESC LIMIT ?
    `).all(limit);
  }

  getAuditLogFiltered({ limit = 50, action = null, risk = null, status = null, from = null, to = null, user = null } = {}) {
    let sql = 'SELECT * FROM action_audit WHERE 1=1';
    const params = [];
    if (action) { sql += ' AND action_name = ?'; params.push(action); }
    if (risk) { sql += ' AND risk_level = ?'; params.push(risk); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (from) { sql += ' AND ts >= ?'; params.push(from); }
    if (to) { sql += ' AND ts <= ?'; params.push(to); }
    if (user) { sql += ' AND user_name = ?'; params.push(user); }
    sql += ' ORDER BY ts DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params);
  }

  getAuditStats(from, to) {
    return this.db.prepare(`
      SELECT action_name, risk_level, status, COUNT(*) as count,
             AVG(duration_ms) as avg_duration, MAX(duration_ms) as max_duration
      FROM action_audit WHERE ts >= ? AND ts <= ?
      GROUP BY action_name, risk_level, status ORDER BY count DESC
    `).all(from, to);
  }

  // Usuarios
  insertUser(username, passwordHash, role) {
    this.db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
  }

  getUser(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  listUsers() {
    return this.db.prepare('SELECT id, username, role, created_at, last_login FROM users').all();
  }

  updateLastLogin(username) {
    this.db.prepare("UPDATE users SET last_login = datetime('now') WHERE username = ?").run(username);
  }

  updatePassword(username, passwordHash) {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(passwordHash, username);
  }

  // Heatmap
  queryHeatmapData(metric, days = 14) {
    const ALLOWED = ['active_conns', 'total_connections', 'idle_in_tx_conns', 'cache_hit_table_pct', 'tps_commit', 'waiting_locks', 'max_query_duration_sec', 'queries_gt_30s', 'blk_read_rate', 'blk_write_rate'];
    if (!ALLOWED.includes(metric)) metric = 'active_conns';
    const from = new Date(Date.now() - days * 86400000).toISOString();
    return this.db.prepare(`
      SELECT CAST(strftime('%w', timestamp) AS INTEGER) as dow,
             CAST(strftime('%H', timestamp) AS INTEGER) as hour,
             AVG(${metric}) as avg_val, MAX(${metric}) as max_val, COUNT(*) as samples
      FROM rds_metrics WHERE timestamp >= ? GROUP BY dow, hour ORDER BY dow, hour
    `).all(from);
  }

  // Reportes semanales
  insertReport(report) {
    return this.db.prepare(`
      INSERT OR REPLACE INTO weekly_reports (generated_at, period_from, period_to, health_score, summary_json, html)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(report.generated_at, report.period_from, report.period_to, report.health_score, report.summary_json, report.html);
  }

  getReports(limit = 20) {
    return this.db.prepare('SELECT id, generated_at, period_from, period_to, health_score FROM weekly_reports ORDER BY generated_at DESC LIMIT ?').all(limit);
  }

  getReport(id) {
    return this.db.prepare('SELECT * FROM weekly_reports WHERE id = ?').get(id);
  }

  // SLA — calcular disponibilidad basado en eventos críticos
  calculateSLA(from, to) {
    const totalHours = (new Date(to) - new Date(from)) / 3600000;
    if (totalHours <= 0) return { total_hours: 0, uptime_hours: 0, downtime_hours: 0, pct: 100, target: 99.5, meets_sla: true, incidents: 0 };

    // Obtener eventos crit y ok ordenados por tiempo
    const events = this.db.prepare(`
      SELECT time, level, msg, category FROM events
      WHERE time >= ? AND time <= ? AND level IN ('crit', 'ok')
      ORDER BY time ASC
    `).all(from, to);

    let downtimeMs = 0;
    let critStart = null;
    let incidents = 0;

    for (const ev of events) {
      if (ev.level === 'crit' && !critStart) {
        critStart = new Date(ev.time).getTime();
        incidents++;
      } else if (ev.level === 'ok' && critStart) {
        downtimeMs += new Date(ev.time).getTime() - critStart;
        critStart = null;
      }
    }

    // Si hay un crit abierto sin ok, asumir 30 min de downtime
    if (critStart) {
      downtimeMs += 30 * 60 * 1000;
    }

    const downtimeHours = downtimeMs / 3600000;
    const uptimeHours = totalHours - downtimeHours;
    const pct = Math.min(100, (uptimeHours / totalHours) * 100);

    return {
      total_hours: +totalHours.toFixed(1),
      uptime_hours: +uptimeHours.toFixed(1),
      downtime_hours: +downtimeHours.toFixed(2),
      pct: +pct.toFixed(3),
      target: 99.5,
      meets_sla: pct >= 99.5,
      incidents,
    };
  }

  // Backups — tabla y métodos
  initBackupTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS backup_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        last_file TEXT,
        size_mb REAL,
        age_hours REAL,
        files_count INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_backup_ts ON backup_snapshots(timestamp);
    `);
  }

  insertBackupSnapshot(data) {
    this.db.prepare(`
      INSERT INTO backup_snapshots (timestamp, last_file, size_mb, age_hours, files_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.timestamp || new Date().toISOString(), data.last_file || '', data.size_mb || 0, data.age_hours || 0, data.files_count || 0);
  }

  getLatestBackup() {
    return this.db.prepare(`
      SELECT * FROM backup_snapshots ORDER BY timestamp DESC LIMIT 1
    `).get();
  }

  close() {
    if (this.db) this.db.close();
  }
}

module.exports = { Storage };
