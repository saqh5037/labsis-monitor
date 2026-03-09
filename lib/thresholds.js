// Umbrales verde/amarillo/rojo para cada métrica
// Formato: [min, max] — el valor cae en la primera categoría que coincida

const THRESHOLDS = {
  // CPU idle: bajo = malo (invertido)
  cpu_idle: { green: [30, 100], yellow: [15, 30], red: [0, 15] },
  cpu_steal: { green: [0, 15], yellow: [15, 30], red: [30, 100] },

  // Memoria usada %
  mem_used_pct: { green: [0, 85], yellow: [85, 92], red: [92, 100] },

  // Disco
  disk_pct: { green: [0, 75], yellow: [75, 85], red: [85, 100] },

  // JBoss
  jboss_rss_mb: { green: [0, 15360], yellow: [15360, 17408], red: [17408, Infinity] },
  jboss_threads: { green: [0, 150], yellow: [150, 250], red: [250, Infinity] },

  // BD
  cache_hit_table_pct: { green: [99, 100], yellow: [95, 99], red: [0, 95] },
  cache_hit_index_pct: { green: [99.5, 100], yellow: [98, 99.5], red: [0, 98] },
  idle_in_tx_conns: { green: [0, 2], yellow: [3, 5], red: [6, Infinity] },
  waiting_locks: { green: [0, 0], yellow: [1, 3], red: [4, Infinity] },
  queries_gt_30s: { green: [0, 0], yellow: [1, 2], red: [3, Infinity] },
  total_connections: { green: [0, 100], yellow: [100, 200], red: [200, Infinity] },

  // TCP
  tcp8080_closewait: { green: [0, 5], yellow: [6, 20], red: [21, Infinity] },
};

function getStatus(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t) return 'green';
  if (value >= t.red[0] && value <= t.red[1]) return 'red';
  if (value >= t.yellow[0] && value <= t.yellow[1]) return 'yellow';
  return 'green';
}

module.exports = { THRESHOLDS, getStatus };
