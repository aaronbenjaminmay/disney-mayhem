import { supabase, tripId } from './supabaseClient';

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function isPushSubscriptionConfigured(): boolean {
  return Boolean(supabase && tripId && vapidPublicKey);
}

export function hasVapidPublicKey(): boolean {
  return Boolean(vapidPublicKey);
}

export function hasPushSubscriptionStorage(): boolean {
  return Boolean(supabase && tripId);
}

export function isPushSubscriptionSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return buffer;
}

function getDeviceName(): string {
  const platform = navigator.platform || 'Unknown platform';
  const browser = navigator.userAgent.includes('CriOS')
    ? 'Chrome iOS'
    : navigator.userAgent.includes('EdgiOS')
      ? 'Edge iOS'
      : navigator.userAgent.includes('Safari') && navigator.userAgent.includes('Mobile')
        ? 'Mobile Safari'
        : navigator.userAgent.includes('Chrome')
          ? 'Chrome'
          : navigator.userAgent.includes('Firefox')
            ? 'Firefox'
            : 'Browser';

  return `${browser} · ${platform}`;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSubscriptionSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function savePushSubscription(subscription: PushSubscription) {
  if (!supabase || !tripId) throw new Error('Supabase push subscription storage is not configured.');

  const row = {
    trip_id: tripId,
    endpoint: subscription.endpoint,
    subscription: subscription.toJSON(),
    enabled: true,
    device_name: getDeviceName(),
  };

  const { error } = await supabase.from('push_subscriptions').upsert(row, {
    onConflict: 'endpoint',
  });

  if (error) throw error;
  console.log('Disney Mayhem push Supabase save/update result', { endpoint: subscription.endpoint, enabled: true });
}

export async function getStoredPushSubscriptionEnabled(endpoint: string): Promise<boolean | undefined> {
  if (!supabase || !tripId) return undefined;

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('enabled')
    .eq('trip_id', tripId)
    .eq('endpoint', endpoint)
    .maybeSingle();

  if (error) {
    console.warn('Disney Mayhem push Supabase enabled check failed', error);
    return undefined;
  }

  return typeof data?.enabled === 'boolean' ? data.enabled : undefined;
}

export async function subscribeToPushNotifications(): Promise<PushSubscription> {
  if (!isPushSubscriptionSupported()) throw new Error('Push notifications are not supported in this browser.');
  if (!vapidPublicKey) throw new Error('VAPID public key is not configured.');

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
    }));

  await savePushSubscription(subscription);
  return subscription;
}

export async function disablePushSubscription(subscription: PushSubscription) {
  if (supabase && tripId) {
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ enabled: false })
      .eq('trip_id', tripId)
      .eq('endpoint', subscription.endpoint);

    if (error) throw error;
    console.log('Disney Mayhem push Supabase save/update result', { endpoint: subscription.endpoint, enabled: false });
  }

  await subscription.unsubscribe();
}
