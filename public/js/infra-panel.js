// infra-panel.js — Infrastructure status panel (services matrix, DB, LB, anomalies)

function renderInfraStatusPanel() {
  const container = document.getElementById('infra-status-panel');
  if (!container || !siteInfoData) return;

  const { servers, database, loadBalancer, entryPoints } = siteInfoData;

  let html = '<div class="infographic-section">';
  html += '<h2 class="infographic-section-title">Estado de Infraestructura</h2>';

  // === Load Balancer Banner ===
  if (loadBalancer) {
    const isInactive = loadBalancer.status === 'inactive';
    const lbClass = isInactive ? 'lb-inactive' : 'lb-active';
    const lbIcon = isInactive
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>';
    html += `<div class="infra-lb-banner ${lbClass}">
      <span class="infra-lb-icon">${lbIcon}</span>
      <div class="infra-lb-info">
        <div class="infra-lb-title">${loadBalancer.label || 'Load Balancer'}</div>
        <div class="infra-lb-host">${loadBalancer.host || ''}</div>
      </div>
      <div class="infra-lb-status-badge">${isInactive ? 'NO FUNCIONAL' : 'ACTIVO'}</div>
    </div>`;
  }

  // === Services Matrix ===
  const allServiceNames = [];
  const serviceMap = {};
  servers.forEach(s => {
    (s.apps || []).forEach(a => {
      if (!serviceMap[a.name]) {
        serviceMap[a.name] = {};
        allServiceNames.push(a.name);
      }
      serviceMap[a.name][s.id] = a;
    });
  });

  if (allServiceNames.length) {
    html += '<div class="infra-services-matrix">';
    html += '<table class="infra-matrix-table">';
    html += '<thead><tr><th>Servicio</th>';
    servers.forEach(s => {
      const roleClass = `role-${s.role || 'production'}`;
      html += `<th><span class="matrix-server-name">${s.name}</span><span class="role-badge-sm ${roleClass}">${(s.role || 'prod').toUpperCase()}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    allServiceNames.forEach(svcName => {
      html += `<tr><td class="svc-name-cell">${svcName}</td>`;
      servers.forEach(s => {
        const app = serviceMap[svcName]?.[s.id];
        if (!app) {
          html += '<td><span class="dot-none">--</span></td>';
        } else {
          const dotClass = app.status === 'active' ? 'dot-green' :
                           app.status === 'prepared' ? 'dot-blue' :
                           app.status === 'anomaly' ? 'dot-yellow' : 'dot-grey';
          const title = app.note || app.status;
          const portStr = app.port ? `:${app.port}` : '';
          html += `<td><span class="${dotClass}" title="${title}"></span><span class="matrix-port">${portStr}</span></td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }

  // === Database Panel ===
  if (database) {
    html += '<details class="infographic-details" open>';
    html += '<summary class="infographic-summary">Base de Datos</summary>';
    html += '<div class="infra-db-panel">';
    html += `<div class="infra-db-host"><span class="infra-db-label">Host:</span> ${database.host || 'N/A'}</div>`;
    if (database.datasources && database.datasources.length) {
      html += '<div class="infra-ds-grid">';
      database.datasources.forEach(ds => {
        html += `<div class="infra-ds-card">
          <div class="infra-ds-name">${ds.name}</div>
          <div class="infra-ds-pool">Pool: <strong>${ds.pool}</strong></div>
          ${ds.jndi ? `<div class="infra-ds-jndi">JNDI: ${ds.jndi}</div>` : ''}
        </div>`;
      });
      html += '</div>';
    }
    html += '</div></details>';
  }

  // === Cron Jobs ===
  const serversWithCrons = servers.filter(s => s.crons && s.crons.length);
  if (serversWithCrons.length) {
    html += '<details class="infographic-details">';
    html += '<summary class="infographic-summary">Tareas Programadas (Cron)</summary>';
    html += '<div class="infra-crons-panel">';
    serversWithCrons.forEach(s => {
      html += `<div class="infra-cron-server"><strong>${s.name}</strong></div>`;
      s.crons.forEach(c => {
        html += `<div class="infra-cron-item">
          <span class="infra-cron-name">${c.name}</span>
          <span class="infra-cron-schedule">${c.schedule}</span>
        </div>`;
      });
    });
    html += '</div></details>';
  }

  // === Anomalies ===
  const allAnomalies = [];
  servers.forEach(s => {
    (s.anomalies || []).forEach(a => allAnomalies.push({ server: s.name, msg: a }));
  });
  if (allAnomalies.length) {
    html += '<div class="infra-anomalies">';
    html += '<div class="infra-anomalies-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Anomalias Detectadas</div>';
    allAnomalies.forEach(a => {
      html += `<div class="infra-anomaly-item">
        <span class="infra-anomaly-server">${a.server}</span>
        <span class="infra-anomaly-msg">${a.msg}</span>
      </div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}
