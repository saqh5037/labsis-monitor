// Parseo de CSVs de monitoreo

const LABSIS_COLUMNS = [
  'timestamp', 'hostname',
  'cpu_user', 'cpu_sys', 'cpu_iowait', 'cpu_steal', 'cpu_idle',
  'load_1', 'load_5', 'load_15',
  'mem_total_mb', 'mem_used_mb', 'mem_free_mb', 'mem_available_mb', 'mem_bufcache_mb',
  'jboss_pid', 'jboss_rss_mb', 'jboss_vsz_mb', 'jboss_cpu_pct', 'jboss_threads',
  'disk_root_pct', 'disk_tmp_pct',
  'tcp8080_estab', 'tcp8080_timewait', 'tcp8080_closewait', 'tcp8080_total',
  'tcp5432_estab', 'tcp5432_timewait', 'tcp5432_total',
  'diskio_sectors_r', 'diskio_sectors_w',
  'net_rx_bytes', 'net_tx_bytes'
];

const RDS_COLUMNS = [
  'timestamp',
  'total_connections', 'active_conns', 'idle_conns', 'idle_in_tx_conns',
  'waiting_locks',
  'cache_hit_table_pct', 'cache_hit_index_pct',
  'xact_commit', 'xact_rollback', 'deadlocks',
  'temp_files', 'temp_bytes',
  'blk_read_time_ms', 'blk_write_time_ms',
  'tup_returned', 'tup_fetched', 'tup_inserted', 'tup_updated', 'tup_deleted',
  'max_query_duration_sec', 'queries_gt_30s'
];

const STRING_COLS = new Set(['timestamp', 'hostname', 'jboss_pid']);

function parseCSV(text, columns) {
  const lines = text.trim().split('\n');
  const rows = [];
  for (const line of lines) {
    // Skip header
    if (line.startsWith('timestamp,')) continue;
    const parts = line.split(',');
    if (parts.length < columns.length) continue;
    const row = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const val = parts[i];
      if (STRING_COLS.has(col)) {
        row[col] = val;
      } else {
        row[col] = parseFloat(val) || 0;
      }
    }
    rows.push(row);
  }
  return rows;
}

function parseLabsisCSV(text) {
  return parseCSV(text, LABSIS_COLUMNS);
}

function parseRdsCSV(text) {
  return parseCSV(text, RDS_COLUMNS);
}

// Calcula deltas para contadores acumulativos de RDS
function computeRdsDeltas(rows) {
  if (rows.length < 2) return rows;
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const curr = rows[i];
    const prev = rows[i - 1];
    const intervalSec = 300; // 5 min
    result.push({
      ...curr,
      tps_commit: Math.max(0, (curr.xact_commit - prev.xact_commit) / intervalSec),
      tps_rollback: Math.max(0, (curr.xact_rollback - prev.xact_rollback) / intervalSec),
      deadlocks_delta: Math.max(0, curr.deadlocks - prev.deadlocks),
      temp_files_delta: Math.max(0, curr.temp_files - prev.temp_files),
      temp_bytes_delta: Math.max(0, curr.temp_bytes - prev.temp_bytes),
      blk_read_rate: Math.max(0, (curr.blk_read_time_ms - prev.blk_read_time_ms) / intervalSec),
      blk_write_rate: Math.max(0, (curr.blk_write_time_ms - prev.blk_write_time_ms) / intervalSec),
    });
  }
  return result;
}

// Calcula deltas para disk I/O y network (contadores acumulativos del OS)
function computeLabsisDeltas(rows) {
  if (rows.length < 2) return rows;
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const curr = rows[i];
    const prev = rows[i - 1];
    result.push({
      ...curr,
      diskio_read_delta: Math.max(0, curr.diskio_sectors_r - prev.diskio_sectors_r),
      diskio_write_delta: Math.max(0, curr.diskio_sectors_w - prev.diskio_sectors_w),
      net_rx_delta: Math.max(0, curr.net_rx_bytes - prev.net_rx_bytes),
      net_tx_delta: Math.max(0, curr.net_tx_bytes - prev.net_tx_bytes),
    });
  }
  return result;
}

module.exports = { parseLabsisCSV, parseRdsCSV, computeRdsDeltas, computeLabsisDeltas };
