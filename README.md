# IT Pulse

A lightweight personal IT news dashboard designed to work as an installable iPhone web app.

## What works in this version

- Fetches recent headlines from The Hacker News, BleepingComputer and the Microsoft Security Blog.
- Shows story summaries, publisher links, timestamps and simple topic labels.
- Filters by cybersecurity, cloud/services, infrastructure and AI/technology.
- Searches headlines and summaries.
- Refreshes on app open or when you tap **Refresh**.
- Keeps a 15-minute local cache to reduce unnecessary requests.
- Requires no login, Firebase account, API key or backend for the news feed.

## How news is fetched

The browser requests each publisher's public RSS feed through the RSS2JSON conversion service, because browsers generally block direct cross-origin RSS/XML reads. Stories are combined, deduplicated by URL, sorted by publication date and displayed in the app. The RSS conversion service is a third-party dependency and may apply usage limits; if it is unavailable, use Refresh again later.

## Deploy and install on iPhone

1. Host the repository on an HTTPS static host such as GitHub Pages.
2. Open the published site in Safari on your iPhone.
3. Tap Share → Add to Home Screen.
4. Launch IT Pulse from its Home Screen icon.

## Intentionally postponed

Push notifications, Firebase device registration, user accounts and scheduled daily briefings are not part of this working news-reader stage. The feed updates when the app is opened or manually refreshed; it does not run continuously in the background. Push delivery can be configured after the news feed is confirmed working.
