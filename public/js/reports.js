// Reportes Semanales — UI con generación para cliente

async function renderReportsTab() {
  const container = document.getElementById('reports-container');
  if (!container) return;

  try {
    const res = await authFetch('api/reports');
    const reports = await res.json();

    let html = `
      <div class="reports-actions-bar">
        <div class="reports-actions-group">
          <button class="report-btn-client" onclick="generateClientReport()">
            Generar Reporte Semanal (Cliente)
          </button>
          ${window.currentUser?.role === 'admin' ? `
          <button class="report-btn-internal" onclick="generateReport()">
            Generar Reporte Interno
          </button>` : ''}
        </div>
        <div class="reports-info">Los reportes para cliente se generan en formato imprimible. Haz click en "Ver reporte" para abrirlo y guardarlo como PDF.</div>
      </div>
    `;

    if (!reports.length) {
      html += '<div class="no-data">Sin reportes generados. Haz click en "Generar Reporte Semanal" para crear el primero.</div>';
      container.innerHTML = html;
      return;
    }

    html += '<div class="reports-grid">';
    reports.forEach(r => {
      const scoreColor = r.health_score >= 80 ? 'green' : r.health_score >= 60 ? 'yellow' : 'red';
      const from = r.period_from ? r.period_from.slice(0, 10) : '?';
      const to = r.period_to ? r.period_to.slice(0, 10) : '?';
      const dateStr = r.generated_at ? new Date(r.generated_at).toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric',
      }) : '';

      // Detectar tipo de reporte
      let summary = {};
      try { summary = JSON.parse(r.summary_json || '{}'); } catch(e) {}
      const isClient = summary.availability !== undefined;
      const typeBadge = isClient
        ? '<span class="report-type-badge report-type-client">Cliente</span>'
        : '<span class="report-type-badge report-type-internal">Interno</span>';

      html += `
        <div class="report-card" onclick="openReportPrint(${r.id})">
          <div class="report-card-score" style="color:var(--${scoreColor})">${r.health_score ?? '—'}</div>
          <div class="report-card-label">Puntuación</div>
          ${typeBadge}
          <div class="report-card-period">${from} — ${to}</div>
          <div class="report-card-date">Generado: ${dateStr}</div>
          <div class="report-card-actions">
            <button class="report-action-btn" onclick="event.stopPropagation(); openReportPrint(${r.id})">Ver reporte</button>
          </div>
        </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="no-data">Error cargando reportes: ${err.message}</div>`;
  }
}

function openReportPrint(id) {
  // Abre el reporte HTML en nueva ventana, listo para imprimir/guardar como PDF
  const w = window.open(`api/reports/${id}/html`, '_blank');
  // Auto-trigger print después de cargar
  if (w) {
    w.addEventListener('load', () => {
      // No auto-print, dejar que el usuario decida
    });
  }
}

async function generateClientReport() {
  const btn = document.querySelector('.report-btn-client');
  if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }

  try {
    const res = await authFetch('api/reports/generate-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (data.ok) {
      renderReportsTab();
      // Obtener el último reporte para abrirlo
      const reportsRes = await authFetch('api/reports?limit=1');
      const reports = await reportsRes.json();
      if (reports.length) {
        openReportPrint(reports[0].id);
      }
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generar Reporte Semanal (Cliente)'; }
  }
}

async function generateReport() {
  try {
    const res = await authFetch('api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (data.ok) {
      renderReportsTab();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
