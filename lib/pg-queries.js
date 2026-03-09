// Fetch de queries costosos desde pg_stat_statements

const { Client } = require('pg');

const PG_CONFIG = {
  host: process.env.PG_HOST || 'labsis-lapi-db-01.cmtbpifn3sci.us-east-2.rds.amazonaws.com',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DB || 'labsis',
  user: process.env.PG_USER || 'labsis',
  password: process.env.PG_PASSWORD || '',
  ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
};

// ─── Mapeo tabla → módulo funcional LABSIS ─────────────────────────
const LABSIS_TABLE_MODULE_MAP = {
  // Muestras
  muestra: 'Muestras', muestra_log: 'Muestras', muestra_resultado: 'Muestras',
  muestra_estudio: 'Muestras', tipo_muestra: 'Muestras',
  // Ordenes
  orden_trabajo: 'Ordenes', status_orden: 'Ordenes', orden_estudio: 'Ordenes',
  orden_trabajo_log: 'Ordenes',
  // Resultados
  resultado_numer: 'Resultados', resultado_alpha: 'Resultados',
  resultado_memo: 'Resultados', resultado_log: 'Resultados',
  // Equipos
  equipo_sistema: 'Equipos', equipo_sistema_log: 'Equipos',
  equipo_tipo: 'Equipos', equipo_parametro: 'Equipos',
  // Almacenamiento
  gradilla_almacenaminto: 'Almacenamiento', gradilla_almacenaminto_muestra: 'Almacenamiento',
  gradilla_almacenaminto_log: 'Almacenamiento',
  // Pacientes
  paciente: 'Pacientes', paciente_folio: 'Pacientes', paciente_log: 'Pacientes',
  // Configuración
  valor_referencial: 'Configuracion', catalogo: 'Configuracion',
  metodo_analitico: 'Configuracion', unidad_medida: 'Configuracion',
  parametro_sistema: 'Configuracion',
  // Estudios
  estudio: 'Estudios', estudio_log: 'Estudios', perfil_estudio: 'Estudios',
  area_estudio: 'Estudios',
  // Usuarios/Seguridad
  usuario: 'Usuarios', rol: 'Usuarios', permiso: 'Usuarios',
  sesion_usuario: 'Usuarios',
  // Facturación
  factura: 'Facturacion', detalle_factura: 'Facturacion', precio_estudio: 'Facturacion',
  // Sucursales
  sucursal: 'Sucursales', punto_toma: 'Sucursales',
  // Pruebas/Ordenes
  prueba: 'Estudios', prueba_orden: 'Ordenes', prueba_orden_has_prueba_orden_nota: 'Ordenes',
  prueba_orden_nota: 'Ordenes', observacion_prueba_orden: 'Ordenes',
  // Autovalidación
  info_autovalidacion: 'Resultados', resultado_control: 'Resultados',
  // Control de calidad
  lista_trabajo_automatizada: 'Equipos', parametro_equipo_sistema: 'Equipos',
  parametro: 'Configuracion', status_area: 'Configuracion',
  // Incidencias
  incidencia: 'Muestras', tipo_incidencia: 'Muestras',
  // Almacenamiento extra
  gradilla_almacenaminto_muestra_uso: 'Almacenamiento',
  gradilla_almacenaminto_muestra_uso_has_muestra: 'Almacenamiento',
  // Médicos
  medico: 'Medicos', medico_log: 'Medicos',
};

// Mapeo IP → nombre servidor (configurable via env)
const SERVER_NAME_MAP = process.env.SERVER_NAME_MAP
  ? JSON.parse(process.env.SERVER_NAME_MAP)
  : { '172.32.2.250': 'El 18', '172.32.2.166': 'El 3' };

// ─── Funciones auxiliares ──────────────────────────────────────────

// Extrae nombres de tablas del SQL (FROM, JOIN, INTO, UPDATE)
function extractTables(sql) {
  if (!sql) return '';
  const tables = new Set();
  const patterns = [
    /\bFROM\s+(?:public\.)?(\w+)/gi,
    /\bJOIN\s+(?:public\.)?(\w+)/gi,
    /\bINTO\s+(?:public\.)?(\w+)/gi,
    /\bUPDATE\s+(?:public\.)?(\w+)/gi,
  ];
  for (const pat of patterns) {
    let match;
    while ((match = pat.exec(sql)) !== null) {
      const name = match[1].toLowerCase();
      // Filtrar keywords y alias de Hibernate
      if (!['select', 'where', 'set', 'values', 'and', 'or', 'on', 'as'].includes(name)) {
        tables.add(name);
      }
    }
  }
  return Array.from(tables).join(', ');
}

// Deriva módulos LABSIS a partir de tablas involucradas
function deriveModules(tablesStr) {
  if (!tablesStr) return '';
  const modules = new Set();
  for (const t of tablesStr.split(',')) {
    const table = t.trim().toLowerCase();
    if (LABSIS_TABLE_MODULE_MAP[table]) {
      modules.add(LABSIS_TABLE_MODULE_MAP[table]);
    }
  }
  return Array.from(modules).join(', ');
}

// Motor de recomendaciones — evalúa reglas contra métricas del query
function computeRecommendations(query, tableStatsMap) {
  const recs = [];

  // Cache hit bajo
  if (query.cache_hit_pct !== null && query.cache_hit_pct < 90) {
    recs.push({ level: 'crit', msg: `Cache hit ${query.cache_hit_pct}% — tabla leída mayormente de disco. Posible índice faltante.` });
  } else if (query.cache_hit_pct !== null && query.cache_hit_pct < 95) {
    recs.push({ level: 'warn', msg: `Cache hit ${query.cache_hit_pct}% — algo de lectura de disco. Revisar si el working set cabe en RAM.` });
  }

  // Temp blocks altos (ORDER BY / GROUP BY derrama a disco)
  if (query.temp_blks_written > 1000) {
    recs.push({ level: 'warn', msg: `${query.temp_blks_written.toLocaleString()} temp blocks escritos — ORDER BY/GROUP BY derrama a disco. Considerar índice.` });
  }

  // Plan time alto (overhead de Hibernate)
  if (query.total_plan_time_sec > 0 && query.total_time_sec > 0) {
    const planPct = (query.total_plan_time_sec / (query.total_plan_time_sec + query.total_time_sec)) * 100;
    if (planPct > 50) {
      recs.push({ level: 'warn', msg: `Plan time es ${planPct.toFixed(0)}% del total — Hibernate genera planes complejos. Considerar query nativo.` });
    } else if (planPct > 30) {
      recs.push({ level: 'info', msg: `Plan time es ${planPct.toFixed(0)}% del total — overhead moderado de planificación.` });
    }
  }

  // Muchas filas por llamada
  if (query.rows_per_call > 10000) {
    recs.push({ level: 'warn', msg: `${Math.round(query.rows_per_call).toLocaleString()} filas/llamada — verificar paginación o filtros.` });
  } else if (query.rows_per_call > 5000) {
    recs.push({ level: 'info', msg: `${Math.round(query.rows_per_call).toLocaleString()} filas/llamada — dataset grande por ejecución.` });
  }

  // Escrituras WAL altas
  if (query.wal_bytes > 10 * 1024 * 1024) { // > 10 MB
    recs.push({ level: 'warn', msg: `${(query.wal_bytes / 1024 / 1024).toFixed(1)} MB escritos a WAL — write amplification alto.` });
  }

  // Revisar tablas involucradas contra stats
  if (tableStatsMap && query.tables_involved) {
    for (const t of query.tables_involved.split(',')) {
      const table = t.trim().toLowerCase();
      const stats = tableStatsMap[table];
      if (!stats) continue;

      // Seq scan dominante
      if (stats.idx_scan_pct < 20 && stats.seq_scan > 1000) {
        recs.push({ level: 'crit', msg: `Tabla ${table}: ${stats.seq_scan.toLocaleString()} seq scans (${stats.idx_scan_pct.toFixed(0)}% usa índice) — índice faltante.` });
      }

      // Bloat alto
      if (stats.bloat_pct > 10) {
        recs.push({ level: 'warn', msg: `Tabla ${table}: ${stats.bloat_pct.toFixed(1)}% bloat (dead tuples) — necesita VACUUM.` });
      }
    }
  }

  return recs;
}

// ─── Fetch principal: pg_stat_statements ───────────────────────────

let pgStatementsAvailable = null; // null = no verificado, true/false

async function fetchTopQueries(tableStatsMap) {
  if (!PG_CONFIG.password) {
    console.log('[PG-Queries] No PG_PASSWORD configurado, saltando fetch de queries');
    return [];
  }
  if (pgStatementsAvailable === false) return [];

  const client = new Client(PG_CONFIG);
  try {
    await client.connect();

    // Verificar si pg_stat_statements existe (solo una vez)
    if (pgStatementsAvailable === null) {
      const check = await client.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`);
      pgStatementsAvailable = check.rows.length > 0;
      if (!pgStatementsAvailable) {
        console.log('[PG-Queries] pg_stat_statements no disponible — queries deshabilitados');
        await client.end().catch(() => {});
        return [];
      }
    }

    const result = await client.query(`
      SELECT
        queryid::text as queryid,
        query,
        calls,
        round(total_exec_time::numeric / 1000, 2) as total_time_sec,
        round(mean_exec_time::numeric / 1000, 4) as avg_time_sec,
        round(max_exec_time::numeric / 1000, 2) as max_time_sec,
        round(min_exec_time::numeric / 1000, 4) as min_time_sec,
        rows as rows_total,
        round(rows::numeric / NULLIF(calls, 0), 1) as rows_per_call,
        round((shared_blks_hit::numeric / NULLIF(shared_blks_hit + shared_blks_read, 0)) * 100, 2) as cache_hit_pct,
        shared_blks_hit,
        shared_blks_read,
        temp_blks_written,
        round(stddev_exec_time::numeric / 1000, 4) as stddev_time_sec,
        shared_blks_dirtied,
        round(total_plan_time::numeric / 1000, 2) as total_plan_time_sec,
        round(mean_plan_time::numeric / 1000, 4) as avg_plan_time_sec,
        wal_bytes
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = $1)
        AND calls > 10
      ORDER BY total_exec_time DESC
      LIMIT 50
    `, [PG_CONFIG.database]);

    return result.rows.map(row => {
      const tablesInvolved = extractTables(row.query);
      const modules = deriveModules(tablesInvolved);
      const parsed = {
        queryid: row.queryid,
        query: row.query,
        total_time_sec: parseFloat(row.total_time_sec) || 0,
        avg_time_sec: parseFloat(row.avg_time_sec) || 0,
        max_time_sec: parseFloat(row.max_time_sec) || 0,
        min_time_sec: parseFloat(row.min_time_sec) || 0,
        rows_per_call: parseFloat(row.rows_per_call) || 0,
        cache_hit_pct: parseFloat(row.cache_hit_pct) || 0,
        calls: parseInt(row.calls) || 0,
        rows_total: parseInt(row.rows_total) || 0,
        shared_blks_hit: parseInt(row.shared_blks_hit) || 0,
        shared_blks_read: parseInt(row.shared_blks_read) || 0,
        temp_blks_written: parseInt(row.temp_blks_written) || 0,
        stddev_time_sec: parseFloat(row.stddev_time_sec) || 0,
        shared_blks_dirtied: parseInt(row.shared_blks_dirtied) || 0,
        total_plan_time_sec: parseFloat(row.total_plan_time_sec) || 0,
        avg_plan_time_sec: parseFloat(row.avg_plan_time_sec) || 0,
        wal_bytes: parseInt(row.wal_bytes) || 0,
        tables_involved: tablesInvolved,
        modules,
      };
      const recs = computeRecommendations(parsed, tableStatsMap || {});
      parsed.recommendations_json = JSON.stringify(recs);
      return parsed;
    });
  } catch (err) {
    console.error('[PG-Queries] Error:', err.message);
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Fetch stats de tablas: pg_stat_user_tables ────────────────────

async function fetchTableStats() {
  if (!PG_CONFIG.password) return [];

  const client = new Client(PG_CONFIG);
  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        schemaname || '.' || relname as table_name,
        relname as short_name,
        seq_scan,
        idx_scan,
        CASE WHEN (seq_scan + idx_scan) > 0
          THEN round((idx_scan::numeric / (seq_scan + idx_scan)) * 100, 1)
          ELSE 100
        END as idx_scan_pct,
        n_live_tup,
        n_dead_tup,
        CASE WHEN n_live_tup > 0
          THEN round((n_dead_tup::numeric / n_live_tup) * 100, 1)
          ELSE 0
        END as bloat_pct,
        last_autovacuum::text,
        last_autoanalyze::text,
        pg_total_relation_size(relid) as table_size_bytes
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND (seq_scan + idx_scan) > 100
      ORDER BY seq_scan DESC
      LIMIT 100
    `);

    return result.rows.map(row => ({
      table_name: row.short_name || '',
      seq_scan: parseInt(row.seq_scan) || 0,
      idx_scan: parseInt(row.idx_scan) || 0,
      idx_scan_pct: parseFloat(row.idx_scan_pct) || 0,
      n_live_tup: parseInt(row.n_live_tup) || 0,
      n_dead_tup: parseInt(row.n_dead_tup) || 0,
      bloat_pct: parseFloat(row.bloat_pct) || 0,
      last_autovacuum: row.last_autovacuum || null,
      last_autoanalyze: row.last_autoanalyze || null,
      table_size_bytes: parseInt(row.table_size_bytes) || 0,
    }));
  } catch (err) {
    console.error('[PG-Queries] Error fetchTableStats:', err.message);
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

// Convierte array de table stats a mapa para búsqueda rápida
function tableStatsToMap(tableStats) {
  const map = {};
  for (const t of tableStats) {
    map[t.table_name] = t;
  }
  return map;
}


// ─── Fetch conexiones activas: pg_stat_activity ────────────────────

async function fetchActiveConnections() {
  if (!PG_CONFIG.password) return [];

  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    const result = await client.query(`
      SELECT
        pid,
        usename,
        client_addr::text,
        application_name,
        state,
        wait_event_type,
        wait_event,
        left(query, 200) as query_preview,
        round(extract(epoch from (now() - query_start))::numeric, 1) as duration_sec,
        round(extract(epoch from (now() - state_change))::numeric, 1) as state_duration_sec,
        backend_type
      FROM pg_stat_activity
      WHERE datname = $1
        AND pid != pg_backend_pid()
        AND backend_type = 'client backend'
      ORDER BY
        CASE state WHEN 'active' THEN 0 WHEN 'idle in transaction' THEN 1 ELSE 2 END,
        query_start ASC NULLS LAST
    `, [PG_CONFIG.database]);

    return result.rows.map(row => ({
      pid: row.pid,
      usename: row.usename || '',
      client_addr: row.client_addr || '',
      server_name: SERVER_NAME_MAP[row.client_addr] || row.client_addr || '—',
      application_name: row.application_name || '',
      state: row.state || 'unknown',
      wait_event_type: row.wait_event_type || null,
      wait_event: row.wait_event || null,
      query_preview: row.query_preview || '',
      duration_sec: parseFloat(row.duration_sec) || 0,
      state_duration_sec: parseFloat(row.state_duration_sec) || 0,
    }));
  } catch (err) {
    console.error('[PG-Queries] Error fetchActiveConnections:', err.message);
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Fetch índices no usados: pg_stat_user_indexes ─────────────────

async function fetchUnusedIndexes() {
  if (!PG_CONFIG.password) return [];

  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    const result = await client.query(`
      SELECT
        sui.indexrelname as index_name,
        sui.relname as table_name,
        sui.idx_scan,
        pg_relation_size(sui.indexrelid) as index_size_bytes,
        pg_size_pretty(pg_relation_size(sui.indexrelid)) as index_size_pretty,
        pi.indexdef as index_definition
      FROM pg_stat_user_indexes sui
      JOIN pg_indexes pi ON sui.indexrelname = pi.indexname AND sui.schemaname = pi.schemaname
      WHERE sui.schemaname = 'public'
        AND sui.idx_scan = 0
        AND sui.indexrelname NOT LIKE '%_pkey'
        AND pi.indexdef NOT LIKE '%UNIQUE%'
      ORDER BY pg_relation_size(sui.indexrelid) DESC
      LIMIT 50
    `);

    return result.rows.map(row => ({
      index_name: row.index_name || '',
      table_name: row.table_name || '',
      idx_scan: parseInt(row.idx_scan) || 0,
      index_size_bytes: parseInt(row.index_size_bytes) || 0,
      index_size_pretty: row.index_size_pretty || '0 bytes',
      index_definition: row.index_definition || '',
    }));
  } catch (err) {
    console.error('[PG-Queries] Error fetchUnusedIndexes:', err.message);
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Fetch stats de bgwriter: pg_stat_bgwriter ────────────────────

async function fetchBgwriterStats() {
  if (!PG_CONFIG.password) return null;

  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    const result = await client.query(`
      SELECT
        checkpoints_timed,
        checkpoints_req,
        buffers_checkpoint,
        buffers_clean,
        buffers_backend,
        buffers_alloc,
        round(extract(epoch from (now() - stats_reset))::numeric / 3600, 1) as hours_since_reset
      FROM pg_stat_bgwriter
    `);

    if (!result.rows.length) return null;
    const r = result.rows[0];
    const totalCp = (parseInt(r.checkpoints_timed) || 0) + (parseInt(r.checkpoints_req) || 0);
    return {
      checkpoints_timed: parseInt(r.checkpoints_timed) || 0,
      checkpoints_req: parseInt(r.checkpoints_req) || 0,
      checkpoints_req_pct: totalCp > 0 ? +((parseInt(r.checkpoints_req) / totalCp) * 100).toFixed(1) : 0,
      buffers_checkpoint: parseInt(r.buffers_checkpoint) || 0,
      buffers_clean: parseInt(r.buffers_clean) || 0,
      buffers_backend: parseInt(r.buffers_backend) || 0,
      buffers_alloc: parseInt(r.buffers_alloc) || 0,
      hours_since_reset: parseFloat(r.hours_since_reset) || 0,
    };
  } catch (err) {
    console.error('[PG-Queries] Error fetchBgwriterStats:', err.message);
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Fetch stats de WAL: pg_stat_wal (PG14+) ──────────────────────

async function fetchWalStats() {
  if (!PG_CONFIG.password) return null;

  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    const result = await client.query(`
      SELECT
        wal_records,
        wal_fpi,
        wal_bytes,
        round(wal_write_time::numeric, 2) as wal_write_time_ms,
        round(wal_sync_time::numeric, 2) as wal_sync_time_ms,
        wal_buffers_full,
        round(extract(epoch from (now() - stats_reset))::numeric / 3600, 1) as hours_since_reset
      FROM pg_stat_wal
    `);

    if (!result.rows.length) return null;
    const r = result.rows[0];
    const hours = parseFloat(r.hours_since_reset) || 1;
    const walBytes = parseInt(r.wal_bytes) || 0;
    return {
      wal_records: parseInt(r.wal_records) || 0,
      wal_fpi: parseInt(r.wal_fpi) || 0,
      wal_bytes: walBytes,
      wal_mb: +(walBytes / 1024 / 1024).toFixed(1),
      wal_gb: +(walBytes / 1024 / 1024 / 1024).toFixed(2),
      wal_mb_per_hour: +(walBytes / 1024 / 1024 / hours).toFixed(1),
      wal_write_time_ms: parseFloat(r.wal_write_time_ms) || 0,
      wal_sync_time_ms: parseFloat(r.wal_sync_time_ms) || 0,
      wal_buffers_full: parseInt(r.wal_buffers_full) || 0,
      hours_since_reset: hours,
    };
  } catch (err) {
    console.error('[PG-Queries] Error fetchWalStats:', err.message);
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = {
  fetchTopQueries,
  fetchTableStats,
  tableStatsToMap,
  fetchActiveConnections,
  fetchUnusedIndexes,
  fetchBgwriterStats,
  fetchWalStats,
  extractTables,
  deriveModules,
  computeRecommendations,
  LABSIS_TABLE_MODULE_MAP,
  SERVER_NAME_MAP,
};
