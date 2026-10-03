// Notificación activa de eventos críticos vía Telegram.
//
// Diseño: el monitor genera ~480 warn y ~15 crit por día. Notificar todo hace que
// nadie lea nada, así que aquí solo salen los 'crit' de servidores de producción,
// agrupados por ciclo y con antirrebote por tipo de evento.
//
// Configuración por variables de entorno (el token NUNCA va en el código):
//   LAPI_TG_TOKEN    token del bot de alertas LAPI (obligatorio; sin él, no notifica)
//   LAPI_TG_CHAT     chat o grupo destino (obligatorio)
//   LAPI_ALERT_MUTE  nombres de servidor que no deben alertar (default "QA")
//   LAPI_ALERT_COOLDOWN_MIN  minutos de silencio para un mismo tipo de evento (default 30)

const TOKEN = process.env.LAPI_TG_TOKEN || '';
const CHAT = process.env.LAPI_TG_CHAT || '';
const MUTED = (process.env.LAPI_ALERT_MUTE || 'QA').split(',').map(s => s.trim()).filter(Boolean);
const COOLDOWN_MS = (Number(process.env.LAPI_ALERT_COOLDOWN_MIN) || 30) * 60 * 1000;

const ICON = { crit: '\u{1F534}', ok: '\u{1F7E2}' };

class Notifier {
  constructor() {
    this.enabled = Boolean(TOKEN && CHAT);
    this.lastSent = new Map();   // clave de evento -> timestamp del último envío
    this.pendientes = new Set(); // claves que alertaron y siguen sin resolverse
    if (!this.enabled) {
      console.log('[notifier] sin LAPI_TG_TOKEN/LAPI_TG_CHAT — alertas desactivadas');
    }
  }

  // Los mensajes traen cifras variables ("9 operaciones bloqueadas", "10 operaciones
  // bloqueadas"). Sin normalizar, cada variación cuenta como evento distinto y el
  // antirrebote no sirve de nada.
  _clave(ev) {
    return ev.category + '|' + String(ev.msg).replace(/[\d.,]+/g, '#');
  }

  _silenciado(ev) {
    return MUTED.some(n => n && String(ev.msg).includes(n));
  }

  // Procesa el lote de eventos de un ciclo del monitor.
  notify(events) {
    if (!this.enabled || !Array.isArray(events) || !events.length) return;

    const ahora = Date.now();
    const alertas = [];
    const resueltos = [];

    for (const ev of events) {
      if (this._silenciado(ev)) continue;
      const clave = this._clave(ev);

      if (ev.level === 'crit') {
        const previo = this.lastSent.get(clave) || 0;
        if (ahora - previo < COOLDOWN_MS) continue; // ya avisamos hace poco
        this.lastSent.set(clave, ahora);
        this.pendientes.add(clave);
        alertas.push(ev);
      } else if (ev.level === 'ok') {
        // Solo confirmamos la recuperación de algo que efectivamente alertamos.
        const abierto = [...this.pendientes].find(k => k.split('|')[0] === ev.category);
        if (abierto) {
          this.pendientes.delete(abierto);
          this.lastSent.delete(abierto);
          resueltos.push(ev);
        }
      }
    }

    if (alertas.length) this._enviar(this._texto(ICON.crit, 'CRÍTICO en LAPI', alertas));
    if (resueltos.length) this._enviar(this._texto(ICON.ok, 'Resuelto', resueltos));
  }

  _texto(icono, titulo, evs) {
    const hora = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour12: false });
    const lineas = evs.map(e => '• ' + e.msg);
    return `${icono} ${titulo} — ${hora}\n\n${lineas.join('\n')}`;
  }

  // Un fallo de red jamás debe tumbar el ciclo del monitor.
  async _enviar(text) {
    try {
      const ctrl = new AbortController();
      const corte = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
        signal: ctrl.signal
      });
      clearTimeout(corte);
      if (!res.ok) console.error('[notifier] Telegram respondió', res.status);
    } catch (err) {
      console.error('[notifier] no se pudo enviar:', err.message);
    }
  }
}

module.exports = { Notifier };
