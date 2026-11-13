import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js";

// Public Firebase web-app configuration. Do not add service-account credentials here.
const firebaseConfig = {
  apiKey: "AIzaSyDO49GeE91KRk-CYXdHbIvwugAf-_WyFXs",
  authDomain: "it-pulse-5a341.firebaseapp.com",
  projectId: "it-pulse-5a341",
  storageBucket: "it-pulse-5a341.firebasestorage.app",
  messagingSenderId: "913169922836",
  appId: "1:913169922836:web:69c536ca1cacdb86eca001"
};

// Public Web Push certificate key supplied from Firebase Console.
const vapidKey = "BOShbOEK3c1wzVs9ELfWd17dLc3qY7mk_C6qvd6CYe_UOcNzbZ0XRzcRnZACA-RcDkX1Jn3ILe__WiUnFENPi94";

const enableButton = document.querySelector("#enablePush");
const statusText = document.querySelector("#pushStatus");
const tokenOutput = document.querySelector("#tokenOutput");
const copyButton = document.querySelector("#copyToken");

function setStatus(message, kind = "") {
  statusText.textContent = message;
  statusText.className = `status ${kind}`;
}

async function enableNotifications() {
  enableButton.disabled = true;
  setStatus("Checking browser support…");
  try {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      throw new Error("This browser does not support web push notifications.");
    }
    if (!(await isSupported())) {
      throw new Error("Firebase Messaging is not supported in this browser. On iPhone, open the installed Home Screen app using a supported iOS version.");
    }
    if (window.location.protocol !== "https:") {
      throw new Error("Notifications require a secure HTTPS connection.");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error(permission === "denied"
        ? "Notifications are blocked. Enable them in your device settings and try again."
        : "Notification permission was not granted.");
    }

    const app = initializeApp(firebaseConfig);
    const messaging = getMessaging(app);
    const swUrl = new URL("./firebase-messaging-sw.js", window.location.href);
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: new URL("./", window.location.href).pathname
    });

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token) throw new Error("Firebase did not return a device token. Please try again.");
    tokenOutput.value = token;
    copyButton.disabled = false;
    setStatus("This device is registered with Firebase. The sending backend is the next step.", "ok");

    onMessage(messaging, payload => {
      const title = payload.notification?.title || "IT Pulse update";
      const body = payload.notification?.body || "You have a new IT intelligence update.";
      setStatus(`Foreground message received: ${title} — ${body}`, "ok");
    });
  } catch (error) {
    console.error("IT Pulse notification setup:", error);
    setStatus(error.message || "Could not enable notifications. Check the browser console.", "error");
  } finally {
    enableButton.disabled = false;
  }
}

enableButton.addEventListener("click", enableNotifications);
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(tokenOutput.value);
    copyButton.textContent = "Copied";
    setTimeout(() => copyButton.textContent = "Copy device token", 1600);
  } catch {
    tokenOutput.select();
    setStatus("Select and copy the token manually.", "");
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(new URL("./firebase-messaging-sw.js", window.location.href), {
    scope: new URL("./", window.location.href).pathname
  }).catch(err => console.warn("Service worker registration:", err));
}
