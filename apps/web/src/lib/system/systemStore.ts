import { useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Tiny global store for the app-wide system states that no single page owns:
 * "you were signed out" (a 401 whose refresh failed), maintenance (a 503 with
 * `x-maintenance: 1`) and queued system toasts (rate limit, upload failed).
 * The API client publishes into it; `SessionExpiredDialog`, the maintenance
 * gate and `SystemNoticeHost` read from it. It is a module singleton on
 * purpose: the API client lives outside React.
 */
export interface SystemNotice {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly tone: 'error' | 'info';
  readonly icon?: LucideIcon;
  readonly action?: { readonly label: string; readonly onClick: () => void };
  /** ms until auto-dismiss; omit for a toast that stays until dismissed. */
  readonly duration?: number;
}

export interface MaintenanceState {
  readonly active: boolean;
  /** Minutes the API said maintenance would last, when it said. */
  readonly etaMinutes: number | null;
}

interface SystemState {
  readonly sessionExpired: boolean;
  readonly maintenance: MaintenanceState;
  readonly notices: readonly SystemNotice[];
}

const INITIAL: SystemState = {
  sessionExpired: false,
  maintenance: { active: false, etaMinutes: null },
  notices: [],
};

let state: SystemState = INITIAL;
const listeners = new Set<() => void>();
let noticeSeq = 0;

function set(next: SystemState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getSystemState(): SystemState {
  return state;
}

export function useSystemState(): SystemState {
  return useSyncExternalStore(subscribe, getSystemState, getSystemState);
}

export function raiseSessionExpired(): void {
  if (!state.sessionExpired) set({ ...state, sessionExpired: true });
}

export function clearSessionExpired(): void {
  if (state.sessionExpired) set({ ...state, sessionExpired: false });
}

export function setMaintenance(active: boolean, etaMinutes: number | null = null): void {
  const cur = state.maintenance;
  if (cur.active === active && cur.etaMinutes === etaMinutes) return;
  set({ ...state, maintenance: { active, etaMinutes } });
}

/** Queues a toast; returns its id. A notice with the same `key` replaces the old one. */
export function publishNotice(notice: Omit<SystemNotice, 'id'>, key?: string): string {
  noticeSeq += 1;
  const id = key ?? `notice-${String(noticeSeq)}`;
  set({ ...state, notices: [...state.notices.filter((n) => n.id !== id), { ...notice, id }] });
  return id;
}

export function dismissNotice(id: string): void {
  if (!state.notices.some((n) => n.id === id)) return;
  set({ ...state, notices: state.notices.filter((n) => n.id !== id) });
}

/** Test seam: back to the initial state. */
export function resetSystemState(): void {
  state = INITIAL;
  noticeSeq = 0;
  listeners.forEach((fn) => fn());
}
