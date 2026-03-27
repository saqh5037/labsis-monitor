// topology.js — Interactive SVG architecture diagram (v2 — 5 columns, enriched nodes)

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
    container.innerHTML = '<div class="no-data">Sin datos de topologia</div>';
    return;
  }

  // Layout: group by column
  const columns = {};
  nodes.forEach(n => {
    const col = n.col ?? 2;
    if (!columns[col]) columns[col] = [];
    columns[col].push(n);
  });

  const colKeys = Object.keys(columns).sort((a, b) => a - b);
  const numCols = colKeys.length;

  // Dynamic node heights — app nodes with apps need more height
  const baseNodeH = 90;
  const appNodeH = 160; // taller for app chips
  const nodeW = 190;

  // Calculate max height per column considering variable node heights
  let maxColH = 0;
  colKeys.forEach(col => {
    const nodesInCol = columns[col];
    let colH = 0;
    nodesInCol.forEach(n => {
      colH += (n.type === 'app' ? appNodeH : baseNodeH) + 20; // 20px gap
    });
    maxColH = Math.max(maxColH, colH);
  });

  const colWidth = 260;
  const padding = 40;
  const svgWidth = numCols * colWidth + padding * 2;
  const svgHeight = Math.max(maxColH + padding * 2 + 30, 500);

  // Assign positions with variable heights
  const positions = {};
  colKeys.forEach((col, ci) => {
    const nodesInCol = columns[col];
    const colX = padding + ci * colWidth + (colWidth - nodeW) / 2;

    // Calculate total height for this column
    let totalH = 0;
    nodesInCol.forEach(n => { totalH += (n.type === 'app' ? appNodeH : baseNodeH) + 20; });
    totalH -= 20; // remove last gap

    let currentY = padding + 20 + (svgHeight - padding * 2 - 20 - totalH) / 2;
    nodesInCol.forEach(node => {
      const nh = node.type === 'app' ? appNodeH : baseNodeH;
      positions[node.id] = {
        x: colX,
        y: currentY,
        cx: colX + nodeW / 2,
        cy: currentY + nh / 2,
        h: nh,
      };
      currentY += nh + 20;
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
    <linearGradient id="grad-loadbalancer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient>
    <linearGradient id="grad-inactive" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6b7280"/><stop offset="100%" stop-color="#4b5563"/>
    </linearGradient>
    <linearGradient id="grad-app" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="grad-app-qa" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="grad-app-spare" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6b7280"/><stop offset="100%" stop-color="#4b5563"/>
    </linearGradient>
    <linearGradient id="grad-database" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#059669"/><stop offset="100%" stop-color="#047857"/>
    </linearGradient>
    <linearGradient id="grad-storage" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#0891b2"/>
    </linearGradient>
    <linearGradient id="grad-entrypoint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>`;

  // Zone backgrounds
  const zoneColors = {
    0: { fill: 'rgba(245,158,11,0.04)', label: 'USUARIOS / EQUIPOS' },
    1: { fill: 'rgba(139,92,246,0.04)', label: 'BALANCEADOR' },
    2: { fill: 'rgba(59,130,246,0.04)', label: 'SERVIDORES' },
    3: { fill: 'rgba(5,150,105,0.04)', label: 'BASE DE DATOS' },
    4: { fill: 'rgba(6,182,212,0.04)', label: 'ALMACENAMIENTO' },
  };

  colKeys.forEach((col, ci) => {
    const zone = zoneColors[parseInt(col)] || zoneColors[2];
    const zx = padding / 2 + ci * colWidth;
    svg += `<rect x="${zx}" y="${padding / 2}" width="${colWidth}" height="${svgHeight - padding}" rx="8" class="topology-zone" fill="${zone.fill}"/>`;
    svg += `<text x="${zx + colWidth / 2}" y="${padding - 4}" class="topology-zone-label" text-anchor="middle" font-size="9" font-weight="600" letter-spacing="1">${zone.label}</text>`;
  });

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

    const isInactive = edge.style === 'inactive';
    const isBypass = edge.style === 'bypass';
    const isSecondary = edge.style === 'secondary';
    const dashAttr = (isInactive || isSecondary) ? 'stroke-dasharray="6 4"' : '';
    const opacity = isInactive ? '0.3' : isBypass ? '0.5' : isSecondary ? '0.3' : '0.12';

    // Glow edge
    svg += `<path d="M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}"
      class="topology-edge-glow" fill="none" stroke="var(--primary)" stroke-width="6" opacity="${opacity}" stroke-linecap="round" ${dashAttr}/>`;

    // Normal edge
    svg += `<path d="M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}"
      class="topology-edge" marker-end="url(#arrow)" ${dashAttr}
      data-from="${edge.from}" data-to="${edge.to}"/>`;
  });

  // Nodes
  nodes.forEach(node => {
    const pos = positions[node.id];
    if (!pos) return;

    const nh = pos.h;
    const isClickable = node.type === 'app';
    const isInactiveLB = node.type === 'loadbalancer' && node.status === 'inactive';

    // Determine gradient
    let grad = `url(#grad-${node.type})`;
    if (isInactiveLB) grad = 'url(#grad-inactive)';
    else if (node.type === 'app' && node.role === 'qa') grad = 'url(#grad-app-qa)';
    else if (node.type === 'app' && node.role === 'spare') grad = 'url(#grad-app-spare)';

    const icon = getNodeIcon(node.type, node.subtype);

    svg += `<g class="topology-node ${isClickable ? 'topology-node-clickable' : ''}"
      data-node-id="${node.id}"
      ${isClickable ? `onclick="setView('server-detail', {serverId:'${node.id}'})"` : ''}
      transform="translate(${pos.x}, ${pos.y})">`;

    // Card background
    svg += `<rect width="${nodeW}" height="${nh}" rx="12" fill="${grad}" filter="url(#topo-shadow)" class="topology-node-bg"/>`;

    // Icon
    svg += `<g transform="translate(12, 14)">${icon}</g>`;

    // Label
    svg += `<text x="${nodeW / 2 + 8}" y="28" class="topology-node-label">${node.label}</text>`;

    // Host/IP
    if (node.host) {
      const hostDisplay = node.host.length > 24 ? node.host.substring(0, 22) + '..' : node.host;
      svg += `<text x="${nodeW / 2 + 8}" y="44" class="topology-node-ip">${hostDisplay}</text>`;
    }

    // Role badge (for app nodes)
    if (node.type === 'app' && node.role) {
      const roleLabels = { production: 'PROD', qa: 'QA', spare: 'SPARE' };
      const roleColors = { production: '#10b981', qa: '#f59e0b', spare: '#6b7280' };
      const rl = roleLabels[node.role] || node.role.toUpperCase();
      const rc = roleColors[node.role] || '#6b7280';
      svg += `<rect x="${nodeW - 50}" y="36" width="38" height="14" rx="3" fill="${rc}" opacity="0.9"/>`;
      svg += `<text x="${nodeW - 31}" y="46" text-anchor="middle" font-size="7" font-weight="700" fill="white" letter-spacing="0.5">${rl}</text>`;
    }

    // Entry point extra info
    if (node.type === 'entrypoint') {
      if (node.count) {
        svg += `<text x="${nodeW / 2}" y="60" text-anchor="middle" font-size="20" font-weight="700" fill="white" opacity="0.9">${node.count}</text>`;
        svg += `<text x="${nodeW / 2}" y="73" text-anchor="middle" font-size="9" fill="white" opacity="0.6">usuarios</text>`;
      }
      if (node.protocol) {
        svg += `<text x="${nodeW / 2}" y="60" text-anchor="middle" font-size="10" fill="white" opacity="0.7">${node.protocol}</text>`;
      }
    }

    // LB inactive indicator
    if (isInactiveLB) {
      svg += `<rect x="10" y="${nh - 28}" width="${nodeW - 20}" height="18" rx="4" fill="rgba(239,68,68,0.25)"/>`;
      svg += `<text x="${nodeW / 2}" y="${nh - 15}" text-anchor="middle" font-size="9" font-weight="600" fill="#fca5a5" letter-spacing="0.5">INACTIVO</text>`;
    }

    // App chips (for server nodes)
    if (node.type === 'app' && node.apps && node.apps.length) {
      let appY = 60;
      const maxApps = 6;
      node.apps.slice(0, maxApps).forEach(app => {
        const statusColor = app.status === 'active' ? '#10b981' :
                            app.status === 'anomaly' ? '#f59e0b' :
                            app.status === 'prepared' ? '#60a5fa' : '#6b7280';
        svg += `<circle cx="14" cy="${appY}" r="3" fill="${statusColor}"/>`;
        const portStr = app.port ? ` :${app.port}` : '';
        svg += `<text x="22" y="${appY + 3}" font-size="8" fill="white" opacity="0.85">${app.name}${portStr}</text>`;
        appY += 14;
      });
      if (node.apps.length > maxApps) {
        svg += `<text x="22" y="${appY + 3}" font-size="7" fill="white" opacity="0.5">+${node.apps.length - maxApps} mas</text>`;
      }
    }

    // Datasources (for DB node)
    if (node.type === 'database' && node.datasources && node.datasources.length) {
      let dsY = 58;
      node.datasources.forEach(ds => {
        svg += `<text x="14" y="${dsY}" font-size="7.5" fill="white" opacity="0.75">${ds.name}</text>`;
        svg += `<text x="${nodeW - 14}" y="${dsY}" text-anchor="end" font-size="7" fill="white" opacity="0.5">pool ${ds.pool}</text>`;
        dsY += 12;
      });
    }

    // Anomalies indicator
    if (node.anomalies && node.anomalies.length) {
      svg += `<rect x="10" y="${nh - 28}" width="${nodeW - 20}" height="18" rx="4" fill="rgba(245,158,11,0.25)"/>`;
      svg += `<text x="${nodeW / 2}" y="${nh - 15}" text-anchor="middle" font-size="7.5" font-weight="500" fill="#fbbf24">ANOMALIA</text>`;
    }

    // Status glow + dot (top-right)
    if (node.type !== 'entrypoint') {
      svg += `<circle cx="${nodeW - 14}" cy="14" r="10" class="topology-status-glow" data-glow-node="${node.id}" fill="var(--text3)" opacity="0.15"/>`;
      svg += `<circle cx="${nodeW - 14}" cy="14" r="6" class="topology-status-dot" data-status-node="${node.id}" fill="var(--text3)"/>`;
    }

    // Mini metric
    if (node.type === 'app' || node.type === 'database') {
      svg += `<text x="${nodeW / 2}" y="${nh - 4}" class="topology-mini-metric" data-metric-node="${node.id}" text-anchor="middle" font-size="11" font-weight="600"></text>`;
    }

    svg += '</g>';
  });

  svg += '</svg>';

  // Legend
  let legendHtml = '';
  try {
    const siteInfo = siteInfoData;
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

  legendHtml += `<div class="topology-legend">
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:var(--green)"></span>Normal</span>
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:var(--yellow)"></span>Alerta</span>
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:var(--red)"></span>Critico</span>
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:#60a5fa"></span>Preparado</span>
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:#6b7280"></span>Inactivo</span>
    <span class="topology-legend-sep">|</span>
    <span class="topology-legend-hint">Scroll zoom · Arrastra · Doble-click reset</span>
  </div>`;

  container.innerHTML = svg + legendHtml;

  // Entrance animation
  const nodeEls = container.querySelectorAll('.topology-node');
  const edgeEls = container.querySelectorAll('.topology-edge');

  edgeEls.forEach(e => { e.style.opacity = '0'; });
  nodeEls.forEach(n => { n.style.opacity = '0'; });

  requestAnimationFrame(() => {
    nodeEls.forEach((n, i) => {
      setTimeout(() => {
        n.style.transition = 'opacity 0.5s ease';
        n.style.opacity = '1';
      }, i * 120);
    });
    edgeEls.forEach((e, i) => {
      setTimeout(() => {
        e.style.transition = 'opacity 0.6s ease';
        e.style.opacity = '1';
      }, nodeEls.length * 120 + i * 80);
    });
  });

  // Zoom & Pan
  const svgEl = container.querySelector('.topology-svg');
  if (svgEl) {
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startX, startY;
    const originalVB = svgEl.viewBox.baseVal;
    const vbW = originalVB.width;
    const vbH = originalVB.height;

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.04 : 0.96;
      const newScale = Math.max(0.6, Math.min(3, scale * delta));
      const rect = svgEl.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / rect.width;
      const mouseY = (e.clientY - rect.top) / rect.height;
      const scaleDiff = newScale / scale;
      panX = mouseX * vbW * (1 - scaleDiff) + panX * scaleDiff;
      panY = mouseY * vbH * (1 - scaleDiff) + panY * scaleDiff;
      scale = newScale;
      clampPan();
      updateViewBox();
    }, { passive: false });

    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.topology-node-clickable')) return;
      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      const rect = svgEl.getBoundingClientRect();
      const dx = (e.clientX - startX) / rect.width * vbW / scale;
      const dy = (e.clientY - startY) / rect.height * vbH / scale;
      panX -= dx;
      panY -= dy;
      startX = e.clientX;
      startY = e.clientY;
      clampPan();
      updateViewBox();
    });

    window.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        container.style.cursor = '';
      }
    });

    container.addEventListener('dblclick', (e) => {
      if (e.target.closest('.topology-node-clickable')) return;
      scale = 1;
      panX = 0;
      panY = 0;
      svgEl.style.transition = 'all 0.3s ease';
      updateViewBox();
      setTimeout(() => { svgEl.style.transition = ''; }, 350);
    });

    function clampPan() {
      const w = vbW / scale;
      const h = vbH / scale;
      const maxPanX = vbW - w;
      const maxPanY = vbH - h;
      panX = Math.max(Math.min(maxPanX, 0), Math.min(panX, Math.max(maxPanX, 0)));
      panY = Math.max(Math.min(maxPanY, 0), Math.min(panY, Math.max(maxPanY, 0)));
    }

    function updateViewBox() {
      const w = vbW / scale;
      const h = vbH / scale;
      svgEl.setAttribute('viewBox', `${panX.toFixed(1)} ${panY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    }

    container.style.cursor = 'grab';
  }
}

function getNodeIcon(type, subtype) {
  const icons = {
    loadbalancer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/><path d="M8 8l4 4 4-4M8 16l4-4 4 4"/></svg>',
    app: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="var(--primary)"/><circle cx="6" cy="18" r="1" fill="var(--primary)"/></svg>',
    database: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>',
    storage: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="1.5"><path d="M17.5 19H9a7 7 0 110-14h.5"/><path d="M17.5 5a5.5 5.5 0 010 11h-2"/></svg>',
    entrypoint: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    equipment: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.5"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M4 16l-2 4h20l-2-4"/><path d="M12 8v4M10 10h4"/></svg>',
  };
  if (type === 'entrypoint' && subtype === 'equipment') return icons.equipment;
  return icons[type] || icons.app;
}

function updateTopologyStatus(data) {
  if (!topologyData || !data) return;

  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];

  servers.forEach(srv => {
    const serverData = data[srv.id];
    if (!serverData || !serverData.length) return;

    const latest = serverData[serverData.length - 1];
    const cpuUsed = 100 - (latest.cpu_idle || 100);
    const memPct = latest.mem_total_mb > 0 ? (latest.mem_used_mb / latest.mem_total_mb * 100) : 0;

    // Check for anomalies override
    const srvConfig = window.SITE_CONFIG?.servers?.find(s => s.id === srv.id);
    const hasAnomaly = srvConfig?.anomalies?.length > 0;

    const color = hasAnomaly ? 'var(--yellow)' :
                  cpuUsed > 85 ? 'var(--red)' : cpuUsed > 70 ? 'var(--yellow)' : 'var(--green)';

    const dot = document.querySelector(`[data-status-node="${srv.id}"]`);
    if (dot) dot.setAttribute('fill', color);
    const glow = document.querySelector(`[data-glow-node="${srv.id}"]`);
    if (glow) glow.setAttribute('fill', color);

    const metric = document.querySelector(`[data-metric-node="${srv.id}"]`);
    if (metric) metric.textContent = `CPU ${cpuUsed.toFixed(0)}% · RAM ${memPct.toFixed(0)}%`;
  });

  // DB node
  const rdsData = data.rds;
  if (rdsData && rdsData.length) {
    const latest = rdsData[rdsData.length - 1];
    const dbDot = document.querySelector('[data-status-node="db"]');
    if (dbDot) {
      const cacheHit = latest.cache_hit_table_pct || 100;
      const color = cacheHit < 95 ? 'var(--red)' : cacheHit < 99 ? 'var(--yellow)' : 'var(--green)';
      dbDot.setAttribute('fill', color);
      const dbGlow = document.querySelector('[data-glow-node="db"]');
      if (dbGlow) dbGlow.setAttribute('fill', color);
    }
    const dbMetric = document.querySelector('[data-metric-node="db"]');
    if (dbMetric) {
      dbMetric.textContent = `${latest.active_conns || 0} conns`;
    }
  }

  // LB node — always red if inactive
  const lbNode = topologyData.nodes.find(n => n.id === 'lb');
  if (lbNode && lbNode.status === 'inactive') {
    const lbDot = document.querySelector('[data-status-node="lb"]');
    if (lbDot) lbDot.setAttribute('fill', 'var(--red)');
    const lbGlow = document.querySelector('[data-glow-node="lb"]');
    if (lbGlow) lbGlow.setAttribute('fill', 'var(--red)');
  }
}
