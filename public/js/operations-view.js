// Operations View — Acciones + Timeline + Interfaces
// Reorganiza el contenido de los tabs viejos (actions, interfaces, timeline)

function renderOperationsView() {
  const container = document.getElementById('operations-view-container');
  if (!container || container.dataset.initialized) return;
  container.dataset.initialized = 'true';

  container.innerHTML = `
    <div class="srv-detail-card">
      <div class="srv-detail-sections">
        <details class="srv-section" open>
          <summary class="srv-section-header system">
            <i data-lucide="zap"></i> Centro de Acciones
          </summary>
          <div class="srv-section-body" id="ops-actions-catalog"></div>
        </details>

        <details class="srv-section">
          <summary class="srv-section-header connections">
            <i data-lucide="cable"></i> Interfaces Middleware
          </summary>
          <div class="srv-section-body" id="ops-interfaces-container"></div>
        </details>

        <details class="srv-section">
          <summary class="srv-section-header performance">
            <i data-lucide="clock"></i> Timeline de Eventos
          </summary>
          <div class="srv-section-body" id="ops-timeline"></div>
        </details>

        <details class="srv-section">
          <summary class="srv-section-header slow">
            <i data-lucide="clipboard-list"></i> Log de Auditoria
          </summary>
          <div class="srv-section-body">
            <div id="ops-audit-filters"></div>
            <div id="ops-actions-audit"></div>
          </div>
        </details>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });

  // Renderizar contenido
  try { renderActionsTab(); } catch(e) {}
  try { renderInterfacesTab(); } catch(e) {}
  try { fetchAndRenderTimeline(); } catch(e) {}
}
