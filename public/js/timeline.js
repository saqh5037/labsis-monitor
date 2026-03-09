// Timeline de Eventos — log visual cronológico

async function fetchAndRenderTimeline() {
  try {
    const res = await authFetch('api/events?limit=100');
    const events = await res.json();
    renderTimeline(events);
  } catch (e) {
    console.error('Error fetching events:', e);
  }
}

function renderTimeline(events) {
  // Renderizar en panel de salud
  const healthTl = document.getElementById('health-timeline');
  if (healthTl) {
    healthTl.innerHTML = renderTimelineHTML(events.slice(0, 20), true);
  }

  // Renderizar en tab infraestructura
  const infraTl = document.getElementById('infra-timeline');
  if (infraTl) {
    infraTl.innerHTML = renderTimelineHTML(events, false);
  }
}

function renderTimelineHTML(events, compact) {
  if (!events || !events.length) {
    return '<div class="tl-empty">Sin eventos registrados aún. Los eventos se generan automáticamente al detectar cambios.</div>';
  }

  const icons = { ok: '✅', warn: '⚠️', crit: '🔺', info: 'ℹ️' };
  const colors = { ok: getCSSVar('--green') || '#10b981', warn: getCSSVar('--yellow') || '#f59e0b', crit: getCSSVar('--red') || '#ef4444', info: getCSSVar('--blue') || '#3b82f6' };
  const labels = { ok: 'OK', warn: 'ALERTA', crit: 'CRÍTICO', info: 'INFO' };

  let html = '<div class="tl-list">';

  // Agrupar por fecha
  let currentDate = '';
  events.forEach(ev => {
    const date = (ev.time || '').substring(0, 10);
    const time = (ev.time || '').substring(11, 16);
    const level = ev.level || 'info';

    if (date !== currentDate && !compact) {
      currentDate = date;
      const d = new Date(date);
      const dayStr = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      html += `<div class="tl-date">${dayStr}</div>`;
    }

    const isAnomaly = ev.category === 'anomaly';
    html += `
      <div class="tl-item tl-${level}${isAnomaly ? ' tl-anomaly' : ''}">
        <span class="tl-time">${time}</span>
        <span class="tl-icon">${isAnomaly ? '📊' : icons[level]}</span>
        <span class="tl-label" style="color:${isAnomaly ? (getCSSVar('--purple') || '#7c3aed') : colors[level]}">${isAnomaly ? 'ANOMALÍA' : labels[level]}</span>
        <span class="tl-msg">${ev.msg}</span>
      </div>
    `;
  });

  html += '</div>';
  return html;
}
