// lib/topology.js — Build ecosystem topology with zone-based layout

function buildTopology(serversConfig, topologyOverride) {
  const nodes = [];
  const edges = [];

  let override = {};
  if (topologyOverride) {
    try {
      override = typeof topologyOverride === 'string' ? JSON.parse(topologyOverride) : topologyOverride;
    } catch (e) {
      console.error('[Topology] Error parsing SITE_TOPOLOGY:', e.message);
    }
  }

  // --- Entry Points (zone: entry) ---
  if (override.entryPoints) {
    override.entryPoints.forEach((ep, i) => {
      nodes.push({
        id: `entry_${i}`,
        type: 'entrypoint',
        subtype: ep.type,
        label: ep.label,
        count: ep.count,
        protocol: ep.protocol,
        desc: ep.desc,
        zone: 'entry',
        zoneRow: i,
      });
    });
  }

  // --- Servers grouped by role (zone: prod / qa) ---
  const serverIds = Object.keys(serversConfig);
  const prodServers = serverIds.filter(id => (serversConfig[id].role || 'production') === 'production');
  const qaServers = serverIds.filter(id => {
    const role = serversConfig[id].role || 'production';
    return role === 'qa' || role === 'spare';
  });

  prodServers.forEach((id, i) => {
    const srv = serversConfig[id];
    nodes.push({
      id,
      type: 'app',
      role: 'production',
      label: srv.name || id,
      host: srv.ip || srv.host || '',
      diskGB: srv.diskGB,
      memGB: srv.memGB,
      heapGB: srv.heapGB,
      appPort: srv.appPort || 8080,
      apps: srv.apps || [],
      anomalies: srv.anomalies || [],
      zone: 'prod',
      zoneRow: i,
    });
  });

  qaServers.forEach((id, i) => {
    const srv = serversConfig[id];
    nodes.push({
      id,
      type: 'app',
      role: srv.role || 'qa',
      label: srv.name || id,
      host: srv.ip || srv.host || '',
      diskGB: srv.diskGB,
      memGB: srv.memGB,
      heapGB: srv.heapGB,
      appPort: srv.appPort || 8080,
      apps: srv.apps || [],
      anomalies: srv.anomalies || [],
      zone: 'qa',
      zoneRow: i,
    });
  });

  // --- Database (zone: data) ---
  const hasDB = override.database || Object.values(serversConfig).some(s => s.rdsCSV);
  if (hasDB) {
    const db = override.database || {};
    nodes.push({
      id: 'db',
      type: 'database',
      label: db.label || 'PostgreSQL',
      host: db.host || '',
      port: db.port,
      dbName: db.dbName,
      env: db.env || 'Produccion',
      datasources: db.datasources || [],
      qaNote: db.qaNote || null,
      zone: 'data',
      zoneRow: 0,
    });
  }

  // --- Storage (zone: storage) ---
  const hasStorage = override.storage || Object.values(serversConfig).some(s => s.backupPath);
  if (hasStorage) {
    const st = override.storage || {};
    nodes.push({
      id: 'storage',
      type: 'storage',
      label: st.label || 'Backup Storage',
      host: st.bucket || '',
      nfs: st.nfs || '',
      zone: 'storage',
      zoneRow: 0,
    });
  }

  // --- Edges ---
  const entryIds = nodes.filter(n => n.type === 'entrypoint').map(n => n.id);

  // Entry → Prod servers (direct, no LB)
  entryIds.forEach(eid => {
    prodServers.forEach(sid => {
      edges.push({ from: eid, to: sid, style: 'solid' });
    });
  });

  // Entry → QA servers (dashed — test access)
  entryIds.forEach(eid => {
    qaServers.forEach(sid => {
      edges.push({ from: eid, to: sid, style: 'dashed' });
    });
  });

  // Prod servers → DB
  if (hasDB) {
    prodServers.forEach(id => {
      edges.push({ from: id, to: 'db', style: 'solid' });
    });
  }

  // QA servers → DB (dashed — "usa BD Prod")
  if (hasDB) {
    qaServers.forEach(id => {
      edges.push({ from: id, to: 'db', style: 'dashed', label: 'BD Prod' });
    });
  }

  // DB → Storage
  if (hasDB && hasStorage) {
    edges.push({ from: 'db', to: 'storage', style: 'solid' });
  }

  return { nodes, edges };
}

module.exports = { buildTopology };
