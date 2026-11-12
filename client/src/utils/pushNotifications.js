import axios from "axios";
import { server } from "../constants/config";
import { getDeviceMetadata } from "./device";

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function subscribeBrowserPushNotifications() {
  if (!isWebPushSupported()) {
    return { supported: false, reason: "Push notifications are not supported on this browser." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { supported: true, permission, subscribed: false, reason: "Notification permission denied." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const { data } = await axios.get(`${server}/api/v1/notifications/webpush/vapid-key`, {
    withCredentials: true,
  });
  const vapidPublicKey = data?.publicKey;
  if (!vapidPublicKey) {
    return {
      supported: true,
      permission,
      subscribed: false,
      reason: "Browser notifications allowed; server VAPID public key is not configured yet.",
    };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  await axios.post(
    `${server}/api/v1/notifications/webpush/subscribe`,
    {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh || "",
      auth: json.keys?.auth || "",
      device_id: getDeviceMetadata().device_id,
    },
    { withCredentials: true }
  );

  return { supported: true, permission, subscribed: true };
}

