/** Tiny external store powering the global confirmation dialog. */
let state = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export const confirmStore = {
  get: () => state,
  subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  close: () => { state = null; emit(); },
};

/** `if (await confirm({ message: 'Delete?' })) …` */
export function confirm(opts) {
  return new Promise((resolve) => {
    state = { ...(typeof opts === 'string' ? { message: opts } : opts), resolve };
    emit();
  });
}
