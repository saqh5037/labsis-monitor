// infographic.js — Client infographic page

let siteInfoData = null;

async function loadSiteInfo() {
  try {
    const res = await authFetch('api/site-info');
    siteInfoData = await res.json();
    renderInfographic();
  } catch (e) {
    console.error('[Infographic] Error:', e);
    document.getElementById('infographic-container').innerHTML =
      '<div class="no-data">Error cargando información del sitio</div>';
  }
}

function renderInfographic() {
  const container = document.getElementById('infographic-container');
  if (!container || !siteInfoData) return;

  const { client, siteName, servers, summary } = siteInfoData;

  let html = '';

  // === SECCION 2: Fichas Técnicas por Servidor ===
  html += '<div class="infographic-section">';
  html += '<h2 class="infographic-section-title">Infraestructura</h2>';

  servers.forEach(srv => {
    html += renderServerCard(srv);
  });

  html += '</div>';

  // === SECCION 3: Timeline de Deploys ===
  if (client?.deployDate || client?.lastUpdate) {
    html += '<div class="infographic-section">';
    html += '<details class="infographic-details">';
    html += '<summary class="infographic-summary">Historial de Despliegues</summary>';
    html += '<div class="deploy-timeline">';
    if (client.deployDate) {
      html += `<div class="deploy-event">
        <div class="deploy-dot deploy-dot-initial"></div>
        <div class="deploy-info">
          <div class="deploy-date">${formatDate(client.deployDate)}</div>
          <div class="deploy-label">Deploy inicial</div>
        </div>
      </div>`;
    }
    if (client.lastUpdate && client.lastUpdate !== client.deployDate) {
      html += `<div class="deploy-event">
        <div class="deploy-dot deploy-dot-update"></div>
        <div class="deploy-info">
          <div class="deploy-date">${formatDate(client.lastUpdate)}</div>
          <div class="deploy-label">Última actualización</div>
        </div>
      </div>`;
    }
    if (client.notes) {
      html += `<div class="deploy-notes">${client.notes}</div>`;
    }
    html += '</div></details></div>';
  }

  container.innerHTML = html;
}

function renderKpiCard(label, value, unit, icon) {
  const icons = {
    server: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg>',
    memory: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
    disk: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/></svg>',
    users: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    samples: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    sla: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    version: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  };

  return `<div class="kpi-card">
    <div class="kpi-icon">${icons[icon] || icons.server}</div>
    <div class="kpi-value">${value}<span class="kpi-unit">${unit}</span></div>
    <div class="kpi-label">${label}</div>
  </div>`;
}

function renderServerCard(srv) {
  const ramPct = srv.memGB ? Math.round((srv.heapGB / srv.memGB) * 100) : 0;

  let detailsHtml = '<div class="srv-details-grid">';

  // Columna 1: Sistema
  detailsHtml += '<div class="srv-detail-col">';
  detailsHtml += '<div class="srv-detail-heading">Sistema</div>';
  detailsHtml += renderDetailRow('OS', srv.os || 'N/A');
  detailsHtml += renderDetailRow('Kernel', srv.kernel || 'N/A');
  detailsHtml += renderDetailRow('CPU', srv.cpuModel || 'N/A');
  detailsHtml += renderDetailRow('Cores', srv.cpuCores || 'N/A');
  detailsHtml += renderDetailRow('Uptime', srv.uptime || 'N/A');
  detailsHtml += '</div>';

  // Columna 2: Software
  detailsHtml += '<div class="srv-detail-col">';
  detailsHtml += '<div class="srv-detail-heading">Software</div>';
  detailsHtml += renderDetailRow('Java', srv.java || 'N/A');
  detailsHtml += renderDetailRow('Puerto App', srv.appPort || 8080);
  detailsHtml += '</div>';

  // Columna 3: Recursos
  detailsHtml += '<div class="srv-detail-col">';
  detailsHtml += '<div class="srv-detail-heading">Recursos</div>';
  detailsHtml += `<div class="srv-resource">
    <div class="srv-resource-label">RAM ${srv.memGB} GB <span class="srv-resource-sub">(Heap: ${srv.heapGB} GB)</span></div>
    <div class="srv-resource-bar"><div class="srv-resource-fill" style="width:${ramPct}%;background:${ramPct > 80 ? 'var(--red)' : ramPct > 60 ? 'var(--yellow)' : 'var(--green)'}"></div></div>
  </div>`;
  detailsHtml += `<div class="srv-resource">
    <div class="srv-resource-label">Disco ${srv.diskGB} GB</div>
    <div class="srv-resource-bar"><div class="srv-resource-fill" style="width:30%;background:var(--green)"></div></div>
  </div>`;
  detailsHtml += '</div>';

  detailsHtml += '</div>'; // srv-details-grid

  // Servicios detectados por systemctl
  if (srv.services && srv.services !== 'N/A' && srv.services.trim()) {
    const serviceList = srv.services.split('\n').filter(s => s.trim());
    if (serviceList.length) {
      detailsHtml += '<div class="srv-services">';
      detailsHtml += '<div class="srv-detail-heading">Servicios Activos (systemctl)</div>';
      detailsHtml += '<div class="srv-services-list">';
      serviceList.forEach(s => {
        detailsHtml += `<span class="srv-service-chip"><span class="srv-service-dot"></span>${s.replace('.service', '')}</span>`;
      });
      detailsHtml += '</div></div>';
    }
  }

  // Application Inventory (from config + live discovery)
  const apps = srv.liveApps || srv.apps || [];
  if (apps.length) {
    detailsHtml += '<div class="srv-apps-section">';
    detailsHtml += '<div class="srv-detail-heading">Aplicaciones</div>';
    detailsHtml += '<div class="srv-apps-grid">';
    apps.forEach(app => {
      const statusClass = `app-status-${app.status || 'unknown'}`;
      const statusLabel = app.status === 'active' ? 'Activo' :
                          app.status === 'prepared' ? 'Preparado' :
                          app.status === 'anomaly' ? 'Anomalia' :
                          app.status === 'stopped' ? 'Detenido' : app.status || 'N/A';
      detailsHtml += `<div class="srv-app-card ${statusClass}">
        <div class="srv-app-header">
          <span class="srv-app-name">${app.name}</span>
          <span class="srv-app-status-dot ${statusClass}"></span>
        </div>
        <div class="srv-app-meta">
          ${app.port ? `<span>Puerto: ${app.port}</span>` : ''}
          ${app.heap ? `<span>Heap: ${app.heap}</span>` : ''}
          ${app.java ? `<span>${app.java}</span>` : ''}
          ${app.pid ? `<span>PID ${app.pid}</span>` : ''}
          ${app.mount ? `<span>${app.mount}</span>` : ''}
        </div>
        ${app.note ? `<div class="srv-app-note">${app.note}</div>` : ''}
      </div>`;
    });
    detailsHtml += '</div></div>';
  }

  // Nginx routing
  if (srv.nginx) {
    detailsHtml += '<div class="srv-nginx-section">';
    detailsHtml += '<div class="srv-detail-heading">Nginx Routing</div>';
    if (srv.nginx.domain) {
      detailsHtml += `<div class="srv-nginx-domain">${srv.nginx.domain} ${srv.nginx.ssl ? '(SSL)' : ''}</div>`;
    }
    if (srv.nginx.routes) {
      detailsHtml += '<div class="srv-nginx-routes">';
      Object.entries(srv.nginx.routes).forEach(([path, target]) => {
        detailsHtml += `<div class="srv-nginx-route"><code>${path}</code> &rarr; <code>${target}</code></div>`;
      });
      detailsHtml += '</div>';
    }
    detailsHtml += '</div>';
  }

  // Cron jobs
  if (srv.crons && srv.crons.length) {
    detailsHtml += '<div class="srv-crons-section">';
    detailsHtml += '<div class="srv-detail-heading">Tareas Cron</div>';
    srv.crons.forEach(c => {
      detailsHtml += `<div class="srv-cron-item"><span class="srv-cron-name">${c.name}</span><span class="srv-cron-schedule">${c.schedule}</span></div>`;
    });
    detailsHtml += '</div>';
  }

  // Anomalies
  if (srv.anomalies && srv.anomalies.length) {
    detailsHtml += '<div class="srv-anomalies">';
    srv.anomalies.forEach(a => {
      detailsHtml += `<div class="srv-anomaly-banner">${a}</div>`;
    });
    detailsHtml += '</div>';
  }

  // Role badge
  const roleLabels = { production: 'Produccion', qa: 'Testing / QA', spare: 'Disponible' };
  const roleClass = `role-badge role-${srv.role || 'production'}`;
  const roleLabel = roleLabels[srv.role] || srv.role || 'Produccion';

  return `<details class="infographic-details server-card">
    <summary class="server-card-header">
      <div class="server-card-info">
        <span class="server-card-name">${srv.name}</span>
        <span class="ip-badge">${srv.ip || srv.host || ''}</span>
        <span class="${roleClass}">${roleLabel}</span>
      </div>
      <div class="server-card-meta">
        <span class="server-card-spec">${srv.memGB} GB RAM</span>
        <span class="server-card-spec">${srv.diskGB} GB Disco</span>
        <span class="server-card-spec">${srv.cpuCores || '?'} Cores</span>
      </div>
    </summary>
    <div class="server-card-body">${detailsHtml}</div>
  </details>`;
}

function renderDetailRow(label, value) {
  return `<div class="srv-detail-row">
    <span class="srv-detail-label">${label}</span>
    <span class="srv-detail-value">${value}</span>
  </div>`;
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}
