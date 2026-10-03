const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQueues, createFlowEvaluator } = require('../lib/interface-flow');

const MIN = 60000;
const T0 = Date.parse('2026-10-02T14:26:00-06:00');

function row(over = {}) {
  return {
    equipo: 167, tipo: 'Checkin', pend: 0, first_pend_id: null, oldest_pend_s: 0,
    sent: 1000, max_id: 850000, orphans: 0, ...over,
  };
}

function newEval() {
  return createFlowEvaluator({ queues: [{ equipoId: 167, tipo: 'Checkin' }] });
}

test('parseQueues: default and custom', () => {
  assert.deepEqual(parseQueues(undefined), [{ equipoId: 167, tipo: 'Checkin' }]);
  assert.deepEqual(parseQueues(''), [{ equipoId: 167, tipo: 'Checkin' }]);
  assert.deepEqual(parseQueues('166:Checkin, 167:Abort'), [
    { equipoId: 166, tipo: 'Checkin' },
    { equipoId: 167, tipo: 'Abort' },
  ]);
});

test('healthy day produces no events', () => {
  const ev = newEval();
  let all = [];
  for (let i = 0; i < 120; i++) {
    // rows flow: a few pending with a moving head, sent grows, oldest age in seconds
    const r = row({ pend: i % 3, first_pend_id: i % 3 ? 850000 + i : null, oldest_pend_s: i % 3 ? 4 : 0, sent: 1000 + i, max_id: 850000 + i });
    const out = ev.evaluate([r], T0 + i * MIN);
    all = all.concat(out.events);
    assert.equal(out.queues[0].level, 'ok');
  }
  assert.equal(all.length, 0);
});

test('replay 2026-10-02: crit within 11 min, then single recovery event', () => {
  const ev = newEval();
  const events = [];
  let firstCritAt = null;
  for (let i = 0; i <= 11; i++) {
    const now = T0 + i * MIN;
    const out = ev.evaluate([row({
      pend: 5 * (i + 1), first_pend_id: 848483, oldest_pend_s: i * 60,
      sent: 1000, max_id: 848483 + 5 * (i + 1),
    })], now);
    for (const e of out.events) {
      events.push(e);
      if (e.level === 'crit' && firstCritAt === null) firstCritAt = i;
    }
  }
  assert.ok(firstCritAt !== null && firstCritAt <= 11, `crit at minute ${firstCritAt}`);
  assert.equal(firstCritAt, 10);
  const stalled = events.find(e => e.msg.includes('detenida'));
  assert.ok(stalled);
  assert.match(stalled.msg, /Cola AlphaWeb Checkin detenida: 55 pendientes, sin envíos hace 10 min \(primer pendiente id 848483\)/);
  assert.equal(stalled.category, 'interfaces');

  const rec = ev.evaluate([row({ pend: 0, sent: 1200, max_id: 848600 })], T0 + 12 * MIN);
  assert.equal(rec.events.length, 1);
  assert.equal(rec.events[0].level, 'ok');
  assert.equal(rec.queues[0].level, 'ok');

  const again = ev.evaluate([row({ pend: 0, sent: 1201, max_id: 848601 })], T0 + 13 * MIN);
  assert.equal(again.events.length, 0);
});

test('mass reset: pending 0 -> 3189 with max_id +10 is crit reset', () => {
  const ev = newEval();
  ev.evaluate([row({ pend: 0, max_id: 850000 })], T0);
  const out = ev.evaluate([row({ pend: 3189, first_pend_id: 800000, oldest_pend_s: 30, max_id: 850010 })], T0 + MIN);
  assert.equal(out.queues[0].level, 'crit');
  assert.ok(out.queues[0].reasons.includes('reset'));
  assert.ok(out.events.some(e => e.level === 'crit' && /salto masivo/.test(e.msg)));
});

test('orphans > 0 is warn', () => {
  const ev = newEval();
  const out = ev.evaluate([row({ pend: 2, first_pend_id: 850001, oldest_pend_s: 3, orphans: 2 })], T0);
  assert.equal(out.queues[0].level, 'warn');
  assert.deepEqual(out.queues[0].reasons, ['orphans']);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].level, 'warn');
});

test('no duplicate events across repeated crit cycles', () => {
  const ev = newEval();
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const out = ev.evaluate([row({ pend: 20, first_pend_id: 848483, oldest_pend_s: 900 + i * 60, sent: 1000 })], T0 + i * MIN);
    total += out.events.length;
  }
  // oldest fires on cycle 0; stalled fires once at 10 min; nothing else
  assert.equal(total, 2);
});

test('string numerics from pg are coerced', () => {
  const ev = newEval();
  const out = ev.evaluate([{
    equipo: '167', tipo: 'Checkin', pend: '60', first_pend_id: '850001',
    oldest_pend_s: '700', sent: '5', max_id: '850100', orphans: '0',
  }], T0);
  const s = out.queues[0];
  assert.equal(s.pending, 60);
  assert.equal(s.oldestPendingSec, 700);
  assert.equal(s.firstPendingId, 850001);
  assert.equal(s.level, 'crit');
});

test('sent counter drop (sliding window) is not progress but resets baseline', () => {
  const ev = newEval();
  ev.evaluate([row({ pend: 5, first_pend_id: 848483, sent: 1000 })], T0);
  const drop = ev.evaluate([row({ pend: 5, first_pend_id: 848483, sent: 990 })], T0 + 5 * MIN);
  assert.equal(drop.queues[0].stalledSec, 300);
  const up = ev.evaluate([row({ pend: 5, first_pend_id: 848483, sent: 991 })], T0 + 6 * MIN);
  assert.equal(up.queues[0].stalledSec, 0);
});

test('missing queue in rows is healthy', () => {
  const ev = newEval();
  const out = ev.evaluate([], T0);
  assert.equal(out.queues[0].pending, 0);
  assert.equal(out.queues[0].level, 'ok');
  assert.equal(out.events.length, 0);
});
