// Reports & Docs View — Reportes + Documentacion

function renderReportsView() {
  const container = document.getElementById('reports-view-container');
  if (!container || container.dataset.initialized) return;
  container.dataset.initialized = 'true';

  container.innerHTML = `
    <div class="srv-detail-card">
      <div class="srv-detail-sections">
        <details class="srv-section" open>
          <summary class="srv-section-header system">
            <i data-lucide="file-text"></i> Reportes para Entrega
          </summary>
          <div class="srv-section-body" id="rpts-reports-container"></div>
        </details>

        <details class="srv-section">
          <summary class="srv-section-header connections">
            <i data-lucide="book-open"></i> Documentacion
          </summary>
          <div class="srv-section-body">
            <div class="docs-layout" style="min-height:400px">
              <aside class="docs-sidebar" id="rpts-docs-sidebar"></aside>
              <div class="docs-content" id="rpts-docs-content">
                <div class="no-data">Selecciona un documento del panel izquierdo</div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });

  // Renderizar reportes
  try { renderReportsTab(); } catch(e) {}
  // Docs se inicializa cuando el usuario abre esa seccion
}
