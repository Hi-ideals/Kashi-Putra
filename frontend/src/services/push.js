import { post, get } from './api';

const b64ToUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Ask permission and register this browser for push notifications. */
export async function enablePush(vapidKey) {
  if (!pushSupported()) throw new Error('Notifications are not supported in this browser.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not granted.');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW());
  await navigator.serviceWorker.ready;
  let key = vapidKey;
  if (!key) key = (await get('/notifications/vapid-key')).data.publicKey;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
  const json = sub.toJSON();
  await post('/notifications/subscribe', { endpoint: json.endpoint, keys: json.keys });
  return true;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) { await post('/notifications/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
}
