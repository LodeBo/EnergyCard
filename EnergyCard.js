/*!
 * 🟢 EnergyCard 1.6.0 (Legend Gap & Settings Restored)
 */

(() => {
  const TAG = "energy-card";
  const VERSION = "1.6.0";

  class EnergyCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._hass = null;
      this._config = null;
      this._lastStates = null;
    }

    static getStubConfig() {
      return {
        segments: [],
        center_mode: "total",
        center_entity: "",
        center_unit: "kWh",
        center_decimals: 2,
        center_font_scale: 0.35,
        top_label_text: "",
        top_label_weight: 400,
        top_label_color: "#ffffff",
        text_color_inside: "#ffffff",
        top_label_font_scale: 0.40,
        top_label_offset_y: -5,
        ring_radius: 80,
        ring_width: 14,
        ring_offset_y: 10,
        label_ring_gap: 5,
        background: "var(--card-background-color)",
        border_radius: "16px",
        border: "none",
        box_shadow: "0 4px 30px rgba(0, 0, 0, 0.05)",
        padding: "24px",
        track_color: "#000000",
        track_opacity: 0.0,
        card_height: "",
        min_total: 0,
        show_legend: true,
        legend_position: "right",
        legend_value_mode: "both",
        legend_percent_decimals: 1,
        legend_font_scale: 1.1,
        legend_gap: 50, // Nieuwe instelling voor de spatie!
        segment_label_mode: "none",
        segment_label_decimals: 1,
        segment_label_min_angle: 12,
        segment_label_offset: 30,
        segment_font_scale: 0.15,
        segment_gap_width: 3,
        segment_gap_color: "transparent",
      };
    }

    setConfig(config) {
      const base = EnergyCard.getStubConfig();
      this._config = { ...base, ...config, segments: config.segments || base.segments };
      this._lastStates = null;
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._config || !this._config.segments) return;
      this._render();
    }

    _clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    _toRad(d) { return (d * Math.PI) / 180; }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const h = this._hass;

      const segDefs = Array.isArray(c.segments) ? c.segments : [];
      if (!segDefs.length) return;

      const segs = [];
      let total = 0;

      for (const s of segDefs) {
        if (!s || !s.entity) continue;
        const st = h.states?.[s.entity];
        if (!st) continue;
        const raw = String(st.state ?? "0").replace(",", ".");
        let v = Number(raw);
        if (!isFinite(v)) v = 0;
        if (v < 0) v = 0;
        total += v;
        segs.push({
          entity: s.entity,
          label: s.label || s.entity,
          color: s.color || "#ffffff",
          value: v,
          unit: st.attributes?.unit_of_measurement || "",
          rawState: st.state,
        });
      }

      const minTotal = Number(c.min_total ?? 0);
      if (total < minTotal) total = 0;

      const R = Number(c.ring_radius || 65);
      const W = Number(c.ring_width || 12);
      const cx = 130;
      const cy = 130 + Number(c.ring_offset_y || 0);
      const trackOpacity = Number(c.track_opacity ?? 0);
      const trackColor = c.track_color || "#000000";

      const arcSeg = (a0, a1, sw, color) => {
        const x0 = cx + R * Math.cos(this._toRad(a0));
        const y0 = cy + R * Math.sin(this._toRad(a0));
        const x1 = cx + R * Math.cos(this._toRad(a1));
        const y1 = cy + R * Math.sin(this._toRad(a1));
        const large = (a1 - a0) > 180 ? 1 : 0;
        return `<path d="M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt"/>`;
      };

      let svg = `<svg viewBox="0 0 260 260" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;

      if (trackOpacity > 0) {
        svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${trackColor}" stroke-width="${W}" opacity="${trackOpacity}"/>`;
      }

      if (total > 0 && segs.length) {
        let angleCursor = -90;
        for (const s of segs) {
          const frac = this._clamp(s.value / total, 0, 1);
          let span = frac * 360;
          if (span >= 360) span = 359.999;
          if (span <= 0) { s._startAngle = s._endAngle = angleCursor; continue; }
          const start = angleCursor;
          const end = angleCursor + span;
          angleCursor = end;
          s._startAngle = start;
          s._endAngle = end;
          svg += arcSeg(start, end, W, s.color);
        }
      }

      if ((c.top_label_text ?? "").trim() !== "") {
        const fsTop = R * (Number(c.top_label_font_scale) || 0.35);
        const yTop = (cy - R) - (W * 0.8) - fsTop * 0.25 - Number(c.label_ring_gap || 0) + Number(c.top_label_offset_y || 0);
        svg += `<text x="${cx}" y="${yTop}" font-size="${fsTop}" font-weight="${c.top_label_weight || 400}" fill="${c.top_label_color || "#ffffff"}" text-anchor="middle" dominant-baseline="middle">${c.top_label_text}</text>`;
      }

      const centerMode = c.center_mode || "total";
      let centerText = "";
      if (centerMode === "total") {
        centerText = `${total.toFixed(Number(c.center_decimals || 0))} ${c.center_unit || ""}`.trim();
      }
      if (centerText) {
        const fsCenter = R * (Number(c.center_font_scale) || 0.40);
        svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="${fsCenter}" font-weight="400" fill="${c.text_color_inside || "#ffffff"}" dominant-baseline="middle">${centerText}</text>`;
      }

      const gapWidth = Number(c.segment_gap_width ?? 0);
      if (gapWidth > 0 && segs.length > 1) {
        const gapColor = (c.segment_gap_color && c.segment_gap_color !== "auto") ? c.segment_gap_color : (c.background || "var(--card-background-color)");
        const rInner = R - W / 2 - 1, rOuter = R + W / 2 + 1;
        for (let i = 0; i < segs.length; i++) {
          if (segs[i]._endAngle === undefined) continue;
          const rad = this._toRad(segs[i]._endAngle);
          svg += `<line x1="${cx + rInner * Math.cos(rad)}" y1="${cy + rInner * Math.sin(rad)}" x2="${cx + rOuter * Math.cos(rad)}" y2="${cy + rOuter * Math.sin(rad)}" stroke="${gapColor}" stroke-width="${gapWidth}" stroke-linecap="butt"/>`;
        }
      }
      svg += `</svg>`;

      let legendHtml = "";
      if (c.show_legend !== false && total > 0 && segs.length) {
        const valDec = Number(c.center_decimals || 0), pctDec = Number(c.legend_percent_decimals || 1);
        legendHtml = `<div class="legend">`;
        for (const s of segs) {
          const pctStr = `${(total > 0 ? (s.value / total) * 100 : 0).toFixed(pctDec)}%`;
          const valStr = isFinite(s.value) ? s.value.toFixed(valDec) : s.rawState;
          let rightText = c.legend_value_mode === "value" ? `${valStr} ${s.unit}` : c.legend_value_mode === "percent" ? pctStr : `${valStr} ${s.unit} (${pctStr})`;
          legendHtml += `<div class="legend-item"><div class="legend-left"><span class="legend-color" style="background:${s.color};"></span><span class="legend-label">${s.label}</span></div><span class="legend-value">${rightText}</span></div>`;
        }
        legendHtml += `</div>`;
      }

      const isRight = c.legend_position === "right";
      const legendGap = c.legend_gap !== undefined ? c.legend_gap : 32;

      this.shadowRoot.innerHTML = `
        <style>
          :host { display:block; width:100%; height:100%; }
          ha-card { background:${c.background}; border-radius:${c.border_radius}; border:${c.border}; box-shadow:${c.box_shadow}; padding:${c.padding}; width:100%; height:100%; box-sizing:border-box; display:flex; }
          .wrap { width: 100%; height: 100%; margin: 0 auto; display: flex; flex-direction: ${isRight ? 'row' : 'column'}; align-items: center; justify-content: center; position: relative; box-sizing: border-box; padding: 0 12px; gap: ${isRight ? legendGap + 'px' : '8px'}; }
          .chart-container { flex: 0 0 auto; width: 220px; display: flex; align-items: center; justify-content: center; }
          svg { width:100%; height:100%; display:block; }
          .legend { display: flex; flex-direction: column; justify-content: center; gap: 12px; font-size: ${0.85 * (Number(c.legend_font_scale) || 1.0)}rem; flex: 0 1 auto; min-width: 160px; }
          .legend-item { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; }
          .legend-left { display: flex; align-items: center; }
          .legend-color { width:${0.85 * (Number(c.legend_font_scale) || 1.0) * 0.9}rem; height:${0.85 * (Number(c.legend_font_scale) || 1.0) * 0.9}rem; border-radius:50%; margin-right:12px; box-shadow:0 0 0 1px rgba(0,0,0,0.4); flex-shrink: 0 !important; }
          .legend-value { flex-shrink:0; text-align:right; font-variant-numeric:tabular-nums; font-weight: 500; }
        </style>
        <ha-card><div class="wrap"><div class="chart-container">${svg}</div>${legendHtml}</div></ha-card>
      `;
    }
    getCardSize() { return 4; }
  }
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, EnergyCard);
    window.customCards = window.customCards || [];
    window.customCards.push({ type: "energy-card", name: "EnergyCard", description: "Custom Energy Card v1.2.0", preview: true });
    console.info(`🟢 ${TAG} v${VERSION} geladen`);
  } catch (e) { console.error("❌ Fout bij registratie EnergyCard:", e); }
})();
