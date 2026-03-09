// Runbooks — Guías de acción contextual para cada tipo de problema
// Se muestran como botón "¿Qué hacer?" en los banners de diagnóstico

const RUNBOOKS = {
  zombie_transaction: {
    title: 'Transacción zombie detectada',
    steps: [
      { text: 'Identifica el proceso:', code: "SELECT pid, usename, application_name, client_addr,\n  state, query_start, now() - query_start as duracion,\n  left(query, 200) as query\nFROM pg_stat_activity\nWHERE state = 'idle in transaction'\nORDER BY query_start;",
        action: { name: 'view_zombies', label: '▶ Ver zombies', risk: 'safe' } },
      { text: 'Mata la conexión (necesitas el PID del paso anterior):', code: "SELECT pg_terminate_backend(<PID>);",
        action: { name: 'kill_zombie', label: '⚠ Matar zombie', risk: 'moderate', paramPrompt: 'pid' } },
      { text: 'Verifica que LABSIS reconecte automáticamente (los datasources JBoss se recuperan solos).' },
      { text: 'Reporta al equipo de desarrollo: el datasource indicado en "application_name" tiene un leak de conexiones.' },
      { text: 'Para prevenir: configurar idle_in_transaction_session_timeout en PostgreSQL (parámetro RDS, requiere reboot del cluster).' },
    ],
  },

  high_cpu: {
    title: 'CPU saturada',
    steps: [
      { text: 'Verifica qué proceso consume CPU:', code: "top -bn1 | head -15",
        action: { name: 'view_top', label: '▶ Ver procesos', risk: 'safe', paramPrompt: 'server' } },
      { text: 'Si es JBoss (proceso java), verifica su estado:',
        action: { name: 'view_jboss', label: '▶ Ver JBoss', risk: 'safe', paramPrompt: 'server' } },
      { text: 'Revisa si hay queries pesados corriendo en la BD (tab Queries BD).' },
      { text: 'Si la CPU no baja, considera reiniciar JBoss:',
        action: { name: 'restart_jboss', label: '🔺 Reiniciar JBoss', risk: 'danger', paramPrompt: 'server' } },
      { text: 'Nota: si el steal es alto (>30%), el problema es de Amazon, no de la app. Considerar upgrade del tipo de instancia EC2.' },
    ],
  },

  high_memory: {
    title: 'Memoria del servidor al límite',
    steps: [
      { text: 'Verifica qué proceso consume memoria:',
        action: { name: 'view_memory', label: '▶ Ver memoria', risk: 'safe', paramPrompt: 'server' } },
      { text: 'Si JBoss usa >18 GB, el Garbage Collector está trabajando de más. Revisa si hay memory leak en la app.' },
      { text: 'Libera caché del sistema operativo (temporal):',
        action: { name: 'drop_caches', label: '🔺 Liberar cache', risk: 'danger', paramPrompt: 'server' } },
      { text: 'Si se repite, considera aumentar RAM del servidor o reducir el heap de JBoss.' },
    ],
  },

  disk_full: {
    title: 'Disco casi lleno',
    steps: [
      { text: 'Verifica uso de disco:',
        action: { name: 'view_disk', label: '▶ Ver disco', risk: 'safe', paramPrompt: 'server' } },
      { text: 'Limpia logs viejos (>7 días):',
        action: { name: 'clean_logs', label: '🔺 Limpiar logs', risk: 'danger', paramPrompt: 'server' } },
      { text: 'Limpia archivos temporales (>2 días):',
        action: { name: 'clean_tmp', label: '🔺 Limpiar /tmp', risk: 'danger', paramPrompt: 'server' } },
    ],
  },

  low_cache_hit: {
    title: 'Cache hit de BD bajo',
    steps: [
      { text: 'El cache hit bajo significa que la BD lee datos del disco en vez de memoria. Esto es ~100x más lento.' },
      { text: 'Causas comunes: shared_buffers muy pequeño, tablas sin índices, o queries que escanean tablas completas (Seq Scan).' },
      { text: 'Verifica tablas con más seq scans:', code: "SELECT schemaname, relname, seq_scan, idx_scan,\n  seq_scan - idx_scan as diff\nFROM pg_stat_user_tables\nWHERE seq_scan > 100\nORDER BY seq_scan DESC LIMIT 10;" },
      { text: 'Verifica el tamaño de shared_buffers:', code: "SHOW shared_buffers;\n-- Recomendado: 25% de RAM del servidor (4 GB para RDS db.m5.large)" },
      { text: 'Si hay tablas grandes sin índices, revisa el documento ANALISIS_BD_LABSIS_LAPI.md para las recomendaciones de índices.' },
    ],
  },

  waiting_locks: {
    title: 'Operaciones bloqueadas en BD',
    steps: [
      { text: 'Identifica bloqueos actuales:',
        action: { name: 'view_locks', label: '▶ Ver bloqueos', risk: 'safe' } },
      { text: 'Si el bloqueador está "idle in transaction", es un zombie. Mata esa conexión:',
        action: { name: 'kill_zombie', label: '⚠ Matar proceso', risk: 'moderate', paramPrompt: 'pid' } },
      { text: 'Si es un query legítimo largo, cancela solo ese query (sin matar conexión):',
        action: { name: 'cancel_query', label: '⚠ Cancelar query', risk: 'moderate', paramPrompt: 'pid' } },
    ],
  },

  high_connections: {
    title: 'Demasiadas conexiones a BD',
    steps: [
      { text: 'Verifica de dónde vienen las conexiones:',
        action: { name: 'view_connections', label: '▶ Ver conexiones', risk: 'safe' } },
      { text: 'Si un servidor tiene muchas conexiones idle, los datasources JBoss están mal configurados (pool muy grande).' },
      { text: 'Configuración recomendada por datasource: min-pool-size=5, max-pool-size=30, idle-timeout-minutes=5.' },
      { text: 'Para liberar conexiones idle viejas (>30 min):',
        action: { name: 'kill_idle_old', label: '⚠ Limpiar idle', risk: 'moderate' } },
    ],
  },

  slow_queries: {
    title: 'Operaciones lentas detectadas',
    steps: [
      { text: 'Ver conexiones activas y su duración:',
        action: { name: 'view_connections', label: '▶ Ver conexiones', risk: 'safe' } },
      { text: 'Revisa el tab "Queries BD" para ver los queries más costosos y si necesitan índices.' },
      { text: 'Para cancelar un query específico sin matar la conexión:',
        action: { name: 'cancel_query', label: '⚠ Cancelar query', risk: 'moderate', paramPrompt: 'pid' } },
    ],
  },

  high_rollbacks: {
    title: 'Alta tasa de rollbacks',
    steps: [
      { text: 'Los rollbacks indican que operaciones están fallando. Causas: deadlocks, constraint violations, timeouts.' },
      { text: 'Revisa logs de JBoss para errores:', code: "ssh dynamtek@<IP> 'tail -100 /opt/wildfly/standalone/log/server.log | grep -i \"error\\|exception\\|rollback\"'" },
      { text: 'Verifica deadlocks recientes:', code: "SELECT deadlocks FROM pg_stat_database WHERE datname = 'labsis';" },
      { text: 'Si los rollbacks son por constraint violations, el equipo de desarrollo debe revisar la lógica de la app.' },
    ],
  },

  high_temp_files: {
    title: 'Archivos temporales de BD excesivos',
    steps: [
      { text: 'Los archivos temporales se crean cuando un query necesita más memoria de la que tiene asignada (work_mem).' },
      { text: 'Verifica el valor actual de work_mem:', code: "SHOW work_mem;\n-- Default: 4MB. Recomendado para LABSIS: 64MB-128MB" },
      { text: 'Los queries que generan temp files son los que hacen ORDER BY, GROUP BY, o JOINs en tablas grandes sin índice.' },
      { text: 'Revisa el tab "Queries BD" y busca queries con "Temp Blocks" > 0.' },
      { text: 'Para aumentar work_mem en RDS: modificar grupo de parámetros (requiere reboot del cluster).' },
    ],
  },
};

// Obtiene el runbook apropiado según el tipo de diagnóstico
function getRunbook(diagType) {
  return RUNBOOKS[diagType] || null;
}

// Genera el HTML del runbook expandible con botones de acción
function renderRunbookHTML(diagType) {
  const rb = RUNBOOKS[diagType];
  if (!rb) return '';

  let stepsHtml = rb.steps.map((step, i) => {
    let html = `<div class="rb-step"><span class="rb-num">${i + 1}.</span> ${step.text}`;
    if (step.code) {
      html += `<pre class="rb-code">${step.code}</pre>`;
    }
    if (step.action) {
      const a = step.action;
      const btnClass = a.risk === 'safe' ? 'action-btn-safe' : a.risk === 'moderate' ? 'action-btn-moderate' : 'action-btn-danger';
      if (a.paramPrompt) {
        // Acción que necesita un parámetro (PID o servidor)
        const isServer = a.paramPrompt === 'server';
        const inputHtml = isServer
          ? '<select class="action-param rb-action-param" data-param="server"><option value="el18">El 18</option><option value="el316">El 3</option></select>'
          : `<input class="action-param rb-action-param" data-param="${a.paramPrompt}" type="number" placeholder="PID" style="width:80px">`;
        html += `<div class="rb-action">${inputHtml}<button class="${btnClass}" onclick="handleRunbookAction('${a.name}', '${a.risk}', this)">${a.label}</button><div class="action-inline-result" style="display:none"></div></div>`;
      } else {
        // Acción sin parámetros extra
        html += `<div class="rb-action"><button class="${btnClass}" onclick="handleRunbookAction('${a.name}', '${a.risk}', this)">${a.label}</button><div class="action-inline-result" style="display:none"></div></div>`;
      }
    }
    html += '</div>';
    return html;
  }).join('');

  return `
    <div class="rb-container" style="display:none">
      <div class="rb-title">${rb.title}</div>
      ${stepsHtml}
    </div>
  `;
}

// Ejecutar acción desde un runbook
function handleRunbookAction(actionName, risk, btn) {
  const container = btn.closest('.rb-action');
  const params = {};
  container.querySelectorAll('.rb-action-param').forEach(el => {
    params[el.dataset.param] = el.value;
  });

  const resultDiv = container.querySelector('.action-inline-result');

  if (risk === 'safe') {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="action-loading">Ejecutando...</div>';
    fetch(`api/actions/${actionName}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    .then(r => r.json())
    .then(data => {
      resultDiv.innerHTML = data.ok
        ? formatOutput(data.output, data.duration_ms, data.action)
        : `<div class="action-error">${data.error}</div>`;
    })
    .catch(err => {
      resultDiv.innerHTML = `<div class="action-error">${err.message}</div>`;
    });
  } else {
    confirmAction(actionName, params);
  }
}

// Toggle del runbook cuando se hace click en "¿Qué hacer?"
function toggleRunbook(btn) {
  const container = btn.nextElementSibling;
  if (container && container.classList.contains('rb-container')) {
    const show = container.style.display === 'none';
    container.style.display = show ? 'block' : 'none';
    btn.textContent = show ? 'Ocultar guía' : '¿Qué hacer?';
  }
}
