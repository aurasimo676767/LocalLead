"use client";
import { useSyncExternalStore } from "react";

// The leads found by the last discovery search, in result order. Lead detail
// pages opened from those results step through this list only, so the arrows
// stay on the city just scanned instead of the whole workspace.
const key = "locallead.scan-batch";
const listeners = new Set<() => void>();

export function saveScanBatch(ids: string[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage unavailable: detail pages fall back to the full lead list.
  }
  listeners.forEach((listener) => listener());
}

function read() {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useScanBatch(): string[] | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  if (!raw) return null;
  try {
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) && ids.every((id) => typeof id === "string")
      ? ids
      : null;
  } catch {
    return null;
  }
}
