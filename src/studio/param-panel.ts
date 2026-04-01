/**
 * Parameter panel — renders sliders for live params.
 */

import type { ParamDef } from "../engine/types.js";

export type ParamChangeCallback = (name: string, value: number) => void;

export class ParamPanel {
  private container: HTMLElement;
  private onChange: ParamChangeCallback;
  private values: Map<string, number> = new Map();
  private definitions: ParamDef[] = [];

  constructor(container: HTMLElement, onChange: ParamChangeCallback) {
    this.container = container;
    this.onChange = onChange;
  }

  /** Rebuild sliders from param definitions. */
  setParams(params: ParamDef[]): void {
    this.definitions = params;
    this.container.innerHTML = "";

    if (params.length === 0) {
      this.container.innerHTML = '<h2>Parameters</h2><p style="color:var(--text-muted);font-size:11px;">No params defined</p>';
      return;
    }

    const header = document.createElement("h2");
    header.textContent = "Parameters";
    this.container.appendChild(header);

    for (const p of params) {
      const group = document.createElement("div");
      group.className = "param-group";

      const label = document.createElement("label");
      const nameSpan = document.createElement("span");
      nameSpan.textContent = p.name + (p.unit ? ` (${p.unit})` : "");
      const valSpan = document.createElement("span");
      valSpan.className = "val";
      valSpan.dataset.paramValue = p.name;
      valSpan.textContent = String(p.value);
      label.appendChild(nameSpan);
      label.appendChild(valSpan);

      const input = document.createElement("input");
      input.type = "range";
      input.dataset.param = p.name;
      input.min = String(p.min ?? 0);
      input.max = String(p.max ?? p.value * 3);
      input.step = String(p.step ?? 1);
      input.value = String(this.values.get(p.name) ?? p.value);
      input.dataset.paramName = p.name;

      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        valSpan.textContent = String(v);
        this.values.set(p.name, v);
        this.onChange(p.name, v);
      });

      group.appendChild(label);
      group.appendChild(input);
      this.container.appendChild(group);
    }
  }

  /** Get current parameter values. */
  getValues(): Map<string, number> {
    return new Map(this.values);
  }

  /** Replace panel values from an external source (e.g. live session). */
  setValues(values: Record<string, number>): void {
    for (const [name, value] of Object.entries(values)) {
      this.values.set(name, value);
      const input = this.container.querySelector<HTMLInputElement>(`input[data-param-name="${CSS.escape(name)}"]`);
      if (input) input.value = String(value);
      const valEl = this.container.querySelector<HTMLElement>(`[data-param-value="${CSS.escape(name)}"]`);
      if (valEl) valEl.textContent = String(value);
    }
  }

  getValueObject(): Record<string, number> {
    return Object.fromEntries(this.values.entries());
  }

  getParamDefinitions(): ParamDef[] {
    return [...this.definitions];
  }

  /**
   * Programmatically set a single param value and update the slider UI if rendered.
   * Used by the __cadlad.setParam() automation surface.
   */
  setValue(name: string, value: number): void {
    this.values.set(name, value);
    const slider = this.container.querySelector<HTMLInputElement>(`input[data-param="${CSS.escape(name)}"]`);
    if (slider) {
      slider.value = String(value);
      const valSpan = slider.closest(".param-group")?.querySelector<HTMLElement>(".val");
      if (valSpan) valSpan.textContent = String(value);
    }
  }
}
