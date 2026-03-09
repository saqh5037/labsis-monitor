// Motor de ejecución de acciones con rate limiting y auditoría

const { getAction, validateParams } = require('./actions');

// Configuración PG para ejecutar vía SSH tunnel (psql en El 316)
const PG_HOST = process.env.PG_HOST || 'labsis-lapi-db-01.cmtbpifn3sci.us-east-2.rds.amazonaws.com';
const PG_USER = process.env.PG_USER || 'labsis';
const PG_PASSWORD = process.env.PG_PASSWORD || 'labsis-lapi';
const PG_DB = process.env.PG_DB || 'labsis';
const PG_SSH_SERVER = 'el316'; // El 316 tiene acceso directo al RDS

// Rate limits por nivel de riesgo (ms entre ejecuciones)
const RATE_LIMITS = {
  safe: 2000,      // 2s entre acciones seguras
  moderate: 10000,  // 10s entre acciones moderadas
  danger: 60000,    // 1 min entre acciones peligrosas
};

class ActionExecutor {
  constructor(fetcher, storage) {
    this.fetcher = fetcher;
    this.storage = storage;
    this.lastExecution = {}; // { risk_level: timestamp }
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
    const output = await this.fetcher.execCommand(serverId, command);
    if (output === null) {
      throw new Error(`No se pudo conectar al servidor ${serverId}`);
    }
    return output;
  }

  async _execPg(query) {
    // Ejecutar SQL vía SSH a El 316 usando psql (el RDS no es accesible directamente)
    const escapedQuery = query.replace(/'/g, "'\\''");
    // -A = unaligned, -F '|' = pipe separator, SIN -t para que incluya headers
    const psqlCmd = `PGPASSWORD='${PG_PASSWORD}' psql -h ${PG_HOST} -U ${PG_USER} -d ${PG_DB} -A -F '|' -c '${escapedQuery}'`;
    const output = await this.fetcher.execCommand(PG_SSH_SERVER, psqlCmd);
    if (output === null) {
      throw new Error('No se pudo conectar al servidor El 316 para ejecutar query en BD');
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
