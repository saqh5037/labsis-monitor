// gauges.js — SVG Gauge component (luxury dashboard style)

class SVGGauge {
  constructor(container, config) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.id = 'g' + Math.random().toString(36).substr(2, 6);
    this.config = {
      label: config.label || '',
      unit: config.unit || '',
      min: config.min ?? 0,
      max: config.max ?? 100,
      thresholds: config.thresholds || [
        { value: 70,  color: '#10b981' },
        { value: 85,  color: '#f59e0b' },
        { value: 100, color: '#ef4444' },
      ],
      format: config.format || (v => v.toFixed(0)),
      size: config.size || 200,
      // 240° sweep: from -210° to +30° (clock-style, relative to 12 o'clock)
      arcStart: -210,
      arcEnd: 30,
    };
    this.currentValue = this.config.min;
    this.render();
  }

  render() {
    const { size, label, unit, min, max, thresholds, arcStart, arcEnd, format } = this.config;
    const id = this.id;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 18;
    const totalSweep = arcEnd - arcStart; // 240°

    // --- SVG Defs: gradients + filters ---
    const defs = `
<defs>
  <radialGradient id="hubGrad-${id}" cx="35%" cy="30%" r="70%">
    <stop offset="0%"   stop-color="#cbd5e1"/>
    <stop offset="50%"  stop-color="#94a3b8"/>
    <stop offset="100%" stop-color="#475569"/>
  </radialGradient>
  <filter id="glow-${id}" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
  <filter id="needleShadow-${id}" x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur stdDeviation="1.5" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>`;

    // --- Background arc (full 240°) ---
    const bgArc = `<path d="${this.describeArc(cx, cy, radius, arcStart, arcEnd)}"
  fill="none" stroke="rgba(100,116,139,0.2)" stroke-width="8" stroke-linecap="round"/>`;

    // --- Threshold segments ---
    let segmentsSvg = '';
    let prevValue = min;
    for (const t of thresholds) {
      const startPct = (prevValue - min) / (max - min);
      const endPct   = (t.value  - min) / (max - min);
      const startAngle = arcStart + startPct * totalSweep;
      const endAngle   = arcStart + endPct   * totalSweep;

      segmentsSvg += `<path d="${this.describeArc(cx, cy, radius, startAngle, endAngle)}"
  fill="none" stroke="${t.color}" stroke-width="8" stroke-linecap="butt" opacity="0.5"/>`;

      prevValue = t.value;
    }

    // --- Major ticks only (5: at 0%, 25%, 50%, 75%, 100%) ---
    let ticksSvg = '';
    const majorSteps = [0, 0.25, 0.5, 0.75, 1.0];
    for (const pct of majorSteps) {
      const angle   = arcStart + pct * totalSweep;
      const radAngle = (angle - 90) * Math.PI / 180;
      const outerR  = radius + 3;
      const innerR  = radius - 8;
      const labelR  = radius - 18;
      const tickValue = min + pct * (max - min);

      ticksSvg += `<line
  x1="${(cx + outerR * Math.cos(radAngle)).toFixed(2)}" y1="${(cy + outerR * Math.sin(radAngle)).toFixed(2)}"
  x2="${(cx + innerR * Math.cos(radAngle)).toFixed(2)}" y2="${(cy + innerR * Math.sin(radAngle)).toFixed(2)}"
  stroke="currentColor" class="gauge-tick-line" stroke-width="1"/>`;

      ticksSvg += `<text
  x="${(cx + labelR * Math.cos(radAngle)).toFixed(2)}"
  y="${(cy + labelR * Math.sin(radAngle)).toFixed(2)}"
  font-size="8" class="gauge-tick-label" text-anchor="middle" dominant-baseline="middle"
  font-family="'JetBrains Mono', 'Courier New', monospace">${Math.round(tickValue)}</text>`;
    }

    // --- Active arc (empty at render time, filled in setValue()) ---
    const activeArc = `<path d="${this.describeArc(cx, cy, radius, arcStart, arcStart)}"
  fill="none" stroke="#10b981" stroke-width="6" stroke-linecap="round"
  filter="url(#glow-${id})" class="gauge-active-arc"/>`;

    // --- Needle ---
    const needleLength = radius - 20;
    const needle = `<g class="gauge-needle-group" transform="rotate(${arcStart}, ${cx}, ${cy})"
  style="transform-origin: ${cx}px ${cy}px; transition: transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1);">
  <polygon
    points="${cx},${(cy - needleLength).toFixed(2)} ${(cx - 2).toFixed(2)},${(cy + 4).toFixed(2)} ${(cx + 2).toFixed(2)},${(cy + 4).toFixed(2)}"
    fill="#ef4444" filter="url(#needleShadow-${id})"/>
</g>`;

    // --- Hub (metallic chrome center) ---
    const hub = `<circle cx="${cx}" cy="${cy}" r="7" fill="url(#hubGrad-${id})"/>`;

    // --- Readout, unit, label ---
    const readoutY = cy + 32;
    const unitY    = readoutY + 14;
    const labelY   = unitY + 13;

    const readout = `<text x="${cx}" y="${readoutY}"
  class="gauge-readout"
  font-size="24" font-weight="700"
  font-family="'JetBrains Mono', 'Courier New', monospace"
  text-anchor="middle" dominant-baseline="middle">0</text>`;

    const unitText = `<text x="${cx}" y="${unitY}"
  font-size="10" class="gauge-unit"
  font-family="system-ui, sans-serif"
  text-anchor="middle" dominant-baseline="middle">${unit}</text>`;

    const labelText = `<text x="${cx}" y="${labelY}"
  font-size="11" class="gauge-label"
  font-family="system-ui, sans-serif" letter-spacing="0.08em"
  text-anchor="middle" dominant-baseline="middle">${label.toUpperCase()}</text>`;

    // --- Assemble ---
    const svg = `<svg viewBox="0 0 ${size} ${size}" class="gauge-svg" style="overflow:visible;">
${defs}
${bgArc}
${segmentsSvg}
${ticksSvg}
${activeArc}
${needle}
${hub}
${readout}
${unitText}
${labelText}
</svg>`;

    if (this.container) {
      this.container.innerHTML = svg;
    }
  }

  setValue(value) {
    const { min, max, thresholds, format, unit, arcStart, arcEnd } = this.config;
    const id = this.id;
    const clampedValue = Math.max(min, Math.min(max, value));
    this.currentValue = clampedValue;

    const size     = this.config.size;
    const cx       = size / 2;
    const cy       = size / 2;
    const radius   = size / 2 - 18;
    const totalSweep = arcEnd - arcStart;
    const pct    = (clampedValue - min) / (max - min);
    const angle  = arcStart + pct * totalSweep;

    // Determine zone color
    let color = thresholds[thresholds.length - 1].color;
    for (const t of thresholds) {
      if (clampedValue <= t.value) {
        color = t.color;
        break;
      }
    }

    // Update active arc
    const activeArc = this.container?.querySelector('.gauge-active-arc');
    if (activeArc) {
      activeArc.setAttribute('d', this.describeArc(cx, cy, radius, arcStart, angle));
      activeArc.setAttribute('stroke', color);
    }

    // Update needle — use CSS transform for transition, setAttribute for initial pos
    const needleGroup = this.container?.querySelector('.gauge-needle-group');
    if (needleGroup) {
      // setAttribute alone won't trigger CSS transition; switch to CSS transform
      needleGroup.style.transform = `rotate(${angle}deg)`;
    }

    // Update readout value with tween animation
    const readout = this.container?.querySelector('.gauge-readout');
    if (readout) {
      // Tween animation for readout value
      const startVal = this.previousValue ?? min;
      const endVal = clampedValue;
      const duration = 1200;
      const startTime = performance.now();
      const fmt = format;

      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startVal + (endVal - startVal) * eased;
        readout.textContent = fmt(current);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      this.previousValue = clampedValue;
    }
  }

  describeArc(cx, cy, radius, startAngle, endAngle) {
    // SVG arc: clockwise, angles relative to 12 o'clock
    // We draw from startAngle to endAngle in the clockwise direction
    if (Math.abs(endAngle - startAngle) < 0.01) {
      // Degenerate arc — return a tiny invisible segment to avoid SVG render artifacts
      const p = this.polarToCartesian(cx, cy, radius, startAngle);
      return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }

    const start = this.polarToCartesian(cx, cy, radius, startAngle);
    const end   = this.polarToCartesian(cx, cy, radius, endAngle);
    const sweep = endAngle - startAngle;
    const largeArcFlag = sweep > 180 ? 1 : 0;

    // sweep-flag=1 → clockwise
    return [
      `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    ].join(' ');
  }

  polarToCartesian(cx, cy, radius, angleInDegrees) {
    // 0° = 12 o'clock, positive = clockwise
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians),
    };
  }
}

// Gauge presets — hex colors (not CSS vars) for SVG filter compatibility
const GAUGE_PRESETS = {
  cpu: {
    label: 'CPU',
    unit: '%',
    min: 0, max: 100,
    thresholds: [
      { value: 70,  color: '#10b981' },
      { value: 85,  color: '#f59e0b' },
      { value: 100, color: '#ef4444' },
    ],
  },
  ram: {
    label: 'MEMORIA RAM',
    unit: '%',
    min: 0, max: 100,
    thresholds: [
      { value: 70,  color: '#10b981' },
      { value: 85,  color: '#f59e0b' },
      { value: 100, color: '#ef4444' },
    ],
  },
  disk: {
    label: 'DISCO',
    unit: '%',
    min: 0, max: 100,
    thresholds: [
      { value: 75,  color: '#10b981' },
      { value: 85,  color: '#f59e0b' },
      { value: 100, color: '#ef4444' },
    ],
  },
  load: {
    label: 'LOAD AVERAGE',
    unit: '',
    min: 0, max: 16,
    thresholds: [
      { value: 8,  color: '#10b981' },
      { value: 12, color: '#f59e0b' },
      { value: 16, color: '#ef4444' },
    ],
    format: v => v.toFixed(1),
  },
  threads: {
    label: 'JBOSS THREADS',
    unit: '',
    min: 0, max: 500,
    thresholds: [
      { value: 150, color: '#10b981' },
      { value: 250, color: '#f59e0b' },
      { value: 500, color: '#ef4444' },
    ],
  },
  connections: {
    label: 'TCP CONNECTIONS',
    unit: '',
    min: 0, max: 300,
    thresholds: [
      { value: 100, color: '#10b981' },
      { value: 200, color: '#f59e0b' },
      { value: 300, color: '#ef4444' },
    ],
  },
};
