#!/usr/bin/env python3
"""Fetch selected public IT feeds and send high-priority alerts through FCM HTTP v1."""

import email.utils
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SEEN_FILE = DATA / "seen.json"
LATEST_FILE = DATA / "latest.json"
BRIEFING_FILE = DATA / "briefing.json"
SITE_URL = "https://mutiashraf.github.io/IT-Pulse/"

SOURCES = [
    ("CISA Advisories", "https://www.cisa.gov/cybersecurity-advisories/all.xml", "Cybersecurity"),
    ("Microsoft Security Blog", "https://www.microsoft.com/en-us/security/blog/feed/", "Microsoft"),
    ("Cisco Security Advisories", "https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml", "Networking"),
    ("The Hacker News", "https://feeds.feedburner.com/TheHackersNews", "Cybersecurity"),
    ("BleepingComputer", "https://www.bleepingcomputer.com/feed/", "Cybersecurity"),
    ("Ubuntu Security Notices", "https://ubuntu.com/security/notices/rss.xml", "Linux"),
    ("Cloudflare Status", "https://www.cloudflarestatus.com/history.rss", "Cloud"),
    ("Google Cloud Status", "https://status.cloud.google.com/en/feed.atom", "Cloud"),
    ("Dawn Technology", "https://www.dawn.com/feeds/tech", "Pakistan IT"),
]

def now_utc():
    return datetime.now(timezone.utc)

def parse_date(value):
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except (TypeError, ValueError):
            return None

def text_of(element, names):
    for child in element.iter():
        local = child.tag.rsplit("}", 1)[-1].lower()
        if local in names and child.text:
            return " ".join(child.text.split())
    return ""

def parse_feed(xml_bytes, source, category):
    root = ET.fromstring(xml_bytes)
    entries = [e for e in root.iter() if e.tag.rsplit("}", 1)[-1].lower() in ("item", "entry")]
    output = []
    for entry in entries:
        title = text_of(entry, {"title"})
        summary = text_of(entry, {"description", "summary", "content", "encoded"})
        link = ""
        for child in entry.iter():
            if child.tag.rsplit("}", 1)[-1].lower() == "link":
                href = child.attrib.get("href")
                if href:
                    link = href
                    break
                if child.text:
                    link = child.text.strip()
                    break
        published = text_of(entry, {"pubdate", "published", "updated", "date"})
        if not link or not link.startswith(("http://", "https://")) or not title:
            continue
        output.append({
            "title": title[:300],
            "summary": re.sub(r"\s+", " ", summary)[:500],
            "url": link,
            "source": source,
            "category": category,
            "published": published,
        })
    return output

def fetch_all():
    stories = []
    failures = []
    for source, url, category in SOURCES:
        request = urllib.request.Request(url, headers={"User-Agent": "IT-Pulse/1.0 (personal IT monitoring)"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                stories.extend(parse_feed(response.read(), source, category))
        except Exception:
            failures.append(source)
    if not stories:
        raise RuntimeError("No monitoring sources could be reached.")
    unique = {story["url"]: story for story in stories}
    return sorted(unique.values(), key=lambda item: parse_date(item["published"]) or datetime.min.replace(tzinfo=timezone.utc), reverse=True), failures

def classify_story(story):
    text = (story["title"] + " " + story["summary"]).lower()
    if re.search(r"\\binternet\\b|\\bnetwork(?:ing)?\\b|router|routing|bgp|dns|dhcp|\\bisp\\b|broadband|wi-?fi|wireless|ethernet|firewall|switch(?:ing)?|connectivity|packet loss|latency|peering|fiber optic|fibre optic|telecom|\\bcdn\\b|ddos|cloudflare status|internet outage", text):
        return "Networking"
    if re.search(r"outlook|microsoft 365|office 365|\\bteams\\b|exchange online|sharepoint|onedrive", text):
        return "Productivity"
    return story.get("category", "Technology")

def severity_for(story):
    text = (story["title"] + " " + story["summary"]).lower()
    cvss = re.search(r"cvss(?:v\d(?:\.\d)?)?[^0-9]{0,8}([0-9]\.[0-9])", text)
    score = float(cvss.group(1)) if cvss else None
    if any(term in text for term in (
        "actively exploited", "known exploited", "zero-day", "zero day",
        "ransomware", "emergency security update", "emergency patch",
        "mass exploitation", "critical vulnerability",
    )) or (score is not None and score >= 9.0):
        return "CRITICAL"
    if (score is not None and score >= 7.0) or (
        re.search(r"\bcve-\d{4}-\d+\b", text)
        and any(term in text for term in ("vulnerability", "exploit", "security update", "security advisory"))
    ) or any(term in text for term in (
        "major outage", "service disruption", "security breach", "actively targeted",
        "critical security", "exploitation detected",
    )):
        return "HIGH"
    return "INFORMATIONAL"

def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default

def write_json(path, value):
    DATA.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def fcm_send(title, body, url=SITE_URL):
    service_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    device_token = os.environ.get("FCM_DEVICE_TOKEN", "")
    if not service_json or not device_token:
        raise RuntimeError("Missing FIREBASE_SERVICE_ACCOUNT_JSON or FCM_DEVICE_TOKEN repository secret.")
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
        service_info = json.loads(service_json)
        project_id = service_info.get("project_id")
        if not project_id:
            raise ValueError("Service account JSON has no project_id.")
        credentials = service_account.Credentials.from_service_account_info(
            service_info,
            scopes=["https://www.googleapis.com/auth/firebase.messaging"],
        )
        session = AuthorizedSession(credentials)
        endpoint = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
        payload = {
            "message": {
                "token": device_token,
                "data": {
                    "title": title[:100],
                    "body": body[:240],
                    "url": SITE_URL,
                },
                "webpush": {
                    "fcm_options": {"link": SITE_URL},
                },
            }
        }
        response = session.post(endpoint, json=payload, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(f"FCM HTTP v1 request failed with status {response.status_code}. Check the service account, project and device token.")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Firebase authentication or request setup failed ({type(exc).__name__}). Check the service account secret.") from None

def monitor():
    stories, failures = fetch_all()
    cutoff = now_utc() - timedelta(hours=36)
    seen = read_json(SEEN_FILE, {"sent": []})
    sent_ids = set(seen.get("sent", []))
    candidates = []
    for story in stories:
        published = parse_date(story["published"])
        if published and published < cutoff:
            continue
        severity = severity_for(story)
        if severity in ("CRITICAL", "HIGH") and story["url"] not in sent_ids:
            story["severity"] = severity
            candidates.append(story)
    new_sent = []
    for story in candidates:
        fcm_send(f"{story['severity']}: {story['source']}", story["title"], story["url"])
        new_sent.append(story["url"])
        print(f"Sent {story['severity']} alert from {story['source']}.")
    if new_sent:
        sent_ids.update(new_sent)
        write_json(SEEN_FILE, {"sent": sorted(sent_ids)[-3000:]})
        existing = read_json(LATEST_FILE, {"alerts": []})
        combined = candidates + existing.get("alerts", [])
        unique = {item["url"]: item for item in combined}
        write_json(LATEST_FILE, {
            "updated_utc": now_utc().isoformat(),
            "alerts": list(unique.values())[:100],
            "source_failures": failures,
        })
    else:
        print("No new high-priority alerts. No push notification sent.")
    write_json(DATA / "status.json", {
        "last_monitor_utc": now_utc().isoformat(),
        "source_failures": failures,
        "stories_checked": len(stories),
        "new_alerts_sent": len(new_sent),
    })
    if failures:
        print(f"{len(failures)} source(s) could not be reached.")

def briefing():
    stories, failures = fetch_all()
    cutoff = now_utc() - timedelta(hours=24)
    recent = []
    for story in stories:
        published = parse_date(story["published"])
        if published is None or published >= cutoff:
            story["severity"] = severity_for(story)
            recent.append(story)
    for story in recent:
        story["category"] = classify_story(story)
    category_order = {"Networking": 0, "Cybersecurity": 1, "Cloud": 2, "Linux": 3, "Microsoft": 4, "Productivity": 5, "Pakistan IT": 6}
    recent.sort(key=lambda story: (category_order.get(story["category"], 7), -(parse_date(story["published"]).timestamp() if parse_date(story["published"]) else 0)))
    recent = recent[:30]
    sections = {}
    for story in recent:
        sections.setdefault(story["category"], []).append(story)
    briefing_data = {
        "generated_utc": now_utc().isoformat(),
        "window_hours": 24,
        "summary": "A source-based digest of recent public IT updates. Verify details in the original source before taking action.",
        "sections": sections,
        "source_failures": failures,
    }
    write_json(BRIEFING_FILE, briefing_data)
    priority = [item for item in recent if item["severity"] in ("CRITICAL", "HIGH")]
    headline = priority[0]["title"] if priority else (recent[0]["title"] if recent else "No recent feed items were returned.")
    fcm_send("Your IT Pulse daily briefing is ready", headline[:180], SITE_URL)
    print(f"Daily briefing prepared with {len(recent)} recent stories.")

def test():
    fcm_send(
        "IT Pulse test notification",
        "Your GitHub Actions to Firebase Cloud Messaging connection is working.",
        SITE_URL,
    )
    print("FCM accepted the test notification.")

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "monitor"
    try:
        if mode == "test":
            test()
        elif mode == "briefing":
            briefing()
        elif mode == "monitor":
            monitor()
        else:
            raise RuntimeError("Unknown mode. Use test, monitor or briefing.")
    except Exception as exc:
        print(f"IT Pulse failed: {exc}", file=sys.stderr)
        sys.exit(1)
