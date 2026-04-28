import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '';

function base64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const webPushService = {
  async ensureSubscribed(userId) {
    if (!userId) throw new Error('Missing user id for push subscription.');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Push is not supported in this browser.');
    }
    if (!VAPID_PUBLIC_KEY) {
      throw new Error('Missing VITE_WEB_PUSH_PUBLIC_KEY.');
    }

    const registration = await navigator.serviceWorker.register('/sw-notifications.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) return;

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        [{
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        }],
        { onConflict: 'endpoint' },
      );
    if (error) throw error;
  },

  async showLocalNotification(title, body, url = '/') {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          data: { url },
        });
        return;
      }
    }

    const n = new Notification(title, { body });
    n.onclick = () => {
      window.focus();
      window.location.assign(url);
    };
  },
};
