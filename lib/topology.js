// lib/topology.js — Auto-generate server topology from config

function buildTopology(serversConfig, topologyOverride) {
  const nodes = [];
  const edges = [];
  const serverIds = Object.keys(serversConfig);

  // Parse override si existe
  let override = {};
  if (topologyOverride) {
    try {
      override = typeof topologyOverride === 'string' ? JSON.parse(topologyOverride) : topologyOverride;
    } catch (e) {
      console.error('[Topology] Error parsing SITE_TOPOLOGY:', e.message);
    }
  }

  // Detectar si hay load balancer (>1 app server o override)
  const hasLB = override.loadBalancer || serverIds.length > 1;
  if (hasLB) {
    const lb = override.loadBalancer || {};
    nodes.push({
      id: 'lb',
      type: 'loadbalancer',
      label: lb.label || 'Load Balancer',
      host: lb.host || '',
      col: 0,
    });
  }

  // Agregar app servers
  serverIds.forEach(id => {
    const srv = serversConfig[id];
    const role = override.roles?.[id] || 'app';
    nodes.push({
      id,
      type: role,
      label: srv.name || id,
      host: srv.ip || srv.host || '',
      diskGB: srv.diskGB,
      memGB: srv.memGB,
      heapGB: srv.heapGB,
      appPort: srv.appPort || 8080,
      col: 1,
    });

    // Edge desde LB
    if (hasLB) {
      edges.push({ from: 'lb', to: id });
    }
  });

  // Detectar database (algún server tiene rdsCSV o hay override)
  const hasDB = override.database || Object.values(serversConfig).some(s => s.rdsCSV);
  if (hasDB) {
    const db = override.database || {};
    nodes.push({
      id: 'db',
      type: 'database',
      label: db.label || 'PostgreSQL',
      host: db.host || '',
      col: 2,
    });

    // Edges desde app servers a DB
    serverIds.forEach(id => {
      edges.push({ from: id, to: 'db' });
    });
  }

  // Detectar storage (backupPath o override)
  const hasStorage = override.storage || Object.values(serversConfig).some(s => s.backupPath);
  if (hasStorage) {
    const st = override.storage || {};
    nodes.push({
      id: 'storage',
      type: 'storage',
      label: st.label || 'Backup Storage',
      host: st.bucket || '',
      col: 3,
    });

    // Edge desde DB a storage
    if (hasDB) {
      edges.push({ from: 'db', to: 'storage' });
    }
  }

  return { nodes, edges };
}

module.exports = { buildTopology };
