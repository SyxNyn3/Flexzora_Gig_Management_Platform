// Web Push — subscribe this device to crew alerts.
// Flag-gated: without VITE_VAPID_PUBLIC_KEY the helpers return available=false
// and the UI hides the toggle. Server-side delivery additionally needs
// VAPID_PRIVATE_KEY, PUSH_INTERNAL_SECRET and app.push_fn_url/app.push_internal_secret
// settings on the database (see docs/BACKLOG.md — SmartAlerts transports).

import { supabase } from '@/lib/supabase';

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!vapidPublicKey
  );
}

const urlB64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Url);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Subscribe this device + register the endpoint server-side. */
export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Push is not available on this device/deployment' };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, error: 'Notification permission denied' };

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(vapidPublicKey!) as BufferSource,
    });

    const json = subscription.toJSON();
    const { error } = await supabase.functions.invoke('save-push-subscription', {
      body: { endpoint: json.endpoint, keys: json.keys },
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.functions.invoke('save-push-subscription', {
        body: { endpoint: subscription.endpoint, unsubscribe: true },
      });
      await subscription.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Whether this device currently has an active push subscription. */
export async function hasPushSubscription(): Promise<boolean> {
  try {
    if (!pushSupported()) return false;
    const registration = await navigator.serviceWorker.ready;
    return !!(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}
