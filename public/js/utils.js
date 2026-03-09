// Utilidades de formateo y tema

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatPct(val) {
  return (val || 0).toFixed(1) + '%';
}

function formatMB(val) {
  if (!val) return '0 MB';
  if (val >= 1024) return (val / 1024).toFixed(1) + ' GB';
  return Math.round(val) + ' MB';
}

function formatBytes(val) {
  if (!val) return '0 B';
  if (val >= 1e9) return (val / 1e9).toFixed(1) + ' GB';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + ' MB';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + ' KB';
  return val + ' B';
}

function formatNum(val) {
  if (!val) return '0';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  return val.toString();
}

function formatTime(secs) {
  if (!secs) return '0s';
  if (secs >= 3600) return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  if (secs >= 60) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
  return secs + 's';
}

function getStatusColor(metric, value) {
  const THRESHOLDS = {
    cpu_idle: { green: [30, 100], yellow: [15, 30], red: [0, 15] },
    cpu_steal: { green: [0, 15], yellow: [15, 30], red: [30, 100] },
    mem_used_pct: { green: [0, 70], yellow: [70, 85], red: [85, 100] },
    disk_pct: { green: [0, 75], yellow: [75, 85], red: [85, 100] },
    jboss_rss_mb: { green: [0, 15000], yellow: [15000, 18000], red: [18000, Infinity] },
    cache_hit_table_pct: { green: [99, 100], yellow: [95, 99], red: [0, 95] },
    idle_in_tx_conns: { green: [0, 2], yellow: [3, 5], red: [6, Infinity] },
    waiting_locks: { green: [0, 0], yellow: [1, 3], red: [4, Infinity] },
    queries_gt_30s: { green: [0, 0], yellow: [1, 2], red: [3, Infinity] },
    total_connections: { green: [0, 100], yellow: [100, 200], red: [200, Infinity] },
  };
  const t = THRESHOLDS[metric];
  if (!t) return 'green';
  if (value >= t.red[0] && value <= t.red[1]) return 'red';
  if (value >= t.yellow[0] && value <= t.yellow[1]) return 'yellow';
  return 'green';
}

function lastItem(arr) {
  return arr && arr.length > 0 ? arr[arr.length - 1] : null;
}
