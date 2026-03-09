const express = require('express');
const path = require('path');
const { DataFetcher } = require('./lib/fetcher');
const { Storage } = require('./lib/storage');
const { fetchTopQueries } = require('./lib/pg-queries');
const { getStatus } = require('./lib/thresholds');
const { EventDetector } = require('./lib/events');
const { listActions, getAction } = require('./lib/actions');
const { ActionExecutor } = require('./lib/action-executor');
const { Auth } = require('./lib/auth');

const PORT = process.env.PORT || 3090;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const FETCH_INTERVAL = 30000;
const QUERIES_INTERVAL = 300000;

const app = express();
const fetcher = new DataFetcher();
const storage = new Storage();
let eventDetector;
let actionExecutor;
let auth;
let anomalyDetector;
let scheduler;
const sseClients = [];

// Middleware
app.use(express.json());

// ── Helper: extraer token de cookie ──
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Auth middleware ──
function authMiddleware(req, res, next) {
  if (req.path === '/api/login' || req.path === '/login.html') return next();
  if (req.path.match(/\.(css|ico|png|svg|woff2?)$/)) return next();

  const token = req.headers.authorization?.replace('Bearer ', '')
    || parseCookie(req.headers.cookie, 'token')
    || req.query.token;

  if (!token) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'No autenticado' });
    return res.redirect('login.html');
  }

  const user = auth ? auth.verifyToken(token) : null;
  if (!user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Token inválido o expirado' });
    return res.redirect('login.html');
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol de administrador' });
  }
  next();
}

// Servir login.html sin auth
app.use('/login.html', express.static(path.join(__dirname, 'public', 'login.html')));

// Auth middleware antes de static
app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes ──
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username y password requeridos' });
  const result = await auth.validateLogin(username, password);
  if (!result) return res.status(401).json({ error: 'Credenciales inválidas' });
  res.json(result);
});

app.post('/api/logout', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json(req.user);
});

// Site config para frontend (nombre del sitio, servidores disponibles)
app.get('/api/site-config', (req, res) => {
  const servers = process.env.MONITOR_SERVERS
    ? JSON.parse(process.env.MONITOR_SERVERS)
    : { el18: { name: 'El 18' }, el316: { name: 'El 3' } };
  res.json({
    siteName: process.env.SITE_NAME || 'LAPI',
    servers: Object.entries(servers).map(([id, s]) => ({ id, name: s.name || id })),
  });
});

app.get('/api/users', requireAdmin, (req, res) => {
  res.json(auth.listUsers());
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const user = await auth.createUser(username, password, role || 'readonly');
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: Datos
app.get('/api/data', (req, res) => {
  const { from, to } = req.query;
  if (from && to) {
    const data = {
      el18: storage.queryLabsis('el18', from, to),
      el316: storage.queryLabsis('el316', from, to),
      rds: storage.queryRds(from, to),
      logs: fetcher.getData().logs,
      lastUpdate: new Date().toISOString(),
    };
    res.json(data);
  } else {
    res.json(fetcher.getData());
  }
});

// API: Queries costosos
app.get('/api/queries', (req, res) => {
  const { from, to, mode } = req.query;
  if (from && to) {
    if (mode === 'raw') {
      res.json(storage.querySnapshots(from, to));
    } else {
      res.json(storage.queryDeltaSnapshots(from, to));
    }
  } else {
    res.json(storage.getLatestSnapshot());
  }
});

// API: SSE stream (token via query param)
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

// API: Logs
app.get('/api/logs/:type', (req, res) => {
  const data = fetcher.getData();
  const logMap = { slow: data.logs.slow, locks: data.logs.locks, 'idle-tx': data.logs.idleTx };
  res.type('text/plain').send(logMap[req.params.type] || '');
});

// API: Eventos
app.get('/api/events', (req, res) => {
  const { from, to, limit } = req.query;
  if (from && to) {
    res.json(storage.queryEventsByRange(from, to));
  } else {
    res.json(storage.queryEvents(parseInt(limit) || 100));
  }
});

// API: Historial de un query
app.get('/api/queries/:queryid/history', (req, res) => {
  res.json(storage.queryHistory(req.params.queryid));
});

// API: Exportar CSV
app.get('/api/export/:type', (req, res) => {
  const { type } = req.params;
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).send('Parámetros from y to requeridos');

  let rows, columns;
  if (type === 'el18' || type === 'el316') {
    rows = storage.queryLabsis(type, from, to);
    columns = ['timestamp', 'cpu_user', 'cpu_sys', 'cpu_iowait', 'cpu_steal', 'cpu_idle',
      'load_1', 'load_5', 'mem_total_mb', 'mem_used_mb', 'mem_free_mb',
      'jboss_rss_mb', 'jboss_threads', 'disk_root_pct', 'disk_tmp_pct',
      'tcp8080_estab', 'tcp8080_closewait', 'tcp5432_estab'];
  } else if (type === 'rds') {
    rows = storage.queryRds(from, to);
    columns = ['timestamp', 'total_connections', 'active_conns', 'idle_conns', 'idle_in_tx_conns',
      'waiting_locks', 'cache_hit_table_pct', 'cache_hit_index_pct',
      'tps_commit', 'tps_rollback', 'max_query_duration_sec', 'queries_gt_30s'];
  } else if (type === 'queries') {
    rows = storage.getLatestSnapshot();
    columns = ['queryid', 'query', 'calls', 'total_time_sec', 'avg_time_sec',
      'max_time_sec', 'rows_total', 'rows_per_call', 'cache_hit_pct', 'tables_involved'];
  } else if (type === 'events') {
    rows = storage.queryEventsByRange(from + 'T00:00:00Z', to + 'T23:59:59Z');
    columns = ['time', 'level', 'msg', 'category'];
  } else {
    return res.status(400).send('Tipo no válido: el18, el316, rds, queries, events');
  }

  const header = columns.join(',');
  const csv = [header, ...rows.map(r => columns.map(c => {
    const val = r[c];
    if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val ?? '';
  }).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=lapi-${type}-${from}-${to}.csv`);
  res.send(csv);
});

// API: Acciones — catálogo
app.get('/api/actions', (req, res) => {
  res.json(listActions());
});

// API: Acciones — preview
app.post('/api/actions/:name/preview', async (req, res) => {
  if (!actionExecutor) return res.status(503).json({ ok: false, error: 'Sistema de acciones no inicializado' });
  const result = await actionExecutor.preview(req.params.name, req.body || {});
  res.json(result);
});

// API: Acciones — ejecutar (con control de roles)
app.post('/api/actions/:name/execute', async (req, res) => {
  if (!actionExecutor) return res.status(503).json({ ok: false, error: 'Sistema de acciones no inicializado' });

  const action = getAction(req.params.name);
  if (action && action.risk !== 'safe' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Se requiere rol admin para acciones moderadas/peligrosas' });
  }

  const userContext = { username: req.user.username, ip: req.ip };
  const result = await actionExecutor.execute(req.params.name, req.body || {}, userContext);

  // Broadcast audit event via SSE
  if (result.ok !== undefined) {
    broadcastEvent({
      type: 'audit',
      entry: {
        ts: new Date().toISOString(),
        action_name: req.params.name,
        risk_level: action?.risk || 'safe',
        status: result.ok ? 'ok' : 'error',
        user_name: req.user.username,
        duration_ms: result.duration_ms,
      },
    });
  }

  res.json(result);
});

// API: Auditoría
app.get('/api/audit', (req, res) => {
  const { limit, action, risk, status, from, to, user } = req.query;
  res.json(storage.getAuditLogFiltered({
    limit: parseInt(limit) || 50,
    action: action || null,
    risk: risk || null,
    status: status || null,
    from: from || null,
    to: to || null,
    user: user || null,
  }));
});

app.get('/api/audit/stats', (req, res) => {
  const { from, to } = req.query;
  const now = new Date();
  res.json(storage.getAuditStats(
    from || new Date(now - 7 * 86400000).toISOString(),
    to || now.toISOString(),
  ));
});

// API: SLA
app.get('/api/sla', (req, res) => {
  const now = new Date();
  const { from, to } = req.query;
  const sla7d = storage.calculateSLA(
    from || new Date(now - 7 * 86400000).toISOString(),
    to || now.toISOString()
  );
  const sla30d = storage.calculateSLA(
    new Date(now - 30 * 86400000).toISOString(),
    now.toISOString()
  );
  res.json({ '7d': sla7d, '30d': sla30d });
});

// API: Backup status
app.get('/api/backups/status', (req, res) => {
  const latest = storage.getLatestBackup();
  res.json(latest || { last_file: null, size_mb: 0, age_hours: -1, message: 'Sin datos de backup' });
});

// API: Heatmap
app.get('/api/heatmap', (req, res) => {
  const { metric, days } = req.query;
  res.json(storage.queryHeatmapData(metric || 'active_conns', parseInt(days) || 14));
});

// API: Anomaly baselines
app.get('/api/anomaly/baselines', (req, res) => {
  if (!anomalyDetector) return res.json({});
  res.json(anomalyDetector.baselines);
});

// API: Reportes
app.get('/api/reports', (req, res) => {
  res.json(storage.getReports(parseInt(req.query.limit) || 20));
});

app.get('/api/reports/:id', (req, res) => {
  const report = storage.getReport(parseInt(req.params.id));
  if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
  res.json(report);
});

app.get('/api/reports/:id/html', (req, res) => {
  const report = storage.getReport(parseInt(req.params.id));
  if (!report) return res.status(404).send('Reporte no encontrado');
  res.type('text/html').send(report.html);
});

app.post('/api/reports/generate', requireAdmin, async (req, res) => {
  try {
    const { ReportGenerator } = require('./lib/report-generator');
    const gen = new ReportGenerator(storage);
    const { from, to } = req.body || {};
    const report = gen.generate(from, to);
    storage.insertReport(report);
    res.json({ ok: true, health_score: report.health_score });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: Reporte para cliente (filtrado)
app.post('/api/reports/generate-client', async (req, res) => {
  try {
    const { ClientReportGenerator } = require('./lib/client-report-generator');
    const gen = new ClientReportGenerator(storage);
    const { from, to } = req.body || {};
    const report = gen.generate(from, to);
    storage.insertReport(report);
    res.json({ ok: true, health_score: report.health_score, type: 'client' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Broadcast ──
function broadcast(data) {
  const payload = `data: ${JSON.stringify({ type: 'update', data })}\n\n`;
  sseClients.forEach(client => {
    try { client.write(payload); } catch (e) {}
  });
}

function broadcastEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(payload); } catch (e) {}
  });
}

async function fetchAndBroadcast(full = false) {
  try {
    const data = await fetcher.fetchAll(full);

    if (data.el18.length) storage.insertLabsis('el18', data.el18);
    if (data.el316.length) storage.insertLabsis('el316', data.el316);
    if (data.rds.length) storage.insertRds(data.rds);

    if (eventDetector) {
      const events = eventDetector.detect(data);
      if (events.length) console.log(`[Events] ${events.length} evento(s) detectado(s)`);
    }

    if (anomalyDetector) {
      const anomalies = anomalyDetector.detect(data);
      if (anomalies.length) console.log(`[Anomaly] ${anomalies.length} anomalía(s) detectada(s)`);
    }

    broadcast(data);
    console.log(`[Fetch] el18:${data.el18.length} el316:${data.el316.length} rds:${data.rds.length} clients:${sseClients.length}`);
  } catch (err) {
    console.error('[Fetch] Error:', err.message);
  }
}

async function fetchBackupStatus() {
  try {
    const output = await fetcher.execCommand('el316', 'ls -lt /home/dynamtek/autoPGbackup/ 2>/dev/null | head -6');
    if (!output) return;
    const lines = output.trim().split('\n').filter(l => l && !l.startsWith('total'));
    if (!lines.length) return;

    // Parsear primera línea (archivo más reciente)
    // Formato: -rw-r--r-- 1 dynamtek dynamtek 2469021696 Feb 25 03:00 labsis_backup_20260225.sql.gz
    const parts = lines[0].split(/\s+/);
    if (parts.length < 9) return;
    const sizeBytes = parseInt(parts[4]) || 0;
    const sizeMb = sizeBytes / (1024 * 1024);
    const fileName = parts.slice(8).join(' ');

    // Calcular edad del archivo
    const monthStr = parts[5];
    const day = parts[6];
    const timeOrYear = parts[7];
    const months = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const now = new Date();
    let fileDate;
    if (timeOrYear.includes(':')) {
      fileDate = new Date(now.getFullYear(), months[monthStr] || 0, parseInt(day));
      const [h, m] = timeOrYear.split(':');
      fileDate.setHours(parseInt(h), parseInt(m));
    } else {
      fileDate = new Date(parseInt(timeOrYear), months[monthStr] || 0, parseInt(day));
    }
    const ageHours = (now - fileDate) / 3600000;

    const snapshot = {
      timestamp: now.toISOString(),
      last_file: fileName,
      size_mb: +sizeMb.toFixed(1),
      age_hours: +ageHours.toFixed(1),
      files_count: lines.length,
    };
    storage.insertBackupSnapshot(snapshot);

    // Detectar backup viejo
    if (eventDetector) {
      const events = [];
      const time = now.toISOString();
      if (ageHours > 48) {
        events.push({ time, level: 'crit', msg: `Sin backup en ${ageHours.toFixed(0)}h — último: ${fileName}`, category: 'backup' });
      } else if (ageHours > 24) {
        events.push({ time, level: 'warn', msg: `Backup tiene ${ageHours.toFixed(0)}h — último: ${fileName}`, category: 'backup' });
      }
      for (const ev of events) {
        storage.insertEvent(ev.time, ev.level, ev.msg, ev.category);
      }
    }

    console.log(`[Backup] Último: ${fileName} (${sizeMb.toFixed(1)} MB, hace ${ageHours.toFixed(1)}h)`);
  } catch (err) {
    console.error('[Backup] Error:', err.message);
  }
}

async function fetchQueries() {
  try {
    const queries = await fetchTopQueries();
    if (queries.length) {
      const snapshotTime = new Date().toISOString();
      storage.insertQuerySnapshot(snapshotTime, queries);
      console.log(`[Queries] ${queries.length} queries guardados`);
    }
  } catch (err) {
    console.error('[Queries] Error:', err.message);
  }
}

// Startup
app.listen(PORT, BIND_HOST, async () => {
  console.log(`\n  Dashboard LAPI corriendo en http://${BIND_HOST}:${PORT}\n`);

  storage.init();
  storage.initBackupTable();
  eventDetector = new EventDetector(storage);
  actionExecutor = new ActionExecutor(fetcher, storage);
  auth = new Auth(storage);
  await auth.seedAdmin();

  // Anomaly detector (lazy load)
  try {
    const { AnomalyDetector } = require('./lib/anomaly');
    anomalyDetector = new AnomalyDetector(storage);
    anomalyDetector.buildBaselines();
  } catch (e) {
    console.log('[Anomaly] Módulo no disponible:', e.message);
  }

  // Scheduler (lazy load)
  try {
    const { Scheduler } = require('./lib/scheduler');
    const { ReportGenerator } = require('./lib/report-generator');
    const { ClientReportGenerator } = require('./lib/client-report-generator');
    scheduler = new Scheduler();
    const reportGen = new ReportGenerator(storage);
    const clientReportGen = new ClientReportGenerator(storage);

    // Reporte interno — lunes 8:00 AM
    scheduler.scheduleWeekly(1, 8, 0, () => {
      try {
        const report = reportGen.generate();
        storage.insertReport(report);
        console.log(`[Report] Reporte interno generado. Score: ${report.health_score}/100`);
      } catch (err) {
        console.error('[Report] Error interno:', err.message);
      }
    });

    // Reporte para cliente — lunes 8:05 AM
    scheduler.scheduleWeekly(1, 8, 5, () => {
      try {
        const report = clientReportGen.generate();
        storage.insertReport(report);
        console.log(`[Report] Reporte CLIENTE generado. Score: ${report.health_score}/100`);
      } catch (err) {
        console.error('[Report] Error cliente:', err.message);
      }
    });
  } catch (e) {
    console.log('[Scheduler] Módulo no disponible:', e.message);
  }

  console.log('[Init] Descargando datos de servidores...');
  await fetchAndBroadcast(true);
  console.log('[Init] Datos cargados. Auto-refresh cada 30s.');

  fetchQueries();
  fetchBackupStatus();
  setInterval(() => fetchAndBroadcast(false), FETCH_INTERVAL);
  setInterval(() => fetchQueries(), QUERIES_INTERVAL);
  setInterval(() => fetchBackupStatus(), 1800000); // cada 30 min
});

process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Cerrando conexiones...');
  if (scheduler) scheduler.stop();
  storage.close();
  await fetcher.disconnect();
  process.exit(0);
});
