# IT Pulse

A personal IT news dashboard with GitHub Actions monitoring and Firebase Cloud Messaging alerts.

## Current implementation

- The website reads recent public RSS feeds from selected security, vendor, cloud status, Linux and Pakistan technology sources.
- The GitHub Actions workflow runs monitoring every 30 minutes, with a separate daily briefing run scheduled for 6:30 PM Pakistan Standard Time (13:30 UTC).
- Only newly detected HIGH and CRITICAL items trigger push notifications.
- A manual workflow run can send a test notification, run monitoring, or generate the daily briefing.
- Generated alert history, monitoring status and briefing data are stored in the repository under `data/` and displayed by the dashboard.
- Firebase service-account credentials and the device token are read only from GitHub Actions secrets.

## GitHub repository secrets

Set these two repository Actions secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete Firebase service-account JSON.
- `FCM_DEVICE_TOKEN`: the iPhone web-push registration token.

Do not add either value to repository files, source code, issue comments or logs. The service account must belong to the same Firebase project used by the website and have permission to send Firebase Cloud Messaging messages. Enable the Firebase Cloud Messaging API for the project.

## Test the iPhone notification

1. Confirm the iPhone has IT Pulse installed from Safari using **Add to Home Screen**.
2. Open IT Pulse on the iPhone and allow notifications if iOS prompts. Web push on iPhone requires iOS 16.4 or later and a Home Screen web app.
3. Open the repository's **Actions** tab.
4. Select **IT Pulse Monitoring**, choose **Run workflow**, select `test`, and start the run.
5. Open the run and inspect the job steps. A successful FCM HTTP v1 response means Firebase accepted the message; confirm that the notification actually appears on the iPhone.

If the test fails, check the service-account project ID, FCM API enablement, service-account IAM permission, the current device token, and iPhone notification permission. Do not paste secrets into logs or chat.

## Schedule

- Monitoring: every 30 minutes, excluding the 13:00 UTC hour (6:00 PM Pakistan time) to avoid overlap with the daily briefing.
- Daily briefing: 13:30 UTC (6:30 PM Asia/Karachi).
- GitHub Actions scheduled runs can be delayed, and delivery is not guaranteed to be real-time.

## Data sources and limitations

The monitor reads public RSS/Atom feeds from CISA, Microsoft Security, Cisco, The Hacker News, BleepingComputer, Ubuntu Security Notices, Cloudflare Status, Google Cloud Status and Dawn Technology. Individual feeds may be unavailable or change format.

Severity classification is a conservative keyword/CVSS heuristic, not a full vulnerability intelligence engine. It can miss important items or classify an item incorrectly. Review the linked original advisory before making operational changes. The daily briefing is a source-based digest of feed titles and descriptions, not independently verified research or AI-generated analysis.

The static dashboard still fetches its latest general news through the RSS2JSON public conversion service. The Actions monitor uses direct RSS/Atom requests and does not depend on that browser service.

## Files added or updated

- `.github/workflows/it-pulse.yml`: manual test, scheduled monitoring and daily briefing.
- `scripts/monitor.py`: RSS collection, severity checks, deduplication and Firebase HTTP v1 sender.
- `firebase-messaging-sw.js`: background notification display and click handling.
- `app.js`, `index.html`, `styles.css`: dashboard status, critical alerts, briefing and receiver registration.
