// Session Panel — drawer deslizable con detalles de usuarios y equipos conectados
// Expone: openSessionPanel(type), closeSessionPanel(), updateSessionPanelIfOpen(sessions)

(function() {

  let currentPanelType = null;  // 'users' | 'equipment'
  let panelVisible = false;

  // ── Utilidades de tiempo ──

  function formatDuration(loginTimeStr) {
    if (!loginTimeStr) return '—';
    const now = new Date();
    const login = new Date(loginTimeStr);
    if (isNaN(login.getTime())) return '—';
    const diffMs = now - login;
    if (diffMs < 0) return '—';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'ahora mismo';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function formatTime(timeStr) {
    if (!timeStr) return '—';
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatRelative(timeStr) {
    if (!timeStr) return '—';
    const now = new Date();
    const t = new Date(timeStr);
    if (isNaN(t.getTime())) return '—';
    const diffMs = now - t;
    if (diffMs < 0) return '—';
    const secs = Math.floor(diffMs / 1000);
    if (secs < 60) return `hace ${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    return `hace ${Math.floor(hours / 24)}d`;
  }

  // ── Render: tabla de usuarios ──

  function renderUserTable(data, container) {
    const users = Array.isArray(data) ? data : (data.sessions || data.users || []);
    const total = users.length;

    let html = `
      <div class="session-summary-row">
        <span class="session-count-badge session-badge-blue">${total} usuario${total !== 1 ? 's' : ''} conectado${total !== 1 ? 's' : ''}</span>
      </div>`;

    if (total === 0) {
      html += `<div class="session-empty">Sin usuarios conectados en este momento</div>`;
      container.innerHTML = html;
      return;
    }

    html += `
      <table class="session-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Título</th>
            <th>Login</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>`;

    users.forEach(u => {
      const fullName = [u.nombre, u.apellido].filter(Boolean).join(' ') || u.nombre_completo || '—';
      const username = u.username || u.usuario || '';
      const titulo = u.titulo || u.title || '—';
      const loginTime = u.loginTime || u.login_time || u.fecha_login || u.session_start;

      html += `
          <tr>
            <td>
              <div class="session-user-name">${escapeHtml(fullName)}</div>
              ${username ? `<div class="session-user-sub">${escapeHtml(username)}</div>` : ''}
            </td>
            <td class="session-cell-muted">${escapeHtml(titulo)}</td>
            <td class="session-cell-mono">${formatTime(loginTime)}</td>
            <td class="session-cell-muted">${formatDuration(loginTime)}</td>
          </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // ── Render: tabla de equipos ──

  function renderEquipmentTable(data, container) {
    const equipment = Array.isArray(data) ? data : (data.equipment || data.equipos || []);
    const activeCount = equipment.filter(e => e.isActive || e.activo || e.active || e.status === 'active').length;
    const total = data.totalRegistered || equipment.length;

    let html = `
      <div class="session-summary-row">
        <span class="session-count-badge session-badge-green">${activeCount} activo${activeCount !== 1 ? 's' : ''}</span>
        <span class="session-count-badge session-badge-gray">${total} registrado${total !== 1 ? 's' : ''}</span>
      </div>`;

    if (total === 0) {
      html += `<div class="session-empty">Sin equipos registrados</div>`;
      container.innerHTML = html;
      return;
    }

    html += `
      <table class="session-table">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>Puerto</th>
            <th>Acciones</th>
            <th>Última Actividad</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>`;

    equipment.forEach(e => {
      const nombre = e.nombre_s || e.nombre || e.name || '—';
      const puerto = e.puerto || e.port || '—';
      const acciones = e.acciones || e.actions || e.action_count || 0;
      const ultimaActividad = e.lastActivity || e.ultima_actividad || e.last_activity || e.last_action;
      const isActive = e.isActive || e.activo || e.active || e.status === 'active';

      html += `
          <tr>
            <td class="session-equipo-name">${escapeHtml(nombre)}</td>
            <td class="session-cell-mono">${escapeHtml(String(puerto))}</td>
            <td class="session-cell-muted">${Number(acciones).toLocaleString('es-MX')} acciones</td>
            <td class="session-cell-muted">${formatRelative(ultimaActividad)}</td>
            <td>
              <span class="session-status-badge ${isActive ? 'session-status-active' : 'session-status-inactive'}">
                <span class="session-status-dot ${isActive ? 'dot-green' : 'dot-gray'}"></span>
                ${isActive ? 'Activo' : 'Inactivo'}
              </span>
            </td>
          </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // ── Loading state ──

  function renderLoading(container) {
    container.innerHTML = `
      <div class="session-loading">
        <div class="session-loading-spinner"></div>
        <span>Cargando datos...</span>
      </div>`;
  }

  function renderError(container, msg) {
    container.innerHTML = `
      <div class="session-empty session-error">
        No se pudo cargar la información.
        ${msg ? `<div class="session-error-detail">${escapeHtml(msg)}</div>` : ''}
      </div>`;
  }

  // ── Fetch de datos ──

  async function loadSessionData(type) {
    const container = document.getElementById('session-panel-body-content');
    if (!container) return;

    renderLoading(container);

    const endpoint = type === 'users' ? 'api/sessions/users' : 'api/sessions/equipment';

    try {
      const res = await authFetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (type === 'users') {
        renderUserTable(data, container);
      } else {
        renderEquipmentTable(data, container);
      }
    } catch (err) {
      renderError(container, err.message);
    }
  }

  // ── Panel DOM ──

  function buildPanelHTML(type) {
    const title = type === 'users' ? 'Usuarios Conectados' : 'Equipos Analíticos';
    const icon = type === 'users'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`;

    return `
      <div class="session-panel-header">
        <div class="session-panel-title">
          <span class="session-panel-icon">${icon}</span>
          <span>${title}</span>
        </div>
        <button class="session-panel-close" onclick="closeSessionPanel()" title="Cerrar">&times;</button>
      </div>
      <div class="session-panel-body">
        <div id="session-panel-body-content"></div>
      </div>`;
  }

  // ── Abrir panel ──

  window.openSessionPanel = function(type) {
    // Si ya está abierto con el mismo tipo, solo refrescar
    if (panelVisible && currentPanelType === type) {
      loadSessionData(type);
      return;
    }

    closeSessionPanel(true); // cerrar sin animación si había otro

    currentPanelType = type;
    panelVisible = true;

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'session-panel-overlay';
    overlay.id = 'session-panel-overlay';
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeSessionPanel();
    });

    // Panel drawer
    const panel = document.createElement('div');
    panel.className = 'session-panel';
    panel.id = 'session-panel';
    panel.innerHTML = buildPanelHTML(type);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Forzar reflow para que la animación slide-in funcione
    panel.getBoundingClientRect();
    panel.classList.add('session-panel-open');

    // Cerrar con Escape
    document.addEventListener('keydown', handleEscapeKey);

    loadSessionData(type);
  };

  // ── Cerrar panel ──

  window.closeSessionPanel = function(immediate) {
    const overlay = document.getElementById('session-panel-overlay');
    const panel = document.getElementById('session-panel');

    if (!overlay) {
      panelVisible = false;
      currentPanelType = null;
      document.removeEventListener('keydown', handleEscapeKey);
      return;
    }

    if (immediate) {
      overlay.remove();
      panelVisible = false;
      currentPanelType = null;
      document.removeEventListener('keydown', handleEscapeKey);
      return;
    }

    if (panel) {
      panel.classList.remove('session-panel-open');
      panel.classList.add('session-panel-closing');
    }

    setTimeout(() => {
      overlay.remove();
      panelVisible = false;
      currentPanelType = null;
      document.removeEventListener('keydown', handleEscapeKey);
    }, 260);
  };

  function handleEscapeKey(e) {
    if (e.key === 'Escape') closeSessionPanel();
  }

  // ── Auto-refresh vía SSE ──
  // app.js llamará esto cuando llegue data de sessions en el SSE handler

  window.updateSessionPanelIfOpen = function(sessions) {
    if (!panelVisible || !currentPanelType) return;

    const container = document.getElementById('session-panel-body-content');
    if (!container) return;

    // sessions puede tener { users: [...], equipment: [...] }
    if (currentPanelType === 'users' && sessions.users) {
      renderUserTable(sessions.users, container);
    } else if (currentPanelType === 'equipment' && (sessions.equipment || sessions.equipos)) {
      renderEquipmentTable(sessions.equipment || sessions.equipos, container);
    }
  };

  // ── Helper: escape HTML ──

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
