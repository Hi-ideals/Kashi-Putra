/** Lets the header know which edition is open (to highlight its category in the menu). */
import { useSyncExternalStore } from 'react';

let current = null;
const subs = new Set();

export function setCurrentEdition(e) {
  const next = e ? { id: e.id, category_id: e.category_id, slug: e.slug } : null;
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  subs.forEach((f) => f());
}

export const useCurrentEdition = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);
