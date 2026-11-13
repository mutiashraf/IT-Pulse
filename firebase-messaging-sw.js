/* Firebase Cloud Messaging background service worker for IT Pulse.
   This file must remain at the root of the /IT-Pulse/ GitHub Pages project. */
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDO49GeE91KRk-CYXdHbIvwugAf-_WyFXs",
  authDomain: "it-pulse-5a341.firebaseapp.com",
  projectId: "it-pulse-5a341",
  storageBucket: "it-pulse-5a341.firebasestorage.app",
  messagingSenderId: "913169922836",
  appId: "1:913169922836:web:69c536ca1cacdb86eca001"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "IT Pulse";
  const options = {
    body: payload.notification?.body || "A new IT intelligence update is available.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: payload.fcmOptions?.link || "./" }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.location.href).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ("focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
