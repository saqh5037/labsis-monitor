// Pure evaluator for HL7 interface queue flow (no I/O).
//
// Input rows come from pg-queries.fetchInterfaceFlow(), one per equipo+tipo.
// The evaluator keeps per-queue state between cycles and emits events only on
// transitions, so a queue that stays critical does not spam every minute.

const DEFAULTS = {
  stalledSec: 600,        // crit: pending > 0, no sent progress, same first pending id
  oldestSec: 600,         // crit: oldest pending row age
  resetDelta: 200,        // crit: pending jump in one cycle...
  resetMaxIdGrowth: 50,   // ...while max id grows less than this
  backlogPending: 50,     // warn: pending above this
  names: { 167: 'AlphaWeb Checkin' },
};

const CRIT_REASONS = new Set(['stalled', 'oldest', 'reset']);

function parseQueues(str) {
  const raw = str === undefined || str === null || str === '' ? '167:Checkin' : String(str);
  const out = [];
  for (const part of raw.split(',')) {
    const [id, tipo] = part.split(':').map(s => s.trim());
    const equipoId = Number(id);
    if (!Number.isFinite(equipoId) || !tipo) continue;
    out.push({ equipoId, tipo });
  }
  return out;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function createFlowEvaluator(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts, names: { ...DEFAULTS.names, ...(opts.names || {}) } };
  const queues = opts.queues || parseQueues(process.env.INTERFACE_FLOW_QUEUES);
  const state = new Map(); // "equipo|tipo" -> per-queue state

  function label(q) {
    return cfg.names[q.equipoId] || `equipo ${q.equipoId} ${q.tipo}`;
  }

  function message(reason, q, s) {
    const l = label(q);
    switch (reason) {
      case 'stalled':
        return `Cola ${l} detenida: ${s.pending} pendientes, sin envíos hace ${Math.floor(s.stalledSec / 60)} min (primer pendiente id ${s.firstPendingId})`;
      case 'oldest':
        return `Cola ${l} con pendiente de ${Math.floor(s.oldestPendingSec / 60)} min de antigüedad (${s.pending} pendientes, primer pendiente id ${s.firstPendingId})`;
      case 'reset':
        return `Cola ${l}: salto masivo de pendientes a ${s.pending} sin registros nuevos (posible reinicio de envíos)`;
      case 'backlog':
        return `Cola ${l} con acumulación: ${s.pending} pendientes`;
      case 'orphans':
        return `Cola ${l}: ${s.orphans} pendientes apuntan a una muestra inexistente`;
      default:
        return `Cola ${l}: ${reason}`;
    }
  }

  function evaluate(rows, nowMs = Date.now()) {
    const byKey = new Map();
    for (const r of rows || []) byKey.set(`${num(r.equipo)}|${r.tipo}`, r);

    const statuses = [];
    const events = [];
    const time = new Date(nowMs).toISOString();

    for (const q of queues) {
      const key = `${q.equipoId}|${q.tipo}`;
      const row = byKey.get(key);
      let st = state.get(key);
      const first = !st;
      if (first) {
        st = {
          level: 'ok', reasons: new Set(), lastProgressAt: nowMs,
          prevMaxSent: null, prevFirstId: null, prevPending: 0, prevMaxId: null, resetActive: false,
        };
        state.set(key, st);
      }

      const pending = row ? num(row.pend) : 0;
      const firstPendingId = row && row.first_pend_id !== null && row.first_pend_id !== undefined ? num(row.first_pend_id) : null;
      const oldestPendingSec = row ? num(row.oldest_pend_s) : 0;
      const sent = row ? num(row.sent) : 0;
      const maxSent = row
        ? (row.max_sent_id === null || row.max_sent_id === undefined ? null : num(row.max_sent_id))
        : st.prevMaxSent;
      const maxId = row ? num(row.max_id) : (st.prevMaxId === null ? 0 : st.prevMaxId);
      const orphans = row ? num(row.orphans) : 0;

      // Progress: highest sent id increased, queue head moved, or nothing pending.
      // The sent COUNT is useless for this (fixed-size id window stays flat in steady
      // state). Null or decrease of max_sent_id is "unknown": no progress, new baseline.
      let progressed = pending === 0 || first;
      if (st.prevMaxSent !== null && maxSent !== null && maxSent > st.prevMaxSent) progressed = true;
      if (st.prevFirstId !== null && firstPendingId !== st.prevFirstId) progressed = true;
      if (progressed) st.lastProgressAt = nowMs;

      const stalledSec = pending > 0 ? Math.max(0, Math.floor((nowMs - st.lastProgressAt) / 1000)) : 0;

      const jumped = !first
        && pending - st.prevPending >= cfg.resetDelta
        && (st.prevMaxId === null || maxId - st.prevMaxId < cfg.resetMaxIdGrowth);
      if (jumped) st.resetActive = true;
      if (st.resetActive && pending <= cfg.backlogPending) st.resetActive = false;

      const reasons = [];
      if (pending > 0 && stalledSec >= cfg.stalledSec) reasons.push('stalled');
      if (oldestPendingSec >= cfg.oldestSec) reasons.push('oldest');
      if (st.resetActive) reasons.push('reset');
      if (pending > cfg.backlogPending) reasons.push('backlog');
      if (orphans > 0) reasons.push('orphans');

      const level = reasons.some(r => CRIT_REASONS.has(r)) ? 'crit' : reasons.length ? 'warn' : 'ok';

      const status = {
        equipoId: q.equipoId,
        tipo: q.tipo,
        name: label(q),
        pending,
        oldestPendingSec,
        firstPendingId,
        orphans,
        sentInWindow: sent,
        stalledSec,
        level,
        reasons,
        lastProgressAt: new Date(st.lastProgressAt).toISOString(),
      };

      for (const reason of reasons) {
        if (!st.reasons.has(reason)) {
          events.push({
            time,
            level: CRIT_REASONS.has(reason) ? 'crit' : 'warn',
            msg: message(reason, q, status),
            category: 'interfaces',
          });
        }
      }
      if (level === 'ok' && st.level !== 'ok') {
        events.push({
          time,
          level: 'ok',
          msg: `Cola ${label(q)} recuperada: flujo normal, ${pending} pendientes`,
          category: 'interfaces',
        });
      }

      st.level = level;
      st.reasons = new Set(reasons);
      st.prevMaxSent = maxSent;
      st.prevFirstId = firstPendingId;
      st.prevPending = pending;
      st.prevMaxId = maxId;
      statuses.push(status);
    }

    return { queues: statuses, events };
  }

  return { evaluate, queues };
}

module.exports = { parseQueues, createFlowEvaluator, DEFAULTS };
