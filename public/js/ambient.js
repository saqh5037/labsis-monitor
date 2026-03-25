// ambient.js — Motor de animaciones ambientales (htop-like "vibe")
// Corre su propio rAF loop independiente del SSE (30s). Efectos: partículas en
// edges de topología, jitter en agujas, breathing en status dots, scan lines en
// cards, y blink de colones en timestamp.

class AmbientEngine {
  constructor() {
    this._rafId = null;
    this._running = false;
    this._effects = [];
    this._lastTimestamp = 0;
    this._sseFreshness = 0; // ms desde último SSE (sube en cada tick)

    // Estado interno de efectos
    this._particles = [];         // {circle, path, offset, speed, totalLen, phase, critLevel}
    this._particlesSeeded = false;
    this._scanGroups = [];        // [{cards, nextScanAt, staggerMs}]
    this._scanSeeded = false;
    this._colonSpans = null;      // NodeList de <span class="colon-blink">
    this._colonVisible = true;
    this._colonLastToggle = 0;

    // Registra los 5 efectos built-in
    this.register(this._effectParticles.bind(this));
    this.register(this._effectNeedleJitter.bind(this));
    this.register(this._effectBreathing.bind(this));
    this.register(this._effectScanLines.bind(this));
    this.register(this._effectTimestampBlink.bind(this));
  }

  // ── API Pública ────────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    this._rafId = requestAnimationFrame(this.tick.bind(this));
  }

  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  register(fn) {
    this._effects.push(fn);
  }

  onSSE() {
    this._sseFreshness = 0;
  }

  tick(timestamp) {
    if (!this._running) return;

    const elapsed = timestamp - this._lastTimestamp;
    this._lastTimestamp = timestamp;
    this._sseFreshness += elapsed;

    const ctx = { timestamp, elapsed, sseFreshness: this._sseFreshness };

    for (const fn of this._effects) {
      try {
        fn(ctx);
      } catch (e) {
        // efecto roto no debe crashear el loop
      }
    }

    this._rafId = requestAnimationFrame(this.tick.bind(this));
  }

  // ── Efecto 1: Partículas en edges de topología ─────────────────────────────

  _effectParticles({ timestamp, elapsed }) {
    const svg = document.querySelector('.topology-svg');
    if (!svg) {
      // Si el SVG desapareció (cambio de vista), limpia estado y espera
      if (this._particlesSeeded) {
        this._particles = [];
        this._particlesSeeded = false;
      }
      return;
    }

    // Creación lazy: solo la primera vez que existan edges
    if (!this._particlesSeeded) {
      this._seedParticles(svg);
      this._particlesSeeded = true;
    }

    // Si no hay partículas aún (edges pueden no estar todavía), nada que animar
    if (!this._particles.length) {
      // Reintentar seed si aún no hay partículas (topología puede tardar en render)
      this._particlesSeeded = false;
      return;
    }

    // Mover cada partícula (elapsed en ms → convertir a segundos)
    const speed = 40; // px/s
    const delta = Math.min(elapsed, 100) / 1000; // cap a 100ms para no saltar si tab pierde foco
    for (const p of this._particles) {
      if (!p.circle.isConnected) {
        // El círculo fue removido del DOM (re-render de topología)
        this._particles = [];
        this._particlesSeeded = false;
        return;
      }

      // Avanzar offset en px usando delta real
      p.offset += speed * delta;
      if (p.offset >= p.totalLen) {
        p.offset = 0;
      }

      const pct = p.offset / p.totalLen;

      // Fade: 0→1 en primer 10%, 1→0 en último 10%
      let opacity;
      if (pct < 0.1) {
        opacity = pct / 0.1;
      } else if (pct > 0.9) {
        opacity = (1 - pct) / 0.1;
      } else {
        opacity = 1;
      }

      try {
        const pt = p.path.getPointAtLength(p.offset);
        p.circle.setAttribute('cx', pt.x.toFixed(2));
        p.circle.setAttribute('cy', pt.y.toFixed(2));
        p.circle.style.opacity = opacity.toFixed(3);
      } catch (e) {
        // path puede haber cambiado
      }
    }
  }

  _seedParticles(svg) {
    const edges = svg.querySelectorAll('.topology-edge');
    if (!edges.length) return;

    // Limpiar partículas anteriores
    this._particles = [];
    svg.querySelectorAll('.topology-particle').forEach(c => c.remove());

    edges.forEach(path => {
      let totalLen;
      try {
        totalLen = path.getTotalLength();
      } catch (e) {
        return;
      }
      if (totalLen < 10) return;

      // Determinar nivel de criticidad mirando el nodo destino
      const toNodeId = path.getAttribute('data-to');
      let critLevel = 'ok'; // ok | warn | crit
      if (toNodeId) {
        const dot = svg.querySelector(`[data-status-node="${toNodeId}"]`);
        if (dot) {
          const fill = dot.getAttribute('fill') || '';
          // Las CSS vars se resuelven como color computado — comparamos strings
          if (fill.includes('red') || fill === 'var(--red)' || fill === '#ef4444') {
            critLevel = 'crit';
          } else if (fill.includes('yellow') || fill === 'var(--yellow)' || fill === '#f59e0b') {
            critLevel = 'warn';
          }
        }
      }

      // 3 partículas por edge, staggered 0% / 33% / 66%
      const staggerOffsets = [0, totalLen * 0.333, totalLen * 0.666];
      staggerOffsets.forEach((startOffset) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', '2');
        circle.classList.add('topology-particle');
        if (critLevel === 'crit') circle.classList.add('crit');
        if (critLevel === 'warn') circle.classList.add('warn');
        circle.style.opacity = '0';
        circle.style.pointerEvents = 'none';

        // Insertar después del path para que quede encima
        path.parentNode.insertBefore(circle, path.nextSibling);

        this._particles.push({
          circle,
          path,
          offset: startOffset,
          totalLen,
          critLevel,
        });
      });
    });
  }

  // ── Efecto 2: Micro-jitter en agujas ───────────────────────────────────────

  _effectNeedleJitter({ timestamp, sseFreshness }) {
    // Solo aplica si han pasado más de 2s desde el último SSE
    if (sseFreshness < 2000) return;

    const needles = document.querySelectorAll('.gauge-needle-group');
    needles.forEach((needle, index) => {
      if (!needle.isConnected) return;

      // El transform actual puede ser "rotate(Xdeg)" (CSS) o nada
      const currentTransform = needle.style.transform || '';
      const match = currentTransform.match(/rotate\(([-\d.]+)deg\)/);
      if (!match) return;

      const baseAngle = parseFloat(match[1]);
      const jitter = Math.sin(timestamp * 0.002 + index * 1.3) * 0.3;
      // No modificar style.transform directo para no romper la transición CSS
      // Usamos un atributo transform como capa adicional con wrapper-group approach:
      // En lugar de sobreescribir, seteamos un data attribute y calculamos desde JS
      needle.style.transform = `rotate(${(baseAngle + jitter).toFixed(4)}deg)`;
    });
  }

  // ── Efecto 3: Breathing en status dots ────────────────────────────────────

  _effectBreathing({ timestamp }) {
    const dots = document.querySelectorAll('.topology-status-dot');
    dots.forEach((dot) => {
      if (!dot.isConnected) return;

      const fill = dot.getAttribute('fill') || '';
      const isCritical = fill.includes('red') || fill === 'var(--red)' || fill === '#ef4444';

      // Crítico respira más rápido
      const freq = isCritical ? 0.005 : 0.003;
      // Cicla entre 0.6 y 1.0
      const opacity = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(timestamp * freq));
      dot.style.opacity = opacity.toFixed(3);
    });
  }

  // ── Efecto 4: Scan lines en glass cards ───────────────────────────────────

  _effectScanLines({ timestamp }) {
    // Si la vista está oculta, skip
    const overviewView = document.getElementById('view-overview');
    if (overviewView && overviewView.style.display === 'none') return;

    const serverDetailView = document.getElementById('view-server-detail');
    const isDashboardView = window.currentView === 'dashboard';
    if (isDashboardView) return;

    // Seed lazy: armar grupos de cards
    if (!this._scanSeeded) {
      this._seedScanGroups(timestamp);
      this._scanSeeded = true;
    }

    const now = performance.now();

    for (const group of this._scanGroups) {
      if (!group.cards.length) continue;

      // Verificar que el primer card sigue en DOM; si no, re-seed
      if (!group.cards[0].isConnected) {
        this._scanSeeded = false;
        return;
      }

      if (now < group.nextScanAt) continue;

      // Animar cada card con stagger
      group.cards.forEach((card, i) => {
        if (!card.isConnected) return;
        const delay = i * group.staggerMs;
        setTimeout(() => {
          this._runShineSweep(card);
        }, delay);
      });

      // Próximo scan en 8 segundos
      group.nextScanAt = now + 8000;
    }
  }

  _seedScanGroups(timestamp) {
    const now = performance.now();
    this._scanGroups = [];

    const selectors = [
      '.card',
      '.chart-card',
      '.car-gauge-slot',
      '.infographic-details',
    ];

    // Un grupo por selector para que cada tipo se anime junto
    selectors.forEach((sel, gi) => {
      const cards = Array.from(document.querySelectorAll(sel));
      if (!cards.length) return;

      this._scanGroups.push({
        cards,
        staggerMs: 100,
        // Escalonar el inicio de cada grupo para que no arranquen todos juntos
        nextScanAt: now + gi * 2000 + 1000,
      });
    });
  }

  _runShineSweep(el) {
    if (!el.isConnected) return;

    // Animar --shine-offset de -10% a 110% en 2s
    const duration = 2000;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const offset = -10 + 120 * progress; // -10% → 110%
      el.style.setProperty('--shine-offset', offset.toFixed(1) + '%');
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        el.style.removeProperty('--shine-offset');
      }
    };

    requestAnimationFrame(animate);
  }

  // ── Efecto 5: Timestamp blink ─────────────────────────────────────────────

  _effectTimestampBlink({ timestamp }) {
    const el = document.getElementById('last-update');
    if (!el || !el.isConnected) return;

    // Wrap colones la primera vez que veamos el elemento con texto real
    if (!this._colonSpans) {
      const text = el.textContent || '';
      if (!text.includes(':')) return; // aún no tiene timestamp

      // Reemplazar ":" por spans — pero solo si no lo hemos hecho ya
      if (!el.querySelector('.colon-blink')) {
        el.innerHTML = el.textContent
          .replace(/:/g, '<span class="colon-blink">:</span>');
      }
      this._colonSpans = el.querySelectorAll('.colon-blink');
    }

    // Si el texto cambió (nuevo SSE), los spans se re-crean en el siguiente ciclo
    if (!el.querySelector('.colon-blink')) {
      this._colonSpans = null;
      return;
    }

    // Toggle cada 500ms
    const now = performance.now();
    if (now - this._colonLastToggle < 500) return;
    this._colonLastToggle = now;

    this._colonVisible = !this._colonVisible;
    const opacity = this._colonVisible ? '1' : '0.2';
    this._colonSpans.forEach(span => {
      if (span.isConnected) span.style.opacity = opacity;
    });
  }
}

// Exponer al global; la instanciación se hace desde app.js
window.AmbientEngine = AmbientEngine;
