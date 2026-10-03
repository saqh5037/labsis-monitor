# Feature: interface flow health (LAPI)

## Objective
Detect stalled HL7 interface queues in Labsis before the client does, by measuring
queue FLOW (not only process liveness) in the existing interfaces panel.

## Problem / why
On 2026-10-02 the LapiAlphaweb Checkin queue (`lista_trabajo_automatizada_orden_trabajo`,
`equipo_sistema_id=167`) stopped from ~14:26 to ~19:27. The interfaces panel showed the
Windows executor alive the whole time (process liveness via middle-agent), so nothing alerted;
Alphalab reported it ~3 h late. Incident report:
`DevOps-2/DevOpsLapi/incidente-alpha-checkin-20261002.md`. Engram:
`bug.lapi.checkin-alpha-cola-atorada-2026-10-02`.

## Scope (authorized 2026-10-03)
- Read-only DB flow check, evaluator, events/alerts, UI in the existing interfaces panel.
- NOT included: deploy to el18, middle-agent changes on the Windows PC, Labsis code, DB writes.

## Constraints / evidence
- Table has ONLY the PK index on `id` (850k rows, 189 MB). Never filter by `fecha_creacion`;
  window by `id > max(id) - N` (N=20000 ≈ 5-6 days). EXPLAIN ANALYZE: 43 ms, index scan.
- `fecha_creacion` is `timestamp without time zone`, DB session tz -06.
- 14-day mix: 167/Checkin/Muestra = 44,120 (all sent); 166 and 167 also carry `Abort`
  (~110/day each, entidad null, chronically pending = noise); `CalcularMuestra` equipo null.
  Monitored queues by default: `167:Checkin`.
- Monitor connects with the app user `labsis` and has no read-only guard → the new query must
  run inside `BEGIN READ ONLY` / `SET default_transaction_read_only=on` + `statement_timeout`.
- Telegram notifier exists (synced from el18 in T0) but is INACTIVE: no `LAPI_TG_TOKEN/LAPI_TG_CHAT`
  since 2026-09-03. Human blocker: Samuel must create the bot.

## TDD
Mode: off (no project/session TDD config; no test runner existed). Ordinary checks: pure
evaluator covered with `node --test` (no new deps), `node --check`, local smoke run.

## Tasks
- [x] T0 Sync prod-only `lib/notifier.js` + `lib/events.js` hook into repo. Route: inline.
      Evidence: commit 1970104; md5 diff vs el18 showed only these 2 files differed.
- [x] T1 `lib/interface-flow.js`: pure evaluator (state per queue: pending, oldest age,
      first pending id, sent counter progress, orphans, reset detection) + `node --test` suite,
      incl. a replay of the 2026-10-02 sequence. Route: delegated writer (2+ non-trivial files).
      Evidence: commit 7cf19a6; `npm test`: 9 tests, 9 pass, 0 fail (replay raises crit at minute 10).
      Note: script is `node --test` (no `test/` arg) because Node 22 treats `test/` as a module path.
- [x] T2 `fetchInterfaceFlow()` in `lib/pg-queries.js` (read-only txn, statement_timeout,
      id window) + wiring in `server.js` (own 60 s interval, no-overlap guard, env gate
      `INTERFACE_FLOW_CHECK`, events via storage + notifier, `/api/interfaces/flow`) +
      `ecosystem.config.js` env. Route: same delegated writer as T1.
      Evidence: commit 24e38aa; `node --check` ok on server.js, pg-queries.js, storage.js,
      interface-flow.js, ecosystem.config.js; `npm test` 9/9 pass; require smoke ok.
      Notifier: reuses `eventDetector.notifier` (single cooldown state). No DB/SSH touched (T4 pending).
      Fix: progress measured by `max_sent_id` (highest sent id), not the windowed `sent` count
      (flat in steady state); `sent` kept for display only.
- [x] T3 UI: flow status per queue in the existing interfaces panel ("vivo y procesando").
      Route: delegated UI writer (serial), then `/visual-iterate`.
      Evidence: commits 9a53551 + db988e3. `/visual-iterate` 360/768/1280 light + 1280 dark, ok and
      mocked crit states: no overflow, no text < 11px in the flow UI; fixes applied (crit/warn tint,
      pill 10→11px, double period). Detail lives in Operaciones → pestaña Interfaces.
      Known gap: the inline flow pill on the SendCheckIn gauge only renders when the middle-agent
      is connected (not verifiable locally).
      `node --check` ok; `npm test` 11/11 pass. Files: public/js/interfaces-panel.js, public/css/dashboard.css.
- [x] T4 Local smoke run against prod DB via tunnel (read-only) + report.
      Evidence: local server with INTERFACE_FLOW_CHECK=true, MONITOR_SERVERS=[] (no server SSH);
      log `[InterfaceFlow] 167/Checkin:ok pend=0` on every cycle, no events; browser console clean
      except pre-existing favicon 404. Query cost: 43 ms (EXPLAIN ANALYZE, PK index scan).

## Thresholds (initial, per monitored queue)
- crit `stalled`: pending > 0 and no sent progress and same first pending id for ≥ 10 min.
- crit `oldest`: oldest pending age ≥ 10 min (normal latency is seconds).
- crit `reset`: pending jumps ≥ 200 in one cycle while max id grows < 50 (mass `enviado=false`).
- warn `backlog`: pending > 50.  warn `orphans`: pending rows pointing to a missing `muestra`.
- `ok` event when a queue that alerted recovers.

## Acceptance criteria
- Replay of 2026-10-02 raises crit by 14:37 (≤ 11 min after the first stuck row).
- Normal day (pending flows within seconds) raises nothing.
- Check is off unless `INTERFACE_FLOW_CHECK=true`; query failure degrades, never crashes.

## Progress / next step
All tasks done. PR: https://github.com/saqh5037/labsis-monitor/pull/1
Deployed to el18 on 2026-10-03 14:03 (approved by Samuel):
- Backup: /home/dynamtek/backups/lapi-dashboard_20261003_pre-flow.tgz (code only, 641 entries).
- 8 files copied via scp; md5 verified against branch; `node --check` ok on server.
- `pm2 delete lapi-dashboard && pm2 start ecosystem.config.js --only lapi-dashboard && pm2 save`
  (pm2-restart-guard forbids `restart` for env changes). Online, 0 restarts, 95 MB, FLOW=true.
- Logs: `[InterfaceFlow] 167/Checkin:ok pend=0` each minute; HTTP 302 (login) on :3090.
- Rollback: extract the backup over /home/dynamtek/lapi-dashboard, then delete/start/save.
Open debt found: `[Local] Error leyendo /tmp/labsis-monitor-ip-172-32-2-250.csv` since
2026-09-10 (65,740 lines, pre-existing); `max_memory_restart: 150M` vs ~150 MB steady usage;
Telegram bot still missing (alerts UI-only).
