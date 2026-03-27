// Detección automática de eventos — compara estado actual vs anterior

// Servidores configurados
const CONFIGURED_SERVERS = process.env.MONITOR_SERVERS
  ? Object.keys(JSON.parse(process.env.MONITOR_SERVERS))
  : ['el18', 'el316'];

const SERVERS_CONFIG = process.env.MONITOR_SERVERS
  ? JSON.parse(process.env.MONITOR_SERVERS)
  : { el18: { name: 'El 18' }, el316: { name: 'El 3' } };

class EventDetector {
  constructor(storage) {
    this.storage = storage;
    this.prevState = {};
  }

  // Helper: obtener última fila de un servidor
  _lastRow(data, serverId) {
    const arr = data[serverId];
    return arr && arr.length ? arr[arr.length - 1] : null;
  }

  // Helper: nombre display de un servidor
  _serverName(serverId) {
    return (SERVERS_CONFIG[serverId] && SERVERS_CONFIG[serverId].name) || serverId;
  }

  // Analiza los datos y genera eventos si hay cambios significativos
  detect(data) {
    const events = [];
    const now = new Date().toISOString();
    const rds = data.rds && data.rds.length ? data.rds[data.rds.length - 1] : null;

    // CPU spikes — todos los servidores configurados
    for (const id of CONFIGURED_SERVERS) {
      const row = this._lastRow(data, id);
      if (!row) continue;
      const name = this._serverName(id);
      const cpuUsed = 100 - (row.cpu_idle || 100);
      const prevCpu = this.prevState[`cpu_${id}`] || 0;

      if (cpuUsed > 85 && prevCpu <= 85) {
        events.push({ time: now, level: 'crit', msg: `CPU ${name} subió a ${cpuUsed.toFixed(0)}% (crítico)`, category: 'cpu' });
      } else if (cpuUsed <= 70 && prevCpu > 85) {
        events.push({ time: now, level: 'ok', msg: `CPU ${name} normalizado (de ${prevCpu.toFixed(0)}% a ${cpuUsed.toFixed(0)}%)`, category: 'cpu' });
      } else if (cpuUsed > 70 && prevCpu <= 70) {
        events.push({ time: now, level: 'warn', msg: `CPU ${name} en carga alta: ${cpuUsed.toFixed(0)}%`, category: 'cpu' });
      }
      this.prevState[`cpu_${id}`] = cpuUsed;

      // Steal
      const steal = row.cpu_steal || 0;
      const prevSteal = this.prevState[`steal_${id}`] || 0;
      if (steal > 30 && prevSteal <= 30) {
        events.push({ time: now, level: 'crit', msg: `CPU Steal ${name} en ${steal.toFixed(1)}% — hipervisor quita recursos`, category: 'cpu' });
      }
      this.prevState[`steal_${id}`] = steal;
    }

    // Memoria — todos los servidores configurados
    for (const id of CONFIGURED_SERVERS) {
      const row = this._lastRow(data, id);
      if (!row) continue;
      const name = this._serverName(id);
      const pct = row.mem_used_mb / row.mem_total_mb * 100;
      const prev = this.prevState[`mem_${id}`] || 0;

      if (pct > 92 && prev <= 92) {
        events.push({ time: now, level: 'crit', msg: `Memoria ${name} al ${pct.toFixed(0)}% — solo ${(row.mem_free_mb/1024).toFixed(1)} GB libres`, category: 'memory' });
      } else if (pct <= 85 && prev > 92) {
        events.push({ time: now, level: 'ok', msg: `Memoria ${name} normalizada (${pct.toFixed(0)}%)`, category: 'memory' });
      }
      this.prevState[`mem_${id}`] = pct;
    }

    // BD — Transacciones zombie
    if (rds) {
      const idleTx = rds.idle_in_tx_conns || 0;
      const prevIdleTx = this.prevState.idle_tx || 0;
      const maxDur = rds.max_query_duration_sec || 0;

      if (idleTx > 0 && prevIdleTx === 0) {
        events.push({ time: now, level: 'warn', msg: `${idleTx} transacción zombie detectada en BD`, category: 'database' });
      }
      if (maxDur >= 3600 && (this.prevState.max_dur || 0) < 3600) {
        const hrs = (maxDur / 3600).toFixed(1);
        events.push({ time: now, level: 'crit', msg: `Transacción zombie lleva ${hrs} horas atorada — necesita ser terminada`, category: 'database' });
      }
      if (idleTx === 0 && prevIdleTx > 0) {
        events.push({ time: now, level: 'ok', msg: 'Transacciones zombie resueltas — BD limpia', category: 'database' });
      }
      this.prevState.idle_tx = idleTx;
      this.prevState.max_dur = maxDur;

      // Locks
      const locks = rds.waiting_locks || 0;
      const prevLocks = this.prevState.locks || 0;
      if (locks >= 5 && prevLocks < 5) {
        events.push({ time: now, level: 'crit', msg: `${locks} operaciones bloqueadas en BD — usuarios esperando`, category: 'database' });
      } else if (locks >= 1 && prevLocks === 0) {
        events.push({ time: now, level: 'warn', msg: `${locks} operación bloqueada en BD`, category: 'database' });
      } else if (locks === 0 && prevLocks >= 1) {
        events.push({ time: now, level: 'ok', msg: 'Bloqueos de BD resueltos', category: 'database' });
      }
      this.prevState.locks = locks;

      // Cache hit
      const cacheHit = rds.cache_hit_table_pct || 100;
      const prevCache = this.prevState.cache_hit || 100;
      if (cacheHit < 95 && prevCache >= 95) {
        events.push({ time: now, level: 'crit', msg: `Cache hit bajó a ${cacheHit.toFixed(1)}% — BD muy lenta`, category: 'database' });
      } else if (cacheHit < 99 && prevCache >= 99) {
        events.push({ time: now, level: 'warn', msg: `Cache hit bajó a ${cacheHit.toFixed(1)}% (debería ser >99%)`, category: 'database' });
      } else if (cacheHit >= 99 && prevCache < 99) {
        events.push({ time: now, level: 'ok', msg: `Cache hit recuperado: ${cacheHit.toFixed(1)}%`, category: 'database' });
      }
      this.prevState.cache_hit = cacheHit;

      // Conexiones
      const conns = rds.total_connections || 0;
      const prevConns = this.prevState.conns || 0;
      if (conns > 200 && prevConns <= 200) {
        events.push({ time: now, level: 'crit', msg: `${conns} conexiones a BD — peligro de saturación`, category: 'database' });
      } else if (conns > 100 && prevConns <= 100) {
        events.push({ time: now, level: 'warn', msg: `Conexiones BD subieron a ${conns}`, category: 'database' });
      }
      this.prevState.conns = conns;

      // Queries lentas
      const slow = rds.queries_gt_30s || 0;
      const prevSlow = this.prevState.slow || 0;
      if (slow > 0 && prevSlow === 0) {
        events.push({ time: now, level: 'warn', msg: `${slow} queries >30s detectados`, category: 'database' });
      } else if (slow === 0 && prevSlow > 0) {
        events.push({ time: now, level: 'ok', msg: 'Queries lentos resueltos', category: 'database' });
      }
      this.prevState.slow = slow;

      // Deadlocks
      const deadlocks = rds.deadlocks_delta || 0;
      const prevDeadlocks = this.prevState.deadlocks || 0;
      if (deadlocks > 0 && deadlocks !== prevDeadlocks) {
        events.push({ time: now, level: 'crit', msg: `${deadlocks} deadlock(s) detectados — conflicto de transacciones`, category: 'database' });
        this.prevState.deadlocks = deadlocks;
      }
    }

    // Disco — todos los servidores configurados
    for (const id of CONFIGURED_SERVERS) {
      const row = this._lastRow(data, id);
      if (!row) continue;
      const name = this._serverName(id);
      const pct = row.disk_root_pct || 0;
      const prev = this.prevState[`disk_${id}`] || 0;
      if (pct >= 85 && prev < 85) {
        events.push({ time: now, level: 'crit', msg: `Disco ${name} al ${pct}% — ¡zona de peligro!`, category: 'disk' });
      } else if (pct >= 75 && prev < 75) {
        events.push({ time: now, level: 'warn', msg: `Disco ${name} al ${pct}% — poco espacio`, category: 'disk' });
      }
      this.prevState[`disk_${id}`] = pct;
    }

    // ─── Session anomaly detection ───
    if (data.sessions && data.sessions._totals) {
      const { browsers, equipment } = data.sessions._totals;
      const hour = new Date().getHours();
      const day = new Date().getDay(); // 0=Sunday
      const isPeak = hour >= 7 && hour <= 18 && day >= 1 && day <= 5;
      const prevUsers = this.prevState.session_users || 0;

      // Zero users during peak = critical (possible outage)
      if (isPeak && browsers === 0 && prevUsers > 0) {
        events.push({ time: now, level: 'crit',
          msg: `LABSIS sin usuarios conectados en hora pico (${hour}:00) — posible caída de servicio`,
          category: 'sessions' });
      }

      // Sudden drop > 50% users
      if (prevUsers > 5 && browsers < prevUsers * 0.5) {
        events.push({ time: now, level: 'warn',
          msg: `Usuarios cayeron de ${prevUsers} a ${browsers} — verificar JBoss`,
          category: 'sessions' });
      }

      // No equipment during peak
      if (isPeak && equipment === 0 && (this.prevState.session_equipment || 0) > 0) {
        events.push({ time: now, level: 'warn',
          msg: `Sin equipos analíticos conectados en hora pico`,
          category: 'sessions' });
      }

      this.prevState.session_users = browsers;
      this.prevState.session_equipment = equipment;
    }

    // Guardar eventos en SQLite
    for (const ev of events) {
      this.storage.insertEvent(ev.time, ev.level, ev.msg, ev.category);
    }

    return events;
  }
}

module.exports = { EventDetector };
