// Motor de ejecución de acciones con rate limiting y auditoría

const { execSync } = require('child_process');
const { getAction, validateParams } = require('./actions');

// Configuración PG
const PG_HOST = process.env.PG_HOST || 'labsis-lapi-db-01.cmtbpifn3sci.us-east-2.rds.amazonaws.com';
const PG_PORT = process.env.PG_PORT || '5432';
const PG_USER = process.env.PG_USER || 'labsis';
const PG_PASSWORD = process.env.PG_PASSWORD || 'labsis-lapi';
const PG_DB = process.env.PG_DB || 'labsis';
const LOCAL_MODE = process.env.LOCAL_SERVER || '';

// Gateway SSH para PG: auto-detect del primer servidor con rdsCSV, o desde env
const PG_SSH_SERVER = process.env.PG_SSH_SERVER || (() => {
  if (process.env.MONITOR_SERVERS) {
    const servers = JSON.parse(process.env.MONITOR_SERVERS);
    const rdsServer = Object.entries(servers).find(([, s]) => s.rdsCSV);
    if (rdsServer) return rdsServer[0];
    return Object.keys(servers)[0];
  }
  return 'el316';
})();

// Rate limits por nivel de riesgo (ms entre ejecuciones)
const RATE_LIMITS = {
  safe: 2000,      // 2s entre acciones seguras
  moderate: 10000,  // 10s entre acciones moderadas
  danger: 60000,    // 1 min entre acciones peligrosas
};

class ActionExecutor {
  constructor(fetcher, storage, middleAgentClient) {
    this.fetcher = fetcher;
    this.storage = storage;
    this.middleAgentClient = middleAgentClient || null;
    this.lastExecution = {};
  }

  // Preview: describe qué hará sin ejecutar
  async preview(actionName, params) {
    const action = getAction(actionName);
    if (!action) return { ok: false, error: `Acción "${actionName}" no existe` };

    const errors = validateParams(action, params);
    if (errors.length) return { ok: false, error: errors.join('. ') };

    const preview = {
      ok: true,
      action: action.name,
      label: action.label,
      description: action.description,
      risk: action.risk,
      riskDetail: action.riskDetail || null,
      target: action.target,
    };

    // Para acciones PG con previewQuery, ejecutar el preview
    if (action.target === 'pg' && action.previewQuery) {
      try {
        const result = await this._execPg(action.previewQuery(params));
        preview.previewData = result;
      } catch (err) {
        preview.previewError = err.message;
      }
    }

    // Mostrar comando que se ejecutará
    if (action.target === 'ssh') {
      preview.command = action.buildCommand(params);
      preview.server = params.server;
    } else if (action.target === 'middle-agent') {
      const req = action.buildRequest(params);
      preview.endpoint = req.path;
    } else {
      preview.query = action.buildQuery(params);
    }

    return preview;
  }

  // Execute: valida, rate-limit, ejecuta, audita
  async execute(actionName, params, userContext = {}) {
    const action = getAction(actionName);
    if (!action) return { ok: false, error: `Acción "${actionName}" no existe` };

    // Validar parámetros
    const errors = validateParams(action, params);
    if (errors.length) return { ok: false, error: errors.join('. ') };

    // Rate limiting
    const rateCheck = this._checkRateLimit(action.risk);
    if (!rateCheck.ok) return rateCheck;

    const startTime = Date.now();
    let result;

    try {
      if (action.target === 'ssh') {
        result = await this._execSsh(params.server, action.buildCommand(params));
      } else if (action.target === 'pg') {
        result = await this._execPg(action.buildQuery(params));
      } else if (action.target === 'middle-agent') {
        if (!this.middleAgentClient) throw new Error('Middle Agent no configurado (MIDDLE_AGENT_URL no definido)');
        const req = action.buildRequest(params);
        result = await this.middleAgentClient.request(req.path, req.method, req.body);
      }

      const duration = Date.now() - startTime;

      // Registrar en auditoría
      this._logAudit(action.name, params, action.risk, 'ok', result, duration, userContext);

      return {
        ok: true,
        action: action.name,
        label: action.label,
        risk: action.risk,
        output: result,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      this._logAudit(action.name, params, action.risk, 'error', err.message, duration, userContext);

      return {
        ok: false,
        action: action.name,
        error: err.message,
        duration_ms: duration,
      };
    }
  }

  _checkRateLimit(risk) {
    const limit = RATE_LIMITS[risk] || 2000;
    const last = this.lastExecution[risk] || 0;
    const elapsed = Date.now() - last;

    if (elapsed < limit) {
      const wait = Math.ceil((limit - elapsed) / 1000);
      return {
        ok: false,
        error: `Demasiado rápido. Espera ${wait}s antes de ejecutar otra acción ${risk === 'danger' ? 'peligrosa' : risk === 'moderate' ? 'moderada' : ''}.`,
        retryAfter: wait,
      };
    }

    this.lastExecution[risk] = Date.now();
    return { ok: true };
  }

  async _execSsh(serverId, command) {
    // Modo local: ejecutar directamente sin SSH
    if (LOCAL_MODE === 'all' || LOCAL_MODE === serverId) {
      return this._execLocal(command);
    }
    const output = await this.fetcher.execCommand(serverId, command);
    if (output === null) {
      throw new Error(`No se pudo conectar al servidor ${serverId}`);
    }
    return output;
  }

  _execLocal(command) {
    try {
      return execSync(command, { encoding: 'utf8', timeout: 15000 }).trim();
    } catch (err) {
      throw new Error(`Error ejecutando comando local: ${err.message}`);
    }
  }

  async _execPg(query) {
    const escapedQuery = query.replace(/'/g, "'\\''");
    const psqlCmd = `PGPASSWORD='${PG_PASSWORD}' psql -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${PG_DB} -A -F '|' -c '${escapedQuery}'`;

    let output;
    // Modo local: ejecutar psql directamente
    if (LOCAL_MODE === 'all') {
      output = this._execLocal(psqlCmd);
    } else {
      output = await this.fetcher.execCommand(PG_SSH_SERVER, psqlCmd);
      if (output === null) {
        throw new Error(`No se pudo conectar al servidor ${PG_SSH_SERVER} para ejecutar query en BD`);
      }
    }
    return this._parsePsqlOutput(output);
  }

  // Parsear output de psql -A -F '|' (con headers) a array de objetos
  _parsePsqlOutput(output) {
    const lines = output.split('\n').filter(l => l.trim());
    // Filtrar el conteo final "(N rows)" / "(N filas)"
    const dataLines = lines.filter(l => !l.match(/^\(\d+ (rows?|filas?)\)$/));

    if (dataLines.length < 2) return []; // necesitamos al menos header + 1 fila

    // Primera línea = nombres de columna
    const headers = dataLines[0].split('|');
    const rows = dataLines.slice(1);

    return rows.map(line => {
      const values = line.split('|');
      const obj = {};
      headers.forEach((col, i) => { obj[col.trim()] = (values[i] || '').trim(); });
      return obj;
    });
  }

  _logAudit(actionName, params, risk, status, output, duration, userContext = {}) {
    try {
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
      const truncated = outputStr.length > 5000 ? outputStr.slice(0, 5000) + '...' : outputStr;
      this.storage.logAction({
        action_name: actionName,
        params_json: JSON.stringify(params),
        risk_level: risk,
        status,
        output: truncated,
        duration_ms: duration,
        user_name: userContext.username || 'system',
        user_ip: userContext.ip || '',
      });
    } catch (err) {
      console.error('[Audit] Error registrando auditoría:', err.message);
    }
  }
}

module.exports = { ActionExecutor };
