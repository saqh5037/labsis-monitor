// Catálogo de acciones ejecutables — whitelist estricta

const ACTIONS = {
  // ── SEGURAS (solo lectura) ──
  view_top: {
    name: 'view_top',
    label: 'Ver procesos (top)',
    description: 'Muestra los procesos que más CPU consumen',
    risk: 'safe',
    target: 'ssh',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'top -bn1 -o %CPU | head -25',
  },
  view_memory: {
    name: 'view_memory',
    label: 'Ver memoria detallada',
    description: 'Muestra uso de RAM y procesos que más memoria consumen',
    risk: 'safe',
    target: 'ssh',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'free -h && echo "---TOP MEM---" && ps aux --sort=-%mem | head -10',
  },
  view_disk: {
    name: 'view_disk',
    label: 'Ver espacio en disco',
    description: 'Muestra uso de disco y directorios grandes',
    risk: 'safe',
    target: 'ssh',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'df -h && echo "---DIRECTORIOS---" && du -sh /var/log /tmp /opt/wildfly/standalone/log 2>/dev/null || true',
  },
  view_connections: {
    name: 'view_connections',
    label: 'Ver conexiones BD',
    description: 'Muestra quién está conectado a PostgreSQL',
    risk: 'safe',
    target: 'pg',
    params: [],
    buildQuery: () => `SELECT pid, client_addr, application_name, state,
      age(now(), query_start) as duracion,
      left(query, 80) as query
      FROM pg_stat_activity
      WHERE datname = 'labsis'
      ORDER BY query_start`,
  },
  view_locks: {
    name: 'view_locks',
    label: 'Ver bloqueos BD',
    description: 'Muestra operaciones bloqueadas y quién las bloquea',
    risk: 'safe',
    target: 'pg',
    params: [],
    buildQuery: () => `SELECT
      blocked.pid AS pid_bloqueado,
      blocked.query AS query_bloqueado,
      age(now(), blocked.query_start) AS esperando,
      blocker.pid AS pid_bloqueador,
      blocker.state AS estado_bloqueador,
      left(blocker.query, 60) AS query_bloqueador
      FROM pg_locks bl
      JOIN pg_stat_activity blocked ON bl.pid = blocked.pid
      JOIN pg_locks bl2 ON bl.locktype = bl2.locktype
        AND bl.database IS NOT DISTINCT FROM bl2.database
        AND bl.relation IS NOT DISTINCT FROM bl2.relation
        AND bl.pid != bl2.pid
      JOIN pg_stat_activity blocker ON bl2.pid = blocker.pid
      WHERE NOT bl.granted`,
  },
  view_zombies: {
    name: 'view_zombies',
    label: 'Ver transacciones zombie',
    description: 'Muestra conexiones en estado "idle in transaction" (abandonadas)',
    risk: 'safe',
    target: 'pg',
    params: [],
    buildQuery: () => `SELECT pid, client_addr, application_name, state,
      age(now(), query_start) as duracion,
      age(now(), xact_start) as duracion_tx,
      left(query, 100) as query
      FROM pg_stat_activity
      WHERE state = 'idle in transaction'
        AND datname = 'labsis'
      ORDER BY query_start`,
  },
  view_jboss: {
    name: 'view_jboss',
    label: 'Ver estado JBoss',
    description: 'Muestra PID, RAM, CPU y threads del proceso LABSIS',
    risk: 'safe',
    target: 'ssh',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'JPID=$(pgrep -f "org.jboss.Main" 2>/dev/null | head -1); if [ -n "$JPID" ]; then echo "PID RSS_KB VSZ_KB CPU% THREADS" && ps -p $JPID -o pid=,rss=,vsz=,pcpu=,nlwp= && echo "---UPTIME---" && ps -p $JPID -o etime= | xargs echo "Uptime:"; else echo "JBoss no encontrado"; fi',
  },
  view_tcp_stuck: {
    name: 'view_tcp_stuck',
    label: 'Ver TCP atoradas',
    description: 'Muestra conexiones TCP en CLOSE-WAIT del puerto 8080',
    risk: 'safe',
    target: 'ssh',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'echo "=== CLOSE-WAIT 8080 ===" && ss -tnp state close-wait sport = :8080 | head -20 && echo "---Total:" && ss -tnp state close-wait sport = :8080 | wc -l',
  },

  // ── MODERADAS (afectan 1 proceso/conexión) ──
  kill_zombie: {
    name: 'kill_zombie',
    label: 'Matar transacción zombie',
    description: 'Desconecta una sesión específica de PostgreSQL',
    risk: 'moderate',
    target: 'pg',
    riskDetail: 'Desconecta esta sesión de la BD. La aplicación reconecta automáticamente. Si era una transacción legítima (reporte largo), se pierde el progreso.',
    params: [{ name: 'pid', type: 'integer', label: 'PID del proceso', min: 1, max: 99999 }],
    buildQuery: (params) => `SELECT pg_terminate_backend(${params.pid})`,
    previewQuery: (params) => `SELECT pid, state, age(now(), query_start) as duracion, left(query, 100) as query FROM pg_stat_activity WHERE pid = ${params.pid}`,
  },
  cancel_query: {
    name: 'cancel_query',
    label: 'Cancelar query lento',
    description: 'Cancela el query actual sin matar la conexión',
    risk: 'moderate',
    target: 'pg',
    riskDetail: 'Cancela solo el query en ejecución, la conexión sigue viva. Puede causar un error en la aplicación que lanzó el query, pero no desconecta.',
    params: [{ name: 'pid', type: 'integer', label: 'PID del proceso', min: 1, max: 99999 }],
    buildQuery: (params) => `SELECT pg_cancel_backend(${params.pid})`,
    previewQuery: (params) => `SELECT pid, state, age(now(), query_start) as duracion, left(query, 100) as query FROM pg_stat_activity WHERE pid = ${params.pid}`,
  },
  kill_idle_old: {
    name: 'kill_idle_old',
    label: 'Limpiar conexiones idle viejas',
    description: 'Cierra conexiones inactivas que llevan mucho tiempo sin hacer nada',
    risk: 'moderate',
    target: 'pg',
    riskDetail: 'Cierra conexiones en estado "idle" con más de X minutos sin actividad. JBoss reconecta automáticamente pero puede haber un breve lag en requests.',
    params: [{ name: 'minutes', type: 'integer', label: 'Minutos de inactividad', min: 5, max: 1440, default: 30 }],
    buildQuery: (params) => `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND datname = 'labsis' AND query_start < now() - interval '${params.minutes} minutes'`,
    previewQuery: (params) => `SELECT count(*) as conexiones_a_cerrar FROM pg_stat_activity WHERE state = 'idle' AND datname = 'labsis' AND query_start < now() - interval '${params.minutes} minutes'`,
  },

  // ── PELIGROSAS (afectan servicio completo) ──
  clean_logs: {
    name: 'clean_logs',
    label: 'Limpiar logs viejos',
    description: 'Elimina logs comprimidos de más de 7 días para liberar disco',
    risk: 'danger',
    target: 'ssh',
    riskDetail: 'Elimina archivos .gz de /var/log con más de 7 días y recorta journal del sistema a 200MB. Se pierde historial de diagnóstico. Necesario si disco >90%.',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'find /var/log -name "*.gz" -mtime +7 -delete 2>/dev/null; journalctl --vacuum-size=200M 2>/dev/null; echo "---ESPACIO DESPUES---" && df -h /',
  },
  clean_tmp: {
    name: 'clean_tmp',
    label: 'Limpiar /tmp',
    description: 'Elimina archivos temporales de más de 2 días (protege CSVs de monitoreo)',
    risk: 'danger',
    target: 'ssh',
    riskDetail: 'Elimina archivos en /tmp con más de 2 días. Protege archivos labsis-* y rds-* (monitoreo). Podría borrar archivos temporales que algún proceso activo necesite.',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'find /tmp -type f -mtime +2 -not -name "labsis-*" -not -name "rds-*" -not -name "monitor-*" -delete 2>/dev/null; echo "---ESPACIO DESPUES---" && df -h / && echo "---TMP---" && du -sh /tmp',
  },
  drop_caches: {
    name: 'drop_caches',
    label: 'Liberar cache del kernel',
    description: 'Libera buffers/cache de RAM del sistema operativo',
    risk: 'danger',
    target: 'ssh',
    riskDetail: 'Ejecuta sync + drop_caches. No afecta procesos en ejecución. Puede causar lentitud temporal de ~30s mientras el kernel reconstruye caches de disco. Requiere sudo.',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'sync && sudo sh -c "echo 3 > /proc/sys/vm/drop_caches" && echo "Caches liberados" && free -h',
  },
  restart_jboss: {
    name: 'restart_jboss',
    label: 'Reiniciar JBoss/LABSIS',
    description: 'Reinicia el servidor de aplicación LABSIS (JBoss 4.2.3)',
    risk: 'danger',
    target: 'ssh',
    riskDetail: 'ALTO RIESGO: Los usuarios conectados a LABSIS pierden su sesión inmediatamente. El servicio tarda 2-5 minutos en volver a estar disponible. Usar SOLO si JBoss no responde o hay memory leak confirmado (RSS >18GB).',
    params: [{ name: 'server', type: 'enum', values: ['el18', 'el316'], label: 'Servidor' }],
    buildCommand: () => 'JPID=$(pgrep -f "org.jboss.Main" 2>/dev/null | head -1); if [ -n "$JPID" ]; then echo "Matando JBoss PID $JPID..." && kill $JPID && sleep 5 && echo "Proceso terminado"; else echo "JBoss no estaba corriendo"; fi && echo "Iniciando JBoss..." && nohup /home/dynamtek/jboss-4.2.3.GA/bin/run.sh -c default -b 0.0.0.0 > /dev/null 2>&1 & sleep 8 && NEWPID=$(pgrep -f "org.jboss.Main" 2>/dev/null | head -1); if [ -n "$NEWPID" ]; then echo "JBoss reiniciado. Nuevo PID: $NEWPID" && ps -p $NEWPID -o pid=,rss=,vsz=,pcpu= 2>/dev/null; else echo "JBoss aún levantando (puede tardar 2-5 min). Verificar con Ver estado JBoss."; fi',
  },
};

function getAction(name) {
  return ACTIONS[name] || null;
}

function listActions() {
  const grouped = { safe: [], moderate: [], danger: [] };
  for (const action of Object.values(ACTIONS)) {
    grouped[action.risk].push({
      name: action.name,
      label: action.label,
      description: action.description,
      risk: action.risk,
      riskDetail: action.riskDetail || null,
      target: action.target,
      params: action.params,
    });
  }
  return grouped;
}

function validateParams(action, params) {
  const errors = [];
  for (const spec of action.params) {
    const val = params[spec.name];
    if (val === undefined || val === null || val === '') {
      errors.push(`Parámetro "${spec.label}" es requerido`);
      continue;
    }
    if (spec.type === 'enum' && !spec.values.includes(val)) {
      errors.push(`"${spec.label}" debe ser uno de: ${spec.values.join(', ')}`);
    }
    if (spec.type === 'integer') {
      const n = parseInt(val);
      if (isNaN(n)) { errors.push(`"${spec.label}" debe ser un número entero`); continue; }
      if (spec.min !== undefined && n < spec.min) errors.push(`"${spec.label}" mínimo: ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) errors.push(`"${spec.label}" máximo: ${spec.max}`);
    }
  }
  return errors;
}

module.exports = { ACTIONS, getAction, listActions, validateParams };
