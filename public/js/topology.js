// topology.js — Ecosystem architecture diagram with zone-based layout

let topologyData = null;

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

  // === Zone definitions (absolute positioning) ===
  const nodeW = 195;
  const nodeH = 80;
  const appNodeH = 155;
  const padding = 30;

  // Count nodes per zone for dynamic sizing
  const prodNodes = nodes.filter(n => n.zone === 'prod');
  const qaNodes = nodes.filter(n => n.zone === 'qa');
  const entryNodes = nodes.filter(n => n.zone === 'entry');

  // Zone layout — horizontal flow with PROD on top, QA below
  const zoneGap = 20;
  const entryW = nodeW + 40;
  const serverZoneW = Math.max(prodNodes.length, qaNodes.length) * (nodeW + 20) + 40;
  const dataW = nodeW + 40;
  const storageW = nodeW + 40;

  const totalW = entryW + serverZoneW + dataW + storageW + zoneGap * 3 + padding * 2;

  const prodZoneH = appNodeH + 60;
  const qaZoneH = appNodeH + 60;
  const totalH = prodZoneH + qaZoneH + zoneGap + padding * 2 + 40;

  // Zone positions
  const zones = {
    entry: {
      x: padding,
      y: padding + 20,
      w: entryW,
      h: totalH - padding * 2 - 20,
      label: 'ENTRADAS',
      color: 'rgba(245,158,11,0.06)',
      border: 'rgba(245,158,11,0.15)',
    },
    prod: {
      x: padding + entryW + zoneGap,
      y: padding + 20,
      w: serverZoneW,
      h: prodZoneH,
      label: 'PRODUCCION',
      color: 'rgba(59,130,246,0.06)',
      border: 'rgba(59,130,246,0.15)',
    },
    qa: {
      x: padding + entryW + zoneGap,
      y: padding + 20 + prodZoneH + zoneGap,
      w: serverZoneW,
      h: qaZoneH,
      label: 'QA / TESTING',
      color: 'rgba(245,158,11,0.06)',
      border: 'rgba(245,158,11,0.15)',
    },
    data: {
      x: padding + entryW + serverZoneW + zoneGap * 2,
      y: padding + 20,
      w: dataW,
      h: prodZoneH + qaZoneH / 2,
      label: 'BASE DE DATOS',
      color: 'rgba(5,150,105,0.06)',
      border: 'rgba(5,150,105,0.15)',
    },
    storage: {
      x: padding + entryW + serverZoneW + zoneGap * 2 + dataW + zoneGap,
      y: padding + 20,
      w: storageW,
      h: prodZoneH,
      label: 'ALMACENAMIENTO',
      color: 'rgba(6,182,212,0.06)',
      border: 'rgba(6,182,212,0.15)',
    },
  };

  // === Position nodes within zones ===
  const positions = {};

  // Entry nodes — stacked vertically, centered in zone
  entryNodes.forEach((node, i) => {
    const zone = zones.entry;
    const totalH = entryNodes.length * nodeH + (entryNodes.length - 1) * 15;
    const startY = zone.y + (zone.h - totalH) / 2;
    positions[node.id] = {
      x: zone.x + (zone.w - nodeW) / 2,
      y: startY + i * (nodeH + 15),
      w: nodeW,
      h: nodeH,
    };
  });

  // Prod servers — side by side in prod zone
  prodNodes.forEach((node, i) => {
    const zone = zones.prod;
    const totalW = prodNodes.length * nodeW + (prodNodes.length - 1) * 20;
    const startX = zone.x + (zone.w - totalW) / 2;
    positions[node.id] = {
      x: startX + i * (nodeW + 20),
      y: zone.y + (zone.h - appNodeH) / 2 + 8,
      w: nodeW,
      h: appNodeH,
    };
  });

  // QA servers — side by side in qa zone
  qaNodes.forEach((node, i) => {
    const zone = zones.qa;
    const totalW = qaNodes.length * nodeW + (qaNodes.length - 1) * 20;
    const startX = zone.x + (zone.w - totalW) / 2;
    positions[node.id] = {
      x: startX + i * (nodeW + 20),
      y: zone.y + (zone.h - appNodeH) / 2 + 8,
      w: nodeW,
      h: appNodeH,
    };
  });

  // DB node — centered in data zone
  const dbNode = nodes.find(n => n.zone === 'data');
  if (dbNode) {
    const zone = zones.data;
    positions[dbNode.id] = {
      x: zone.x + (zone.w - nodeW) / 2,
      y: zone.y + (zone.h - 120) / 2,
      w: nodeW,
      h: 120,
    };
  }

  // Storage node — centered in storage zone
  const storageNode = nodes.find(n => n.zone === 'storage');
  if (storageNode) {
    const zone = zones.storage;
    positions[storageNode.id] = {
      x: zone.x + (zone.w - nodeW) / 2,
      y: zone.y + (zone.h - nodeH) / 2,
      w: nodeW,
      h: nodeH,
    };
  }

  // === Build SVG ===
  let svg = `<svg viewBox="0 0 ${totalW} ${totalH}" class="topology-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Defs
  svg += `<defs>
    <filter id="topo-shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="rgba(30,58,95,0.10)"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="6" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 3 L 0 6 z" fill="var(--text3)"/>
    </marker>
    <linearGradient id="grad-app-prod" x1="0" y1="0" x2="0" y2="1">
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

  // === Zone backgrounds ===
  Object.entries(zones).forEach(([key, zone]) => {
    svg += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="12"
      fill="${zone.color}" stroke="${zone.border}" stroke-width="1" stroke-dasharray="4 3"/>`;
    svg += `<text x="${zone.x + 14}" y="${zone.y + 18}" font-size="10" font-weight="700"
      letter-spacing="1.2" fill="var(--text3)" opacity="0.8">${zone.label}</text>`;
  });

  // === Edges ===
  edges.forEach(edge => {
    const fromPos = positions[edge.from];
    const toPos = positions[edge.to];
    if (!fromPos || !toPos) return;

    // Calculate connection points (right side of from, left side of to)
    const fromCx = fromPos.x + fromPos.w;
    const fromCy = fromPos.y + fromPos.h / 2;
    const toCx = toPos.x;
    const toCy = toPos.y + toPos.h / 2;

    // If nodes are in different zones, use bezier curves
    const dx = toCx - fromCx;
    const cpOffset = Math.max(30, Math.abs(dx) * 0.35);

    const isDashed = edge.style === 'dashed';
    const dashAttr = isDashed ? 'stroke-dasharray="6 4"' : '';
    const glowOpacity = isDashed ? '0.06' : '0.10';

    // Glow
    svg += `<path d="M ${fromCx} ${fromCy} C ${fromCx + cpOffset} ${fromCy}, ${toCx - cpOffset} ${toCy}, ${toCx} ${toCy}"
      fill="none" stroke="var(--primary)" stroke-width="5" opacity="${glowOpacity}" stroke-linecap="round" ${dashAttr}/>`;

    // Edge
    svg += `<path d="M ${fromCx} ${fromCy} C ${fromCx + cpOffset} ${fromCy}, ${toCx - cpOffset} ${toCy}, ${toCx} ${toCy}"
      class="topology-edge" marker-end="url(#arrow)" ${dashAttr}
      data-from="${edge.from}" data-to="${edge.to}"/>`;
  });

  // === Nodes ===
  nodes.forEach(node => {
    const pos = positions[node.id];
    if (!pos) return;

    const isClickable = node.type === 'app';
    const nh = pos.h;
    const nw = pos.w;

    // Determine gradient
    let grad;
    if (node.type === 'entrypoint') grad = 'url(#grad-entrypoint)';
    else if (node.type === 'app' && node.role === 'production') grad = 'url(#grad-app-prod)';
    else if (node.type === 'app' && node.role === 'qa') grad = 'url(#grad-app-qa)';
    else if (node.type === 'app' && node.role === 'spare') grad = 'url(#grad-app-spare)';
    else if (node.type === 'database') grad = 'url(#grad-database)';
    else if (node.type === 'storage') grad = 'url(#grad-storage)';
    else grad = 'url(#grad-app-prod)';

    svg += `<g class="topology-node ${isClickable ? 'topology-node-clickable' : ''}"
      data-node-id="${node.id}"
      ${isClickable ? `onclick="setView('server-detail', {serverId:'${node.id}'})"` : ''}
      transform="translate(${pos.x}, ${pos.y})">`;

    // Card background
    svg += `<rect width="${nw}" height="${nh}" rx="12" fill="${grad}" filter="url(#topo-shadow)" class="topology-node-bg"/>`;

    // Icon
    const icon = getNodeIcon(node.type, node.subtype);
    svg += `<g transform="translate(12, 14)">${icon}</g>`;

    // Label
    svg += `<text x="${nw / 2 + 8}" y="28" class="topology-node-label">${node.label}</text>`;

    // --- Type-specific content ---

    if (node.type === 'entrypoint') {
      if (node.count) {
        svg += `<text x="${nw / 2}" y="55" text-anchor="middle" font-size="18" font-weight="700" fill="white" opacity="0.9">${node.count}</text>`;
        svg += `<text x="${nw / 2}" y="68" text-anchor="middle" font-size="8" fill="white" opacity="0.5">${node.desc || 'usuarios'}</text>`;
      } else if (node.protocol) {
        svg += `<text x="${nw / 2}" y="52" text-anchor="middle" font-size="10" fill="white" opacity="0.7">${node.protocol}</text>`;
        if (node.desc) {
          svg += `<text x="${nw / 2}" y="66" text-anchor="middle" font-size="8" fill="white" opacity="0.5">${node.desc}</text>`;
        }
      }
    }

    if (node.type === 'app') {
      // IP
      if (node.host) {
        svg += `<text x="${nw / 2 + 8}" y="44" class="topology-node-ip">${node.host}</text>`;
      }

      // Role badge
      const roleLabels = { production: 'PROD', qa: 'QA', spare: 'SPARE' };
      const roleColors = { production: '#10b981', qa: '#f59e0b', spare: '#6b7280' };
      const rl = roleLabels[node.role] || '';
      const rc = roleColors[node.role] || '#6b7280';
      if (rl) {
        svg += `<rect x="${nw - 48}" y="36" width="36" height="13" rx="3" fill="${rc}" opacity="0.85"/>`;
        svg += `<text x="${nw - 30}" y="45.5" text-anchor="middle" font-size="7" font-weight="700" fill="white" letter-spacing="0.5">${rl}</text>`;
      }

      // App chips
      if (node.apps && node.apps.length) {
        let appY = 62;
        const maxApps = 6;
        node.apps.slice(0, maxApps).forEach(app => {
          const sc = app.status === 'active' ? '#10b981' :
                     app.status === 'anomaly' ? '#f59e0b' :
                     app.status === 'prepared' ? '#60a5fa' : '#6b7280';
          const portStr = app.port ? ` :${app.port}` : '';
          svg += `<circle cx="14" cy="${appY}" r="3" fill="${sc}"/>`;
          svg += `<text x="22" y="${appY + 3}" font-size="8.5" fill="white" opacity="0.85">${app.name}${portStr}</text>`;
          appY += 14;
        });
        if (node.apps.length > maxApps) {
          svg += `<text x="22" y="${appY + 3}" font-size="7" fill="white" opacity="0.45">+${node.apps.length - maxApps} mas</text>`;
        }
      }

      // Anomaly bar
      if (node.anomalies && node.anomalies.length) {
        svg += `<rect x="8" y="${nh - 24}" width="${nw - 16}" height="16" rx="4" fill="rgba(245,158,11,0.3)"/>`;
        svg += `<text x="${nw / 2}" y="${nh - 13}" text-anchor="middle" font-size="7" font-weight="600" fill="#fbbf24">ANOMALIA</text>`;
      }
    }

    if (node.type === 'database') {
      // Host (truncated)
      const hostShort = node.host ? (node.host.length > 28 ? node.host.substring(0, 26) + '..' : node.host) : '';
      if (hostShort) {
        svg += `<text x="${nw / 2}" y="44" text-anchor="middle" font-size="7.5" fill="white" opacity="0.6">${hostShort}</text>`;
      }
      // Env badge
      if (node.env) {
        svg += `<rect x="${nw / 2 - 30}" y="50" width="60" height="13" rx="3" fill="#10b981" opacity="0.85"/>`;
        svg += `<text x="${nw / 2}" y="59.5" text-anchor="middle" font-size="7" font-weight="700" fill="white">${node.env.toUpperCase()}</text>`;
      }
      // Datasources
      if (node.datasources && node.datasources.length) {
        let dsY = 74;
        node.datasources.forEach(ds => {
          svg += `<text x="12" y="${dsY}" font-size="7" fill="white" opacity="0.65">${ds.name}</text>`;
          svg += `<text x="${nw - 12}" y="${dsY}" text-anchor="end" font-size="6.5" fill="white" opacity="0.4">pool ${ds.pool}</text>`;
          dsY += 11;
        });
      }
      // QA note
      if (node.qaNote) {
        svg += `<rect x="8" y="${nh - 24}" width="${nw - 16}" height="16" rx="4" fill="rgba(245,158,11,0.2)"/>`;
        svg += `<text x="${nw / 2}" y="${nh - 13}" text-anchor="middle" font-size="6.5" font-weight="500" fill="#fbbf24">${node.qaNote}</text>`;
      }
    }

    if (node.type === 'storage') {
      if (node.host) {
        svg += `<text x="${nw / 2}" y="48" text-anchor="middle" font-size="9" fill="white" opacity="0.7">${node.host}</text>`;
      }
      if (node.nfs) {
        svg += `<text x="${nw / 2}" y="62" text-anchor="middle" font-size="8" fill="white" opacity="0.5">${node.nfs}</text>`;
      }
    }

    // Status dot + glow (all except entry)
    if (node.type !== 'entrypoint') {
      svg += `<circle cx="${nw - 14}" cy="14" r="9" class="topology-status-glow" data-glow-node="${node.id}" fill="var(--text3)" opacity="0.12"/>`;
      svg += `<circle cx="${nw - 14}" cy="14" r="5" class="topology-status-dot" data-status-node="${node.id}" fill="var(--text3)"/>`;
    }

    // Mini metric line
    if (node.type === 'app' || node.type === 'database') {
      svg += `<text x="${nw / 2}" y="${nh - 3}" class="topology-mini-metric" data-metric-node="${node.id}" text-anchor="middle" font-size="10" font-weight="600"></text>`;
    }

    svg += '</g>';
  });

  svg += '</svg>';

  // === Legend ===
  let legendHtml = '';
  try {
    if (siteInfoData) {
      const { siteName, summary, client } = siteInfoData;
      const name = client?.name || siteName || 'LABSIS';
      const parts = [];
      if (summary?.totalServers) parts.push(`${summary.totalServers} Servidores`);
      if (summary?.totalMemGB) parts.push(`${summary.totalMemGB} GB RAM`);
      if (summary?.totalDiskGB) parts.push(`${summary.totalDiskGB} GB Disco`);
      if (summary?.totalHeapGB) parts.push(`${summary.totalHeapGB} GB Heap`);
      legendHtml = `<div style="text-align:center;padding:10px 0 4px;font:400 12px/1 var(--font-sans);color:var(--text3);letter-spacing:0.3px;">${name} · ${parts.join(' · ')}</div>`;
    }
  } catch(e) {}

  legendHtml += `<div class="topology-legend">
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:var(--green)"></span>Normal</span>
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:var(--yellow)"></span>Alerta</span>
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:var(--red)"></span>Critico</span>
    <span class="topology-legend-item"><span class="topology-legend-dot" style="background:#60a5fa"></span>Preparado</span>
    <span class="topology-legend-sep">|</span>
    <span class="topology-legend-item" style="opacity:0.6">--- Linea punteada = QA / Temporal</span>
    <span class="topology-legend-sep">|</span>
    <span class="topology-legend-hint">Scroll zoom · Arrastra · Doble-click reset</span>
  </div>`;

  container.innerHTML = svg + legendHtml;

  // === Entrance animation ===
  const nodeEls = container.querySelectorAll('.topology-node');
  const edgeEls = container.querySelectorAll('.topology-edge');

  edgeEls.forEach(e => { e.style.opacity = '0'; });
  nodeEls.forEach(n => { n.style.opacity = '0'; });

  requestAnimationFrame(() => {
    nodeEls.forEach((n, i) => {
      setTimeout(() => { n.style.transition = 'opacity 0.5s ease'; n.style.opacity = '1'; }, i * 100);
    });
    edgeEls.forEach((e, i) => {
      setTimeout(() => { e.style.transition = 'opacity 0.6s ease'; e.style.opacity = '1'; }, nodeEls.length * 100 + i * 60);
    });
  });

  // === Zoom & Pan ===
  const svgEl = container.querySelector('.topology-svg');
  if (svgEl) {
    let scale = 1, panX = 0, panY = 0, isPanning = false, startX, startY;
    const vbW = totalW, vbH = totalH;

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.04 : 0.96;
      const newScale = Math.max(0.5, Math.min(3, scale * delta));
      const rect = svgEl.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const sd = newScale / scale;
      panX = mx * vbW * (1 - sd) + panX * sd;
      panY = my * vbH * (1 - sd) + panY * sd;
      scale = newScale;
      clamp(); updateVB();
    }, { passive: false });

    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.topology-node-clickable')) return;
      isPanning = true; startX = e.clientX; startY = e.clientY;
      container.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      const rect = svgEl.getBoundingClientRect();
      panX -= (e.clientX - startX) / rect.width * vbW / scale;
      panY -= (e.clientY - startY) / rect.height * vbH / scale;
      startX = e.clientX; startY = e.clientY;
      clamp(); updateVB();
    });
    window.addEventListener('mouseup', () => { if (isPanning) { isPanning = false; container.style.cursor = ''; } });
    container.addEventListener('dblclick', (e) => {
      if (e.target.closest('.topology-node-clickable')) return;
      scale = 1; panX = 0; panY = 0;
      svgEl.style.transition = 'all 0.3s ease'; updateVB();
      setTimeout(() => { svgEl.style.transition = ''; }, 350);
    });

    function clamp() {
      const w = vbW / scale, h = vbH / scale;
      const mx = vbW - w, my = vbH - h;
      panX = Math.max(Math.min(mx, 0), Math.min(panX, Math.max(mx, 0)));
      panY = Math.max(Math.min(my, 0), Math.min(panY, Math.max(my, 0)));
    }
    function updateVB() {
      svgEl.setAttribute('viewBox', `${panX.toFixed(1)} ${panY.toFixed(1)} ${(vbW/scale).toFixed(1)} ${(vbH/scale).toFixed(1)}`);
    }
    container.style.cursor = 'grab';
  }
}

function getNodeIcon(type, subtype) {
  const icons = {
    entrypoint: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    equipment: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.5"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M4 16l-2 4h20l-2-4"/><path d="M12 8v4M10 10h4"/></svg>',
    app: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="white"/><circle cx="6" cy="18" r="1" fill="white"/></svg>',
    database: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>',
    storage: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M17.5 19H9a7 7 0 110-14h.5"/><path d="M17.5 5a5.5 5.5 0 010 11h-2"/></svg>',
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

    const hasAnomaly = srv.anomalies?.length > 0;
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
      const ch = latest.cache_hit_table_pct || 100;
      const c = ch < 95 ? 'var(--red)' : ch < 99 ? 'var(--yellow)' : 'var(--green)';
      dbDot.setAttribute('fill', c);
      const g = document.querySelector('[data-glow-node="db"]');
      if (g) g.setAttribute('fill', c);
    }
    const dm = document.querySelector('[data-metric-node="db"]');
    if (dm) dm.textContent = `${latest.active_conns || 0} conns`;
  }
}
