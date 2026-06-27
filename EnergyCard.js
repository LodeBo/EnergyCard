/*!
 * 🟢 EnergyCard 1.4.0 (Stabiele Basis Update)
 * Multi-segment donut voor Home Assistant - Werkt in alle standaard rasters en kolommen
 */

(() => {
  const TAG = "energy-card";
  const VERSION = "1.4.0";

  class EnergyCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._hass = null;
      this._config = null;
    }

    static getStubConfig() {
      return {
        segments: [
          { entity: "sensor.example_1", label: "Zone 1", color: "#f97316" },
          { entity: "sensor.example_2", label: "Zone 2", color: "#22c55e" },
        ],
        center_mode: "total",
        center_unit: "kWh",
        center_decimals: 2,
        center_font_scale: 0.20,
        top_label_text: "Energie",
        top_label_color: "#ffffff",
        ring_radius: 80,
        ring_width: 12,
        background: "var(--card-background-color)",
        border_radius: "12px",
        padding: "12px",
        show_legend: true,
        legend_position: "right",
        segment_label_mode: "none",
        segment_gap_width: 2
      };
    }

    setConfig(config) {
      if (!config) {
        throw new Error("Ongeldige configuratie");
      }
      const base = EnergyCard.getStubConfig();
      this._config = {
        ...base,
        ...config,
        segments: config.segments || base.segments,
      };
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    _toRad(d) {
      return (d * Math.PI) / 180;
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const h = this._hass;

      // Basis CSS opbouwen zodat de kaart ALTIJD een geldige HTML-structuur heeft (voorkomt editor crashes)
      const style = `
        <style>
          :host { display: block; width: 100%; height: 100%; }
          ha-card {
            background: ${c.background};
            border-radius: ${c.border_radius};
            padding: ${c.padding};
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            height: 100%;
          }
          .wrap {
            display: flex;
            flex-direction: ${c.legend_position === "right" ? "row" : "column"};
            align-items: center;
            justify-content: center;
            gap: 16px;
            width: 100%;
          }
          .chart-container {
            width: 100%;
            max-width: 180px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          svg { width: 100%; height: auto; display: block; }
          .legend {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 0.85rem;
            width: 100%;
          }
          .legend-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }
          .legend-left { display: flex; align-items: center; min-width: 0; }
          .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
            flex-shrink: 0;
          }
          .legend-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-text-color); }
          .legend-value { font-weight: 500; font-variant-numeric: tabular-nums; color: var(--primary-text-color); flex-shrink: 0; }
          .error { color: var(--error-color); text-align: center; font-size: 0.9rem; padding: 10px; }
        </style>
      `;

      const segDefs = Array.isArray(c.segments) ? c.segments : [];
      if (segDefs.length === 0) {
        this.shadowRoot.innerHTML = `${style}<ha-card><div class="error">Voeg segmenten toe in de YAML</div></ha-card>`;
        return;
      }

      const segs = [];
      let total = 0;

      for (const s of segDefs) {
        if (!s || !s.entity) continue;
        const st = h.states?.[s.entity];
        const raw = String(st ? st.state : "0").replace(",", ".");
        let v = Number(raw);
        if (!isFinite(v) || v < 0) v = 0;
        total += v;
        segs.push({
          label: s.label || s.entity,
          color: s.color || "#ffffff",
          value: v,
          unit: st?.attributes?.unit_of_measurement || "kWh"
        });
      }

      const R = Number(c.ring_radius || 80);
      const W = Number(c.ring_width || 12);
      const cx = 130;
      const cy = 130;

      let svgPaths = "";
      if (total > 0) {
        let angleCursor = -90;
        for (const s of segs) {
          const frac = Math.max(0, Math.min(1, s.value / total));
          let span = frac * 360;
          if (span >= 360) span = 359.99;
          if (span <= 0) continue;

          const start = angleCursor;
          const end = angleCursor + span;
          angleCursor = end;

          const x0 = cx + R * Math.cos(this._toRad(start));
          const y0 = cy + R * Math.sin(this._toRad(start));
          const x1 = cx + R * Math.cos(this._toRad(end));
          const y1 = cy + R * Math.sin(this._toRad(end));
          const large = span > 180 ? 1 : 0;

          svgPaths += `<path d="M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="${s.color}" stroke-width="${W}" />`;
        }
      } else {
        // Lege ring tonen als er geen data is
        svgPaths = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--disabled-text-color)" stroke-width="${W}" opacity="0.2" />`;
      }

      // Midden tekst
      const fsCenter = R * Number(c.center_font_scale || 0.20);
      const centerText = `${total.toFixed(Number(c.center_decimals || 2))} ${c.center_unit}`;

      let svg = `
        <svg viewBox="0 0 260 260" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
          ${svgPaths}
          <text x="${cx}" y="${cy}" text-anchor="middle" font-size="${fsCenter}" fill="var(--primary-text-color)" dominant-baseline="middle">${centerText}</text>
        </svg>
      `;

      // Legenda HTML bouwen
      let legendHtml = "";
      if (c.show_legend !== false) {
        legendHtml = `<div class="legend">`;
        for (const s of segs) {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          legendHtml += `
            <div class="legend-item">
              <div class="legend-left">
                <span class="legend-color" style="background:${s.color};"></span>
                <span class="legend-label">${s.label}</span>
              </div>
              <span class="legend-value">${s.value.toFixed(Number(c.center_decimals || 2))} ${s.unit} (${pct.toFixed(1)}%)</span>
            </div>
          `;
        }
        legendHtml += `</div>`;
      }

      this.shadowRoot.innerHTML = `
        ${style}
        <ha-card>
          <div class="wrap">
            <div class="chart-container">${svg}</div>
            ${legendHtml}
          </div>
        </ha-card>
      `;
    }

    getCardSize() { return 3; }
  }

  try {
    if (!customElements.get(TAG)) {
      customElements.define(TAG, EnergyCard);
    }
    window.customCards = window.customCards || [];
    const exists = window.customCards.some(c => c.type === TAG);
    if (!exists) {
      window.customCards.push({
        type: TAG,
        name: "EnergyCard",
        description: "Stabiele Donut Energiekaart",
        preview: true,
      });
    }
    console.info(`.js code succesvol ingeladen onder tag: ${TAG}`);
  } catch (e) {
    console.error("Registratiefout:", e);
  }
})();
