# IT Pulse notification update

## Replace these files in the GitHub repository root
- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`

Add:
- `firebase-messaging-sw.js`

Keep the existing `icons/` folder and icon files.

## Important
1. Keep the repository path exactly `/IT-Pulse/` (capitalization matters).
2. Firebase Cloud Messaging requires a trusted sending backend. This update registers the browser and obtains an FCM device token; it does NOT send notifications by itself.
3. Do not put Firebase service-account JSON, private VAPID keys, or other server secrets in this repository.
4. Test on iOS 16.4+ by opening the published site in Safari, adding it to the Home Screen, launching the installed app, and tapping Enable notifications.
5. The browser token is private device-registration data. Do not publish or share it in public GitHub issues.
6. If Firebase reports that the sender is not authorized, check that Firebase Cloud Messaging API is enabled and the Web Push certificate is configured in the same Firebase project.
