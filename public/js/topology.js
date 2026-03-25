// topology.js — Interactive SVG architecture diagram

let topologyData = null;
let topologyLiveData = null;

async function loadTopology() {
  try {
    const res = await authFetch('api/topology');
    topologyData = await res.json();
    renderTopologyDiagram();
  } catch (e) {
    console.error('[Topology] Error:', e);
  }
}

function renderTopologyDiagram() {
  const container = document.getElementById('topology-container');
  if (!container || !topologyData) return;

  const { nodes, edges } = topologyData;
  if (!nodes.length) {
    container.innerHTML = '<div class="no-data">Sin datos de topología</div>';
    return;
  }

  // Layout: group by column
  const columns = {};
  nodes.forEach(n => {
    const col = n.col ?? 1;
    if (!columns[col]) columns[col] = [];
    columns[col].push(n);
  });

  const colKeys = Object.keys(columns).sort((a, b) => a - b);
  const numCols = colKeys.length;
  const maxPerCol = Math.max(...Object.values(columns).map(c => c.length));

  // SVG dimensions (compact)
  const colWidth = 180;
  const rowHeight = 100;
  const padding = 30;
  const svgWidth = numCols * colWidth + padding * 2;
  const svgHeight = maxPerCol * rowHeight + padding * 2;
  const nodeW = 140;
  const nodeH = 70;

  // Assign positions
  const positions = {};
  colKeys.forEach((col, ci) => {
    const nodesInCol = columns[col];
    const colX = padding + ci * colWidth + (colWidth - nodeW) / 2;
    nodesInCol.forEach((node, ri) => {
      const totalH = nodesInCol.length * rowHeight;
      const startY = padding + (svgHeight - padding * 2 - totalH) / 2;
      positions[node.id] = {
        x: colX,
        y: startY + ri * rowHeight + (rowHeight - nodeH) / 2,
        cx: colX + nodeW / 2,
        cy: startY + ri * rowHeight + (rowHeight - nodeH) / 2 + nodeH / 2,
      };
    });
  });

  // Build SVG
  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="topology-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Defs
  svg += `<defs>
    <filter id="topo-shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(30,58,95,0.12)"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="6" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 3 L 0 6 z" fill="var(--text3)"/>
    </marker>
  </defs>`;

  // Edges
  edges.forEach(edge => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;

    const x1 = from.cx + nodeW / 2;
    const y1 = from.cy;
    const x2 = to.cx - nodeW / 2;
    const y2 = to.cy;
    const dx = x2 - x1;
    const cpOffset = Math.max(30, Math.abs(dx) * 0.4);

    svg += `<path d="M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}"
      class="topology-edge" marker-end="url(#arrow)"
      data-from="${edge.from}" data-to="${edge.to}"/>`;
  });

  // Nodes
  nodes.forEach(node => {
    const pos = positions[node.id];
    if (!pos) return;

    const icon = getNodeIcon(node.type);
    const isClickable = node.type === 'app';

    svg += `<g class="topology-node ${isClickable ? 'topology-node-clickable' : ''}"
      data-node-id="${node.id}"
      ${isClickable ? `onclick="setView('server-detail', {serverId:'${node.id}'})"` : ''}
      transform="translate(${pos.x}, ${pos.y})">`;

    // Card background
    svg += `<rect width="${nodeW}" height="${nodeH}" rx="12" class="topology-node-bg" filter="url(#topo-shadow)"/>`;

    // Icon
    svg += `<g transform="translate(12, ${nodeH / 2 - 10})">${icon}</g>`;

    // Labels
    svg += `<text x="${nodeW / 2 + 8}" y="28" class="topology-node-label">${node.label}</text>`;
    if (node.host) {
      svg += `<text x="${nodeW / 2 + 8}" y="43" class="topology-node-ip">${node.host}</text>`;
    }

    // Status dot (top-right)
    svg += `<circle cx="${nodeW - 12}" cy="12" r="4" class="topology-status-dot" data-status-node="${node.id}" fill="var(--text3)"/>`;

    // Mini metric (centered below IP)
    svg += `<text x="${nodeW / 2}" y="${nodeH - 8}" class="topology-mini-metric" data-metric-node="${node.id}" text-anchor="middle"></text>`;

    svg += '</g>';
  });

  svg += '</svg>';

  // Build legend from site info
  let legendHtml = '';
  try {
    const siteInfo = siteInfoData; // from infographic.js global
    if (siteInfo) {
      const { siteName, summary, client } = siteInfo;
      const name = client?.name || siteName || 'LABSIS';
      const parts = [];
      if (summary?.totalServers) parts.push(`${summary.totalServers} Servidores`);
      if (summary?.totalMemGB) parts.push(`${summary.totalMemGB} GB RAM`);
      if (summary?.totalDiskGB) parts.push(`${summary.totalDiskGB} GB Disco`);
      legendHtml = `<div style="text-align:center;padding:10px 0 4px;font:400 12px/1 var(--font-sans);color:var(--text3);letter-spacing:0.3px;">${name} · ${parts.join(' · ')}</div>`;
    }
  } catch(e) {}

  container.innerHTML = svg + legendHtml;

  // Entrance animation — staggered fade-in (opacity only, no transform to preserve SVG translate)
  const nodeEls = container.querySelectorAll('.topology-node');
  const edgeEls = container.querySelectorAll('.topology-edge');

  // Start hidden
  edgeEls.forEach(e => { e.style.opacity = '0'; });
  nodeEls.forEach(n => { n.style.opacity = '0'; });

  // Animate in
  requestAnimationFrame(() => {
    nodeEls.forEach((n, i) => {
      setTimeout(() => {
        n.style.transition = 'opacity 0.5s ease';
        n.style.opacity = '1';
      }, i * 150);
    });
    edgeEls.forEach((e, i) => {
      setTimeout(() => {
        e.style.transition = 'opacity 0.6s ease';
        e.style.opacity = '1';
      }, nodeEls.length * 150 + i * 120);
    });
  });
}

function getNodeIcon(type) {
  const icons = {
    loadbalancer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/><path d="M8 8l4 4 4-4M8 16l4-4 4 4"/></svg>',
    app: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="var(--primary)"/><circle cx="6" cy="18" r="1" fill="var(--primary)"/></svg>',
    database: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>',
    storage: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="1.5"><path d="M17.5 19H9a7 7 0 110-14h.5"/><path d="M17.5 5a5.5 5.5 0 010 11h-2"/></svg>',
  };
  return icons[type] || icons.app;
}

function updateTopologyStatus(data) {
  if (!topologyData || !data) return;

  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];

  servers.forEach(srv => {
    const serverData = data[srv.id];
    if (!serverData || !serverData.length) return;

    const latest = serverData[serverData.length - 1];

    // Update status dot
    const dot = document.querySelector(`[data-status-node="${srv.id}"]`);
    if (dot) {
      const cpuUsed = 100 - (latest.cpu_idle || 100);
      const color = cpuUsed > 85 ? 'var(--red)' : cpuUsed > 70 ? 'var(--yellow)' : 'var(--green)';
      dot.setAttribute('fill', color);
    }

    // Update mini metric
    const metric = document.querySelector(`[data-metric-node="${srv.id}"]`);
    if (metric) {
      const cpuUsed = 100 - (latest.cpu_idle || 100);
      metric.textContent = `CPU ${cpuUsed.toFixed(0)}%`;
    }
  });

  // Update DB node if exists
  const rdsData = data.rds;
  if (rdsData && rdsData.length) {
    const latest = rdsData[rdsData.length - 1];
    const dbDot = document.querySelector('[data-status-node="db"]');
    if (dbDot) {
      const cacheHit = latest.cache_hit_table_pct || 100;
      const color = cacheHit < 95 ? 'var(--red)' : cacheHit < 99 ? 'var(--yellow)' : 'var(--green)';
      dbDot.setAttribute('fill', color);
    }
    const dbMetric = document.querySelector('[data-metric-node="db"]');
    if (dbMetric) {
      dbMetric.textContent = `${latest.active_conns || 0} conns`;
    }
  }
}
