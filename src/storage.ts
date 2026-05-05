import type { CrmState } from "./types";

const KEY = "lawyer-crm-state-v1";

export function loadState(): CrmState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CrmState;
  } catch {
    return null;
  }
}

export function saveState(state: CrmState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function defaultState(): CrmState {
  return { clients: [], cases: [], appointments: [] };
}
