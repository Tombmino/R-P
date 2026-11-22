// Thin localStorage wrapper. Every key is namespaced with STORAGE_PREFIX,
// so the app's brand name never ends up in storage and renames are safe.
// Values are JSON. If a saved value is damaged or missing, we return
// fallback instead of throwing, so the app can always start up.

import { STORAGE_PREFIX } from './config.js';

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

export function removeKey(key) {
  localStorage.removeItem(STORAGE_PREFIX + key);
}
