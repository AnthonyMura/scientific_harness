// Gear popover: per-module settings controls (number steppers, toggles, selects).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ModuleSettings, SettingControl, SettingValue } from "../modules/settings";

interface Props {
  x: number;
  y: number;
  title: string;
  controls: SettingControl[];
  values: ModuleSettings;
  onChange: (key: string, value: SettingValue) => void;
  onClose: () => void;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function NumberControl({ c, value, onChange }: { c: SettingControl; value: number; onChange: Props["onChange"] }) {
  const min = c.min ?? 0;
  const max = c.max ?? 100;
  const step = c.step ?? 1;
  return (
    <span className="set-ctl">
      <button type="button" className="mini" onClick={() => onChange(c.key, Math.max(min, round(value - step)))} aria-label={"decrease " + c.label}>
        −
      </button>
      <span className="set-val">
        {value}
        {c.unit ? ` ${c.unit}` : ""}
      </span>
      <button type="button" className="mini" onClick={() => onChange(c.key, Math.min(max, round(value + step)))} aria-label={"increase " + c.label}>
        +
      </button>
    </span>
  );
}

function SelectControl({ c, value, onChange }: { c: SettingControl; value: string; onChange: Props["onChange"] }) {
  return (
    <select className="set-select" value={value} aria-label={c.label} onChange={(e) => onChange(c.key, e.target.value)}>
      {(c.options ?? []).map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export default function SettingsMenu({ x, y, title, controls, values, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  // Sub-settings (visibleWhen) only render while their parent setting matches.
  const visible = controls.filter((c) => !c.visibleWhen || values[c.visibleWhen.key] === c.visibleWhen.value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
    if (ny + r.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="menu settings" ref={ref} style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={title}>
      <div className="menu-title">{title}</div>
      {visible.length === 0 ? (
        <div className="menu-empty">No settings yet.</div>
      ) : (
        visible.map((c) => (
          <div key={c.key} className="set-row">
            <span className="set-label">{c.label}</span>
            {c.kind === "number" ? (
              <NumberControl c={c} value={typeof values[c.key] === "number" ? (values[c.key] as number) : 0} onChange={onChange} />
            ) : c.kind === "select" ? (
              <SelectControl c={c} value={typeof values[c.key] === "string" ? (values[c.key] as string) : ""} onChange={onChange} />
            ) : (
              <button
                type="button"
                className={"set-toggle" + (values[c.key] ? " on" : "")}
                onClick={() => onChange(c.key, !values[c.key])}
              >
                {values[c.key] ? "On" : "Off"}
              </button>
            )}
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}
