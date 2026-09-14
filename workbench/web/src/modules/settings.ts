// Per-module settings, persisted to localStorage and applied live.
import { useCallback, useState } from "react";

export interface SettingControl {
  kind: "number" | "toggle" | "select";
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Allowed values for `kind: "select"` controls. */
  options?: readonly string[];
  /** When set, the row is shown only while another setting has this value — a sub-setting. */
  visibleWhen?: { key: string; value: string };
}

export type SettingValue = number | boolean | string;
export type ModuleSettings = Record<string, SettingValue>;

const KEY = "workbench.settings.v1";

type AllSettings = Record<string, ModuleSettings>;

function load(): AllSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as AllSettings;
    return {};
  } catch {
    return {};
  }
}

function save(all: AllSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage unavailable (private mode) — settings stay in memory
  }
}

/**
 * Settings for one module: stored values merged over the module defaults.
 * `defaults` must be a stable reference (module-level constant).
 */
export function useModuleSettings(
  moduleId: string,
  defaults: ModuleSettings,
): [ModuleSettings, (key: string, value: SettingValue) => void] {
  const [all, setAll] = useState<AllSettings>(load);
  const update = useCallback(
    (key: string, value: SettingValue) => {
      setAll((prev) => {
        const next: AllSettings = {
          ...prev,
          [moduleId]: { ...(prev[moduleId] ?? {}), [key]: value },
        };
        save(next);
        return next;
      });
    },
    [moduleId],
  );
  return [{ ...defaults, ...(all[moduleId] ?? {}) }, update];
}
