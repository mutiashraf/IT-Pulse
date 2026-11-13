# IT Pulse — starter PWA

This is the first-stage installable web-app shell. It is a visual prototype only:
- It does not yet fetch live IT news.
- It does not yet send remote push notifications.
- The service worker and web app manifest are included as the foundation.

## Deploy
Host the contents of this folder on an HTTPS static host. GitHub Pages or another static host can be used for the first prototype. Keep the folder structure intact.

## Install on iPhone
1. Open the HTTPS site in Safari.
2. Tap Share.
3. Choose Add to Home Screen.
4. Open IT Pulse from the new Home Screen icon.

## Next development stages
1. Add a Web Push subscription flow and VAPID public/private keys.
2. Add a secure backend endpoint to store subscriptions and send push messages.
3. Connect trusted official feeds/status sources and deduplicate alerts.
4. Add a scheduled daily 18:30 Asia/Karachi briefing.

Do not put VAPID private keys or other secrets in browser JavaScript.
