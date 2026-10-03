// Interfaces Middleware Panel — Overview mini gauges + Detail tab
// Monitorea las 6 interfaces Windows (AlphaWeb / AMS) via agente remoto

(function () {

  // ── Static maps ──

  var INTERFACE_DIRECTION = {
    'alphaweb-request-from-lab':  'AlphaWeb → Middle',
    'alphaweb-request-to-labsis': 'Middle → Labsis',
    'ams-send-labrequest':        'Labsis → AMS',
    'ams-results-from-lab':       'AMS → Middle',
    'ams-results-to-labsis':      'Middle → Labsis',
    'alphaweb-checkin':           'Labsis → AlphaWeb',
  };

  var INTERFACE_SHORT_NAME = {
    'alphaweb-request-from-lab':  ['AlphaWeb', 'RequestFromLab'],
    'alphaweb-request-to-labsis': ['AlphaWeb', 'RequestToLabsis'],
    'ams-send-labrequest':        ['AMS', 'SendLabRequest'],
    'ams-results-from-lab':       ['AMS', 'ResultsFromLab'],
    'ams-results-to-labsis':      ['AMS', 'ResultsToLabsis'],
    'alphaweb-checkin':           ['AlphaWeb', 'SendCheckIn'],
  };

  // Middle-agent interface id -> flow queue (equipoId + tipo as reported by api/interfaces/flow)
  var FLOW_QUEUE_BY_INTERFACE = {
    'alphaweb-checkin': { equipoId: 167, tipo: 'Checkin' },
  };

  var FLOW_LEVEL_LABEL = { ok: 'Fluyendo', warn: 'Atención', crit: 'Detenida' };

  var FLOW_REASON_LABEL = {
    stalled: 'Sin avance',
    oldest:  'Pendiente antiguo',
    reset:   'Posible reseteo masivo',
    backlog: 'Acumulación',
    orphans: 'Registros huérfanos (muestra inexistente)',
  };

  // Max MB for gauge arc scale
  var MEM_MAX = 512;

  // Cached last data
  var lastInterfacesData = null;
  var lastFlowData = null; // null = feature off / unreachable -> render nothing new

  // Refresh timer handle
  var refreshTimer = null;

  // ── Helpers ──

  function getStatusColor(iface) {
    if (iface.status !== 'running') return 'var(--red)';
    if (iface.memoryMB > 300) return 'var(--yellow)';
    return 'var(--green)';
  }

  function getStatusClass(iface) {
    if (iface.status !== 'running') return 'intf-status-stopped';
    if (iface.memoryMB > 300) return 'intf-status-warning';
    return 'intf-status-running';
  }

  function shortName(id, index) {
    var parts = INTERFACE_SHORT_NAME[id];
    return parts ? parts[index] : id;
  }

  function memPct(memMB) {
    return Math.min(1, (memMB || 0) / MEM_MAX);
  }

  // SVG circle gauge — 80px, arc showing memory %
  // cx=40 cy=40 r=32, circumference = 2*PI*32 = ~201
  function buildGaugeSVG(iface) {
    var C = 201.06; // 2*PI*32
    var color = getStatusColor(iface);
    var running = iface.status === 'running';
    var pct = memPct(iface.memoryMB);
    var filled = (pct * C).toFixed(2);
    var gap = (C - filled).toFixed(2);

    if (!running) {
      return (
        '<svg width="80" height="80" viewBox="0 0 80 80">' +
          '<circle cx="40" cy="40" r="32" fill="none" stroke="rgba(100,116,139,0.2)" stroke-width="7"/>' +
          '<line x1="26" y1="26" x2="54" y2="54" stroke="rgba(100,116,139,0.45)" stroke-width="3" stroke-linecap="round"/>' +
          '<line x1="54" y1="26" x2="26" y2="54" stroke="rgba(100,116,139,0.45)" stroke-width="3" stroke-linecap="round"/>' +
        '</svg>'
      );
    }

    return (
      '<svg width="80" height="80" viewBox="0 0 80 80">' +
        '<circle cx="40" cy="40" r="32" fill="none" stroke="rgba(100,116,139,0.2)" stroke-width="7"/>' +
        '<circle cx="40" cy="40" r="32" fill="none"' +
          ' stroke="' + color + '"' +
          ' stroke-width="7"' +
          ' stroke-linecap="round"' +
          ' stroke-dasharray="' + filled + ' ' + gap + '"' +
          ' stroke-dashoffset="50.27"' + // rotate so arc starts at top (C/4)
          ' style="transition: stroke-dasharray 0.8s ease"/>' +
      '</svg>'
    );
  }

  // ── Flow helpers ──

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDuration(sec) {
    if (sec == null || isNaN(sec)) return '—';
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + ' s';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    var m = min % 60;
    return m ? h + ' h ' + m + ' min' : h + ' h';
  }

  function formatLocalTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX');
  }

  function flowLevel(q) {
    return q && FLOW_LEVEL_LABEL[q.level] ? q.level : 'warn';
  }

  function flowPill(q) {
    var lvl = flowLevel(q);
    return '<span class="intf-flow-pill ' + lvl + '">' + FLOW_LEVEL_LABEL[lvl] + '</span>';
  }

  function findFlowQueue(ifaceId) {
    var m = FLOW_QUEUE_BY_INTERFACE[ifaceId];
    if (!m || !lastFlowData || !lastFlowData.queues) return null;
    for (var i = 0; i < lastFlowData.queues.length; i++) {
      var q = lastFlowData.queues[i];
      if (String(q.equipoId) === String(m.equipoId) && q.tipo === m.tipo) return q;
    }
    return null;
  }

  function flowInlinePill(ifaceId) {
    var q = findFlowQueue(ifaceId);
    return q ? '<div class="intf-flow-inline">' + flowPill(q) + '</div>' : '';
  }

  function flowQueueTitle(q) {
    return esc(q.name || (q.tipo + ' · equipo ' + q.equipoId));
  }

  function flowReasons(q) {
    return (q.reasons || []).map(function (r) { return FLOW_REASON_LABEL[r] || r; });
  }

  function flowStalledText(q) {
    return q.stalledSec > 0 ? 'sin avance hace ' + formatDuration(q.stalledSec) : '';
  }

  function buildFlowStrip() {
    var f = lastFlowData;
    if (!f) return '';
    var body;
    if (!f.available) {
      body = '<div class="intf-flow-empty">Sin datos de flujo (error de consulta)</div>';
    } else if (!f.queues || !f.queues.length) {
      return '';
    } else {
      body = '<div class="intf-flow-list">' + f.queues.map(function (q) {
        var lvl = flowLevel(q);
        var stalled = flowStalledText(q);
        return (
          '<div class="intf-flow-item ' + lvl + '">' +
            '<div class="intf-flow-item-head">' +
              '<span class="intf-flow-name">' + flowQueueTitle(q) + '</span>' +
              flowPill(q) +
            '</div>' +
            '<div class="intf-flow-item-meta">' +
              '<span>Pendientes: <strong>' + esc(q.pending) + '</strong></span>' +
              '<span>Más antiguo: <strong>' + (q.pending > 0 ? formatDuration(q.oldestPendingSec) : '—') + '</strong></span>' +
              (stalled ? '<span class="intf-flow-stalled">' + stalled + '</span>' : '') +
            '</div>' +
          '</div>'
        );
      }).join('') + '</div>';
    }
    return (
      '<div class="intf-flow-strip" id="intf-flow-strip">' +
        '<div class="intf-flow-title">Flujo de colas</div>' +
        body +
      '</div>'
    );
  }

  function buildFlowSection() {
    var f = lastFlowData;
    if (!f) return '';
    var head = (
      '<div class="intf-tab-header intf-flow-section-header">' +
        '<div class="chart-title">Flujo de colas</div>' +
        '<div class="chart-desc">Procesando, no solo vivo: mide el avance real de las colas de envío. ' +
          (f.checkedAt ? 'Última verificación: ' + esc(formatLocalTime(f.checkedAt)) : '') +
        '</div>' +
      '</div>'
    );
    if (!f.available) {
      return '<div id="intf-flow-section">' + head +
        '<div class="intf-flow-empty">Sin datos de flujo (error de consulta)</div></div>';
    }
    if (!f.queues || !f.queues.length) return '';
    return (
      '<div id="intf-flow-section">' + head +
        '<div class="intf-detail-grid">' + f.queues.map(buildFlowDetailCard).join('') + '</div>' +
      '</div>'
    );
  }

  function buildFlowDetailCard(q) {
    var lvl = flowLevel(q);
    var reasons = flowReasons(q);
    var reasonsHtml = reasons.length
      ? reasons.map(function (r) { return '<span class="intf-flow-reason">' + esc(r) + '</span>'; }).join('')
      : '—';
    return (
      '<div class="intf-detail-card intf-flow-card ' + lvl + '">' +
        '<div class="intf-detail-header">' +
          '<div class="intf-detail-name">' + flowQueueTitle(q) + '</div>' +
          flowPill(q) +
        '</div>' +
        '<div class="intf-detail-body">' +
          _detailRow('Equipo / tipo', esc(q.equipoId) + ' / ' + esc(q.tipo)) +
          _detailRow('Pendientes', esc(q.pending)) +
          _detailRow('Más antiguo', q.pending > 0 ? formatDuration(q.oldestPendingSec) : '—') +
          _detailRow('Sin avance', q.stalledSec > 0 ? formatDuration(q.stalledSec) : '—') +
          _detailRow('Enviados (ventana)', esc(q.sentInWindow)) +
          _detailRow('Huérfanos', esc(q.orphans)) +
          _detailRow('Primer pendiente (id)', q.firstPendingId != null ? esc(q.firstPendingId) : '—') +
          _detailRow('Último avance', esc(formatLocalTime(q.lastProgressAt))) +
          '<div class="intf-detail-row intf-flow-reasons-row">' +
            '<span class="intf-detail-label">Motivos</span>' +
            '<span class="intf-flow-reasons">' + reasonsHtml + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Overview Panel ──

  function renderInterfacesOverview() {
    var container = document.getElementById('interfaces-overview-panel');
    if (!container) return;

    var data = lastInterfacesData;

    // Disconnected state
    if (!data || !data.available || !data.connected) {
      container.innerHTML = (
        '<div class="infographic-section">' +
          '<h2 class="infographic-section-title">Interfaces Middleware</h2>' +
          '<div class="intf-subtitle">Windows Server 2012 — AlphaWeb / AMS</div>' +
          '<div class="intf-connection-banner intf-disconnected">' +
            '<span class="intf-conn-dot"></span>' +
            'Agente no disponible — sin datos de interfaces' +
          '</div>' +
          '<div class="intf-gauges-grid">' +
            _buildDisconnectedGauges() +
          '</div>' +
          buildFlowStrip() +
        '</div>'
      );
      return;
    }

    var ifaces = data.interfaces || [];
    var runningCount = ifaces.filter(function (i) { return i.status === 'running'; }).length;
    var total = ifaces.length;

    container.innerHTML = (
      '<div class="infographic-section">' +
        '<h2 class="infographic-section-title">Interfaces Middleware</h2>' +
        '<div class="intf-subtitle">Windows Server 2012 — AlphaWeb / AMS</div>' +
        '<div class="intf-connection-banner intf-connected">' +
          '<span class="intf-conn-dot"></span>' +
          'Conectado via Cloudflare &nbsp;&bull;&nbsp; ' +
          '<strong>' + runningCount + '</strong>/' + total + ' interfaces activas' +
        '</div>' +
        '<div class="intf-gauges-grid">' +
          ifaces.map(buildGaugeCard).join('') +
        '</div>' +
        buildFlowStrip() +
        '<div class="intf-detail-link">' +
          '<button onclick="setView(\'dashboard\'); switchTab(\'interfaces\');">Ver detalle completo</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildGaugeCard(iface) {
    var statusClass = getStatusClass(iface);
    var running = iface.status === 'running';
    var color = getStatusColor(iface);
    var label1 = shortName(iface.id, 0);
    var label2 = shortName(iface.id, 1);
    var statusText = running ? 'RUNNING' : 'STOPPED';
    var dotClass = running ? 'running' : 'stopped';
    var memVal = running ? iface.memoryMB : '—';
    var uptimeTrunc = iface.uptime ? iface.uptime.split(' ').slice(0, 2).join(' ') : '—';
    var pidText = iface.pid ? 'PID ' + iface.pid : '—';

    return (
      '<div class="intf-gauge-card ' + statusClass + '">' +
        '<div class="intf-gauge-circle">' +
          buildGaugeSVG(iface) +
          '<div class="intf-gauge-overlay">' +
            '<div class="intf-gauge-value">' + (running ? iface.memoryMB : '–') + '</div>' +
            '<div class="intf-gauge-unit">' + (running ? 'MB' : 'OFF') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="intf-gauge-label">' + label1 + '</div>' +
        '<div class="intf-gauge-sublabel">' + label2 + '</div>' +
        '<div class="intf-gauge-status">' +
          '<span class="intf-status-dot ' + dotClass + '"></span>' +
          '<span style="color:' + color + ';font-weight:700;font-size:10px;letter-spacing:.5px">' + statusText + '</span>' +
        '</div>' +
        '<div class="intf-gauge-meta">' + pidText + (running ? ' | ' + uptimeTrunc : '') + '</div>' +
        flowInlinePill(iface.id) +
      '</div>'
    );
  }

  function _buildDisconnectedGauges() {
    var ids = Object.keys(INTERFACE_SHORT_NAME);
    return ids.map(function (id) {
      var parts = INTERFACE_SHORT_NAME[id];
      return (
        '<div class="intf-gauge-card intf-status-offline">' +
          '<div class="intf-gauge-circle">' +
            '<svg width="80" height="80" viewBox="0 0 80 80">' +
              '<circle cx="40" cy="40" r="32" fill="none" stroke="rgba(100,116,139,0.15)" stroke-width="7"/>' +
            '</svg>' +
            '<div class="intf-gauge-overlay">' +
              '<div class="intf-gauge-value" style="font-size:12px;color:var(--text3)">N/A</div>' +
              '<div class="intf-gauge-unit">—</div>' +
            '</div>' +
          '</div>' +
          '<div class="intf-gauge-label">' + parts[0] + '</div>' +
          '<div class="intf-gauge-sublabel">' + parts[1] + '</div>' +
          '<div class="intf-gauge-status">' +
            '<span class="intf-status-dot stopped"></span>' +
            '<span style="color:var(--text3);font-weight:700;font-size:10px;letter-spacing:.5px">DESCONECTADO</span>' +
          '</div>' +
          '<div class="intf-gauge-meta">—</div>' +
        '</div>'
      );
    }).join('');
  }

  // ── Detail Tab ──

  function renderInterfacesTab() {
    var container = document.getElementById('interfaces-tab-container');
    if (!container) return;

    var data = lastInterfacesData;

    if (!data || !data.available || !data.connected) {
      container.innerHTML = (
        '<div class="intf-tab-header">' +
          '<div class="chart-title">Interfaces Middleware</div>' +
          '<div class="chart-desc">Estado en tiempo real de las 6 interfaces AlphaWeb/AMS en el Windows Server de middleware.</div>' +
        '</div>' +
        '<div class="intf-connection-banner intf-disconnected" style="margin-bottom:24px">' +
          '<span class="intf-conn-dot"></span>' +
          'Agente no disponible — configura el agente Windows para ver datos' +
        '</div>' +
        '<div class="no-data">Sin datos de interfaces</div>' +
        buildFlowSection()
      );
      return;
    }

    var ifaces = data.interfaces || [];

    container.innerHTML = (
      '<div class="intf-tab-header">' +
        '<div class="chart-title">Interfaces Middleware</div>' +
        '<div class="chart-desc">Estado en tiempo real de las 6 interfaces AlphaWeb/AMS en el Windows Server de middleware. Se actualiza cada 60 segundos.</div>' +
      '</div>' +
      '<div class="intf-connection-banner intf-connected" style="margin-bottom:20px">' +
        '<span class="intf-conn-dot"></span>' +
        'Conectado via Cloudflare — Windows Server 2012' +
      '</div>' +
      '<div class="intf-detail-grid">' +
        ifaces.map(buildDetailCard).join('') +
      '</div>' +
      buildFlowSection()
    );
  }

  function buildDetailCard(iface) {
    var statusClass = getStatusClass(iface);
    var running = iface.status === 'running';
    var badgeClass = running ? 'running' : 'stopped';
    var direction = INTERFACE_DIRECTION[iface.id] || iface.id;

    return (
      '<div class="intf-detail-card ' + statusClass + '">' +
        '<div class="intf-detail-header">' +
          '<div class="intf-detail-name">' + iface.name + '</div>' +
          '<span class="intf-status-badge ' + badgeClass + '">' + (running ? 'RUNNING' : 'STOPPED') + '</span>' +
        '</div>' +
        '<div class="intf-detail-body">' +
          _detailRow('PID', iface.pid ? iface.pid : '—') +
          _detailRow('Memoria', running ? iface.memoryMB + ' MB' : '—') +
          _detailRow('Uptime', iface.uptime || '—') +
          _detailRow('Dirección', direction) +
          (findFlowQueue(iface.id) ? _detailRow('Flujo', flowPill(findFlowQueue(iface.id))) : '') +
        '</div>' +
        '<div class="intf-detail-actions">' +
          '<button class="intf-action-btn" onclick="executeInterfaceAction(\'view_interface_logs\', \'' + iface.id + '\')">Ver Logs</button>' +
          '<button class="intf-action-btn" onclick="executeInterfaceAction(\'view_interface_errors\', \'' + iface.id + '\')">Ver Errores</button>' +
        '</div>' +
      '</div>'
    );
  }

  function _detailRow(label, val) {
    return (
      '<div class="intf-detail-row">' +
        '<span class="intf-detail-label">' + label + '</span>' +
        '<span class="intf-detail-val">' + val + '</span>' +
      '</div>'
    );
  }

  // ── Data fetching ──

  async function fetchInterfacesData() {
    try {
      var token = localStorage.getItem('token');
      var headers = token ? { Authorization: 'Bearer ' + token } : {};
      var res = await fetch('api/interfaces/status', { headers: headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      lastInterfacesData = await res.json();
    } catch (e) {
      lastInterfacesData = { available: false, connected: false, interfaces: [] };
    }
    await fetchFlowData();
    renderInterfacesOverview();
    renderInterfacesTab();
  }

  // Queue flow is additive: any failure or disabled feature leaves the panel as before
  async function fetchFlowData() {
    try {
      var token = localStorage.getItem('token');
      var headers = token ? { Authorization: 'Bearer ' + token } : {};
      var res = await fetch('api/interfaces/flow', { headers: headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      lastFlowData = json && json.enabled ? json : null;
    } catch (e) {
      lastFlowData = null;
    }
  }

  // ── switchTab (global helper used from buttons) ──

  window.switchTab = function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(function (t) {
      t.classList.remove('active');
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.remove('active');
    });

    var targetBtn = document.querySelector('.nav-tab[data-tab="' + tabName + '"]');
    if (targetBtn) targetBtn.classList.add('active');

    var targetPanel = document.getElementById('tab-' + tabName);
    if (targetPanel) targetPanel.classList.add('active');

    if (tabName === 'interfaces') {
      renderInterfacesTab();
    }
  };

  // ── Action execution ──

  window.executeInterfaceAction = async function executeInterfaceAction(actionName, interfaceId) {
    var params = { interface_id: interfaceId };
    if (actionName === 'view_interface_logs') params.lines = 100;

    // Show loading modal
    _showLogModal('Cargando...', 'Obteniendo ' + (actionName === 'view_interface_logs' ? 'logs' : 'errores') + ' de ' + interfaceId + '...');

    try {
      var token = localStorage.getItem('token');
      var headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      };

      var res = await fetch('api/actions/' + actionName + '/execute', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ params: params }),
      });

      var result = await res.json();
      var output = result.output || result.result || result.data || JSON.stringify(result, null, 2);
      var title = (actionName === 'view_interface_logs' ? 'Logs — ' : 'Errores — ') + interfaceId;
      _showLogModal(title, typeof output === 'string' ? output : JSON.stringify(output, null, 2));
    } catch (e) {
      _showLogModal('Error', 'No se pudo obtener la información: ' + e.message);
    }
  };

  // Modal para mostrar logs/errores (reutiliza chart-modal si existe, sino crea uno propio)
  function _showLogModal(title, content) {
    var existing = document.getElementById('intf-log-modal');
    if (!existing) {
      var overlay = document.createElement('div');
      overlay.id = 'intf-log-modal';
      overlay.className = 'intf-log-modal-overlay';
      overlay.innerHTML = (
        '<div class="intf-log-modal">' +
          '<div class="intf-log-modal-header">' +
            '<div class="intf-log-modal-title" id="intf-log-modal-title"></div>' +
            '<button class="chart-modal-close" onclick="document.getElementById(\'intf-log-modal\').style.display=\'none\'">&times;</button>' +
          '</div>' +
          '<pre class="intf-log-modal-body" id="intf-log-modal-body"></pre>' +
        '</div>'
      );
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.style.display = 'none';
      });
      document.body.appendChild(overlay);
      existing = overlay;
    }

    document.getElementById('intf-log-modal-title').textContent = title;
    document.getElementById('intf-log-modal-body').textContent = content;
    existing.style.display = 'flex';
  }

  // ── Init & refresh schedule ──

  function initInterfacesPanel() {
    fetchInterfacesData();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(fetchInterfacesData, 60000);
  }

  // Expose for app.js to call after initial data load
  window.initInterfacesPanel = initInterfacesPanel;
  window.fetchInterfacesData = fetchInterfacesData;
  window.renderInterfacesOverview = renderInterfacesOverview;
  window.renderInterfacesTab = renderInterfacesTab;

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInterfacesPanel);
  } else {
    initInterfacesPanel();
  }

})();
