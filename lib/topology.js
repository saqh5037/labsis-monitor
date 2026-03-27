// lib/topology.js — Auto-generate server topology from config (v2 — 5 columns)

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

  // Col 0: Entry Points (usuarios, equipos)
  if (override.entryPoints && override.entryPoints.length) {
    override.entryPoints.forEach((ep, i) => {
      nodes.push({
        id: `entry_${i}`,
        type: 'entrypoint',
        label: ep.label,
        subtype: ep.type,
        count: ep.count,
        protocol: ep.protocol,
        col: 0,
      });
    });
  }

  // Col 1: Load Balancer
  const hasLB = override.loadBalancer || serverIds.length > 1;
  if (hasLB) {
    const lb = override.loadBalancer || {};
    nodes.push({
      id: 'lb',
      type: 'loadbalancer',
      label: lb.label || 'Load Balancer',
      host: lb.host || '',
      status: lb.status || 'active',
      col: 1,
    });
  }

  // Col 2: App servers with role, apps, anomalies
  serverIds.forEach(id => {
    const srv = serversConfig[id];
    nodes.push({
      id,
      type: 'app',
      role: srv.role || 'production',
      label: srv.name || id,
      host: srv.ip || srv.host || '',
      diskGB: srv.diskGB,
      memGB: srv.memGB,
      heapGB: srv.heapGB,
      appPort: srv.appPort || 8080,
      apps: srv.apps || [],
      anomalies: srv.anomalies || [],
      crons: srv.crons || [],
      nginx: srv.nginx || null,
      col: 2,
    });
  });

  // Col 3: Database with datasources
  const hasDB = override.database || Object.values(serversConfig).some(s => s.rdsCSV);
  if (hasDB) {
    const db = override.database || {};
    nodes.push({
      id: 'db',
      type: 'database',
      label: db.label || 'PostgreSQL',
      host: db.host || '',
      datasources: db.datasources || [],
      col: 3,
    });
  }

  // Col 4: Storage
  const hasStorage = override.storage || Object.values(serversConfig).some(s => s.backupPath);
  if (hasStorage) {
    const st = override.storage || {};
    nodes.push({
      id: 'storage',
      type: 'storage',
      label: st.label || 'Backup Storage',
      host: st.bucket || '',
      nfs: st.nfs || '',
      col: 4,
    });
  }

  // --- Edges ---

  const lbIsInactive = override.loadBalancer?.status === 'inactive';
  const entryIds = nodes.filter(n => n.type === 'entrypoint').map(n => n.id);
  const prodServerIds = serverIds.filter(id => serversConfig[id].role === 'production');
  const nonProdServerIds = serverIds.filter(id => serversConfig[id].role !== 'production');

  // Entry points → LB
  if (hasLB && entryIds.length) {
    entryIds.forEach(eid => {
      edges.push({ from: eid, to: 'lb', style: lbIsInactive ? 'inactive' : 'active' });
    });
  }

  // LB → production servers (or inactive dashed)
  if (hasLB) {
    prodServerIds.forEach(id => {
      edges.push({ from: 'lb', to: id, style: lbIsInactive ? 'inactive' : 'active' });
    });
  }

  // Direct entry → servers bypass if LB inactive
  if (lbIsInactive && entryIds.length) {
    prodServerIds.forEach(id => {
      entryIds.forEach(eid => {
        edges.push({ from: eid, to: id, style: 'bypass' });
      });
    });
  }

  // Non-prod servers get direct edges from entry (dashed)
  if (entryIds.length) {
    nonProdServerIds.forEach(id => {
      entryIds.forEach(eid => {
        edges.push({ from: eid, to: id, style: 'secondary' });
      });
    });
  }

  // All app servers → DB
  if (hasDB) {
    serverIds.forEach(id => {
      edges.push({ from: id, to: 'db' });
    });
  }

  // DB → Storage
  if (hasDB && hasStorage) {
    edges.push({ from: 'db', to: 'storage' });
  }

  return { nodes, edges };
}

module.exports = { buildTopology };
