// topology.js — Ecosystem architecture diagram (horizontal, large nodes, live sessions)

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

  // === Dimensions ===
  const entryW = 185, entryH = 115;
  const srvW = 210, srvH = 180;
  const dbW = 210, dbH = 175;
  const stW = 185, stH = 110;
  const pad = 35;
  const zoneGap = 25;
  const zonePadX = 20, zonePadY = 30;

  // Group nodes
  const entryNodes = nodes.filter(n => n.zone === 'entry');
  const prodNodes = nodes.filter(n => n.zone === 'prod');
  const qaNodes = nodes.filter(n => n.zone === 'qa');
  const dbNode = nodes.find(n => n.zone === 'data');
  const storageNode = nodes.find(n => n.zone === 'storage');

  // === Column positions ===
  // Col 1: Entry | Col 2: Server zones (prod top, qa bottom) | Col 3: DB | Col 4: Storage
  const col1X = pad;
  const entryColW = entryW + zonePadX * 2;

  const serverCount = Math.max(prodNodes.length, qaNodes.length);
  const serverZoneInnerW = serverCount * srvW + (serverCount - 1) * 20;
  const serverColW = serverZoneInnerW + zonePadX * 2;
  const col2X = col1X + entryColW + zoneGap;

  const col3X = col2X + serverColW + zoneGap;
  const dbColW = dbW + zonePadX * 2;

  const col4X = col3X + dbColW + zoneGap;
  const stColW = stW + zonePadX * 2;

  const totalW = col4X + stColW + pad;

  // Row heights
  const prodZoneH = srvH + zonePadY * 2;
  const qaZoneH = srvH + zonePadY * 2;
  const serverTotalH = prodZoneH + 15 + qaZoneH;
  const totalH = Math.max(serverTotalH, entryNodes.length * (entryH + 15) - 15) + pad * 2 + 30;

  // Entry zone (full height, centered vertically)
  const entryZone = { x: col1X, y: pad + 15, w: entryColW, h: totalH - pad * 2 - 15 };

  // Prod zone (top of col2)
  const prodZone = { x: col2X, y: pad + 15, w: serverColW, h: prodZoneH };

  // QA zone (below prod)
  const qaZone = { x: col2X, y: prodZone.y + prodZoneH + 15, w: serverColW, h: qaZoneH };

  // DB zone
  const dbZone = { x: col3X, y: pad + 15, w: dbColW, h: prodZoneH + 15 + qaZoneH / 2 };

  // Storage zone
  const stZone = { x: col4X, y: pad + 15, w: stColW, h: prodZoneH };

  // === Position nodes ===
  const positions = {};

  // Entry nodes — stacked vertically centered in zone
  const entryTotalH = entryNodes.length * entryH + (entryNodes.length - 1) * 15;
  const entryStartY = entryZone.y + (entryZone.h - entryTotalH) / 2;
  entryNodes.forEach((n, i) => {
    positions[n.id] = { x: entryZone.x + (entryZone.w - entryW) / 2, y: entryStartY + i * (entryH + 15), w: entryW, h: entryH };
  });

  // Prod servers — side by side centered in zone
  const prodTotalW = prodNodes.length * srvW + (prodNodes.length - 1) * 20;
  const prodStartX = prodZone.x + (prodZone.w - prodTotalW) / 2;
  prodNodes.forEach((n, i) => {
    positions[n.id] = { x: prodStartX + i * (srvW + 20), y: prodZone.y + zonePadY, w: srvW, h: srvH };
  });

  // QA servers
  const qaTotalW = qaNodes.length * srvW + (qaNodes.length - 1) * 20;
  const qaStartX = qaZone.x + (qaZone.w - qaTotalW) / 2;
  qaNodes.forEach((n, i) => {
    positions[n.id] = { x: qaStartX + i * (srvW + 20), y: qaZone.y + zonePadY, w: srvW, h: srvH };
  });

  // DB
  if (dbNode) {
    positions[dbNode.id] = { x: dbZone.x + (dbZone.w - dbW) / 2, y: dbZone.y + (dbZone.h - dbH) / 2, w: dbW, h: dbH };
  }

  // Storage
  if (storageNode) {
    positions[storageNode.id] = { x: stZone.x + (stZone.w - stW) / 2, y: stZone.y + (stZone.h - stH) / 2, w: stW, h: stH };
  }

  // === Build SVG ===
  let svg = `<svg viewBox="0 0 ${totalW} ${totalH}" class="topology-svg" xmlns="http://www.w3.org/2000/svg">`;

  svg += `<defs>
    <marker id="arr" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="7" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0L10 3L0 6z" fill="#64748b"/>
    </marker>
  </defs>`;

  // Solid fill colors (no gradients, no filters — maximum contrast)
  const fills = {
    prod: '#1e3a5f',
    qa: '#7c2d12',
    spare: '#374151',
    db: '#064e3b',
    st: '#134e4a',
    entry: '#4c1d95',
  };

  // === Zone backgrounds ===
  const zoneDefs = [
    { z: entryZone, label: 'ENTRADAS', color: 'rgba(139,92,246,0.05)', border: 'rgba(139,92,246,0.15)' },
    { z: prodZone, label: 'PRODUCCION', color: 'rgba(59,130,246,0.05)', border: 'rgba(59,130,246,0.15)' },
    { z: qaZone, label: 'QA / TESTING', color: 'rgba(245,158,11,0.05)', border: 'rgba(245,158,11,0.15)' },
    { z: dbZone, label: 'BASE DE DATOS', color: 'rgba(5,150,105,0.05)', border: 'rgba(5,150,105,0.15)' },
    { z: stZone, label: 'ALMACENAMIENTO', color: 'rgba(6,182,212,0.05)', border: 'rgba(6,182,212,0.15)' },
  ];
  zoneDefs.forEach(({ z, label, color, border }) => {
    svg += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="14" fill="${color}" stroke="${border}" stroke-width="1" stroke-dasharray="5 3"/>`;
    svg += `<text x="${z.x + 12}" y="${z.y + 16}" font-size="9" font-weight="700" letter-spacing="1.5" fill="var(--text3)" opacity="0.7">${label}</text>`;
  });

  // === Edges ===
  edges.forEach(edge => {
    const fp = positions[edge.from], tp = positions[edge.to];
    if (!fp || !tp) return;

    const x1 = fp.x + fp.w, y1 = fp.y + fp.h / 2;
    const x2 = tp.x, y2 = tp.y + tp.h / 2;
    const dx = x2 - x1;
    const cp = Math.max(25, Math.abs(dx) * 0.3);
    const isDash = edge.style === 'dashed';
    const da = isDash ? 'stroke-dasharray="8 5"' : '';

    // Edge line — solid colors, visible
    svg += `<path d="M${x1} ${y1}C${x1+cp} ${y1},${x2-cp} ${y2},${x2} ${y2}" fill="none" stroke="${isDash ? '#94a3b8' : '#3b82f6'}" stroke-width="${isDash ? '1.5' : '2.5'}" opacity="${isDash ? '0.5' : '0.6'}" marker-end="url(#arr)" ${da} data-from="${edge.from}" data-to="${edge.to}" class="topology-edge"/>`;
  });

  // === Render nodes ===
  nodes.forEach(node => {
    const p = positions[node.id];
    if (!p) return;
    const { w: nw, h: nh } = p;
    const isClick = node.type === 'app' || node.type === 'entrypoint';

    let bgColor = fills.prod;
    if (node.type === 'entrypoint') bgColor = fills.entry;
    else if (node.role === 'qa') bgColor = fills.qa;
    else if (node.role === 'spare') bgColor = fills.spare;
    else if (node.type === 'database') bgColor = fills.db;
    else if (node.type === 'storage') bgColor = fills.st;

    const icon = getNodeIcon(node.type, node.subtype);

    // Click handler: app nodes go to server detail, entry nodes open session panel
    let clickAttr = '';
    if (node.type === 'app') {
      clickAttr = `onclick="setView('server-detail',{serverId:'${node.id}'})"`;
    } else if (node.type === 'entrypoint') {
      clickAttr = `onclick="openSessionPanel('${node.subtype || 'users'}')"`;
    }

    svg += `<g class="topology-node ${isClick?'topology-node-clickable':''}" data-node-id="${node.id}" ${clickAttr} transform="translate(${p.x},${p.y})">`;

    // Card — solid fill, no filter
    svg += `<rect width="${nw}" height="${nh}" rx="12" fill="${bgColor}" class="topology-node-bg"/>`;

    // Icon — top-left, natural size
    svg += `<g transform="translate(12, 12)">${icon}</g>`;

    // === Type-specific content ===

    if (node.type === 'entrypoint') {
      svg += `<text x="38" y="24" font-size="12" font-weight="700" fill="white">${node.label}</text>`;
      // Live session count — big centered
      svg += `<text x="${nw/2}" y="62" text-anchor="middle" font-size="28" font-weight="800" fill="white" data-session-node="${node.id}">...</text>`;
      // Description
      const desc = node.desc || (node.count ? 'sesiones activas' : node.protocol || '');
      svg += `<text x="${nw/2}" y="82" text-anchor="middle" font-size="9.5" fill="white" opacity="0.85">${desc}</text>`;
      // Subtitle
      if (node.protocol && node.desc) {
        svg += `<text x="${nw/2}" y="100" text-anchor="middle" font-size="9" fill="white" opacity="0.7">${node.protocol}</text>`;
      }
    }

    if (node.type === 'app') {
      // Name — right of icon
      svg += `<text x="38" y="18" font-size="15" font-weight="700" fill="white">${node.label}</text>`;
      // IP
      svg += `<text x="38" y="32" font-size="10" fill="white" opacity="0.9" font-family="'JetBrains Mono',monospace">${node.host}</text>`;

      // Role badge — white outline style to avoid color clash with status dots
      const rl = { production: 'PROD', qa: 'QA', spare: 'SPARE' }[node.role] || '';
      if (rl) {
        svg += `<rect x="${nw-48}" y="8" width="40" height="16" rx="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>`;
        svg += `<text x="${nw-28}" y="19" text-anchor="middle" font-size="7.5" font-weight="700" fill="white" letter-spacing="0.8">${rl}</text>`;
      }

      // Separator line
      svg += `<line x1="12" y1="42" x2="${nw-12}" y2="42" stroke="white" stroke-width="0.5" opacity="0.2"/>`;

      // App list (max 5) — small inline dots, not confused with status
      if (node.apps && node.apps.length) {
        let ay = 58;
        node.apps.slice(0, 5).forEach(app => {
          // Status: filled for active, outline for prepared, warning for anomaly
          if (app.status === 'active') {
            svg += `<circle cx="18" cy="${ay}" r="3" fill="none" stroke="#86efac" stroke-width="1.5"/>`;
          } else if (app.status === 'anomaly') {
            svg += `<circle cx="18" cy="${ay}" r="3" fill="#fbbf24"/>`;
          } else if (app.status === 'prepared') {
            svg += `<circle cx="18" cy="${ay}" r="3" fill="none" stroke="#93c5fd" stroke-width="1.5"/>`;
          } else {
            svg += `<circle cx="18" cy="${ay}" r="3" fill="none" stroke="#9ca3af" stroke-width="1"/>`;
          }
          const pt = app.port ? ` :${app.port}` : '';
          svg += `<text x="28" y="${ay+4}" font-size="10" fill="white" opacity="0.95">${app.name}${pt}</text>`;
          ay += 17;
        });
        if (node.apps.length > 5) {
          svg += `<text x="28" y="${ay+3}" font-size="8" fill="white" opacity="0.6">+${node.apps.length-5} mas</text>`;
        }
      }

      // Anomaly bar
      if (node.anomalies && node.anomalies.length) {
        svg += `<rect x="8" y="${nh-26}" width="${nw-16}" height="18" rx="5" fill="#fbbf24"/>`;
        svg += `<text x="${nw/2}" y="${nh-14}" text-anchor="middle" font-size="8" font-weight="800" fill="#7c2d12" letter-spacing="0.5">ANOMALIA</text>`;
      }

      // Status dot
      svg += `<circle cx="${nw-14}" cy="14" r="9" data-glow-node="${node.id}" fill="white" opacity="0.2"/>`;
      svg += `<circle cx="${nw-14}" cy="14" r="6" class="topology-status-dot" data-status-node="${node.id}" fill="#9ca3af"/>`;

      // Mini metric
      svg += `<text x="${nw/2}" y="${nh-4}" class="topology-mini-metric" data-metric-node="${node.id}" text-anchor="middle" font-size="11" font-weight="700" fill="white"></text>`;
    }

    if (node.type === 'database') {
      // Name right of icon
      svg += `<text x="38" y="18" font-size="14" font-weight="700" fill="white">${node.label}</text>`;
      // Host
      const hShort = node.host ? (node.host.length > 24 ? node.host.substring(0,22)+'..' : node.host) : '';
      svg += `<text x="38" y="30" font-size="8" fill="white" opacity="0.8" font-family="'JetBrains Mono',monospace">${hShort}</text>`;
      // Env badge — outline style like role badges
      if (node.env) {
        svg += `<rect x="12" y="40" width="80" height="16" rx="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>`;
        svg += `<text x="52" y="51" text-anchor="middle" font-size="8" font-weight="700" fill="white" letter-spacing="0.8">${node.env.toUpperCase()}</text>`;
      }
      // Separator
      svg += `<line x1="12" y1="62" x2="${nw-12}" y2="62" stroke="white" stroke-width="0.5" opacity="0.2"/>`;
      // Datasources
      if (node.datasources && node.datasources.length) {
        let dy = 78;
        node.datasources.forEach(ds => {
          svg += `<text x="14" y="${dy}" font-size="8.5" fill="white" opacity="0.95">${ds.name}</text>`;
          svg += `<text x="${nw-14}" y="${dy}" text-anchor="end" font-size="8" fill="white" opacity="0.65">pool ${ds.pool}</text>`;
          dy += 14;
        });
      }
      // QA note — positioned above the metric line with clear spacing
      if (node.qaNote) {
        svg += `<rect x="8" y="${nh-44}" width="${nw-16}" height="18" rx="5" fill="rgba(251,191,36,0.2)" stroke="#fbbf24" stroke-width="0.5"/>`;
        svg += `<text x="${nw/2}" y="${nh-32}" text-anchor="middle" font-size="7.5" font-weight="600" fill="#fde68a">${node.qaNote}</text>`;
      }
      // Status dot
      svg += `<circle cx="${nw-14}" cy="14" r="9" data-glow-node="${node.id}" fill="white" opacity="0.2"/>`;
      svg += `<circle cx="${nw-14}" cy="14" r="6" class="topology-status-dot" data-status-node="${node.id}" fill="#9ca3af"/>`;
      // Mini metric — at the very bottom, clear space
      svg += `<text x="${nw/2}" y="${nh-8}" class="topology-mini-metric" data-metric-node="${node.id}" text-anchor="middle" font-size="11" font-weight="700" fill="white"></text>`;
    }

    if (node.type === 'storage') {
      // Name right of icon
      svg += `<text x="38" y="24" font-size="13" font-weight="700" fill="white">${node.label}</text>`;
      if (node.host) {
        svg += `<text x="${nw/2}" y="54" text-anchor="middle" font-size="10" fill="white" opacity="0.9">${node.host}</text>`;
      }
      if (node.nfs) {
        svg += `<text x="${nw/2}" y="70" text-anchor="middle" font-size="9" fill="white" opacity="0.8" font-family="'JetBrains Mono',monospace">${node.nfs}</text>`;
      }
      svg += `<text x="${nw/2}" y="90" text-anchor="middle" font-size="9" fill="white" opacity="0.7">Backups automaticos</text>`;
      svg += `<circle cx="${nw-14}" cy="14" r="9" data-glow-node="${node.id}" fill="white" opacity="0.2"/>`;
      svg += `<circle cx="${nw-14}" cy="14" r="6" class="topology-status-dot" data-status-node="${node.id}" fill="#9ca3af"/>`;
    }

    svg += '</g>';
  });

  svg += '</svg>';

  // Legend
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
    <span class="topology-legend-item" style="opacity:0.5">--- QA / Temporal</span>
    <span class="topology-legend-sep">|</span>
    <span class="topology-legend-hint">Scroll zoom · Arrastra · Doble-click reset</span>
  </div>`;

  container.innerHTML = svg + legendHtml;

  // Initial session data update
  if (siteInfoData?.sessions?._totals) {
    updateSessionNodes(siteInfoData.sessions);
  }

  // Animation
  const nodeEls = container.querySelectorAll('.topology-node');
  const edgeEls = container.querySelectorAll('.topology-edge');
  edgeEls.forEach(e => { e.style.opacity = '0'; });
  nodeEls.forEach(n => { n.style.opacity = '0'; });
  requestAnimationFrame(() => {
    nodeEls.forEach((n, i) => { setTimeout(() => { n.style.transition = 'opacity 0.5s ease'; n.style.opacity = '1'; }, i * 80); });
    edgeEls.forEach((e, i) => { setTimeout(() => { e.style.transition = 'opacity 0.6s ease'; e.style.opacity = '1'; }, nodeEls.length * 80 + i * 50); });
  });

  // Zoom & Pan
  const svgEl = container.querySelector('.topology-svg');
  if (svgEl) {
    let scale = 1, panX = 0, panY = 0, isPanning = false, sx, sy;
    const vbW = totalW, vbH = totalH;
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = e.deltaY > 0 ? 1.04 : 0.96;
      const ns = Math.max(0.5, Math.min(3, scale * d));
      const r = svgEl.getBoundingClientRect();
      const mx = (e.clientX-r.left)/r.width, my = (e.clientY-r.top)/r.height;
      const sd = ns/scale;
      panX = mx*vbW*(1-sd)+panX*sd; panY = my*vbH*(1-sd)+panY*sd;
      scale = ns; clamp(); upd();
    }, { passive: false });
    container.addEventListener('mousedown', (e) => { if (e.target.closest('.topology-node-clickable')) return; isPanning=true; sx=e.clientX; sy=e.clientY; container.style.cursor='grabbing'; });
    window.addEventListener('mousemove', (e) => { if (!isPanning) return; const r=svgEl.getBoundingClientRect(); panX-=(e.clientX-sx)/r.width*vbW/scale; panY-=(e.clientY-sy)/r.height*vbH/scale; sx=e.clientX; sy=e.clientY; clamp(); upd(); });
    window.addEventListener('mouseup', () => { if (isPanning) { isPanning=false; container.style.cursor=''; } });
    container.addEventListener('dblclick', (e) => { if (e.target.closest('.topology-node-clickable')) return; scale=1;panX=0;panY=0; svgEl.style.transition='all 0.3s ease'; upd(); setTimeout(()=>{svgEl.style.transition='';},350); });
    function clamp() { const w=vbW/scale,h=vbH/scale,mx2=vbW-w,my2=vbH-h; panX=Math.max(Math.min(mx2,0),Math.min(panX,Math.max(mx2,0))); panY=Math.max(Math.min(my2,0),Math.min(panY,Math.max(my2,0))); }
    function upd() { svgEl.setAttribute('viewBox', `${panX.toFixed(1)} ${panY.toFixed(1)} ${(vbW/scale).toFixed(1)} ${(vbH/scale).toFixed(1)}`); }
    container.style.cursor = 'grab';
  }
}

function getNodeIcon(type, subtype) {
  const icons = {
    entrypoint: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    equipment: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M4 16l-2 4h20l-2-4"/><path d="M12 8v4M10 10h4"/></svg>',
    app: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="white"/><circle cx="6" cy="18" r="1" fill="white"/></svg>',
    database: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>',
    storage: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M17.5 19H9a7 7 0 110-14h.5"/><path d="M17.5 5a5.5 5.5 0 010 11h-2"/></svg>',
  };
  if (type === 'entrypoint' && subtype === 'equipment') return icons.equipment;
  return icons[type] || icons.app;
}

// Update session counts on entry nodes
function updateSessionNodes(sessions) {
  if (!sessions || !sessions._totals) return;
  const totals = sessions._totals;

  // entry_0 = Users (browsers)
  const userEl = document.querySelector('[data-session-node="entry_0"]');
  if (userEl) userEl.textContent = totals.browsers > 0 ? totals.browsers : '0';

  // entry_1 = Equipment
  const equipEl = document.querySelector('[data-session-node="entry_1"]');
  if (equipEl) equipEl.textContent = totals.equipment > 0 ? totals.equipment : '0';
}

function updateTopologyStatus(data) {
  if (!topologyData || !data) return;

  // Update session nodes from SSE data
  if (data.sessions) {
    updateSessionNodes(data.sessions);
  }

  const servers = window.SITE_CONFIG ? window.SITE_CONFIG.servers : [];
  servers.forEach(srv => {
    const sd = data[srv.id];
    if (!sd || !sd.length) return;
    const latest = sd[sd.length - 1];
    const cpu = 100 - (latest.cpu_idle || 100);
    const mem = latest.mem_total_mb > 0 ? (latest.mem_used_mb / latest.mem_total_mb * 100) : 0;
    const hasAnomaly = srv.anomalies?.length > 0;
    const color = hasAnomaly ? 'var(--yellow)' : cpu > 85 ? 'var(--red)' : cpu > 70 ? 'var(--yellow)' : 'var(--green)';

    const dot = document.querySelector(`[data-status-node="${srv.id}"]`);
    if (dot) dot.setAttribute('fill', color);
    const glow = document.querySelector(`[data-glow-node="${srv.id}"]`);
    if (glow) glow.setAttribute('fill', color);
    const metric = document.querySelector(`[data-metric-node="${srv.id}"]`);
    if (metric) metric.textContent = `CPU ${cpu.toFixed(0)}% · RAM ${mem.toFixed(0)}%`;
  });

  // DB
  const rds = data.rds;
  if (rds && rds.length) {
    const l = rds[rds.length - 1];
    const dbDot = document.querySelector('[data-status-node="db"]');
    if (dbDot) {
      const ch = l.cache_hit_table_pct || 100;
      const c = ch < 95 ? 'var(--red)' : ch < 99 ? 'var(--yellow)' : 'var(--green)';
      dbDot.setAttribute('fill', c);
      const g = document.querySelector('[data-glow-node="db"]'); if (g) g.setAttribute('fill', c);
    }
    const dm = document.querySelector('[data-metric-node="db"]');
    if (dm) dm.textContent = `${l.active_conns || 0} conns · cache ${(l.cache_hit_table_pct||0).toFixed(0)}%`;
  }
}
