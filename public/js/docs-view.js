// ═══ Documentation View — Interactive SVG Viewer ═══

const DOCS_DIAGRAMS = [
  { file: '01_arquitectura.svg', title: 'Arquitectura General', desc: 'Interfaces AlphaWeb \u2014 LABSIS \u2014 AMS', icon: 'arch' },
  { file: '02_secuencia.svg', title: 'Diagrama de Secuencia', desc: 'Timeline de mensajes HL7 entre sistemas', icon: 'seq' },
  { file: '03_estados.svg', title: 'Estados de Muestra', desc: 'Ciclo de vida: IP, HD, CA y transiciones', icon: 'state' },
  { file: '04_infraestructura.svg', title: 'Infraestructura', desc: 'Servidor Windows, puertos, servicios Java', icon: 'infra' },
  { file: '05_casos_uso.svg', title: 'Casos de Uso', desc: '6 escenarios en swimlanes (AlphaWeb/LABSIS/AMS)', icon: 'cases' },
  { file: '06_flujo_hl7.svg', title: 'Flujo HL7', desc: 'Ciclo de vida de archivos HL7 en el servidor', icon: 'flow' },
];

const DOCS_PDFS = [
  { file: 'Manual_Proceso_AlphaWeb_LABSIS_AMS_v2.pdf', title: 'Manual Completo v2', size: '27 MB', desc: '27 p\u00e1ginas \u2014 Config DevOps + L\u00f3gica + Mapeo Interfaces' },
  { file: 'Manual_v1_sin_diagramas.pdf', title: 'Manual v1 (sin diagramas)', size: '24 MB', desc: 'Versi\u00f3n anterior sin diagramas integrados' },
];

const SIDEBAR_ICONS = {
  arch: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  seq: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="17 7 12 2 7 7"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  state: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></svg>',
  infra: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6" y2="6"/><line x1="6" y1="18" x2="6" y2="18"/></svg>',
  cases: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  flow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  doc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  pdf: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
};

// ── State ──
let docsCurrentIndex = 0;
let docsCache = {}; // { index: { svgText, scale, panX, panY, userZoomed } }
let docsMinScale = 0.1; // Dynamic min zoom, set per diagram
let docsViewerState = { scale: 1, panX: 0, panY: 0, vbW: 0, vbH: 0 };
let docsIsPanning = false;
let docsPanStart = { x: 0, y: 0 };
let docsAbortController = null;
let docsCleanupListeners = null; // cleanup function for window listeners
let docsInitialized = false;

// ── Initialize View ──
function initDocsView() {
  const sidebar = document.getElementById('docs-sidebar');
  const content = document.getElementById('docs-content');
  if (!sidebar || !content) return;

  if (!docsInitialized) {
    renderDocsSidebar(sidebar);
    docsInitialized = true;
  }

  // Restore last viewed or load first
  const saved = localStorage.getItem('docs-last-index');
  const idx = saved !== null ? parseInt(saved, 10) : 0;
  if (idx < DOCS_DIAGRAMS.length) {
    selectDocsDiagram(idx);
  } else {
    selectDocsDiagram(0);
  }
}

// ── Sidebar ──
function renderDocsSidebar(container) {
  let html = '<div class="docs-sidebar-title">Diagramas</div>';

  DOCS_DIAGRAMS.forEach((d, i) => {
    html += `<div class="docs-sidebar-item${i === 0 ? ' active' : ''}" data-index="${i}" onclick="selectDocsDiagram(${i})">
      <span class="sidebar-icon">${SIDEBAR_ICONS[d.icon]}</span>
      <span class="sidebar-label">${d.title}</span>
    </div>`;
  });

  html += '<div class="docs-sidebar-divider"></div>';
  html += '<div class="docs-sidebar-title">Documentos</div>';

  html += `<div class="docs-sidebar-item" data-type="markdown" onclick="selectDocsMarkdown()">
    <span class="sidebar-icon">${SIDEBAR_ICONS.doc}</span>
    <span class="sidebar-label">Info General</span>
  </div>`;

  html += `<div class="docs-sidebar-item" data-type="pdfs" onclick="selectDocsPdfs()">
    <span class="sidebar-icon">${SIDEBAR_ICONS.pdf}</span>
    <span class="sidebar-label">Manuales PDF</span>
  </div>`;

  container.innerHTML = html;
}

function updateSidebarActive(selector) {
  document.querySelectorAll('.docs-sidebar-item').forEach(item => item.classList.remove('active'));
  const el = document.querySelector(selector);
  if (el) el.classList.add('active');
}

function docsSaveZoomState() {
  if (docsCache[docsCurrentIndex] && docsViewerState.vbW) {
    docsCache[docsCurrentIndex].scale = docsViewerState.scale;
    docsCache[docsCurrentIndex].panX = docsViewerState.panX;
    docsCache[docsCurrentIndex].panY = docsViewerState.panY;
  }
}

// ── Diagram Selection ──
function selectDocsDiagram(index) {
  docsSaveZoomState();

  docsCurrentIndex = index;
  localStorage.setItem('docs-last-index', index);
  updateSidebarActive(`.docs-sidebar-item[data-index="${index}"]`);

  const content = document.getElementById('docs-content');
  const diagram = DOCS_DIAGRAMS[index];

  // Header + viewer container
  content.innerHTML = `
    <div class="docs-viewer-header">
      <div>
        <div class="docs-viewer-title">${diagram.title}</div>
        <div class="docs-viewer-desc">${diagram.desc}</div>
      </div>
    </div>
    <div class="docs-svg-viewer" id="docs-svg-viewer">
      <div class="docs-loading">
        <div class="docs-loading-spinner"></div>
        <span>Cargando diagrama...</span>
      </div>
      <div class="docs-zoom-controls" style="display:none" id="docs-zoom-controls">
        <button class="docs-zoom-btn" onclick="docsZoom(1.25)" title="Zoom In (+)">+</button>
        <button class="docs-zoom-btn" onclick="docsZoom(0.8)" title="Zoom Out (-)">&#8722;</button>
        <span class="docs-zoom-level" id="docs-zoom-level">100%</span>
        <button class="docs-zoom-btn" onclick="docsFit()" title="Ajustar al contenedor">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
        </button>
        <button class="docs-zoom-btn" onclick="docsReset()" title="Reset (1:1)">1:1</button>
        <button class="docs-zoom-btn" onclick="docsToggleFullscreen()" title="Pantalla completa (F)" id="docs-fullscreen-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        </button>
      </div>
      <div class="docs-zoom-hint" id="docs-zoom-hint">Scroll = mover &middot; Pinch/Ctrl+scroll = zoom &middot; Arrastra = pan &middot; Doble-click = ajustar</div>
      <button class="docs-fullscreen-close" onclick="docsToggleFullscreen()" title="Salir de pantalla completa">&times;</button>
    </div>`;

  loadDocsSvg(index);
}

// ── Load SVG ──
async function loadDocsSvg(index) {
  const viewer = document.getElementById('docs-svg-viewer');
  if (!viewer) return;

  // Cancel previous fetch
  if (docsAbortController) docsAbortController.abort();
  docsAbortController = new AbortController();

  // Check cache
  if (docsCache[index]?.svgText) {
    injectDocsSvg(viewer, docsCache[index].svgText, index);
    return;
  }

  try {
    const res = await fetch(`docs/svg/${DOCS_DIAGRAMS[index].file}`, {
      signal: docsAbortController.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svgText = await res.text();

    // Validate it's actually SVG
    if (!svgText.includes('<svg')) throw new Error('Invalid SVG');

    docsCache[index] = { svgText, scale: 1, panX: 0, panY: 0 };
    injectDocsSvg(viewer, svgText, index);
  } catch (e) {
    if (e.name === 'AbortError') return; // Cancelled, ignore
    viewer.innerHTML = `
      <div class="docs-error">
        <div class="docs-error-icon">&#9888;</div>
        <span>No se pudo cargar el diagrama</span>
        <span style="font-size:12px">${e.message}</span>
        <button class="docs-retry-btn" onclick="selectDocsDiagram(${index})">Reintentar</button>
      </div>`;
  }
}

// ── Inject SVG + Attach Zoom/Pan ──
function injectDocsSvg(viewer, svgText, index) {
  // Parse SVG to extract viewBox
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return;

  // Ensure viewBox exists
  let vb = svgEl.getAttribute('viewBox');
  if (!vb) {
    const w = parseFloat(svgEl.getAttribute('width')) || 1200;
    const h = parseFloat(svgEl.getAttribute('height')) || 800;
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    vb = `0 0 ${w} ${h}`;
  }

  // Remove fixed width/height so SVG fills container
  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.style.width = '100%';
  svgEl.style.height = '100%';
  svgEl.style.display = 'block';

  // Build viewer HTML keeping controls
  const controls = viewer.querySelector('#docs-zoom-controls');
  const hint = viewer.querySelector('#docs-zoom-hint');
  const closeBtn = viewer.querySelector('.docs-fullscreen-close');

  viewer.innerHTML = '';
  viewer.appendChild(svgEl);
  if (controls) { controls.style.display = 'flex'; viewer.appendChild(controls); }
  if (hint) viewer.appendChild(hint);
  if (closeBtn) viewer.appendChild(closeBtn);

  // Parse viewBox
  const parts = vb.split(/[\s,]+/).map(Number);
  const vbW = parts[2] || 1200;
  const vbH = parts[3] || 800;

  // Init viewer state with viewBox dimensions
  const cached = docsCache[index];
  docsViewerState = { scale: 1, panX: 0, panY: 0, vbW, vbH };

  // Attach interactions first (before fit, so min scale is set)
  docsAttachZoomPan(viewer, svgEl);

  // Restore user's zoom if they manually zoomed before, otherwise auto-fit
  if (cached?.userZoomed) {
    docsViewerState.scale = cached.scale || 1;
    docsViewerState.panX = cached.panX || 0;
    docsViewerState.panY = cached.panY || 0;
    docsUpdateViewBox();
    docsUpdateZoomLevel();
  } else {
    // Auto-fit after layout establishes (need timeout for container dimensions)
    docsUpdateViewBox();
    setTimeout(() => docsFit(), 50);
  }
}

// ── Zoom/Pan via ViewBox (Google Maps style) ──
//
// Key principle: convert mouse pixel deltas directly to viewBox coordinate deltas.
// viewBox = (panX, panY, viewW, viewH) where viewW = vbW/scale, viewH = vbH/scale.
// 1 pixel on screen = (viewW / containerPixelWidth) viewBox units.

function docsAttachZoomPan(container, svgEl) {
  // ── Clean up previous listeners first ──
  if (docsCleanupListeners) docsCleanupListeners();

  // Calculate dynamic min zoom
  const containerRect = container.getBoundingClientRect();
  const { vbW, vbH } = docsViewerState;
  const fitScale = Math.min(containerRect.width / vbW, containerRect.height / vbH);
  docsMinScale = Math.max(fitScale * 0.5, 0.1);

  function markUserZoomed() {
    if (docsCache[docsCurrentIndex]) docsCache[docsCurrentIndex].userZoomed = true;
  }

  // Helper: get cursor position in viewBox coordinates
  function cursorToVb(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const viewW = vbW / docsViewerState.scale;
    const viewH = vbH / docsViewerState.scale;
    return {
      x: docsViewerState.panX + (clientX - rect.left) / rect.width * viewW,
      y: docsViewerState.panY + (clientY - rect.top) / rect.height * viewH,
    };
  }

  // ── Wheel / Trackpad handling (Mac-optimized) ──
  // Mac trackpad: two-finger scroll = PAN, pinch = ZOOM (ctrlKey=true)
  // External mouse: scroll = PAN vertical, Ctrl+scroll = ZOOM
  function onWheel(e) {
    e.preventDefault();
    markUserZoomed();

    if (e.ctrlKey || e.metaKey) {
      // ── ZOOM (pinch gesture on Mac trackpad, or Ctrl+scroll) ──
      // Mac pinch sends small deltaY with ctrlKey=true
      const delta = -e.deltaY * (e.deltaMode === 1 ? 20 : 1);
      const factor = Math.exp(delta * 0.01); // higher intensity for pinch (small deltas)
      const newScale = Math.max(docsMinScale, Math.min(8, docsViewerState.scale * factor));
      const vbCursor = cursorToVb(e.clientX, e.clientY);
      const ratio = docsViewerState.scale / newScale;
      docsViewerState.panX = vbCursor.x - (vbCursor.x - docsViewerState.panX) * ratio;
      docsViewerState.panY = vbCursor.y - (vbCursor.y - docsViewerState.panY) * ratio;
      docsViewerState.scale = newScale;
      docsUpdateZoomLevel();
    } else {
      // ── PAN (two-finger scroll on Mac trackpad, or mouse wheel) ──
      const rect = container.getBoundingClientRect();
      const viewW = docsViewerState.vbW / docsViewerState.scale;
      const viewH = docsViewerState.vbH / docsViewerState.scale;
      // deltaX = horizontal scroll, deltaY = vertical scroll
      docsViewerState.panX += e.deltaX / rect.width * viewW;
      docsViewerState.panY += e.deltaY / rect.height * viewH;
    }

    docsUpdateViewBox();
  }

  // ── Mouse pan ──
  function onMouseDown(e) {
    if (e.button !== 0) return;
    docsIsPanning = true;
    docsPanStart = { x: e.clientX, y: e.clientY };
    container.classList.add('panning');
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!docsIsPanning) return;
    markUserZoomed();
    const rect = container.getBoundingClientRect();
    const viewW = docsViewerState.vbW / docsViewerState.scale;
    const viewH = docsViewerState.vbH / docsViewerState.scale;
    docsViewerState.panX -= (e.clientX - docsPanStart.x) / rect.width * viewW;
    docsViewerState.panY -= (e.clientY - docsPanStart.y) / rect.height * viewH;
    docsPanStart = { x: e.clientX, y: e.clientY };
    docsUpdateViewBox();
  }

  function onMouseUp() {
    if (docsIsPanning) {
      docsIsPanning = false;
      container.classList.remove('panning');
    }
  }

  // ── Double-click = fit ──
  function onDblClick() {
    if (docsCache[docsCurrentIndex]) docsCache[docsCurrentIndex].userZoomed = false;
    docsFit();
  }

  // ── Touch ──
  let touchStartDist = 0, touchStartScale = 1, touchCenter = { x: 0, y: 0 };

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchStartScale = docsViewerState.scale;
      touchCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    } else if (e.touches.length === 1) {
      docsIsPanning = true;
      docsPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && touchStartDist) {
      e.preventDefault(); markUserZoomed();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const newScale = Math.max(docsMinScale, Math.min(8, touchStartScale * (dist / touchStartDist)));
      const vbC = cursorToVb(touchCenter.x, touchCenter.y);
      const ratio = docsViewerState.scale / newScale;
      docsViewerState.panX = vbC.x - (vbC.x - docsViewerState.panX) * ratio;
      docsViewerState.panY = vbC.y - (vbC.y - docsViewerState.panY) * ratio;
      docsViewerState.scale = newScale;
      docsUpdateViewBox(); docsUpdateZoomLevel();
    } else if (e.touches.length === 1 && docsIsPanning) {
      e.preventDefault(); markUserZoomed();
      const rect = container.getBoundingClientRect();
      const viewW = docsViewerState.vbW / docsViewerState.scale;
      const viewH = docsViewerState.vbH / docsViewerState.scale;
      docsViewerState.panX -= (e.touches[0].clientX - docsPanStart.x) / rect.width * viewW;
      docsViewerState.panY -= (e.touches[0].clientY - docsPanStart.y) / rect.height * viewH;
      docsPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      docsUpdateViewBox();
    }
  }

  function onTouchEnd() { docsIsPanning = false; touchStartDist = 0; }

  // ── Attach all listeners ──
  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('dblclick', onDblClick);
  container.addEventListener('touchstart', onTouchStart, { passive: false });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // ── Cleanup function (called before next diagram attaches) ──
  docsCleanupListeners = () => {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('dblclick', onDblClick);
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    docsCleanupListeners = null;
  };

  // ── Keyboard shortcuts (only one instance) ──
  if (!window._docsKeyHandler) {
    window._docsKeyHandler = (e) => {
      if (window.currentView !== 'docs') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '+' || e.key === '=') docsZoom(1.25);
      else if (e.key === '-') docsZoom(0.8);
      else if (e.key === '0') docsFit();
      else if (e.key === 'f' || e.key === 'F') docsToggleFullscreen();
    };
    window.addEventListener('keydown', window._docsKeyHandler);
  }
}

function docsUpdateViewBox() {
  const svgEl = document.querySelector('#docs-svg-viewer svg');
  if (!svgEl) return;
  const { panX, panY, vbW, vbH, scale } = docsViewerState;
  svgEl.setAttribute('viewBox',
    `${panX.toFixed(1)} ${panY.toFixed(1)} ${(vbW / scale).toFixed(1)} ${(vbH / scale).toFixed(1)}`
  );
}

function docsUpdateZoomLevel() {
  const el = document.getElementById('docs-zoom-level');
  if (el) el.textContent = Math.round(docsViewerState.scale * 100) + '%';
}

// ── Zoom Controls ──
function docsZoom(factor) {
  const svgEl = document.querySelector('#docs-svg-viewer svg');
  const viewer = document.getElementById('docs-svg-viewer');
  if (!svgEl || !viewer) return;
  if (docsCache[docsCurrentIndex]) docsCache[docsCurrentIndex].userZoomed = true;

  const newScale = Math.max(docsMinScale, Math.min(8, docsViewerState.scale * factor));
  // Zoom toward center of viewport
  const rect = viewer.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const viewW = docsViewerState.vbW / docsViewerState.scale;
  const viewH = docsViewerState.vbH / docsViewerState.scale;
  const vbCenterX = docsViewerState.panX + viewW / 2;
  const vbCenterY = docsViewerState.panY + viewH / 2;
  const ratio = docsViewerState.scale / newScale;
  docsViewerState.panX = vbCenterX - (vbCenterX - docsViewerState.panX) * ratio;
  docsViewerState.panY = vbCenterY - (vbCenterY - docsViewerState.panY) * ratio;
  docsViewerState.scale = newScale;

  docsUpdateViewBox();
  docsUpdateZoomLevel();
}

function docsReset() {
  // Reset = fit to container
  docsFit();
}

function docsFit() {
  const svgEl = document.querySelector('#docs-svg-viewer svg');
  const viewer = document.getElementById('docs-svg-viewer');
  if (!svgEl || !viewer) return;

  const rect = viewer.getBoundingClientRect();
  const { vbW, vbH } = docsViewerState;
  const scaleX = rect.width / vbW;
  const scaleY = rect.height / vbH;
  const fitScale = Math.min(scaleX, scaleY);

  docsViewerState.scale = fitScale || 1;
  docsMinScale = Math.max(fitScale * 0.5, 0.1);

  // Center the diagram in the viewport
  const viewW = vbW / docsViewerState.scale;
  const viewH = vbH / docsViewerState.scale;
  docsViewerState.panX = (vbW - viewW) / 2;
  docsViewerState.panY = (vbH - viewH) / 2;

  svgEl.style.transition = 'all 0.3s ease';
  docsUpdateViewBox();
  docsUpdateZoomLevel();
  setTimeout(() => { svgEl.style.transition = ''; }, 350);
}

// ── Fullscreen ──
function docsToggleFullscreen() {
  const viewer = document.getElementById('docs-svg-viewer');
  if (!viewer) return;

  if (viewer.classList.contains('fullscreen')) {
    viewer.classList.remove('fullscreen');
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // Re-fit after layout change
    setTimeout(() => docsFit(), 100);
  } else {
    viewer.classList.add('fullscreen');
    document.body.style.overflow = 'hidden';
    if (viewer.requestFullscreen) viewer.requestFullscreen().catch(() => {});
    // Re-fit after fullscreen establishes
    setTimeout(() => docsFit(), 100);
  }
}

// Listen for Escape to exit fullscreen
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    const viewer = document.getElementById('docs-svg-viewer');
    if (viewer) {
      viewer.classList.remove('fullscreen');
      document.body.style.overflow = '';
      setTimeout(() => docsFit(), 100);
    }
  }
});

// Fix E — Re-fit on window resize
window.addEventListener('resize', () => {
  if (window.currentView !== 'docs') return;
  clearTimeout(window._docsResizeTimer);
  window._docsResizeTimer = setTimeout(() => {
    // Recalculate min scale and re-fit
    const viewer = document.getElementById('docs-svg-viewer');
    const svgEl = viewer?.querySelector('svg');
    if (viewer && svgEl && docsViewerState.vbW) {
      const rect = viewer.getBoundingClientRect();
      const fitScale = Math.min(rect.width / docsViewerState.vbW, rect.height / docsViewerState.vbH);
      docsMinScale = Math.max(fitScale * 0.5, 0.1);
      docsFit();
    }
  }, 200);
});

// ── Markdown View ──
function selectDocsMarkdown() {
  updateSidebarActive('.docs-sidebar-item[data-type="markdown"]');
  const content = document.getElementById('docs-content');

  content.innerHTML = `
    <div class="docs-viewer-header">
      <div>
        <div class="docs-viewer-title">Informaci\u00f3n General</div>
        <div class="docs-viewer-desc">Integraci\u00f3n AlphaWeb \u2014 LABSIS \u2014 AMS (KAB-7592)</div>
      </div>
    </div>
    <div class="docs-markdown">
      <h3>Qu\u00e9 contiene esta documentaci\u00f3n</h3>
      <p><strong>1. Manual PDF (27 p\u00e1gs)</strong> con 3 secciones:</p>
      <ul>
        <li><strong>Configuraci\u00f3n DevOps</strong> \u2014 Servidor Windows Server 2012, rutas de cada interfaz, archivos Configuracion.properties, puertos, endpoints REST, directorios HL7, logs y troubleshooting</li>
        <li><strong>L\u00f3gica del Proceso</strong> \u2014 Estructura HL7 (MSH, SPM, ORC, OBR, ZPV nuevo), c\u00f3digos de estado (IP/HD/CA), los 6 casos de uso, y el flujo completo paso a paso</li>
        <li><strong>Mapeo de Interfaces</strong> \u2014 Las 7 interfaces documentadas con nombre, direcci\u00f3n, funci\u00f3n, trigger, puerto y config</li>
      </ul>

      <p><strong>2. 6 diagramas profesionales</strong> (SVG interactivos + editables .drawio):</p>
      <ul>
        <li>Arquitectura general de interfaces</li>
        <li>Diagrama de secuencia (timeline de mensajes)</li>
        <li>Diagrama de estados de muestra y analito</li>
        <li>Infraestructura del servidor (DevOps)</li>
        <li>Casos de uso en swimlanes</li>
        <li>Flujo de archivos HL7 (ciclo de vida)</li>
      </ul>

      <h3>Lo m\u00e1s importante</h3>
      <ul>
        <li>Las interfaces antiguas (<code>LapiSendLabRequest</code>) dejan de funcionar. Se reemplazan por las nuevas <strong>AlphaWeb</strong> que usan REST en lugar de socket.</li>
        <li>Se agrega un nuevo segmento <strong>ZPV</strong> (empresa) al mensaje HL7.</li>
        <li>Las muestras ahora pueden nacer como <strong>activas (IP)</strong> o <strong>no entregadas (HD)</strong> seg\u00fan la sucursal.</li>
        <li>El checkpoint <strong>"Llegada ACM"</strong> es el trigger principal: al escanear una muestra (manual o autom\u00e1tico), cambia el estado y la mete a la lista de trabajo.</li>
      </ul>

      <h3>Puertos y endpoints clave</h3>
      <table>
        <thead>
          <tr><th>Puerto</th><th>Servicio</th></tr>
        </thead>
        <tbody>
          <tr><td><code>4000</code></td><td>Solicitudes AlphaWeb</td></tr>
          <tr><td><code>4001</code></td><td>Check-in / Resultados</td></tr>
          <tr><td><code>4010</code></td><td>AMS Results</td></tr>
          <tr><td><code>4066</code></td><td>AMS SendLabRequest</td></tr>
          <tr><td><code>8080</code></td><td>LABSIS REST API</td></tr>
          <tr><td><code>8091</code></td><td>AlphaWeb interfaz</td></tr>
        </tbody>
      </table>

      <h3>Referencia</h3>
      <ul>
        <li><strong>JIRA:</strong> KAB-7592</li>
        <li><strong>Servidor:</strong> Windows Server 2012 (AnyDesk)</li>
        <li><strong>BD:</strong> labsisLAPIQA2024003 @ LAPI_nube (pgAdmin 4)</li>
        <li>Los diagramas .drawio son editables en <code>app.diagrams.net</code></li>
      </ul>
    </div>`;
}

// ── PDF View ──
function selectDocsPdfs() {
  updateSidebarActive('.docs-sidebar-item[data-type="pdfs"]');
  const content = document.getElementById('docs-content');

  let cardsHtml = '';
  DOCS_PDFS.forEach(pdf => {
    cardsHtml += `
      <a class="docs-pdf-card" href="docs/pdf/${pdf.file}" target="_blank" download>
        <div class="docs-pdf-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        </div>
        <div class="docs-pdf-info">
          <div class="docs-pdf-name">${pdf.title}</div>
          <div class="docs-pdf-meta">${pdf.size} &middot; ${pdf.desc}</div>
        </div>
      </a>`;
  });

  content.innerHTML = `
    <div class="docs-viewer-header">
      <div>
        <div class="docs-viewer-title">Manuales PDF</div>
        <div class="docs-viewer-desc">Documentaci\u00f3n completa descargable del proceso AlphaWeb \u2014 LABSIS \u2014 AMS</div>
      </div>
    </div>
    <div class="docs-pdf-cards">${cardsHtml}</div>`;
}
