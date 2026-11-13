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
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SEEN_FILE = DATA / "seen.json"
LATEST_FILE = DATA / "latest.json"
BRIEFING_FILE = DATA / "briefing.json"
SITE_URL = "https://mutiashraf.github.io/IT-Pulse/"

SOURCES = [
    # Network and security vendors
    ("Cisco Security Advisories", "https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml", "Cybersecurity"),
    ("Cisco Event Responses", "https://sec.cloudapps.cisco.com/security/center/eventResponses_20.xml", "Cybersecurity"),
    ("Fortinet PSIRT", "https://filestore.fortinet.com/fortiguard/rss/ir.xml", "Cybersecurity"),
    ("Fortinet Outbreak Alerts", "https://filestore.fortinet.com/fortiguard/rss/outbreakalert.xml", "Cybersecurity"),
    ("Fortinet Firmware Updates", "https://pub.kb.fortinet.com/rss/firmware.xml", "Networking"),
    ("Palo Alto Security Advisories", "https://security.paloaltonetworks.com/rss.xml", "Cybersecurity"),
    # Microsoft, Azure and Windows
    ("Microsoft Security Update Guide", "https://api.msrc.microsoft.com/update-guide/rss", "Microsoft"),
    ("Microsoft Security Blog", "https://www.microsoft.com/en-us/security/blog/feed/", "Microsoft"),
    ("Microsoft 365 Blog", "https://www.microsoft.com/en-us/microsoft-365/blog/feed/", "Microsoft"),
    ("Azure Updates", "https://www.microsoft.com/releasecommunications/api/v2/azure/rss", "Cloud"),
    ("Azure Blog", "https://azure.microsoft.com/en-us/blog/feed/", "Cloud"),
    ("Azure Status", "https://azure.status.microsoft/status/feed/", "Cloud"),
    # AWS and Google
    ("AWS What's New", "https://aws.amazon.com/about-aws/whats-new/recent/feed/", "Cloud"),
    ("AWS Security Bulletins", "https://aws.amazon.com/security/security-bulletins/rss/feed/", "Cybersecurity"),
    ("AWS Status", "https://status.aws.amazon.com/rss/all.rss", "Cloud"),
    ("AWS News Blog", "https://aws.amazon.com/blogs/aws/feed/", "Cloud"),
    ("Google Cloud Status", "https://status.cloud.google.com/en/feed.atom", "Cloud"),
    ("Google Cloud Blog", "https://cloudblog.withgoogle.com/rss/", "Cloud"),
    ("Google Cloud Release Notes", "https://docs.cloud.google.com/feeds/gcp-release-notes.xml", "Cloud"),
    ("Google Cloud Security Bulletins", "https://docs.cloud.google.com/feeds/google-cloud-security-bulletins.xml", "Cybersecurity"),
    ("Google Chrome Releases", "https://chromereleases.googleblog.com/feeds/posts/default", "Systems"),
    # Linux and independent technology reporting
    ("Ubuntu Security Notices", "https://ubuntu.com/security/notices/rss.xml", "Linux"),
    ("Red Hat Security Blog", "https://www.redhat.com/en/rss/blog/channel/security", "Linux"),
    ("CISA Advisories", "https://www.cisa.gov/cybersecurity-advisories/all.xml", "Cybersecurity"),
    ("The Hacker News", "https://feeds.feedburner.com/TheHackersNews", "Cybersecurity"),
    ("BleepingComputer", "https://www.bleepingcomputer.com/feed/", "Cybersecurity"),
    ("Cloudflare Status", "https://www.cloudflarestatus.com/history.rss", "Networking"),
    ("Dawn Technology", "https://www.dawn.com/feeds/tech", "Technology"),
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
        # Keep the dashboard readable by skipping entries written in non-Latin scripts.
        combined_text = title + " " + summary
        if any(0x0590 <= ord(char) <= 0x0DFF or 0x0E00 <= ord(char) <= 0x0EFF or 0x3040 <= ord(char) <= 0x30FF or 0x3400 <= ord(char) <= 0x9FFF or 0xAC00 <= ord(char) <= 0xD7AF or 0x0400 <= ord(char) <= 0x052F for char in combined_text):
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

PAKISTAN_TZ = ZoneInfo("Asia/Karachi")
CATEGORY_ORDER = {"Networking": 0, "Cybersecurity": 1, "Cloud": 2, "Microsoft": 3, "Linux": 4, "Productivity": 5, "AI": 6, "Technology": 7}
STOP_WORDS = {"the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "from", "by", "at", "is", "are", "was", "were", "update", "updates", "new", "announces", "announced"}

def classify_story(story):
    text = (story["title"] + " " + story["summary"]).lower()
    if re.search(r"internet outage|network outage|service outage|major outage|service disruption|connectivity issue|packet loss|bgp|dns outage|isp outage|broadband outage|wifi outage|wi-fi outage|router vulnerability|firewall vulnerability|switch vulnerability|cloudflare status", text):
        return "Networking"
    if re.search(r"actively exploited|known exploited|zero.day|zero day|ransomware|malware|phishing|data breach|security advisory|security bulletin|vulnerab|\bcve-\d{4}-\d+\b|\bpsirt\b|security update", text):
        return "Cybersecurity"
    if re.search(r"cisco|unifi|mikrotik|fortinet|palo alto", text) and re.search(r"router|firewall|switch|wireless|wifi|wi-fi|firmware|network|routing|connectivity", text):
        return "Networking"
    if re.search(r"outlook|microsoft 365|office 365|\bteams\b|exchange online|sharepoint|onedrive", text):
        return "Productivity"
    if re.search(r"azure|aws|amazon web services|google cloud|gcp|cloud service|cloud status", text):
        return "Cloud"
    if re.search(r"ubuntu|debian|red hat|linux|kernel", text):
        return "Linux"
    if re.search(r"windows|vmware|chrome release", text):
        return "Microsoft" if "windows" in text else "Technology"
    if re.search(r"artificial intelligence|\bai\b|openai|chatgpt|machine learning", text):
        return "AI"
    if re.search(r"router|routing|bgp|dns|dhcp|\bisp\b|broadband|wi-?fi|wireless|ethernet|firewall|switch|connectivity|latency|peering|fiber|fibre|telecom|\bcdn\b|ddos|network", text):
        return "Networking"
    return story.get("category", "Technology")

def canonical_url(value):
    try:
        parts = urlsplit(value)
        ignored = {"fbclid", "gclid", "ref", "source"}
        query = [(key, val) for key, val in parse_qsl(parts.query, keep_blank_values=True) if not key.lower().startswith("utm_") and key.lower() not in ignored]
        host = (parts.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        port = f":{parts.port}" if parts.port else ""
        path = parts.path.rstrip("/") or "/"
        return urlunsplit((parts.scheme.lower(), host + port, path, urlencode(query), ""))
    except Exception:
        return value

def title_words(value):
    return {word for word in re.findall(r"[a-z0-9]+", value.lower()) if word not in STOP_WORDS and len(word) > 1}

def same_story(left, right):
    if canonical_url(left["url"]) == canonical_url(right["url"]):
        return True
    left_words, right_words = title_words(left["title"]), title_words(right["title"])
    if len(left_words) < 5 or len(right_words) < 5:
        return False
    overlap = len(left_words & right_words) / max(1, min(len(left_words), len(right_words)))
    left_date, right_date = parse_date(left.get("published")), parse_date(right.get("published"))
    close_in_time = not left_date or not right_date or abs((left_date - right_date).total_seconds()) <= 48 * 3600
    return overlap >= 0.90 and close_in_time

def story_score(story):
    published = parse_date(story.get("published"))
    age_hours = max(0.0, (now_utc() - published).total_seconds() / 3600) if published else 48.0
    score = max(0.0, 48.0 - min(age_hours, 48.0))
    severity = story.get("severity") or severity_for(story)
    score += {"CRITICAL": 60, "HIGH": 35, "INFORMATIONAL": 0}.get(severity, 0)
    text = (story["title"] + " " + story["summary"]).lower()
    if re.search(r"actively exploited|known exploited|zero.day|zero day|ransomware|major outage|service outage|service disruption|internet outage|data breach", text):
        score += 25
    if re.search(r"release|general availability|available now|security update|patch|incident|degraded|resolved|maintenance", text):
        score += 8
    story["severity"] = severity
    story["score"] = round(score, 2)
    story["category"] = classify_story(story)
    return score

def deduplicate_stories(stories):
    ranked = sorted(stories, key=story_score, reverse=True)
    unique = []
    for story in ranked:
        match = next((item for item in unique if same_story(item, story)), None)
        if match is None:
            story["also_sources"] = []
            unique.append(story)
            continue
        known = {entry["source"] for entry in match.get("also_sources", [])}
        if story["source"] != match["source"] and story["source"] not in known:
            match.setdefault("also_sources", []).append({"source": story["source"], "url": story["url"]})
    return unique

def balanced_top_stories(stories, limit=40, per_source=2):
    grouped = {}
    for story in stories:
        grouped.setdefault(story["category"], {}).setdefault(story["source"], []).append(story)
    selected = []
    source_counts = {}
    for category in sorted(grouped, key=lambda name: CATEGORY_ORDER.get(name, 99)):
        source_groups = grouped[category]
        ordered_sources = sorted(source_groups, key=lambda source: max(item.get("score", 0) for item in source_groups[source]), reverse=True)
        for round_number in range(per_source):
            for source in ordered_sources:
                items = source_groups[source]
                if round_number < len(items) and source_counts.get(source, 0) < per_source and len(selected) < limit:
                    selected.append(items[round_number])
                    source_counts[source] = source_counts.get(source, 0) + 1
            if len(selected) >= limit:
                break
        if len(selected) >= limit:
            break
    return selected

def publish_daily_digest(stories, failures):
    today = now_utc().astimezone(PAKISTAN_TZ).date().isoformat()
    existing = read_json(BRIEFING_FILE, {})
    days = existing.get("days", {}) if isinstance(existing, dict) else {}
    if not isinstance(days, dict):
        days = {}
    previous = days.get(today, {})
    previous_stories = previous.get("stories", []) if isinstance(previous, dict) else []
    current = []
    for story in stories:
        published = parse_date(story.get("published"))
        if published and published.astimezone(PAKISTAN_TZ).date().isoformat() == today:
            current.append(story)
    merged = deduplicate_stories(previous_stories + current)
    selected = balanced_top_stories(merged, limit=40, per_source=2)
    sections = {}
    for story in selected:
        sections.setdefault(story["category"], []).append(story)
    days[today] = {
        "date": today,
        "generated_utc": now_utc().isoformat(),
        "story_count": len(selected),
        "source_count": len({story["source"] for story in selected}),
        "stories": selected,
        "sections": sections,
        "source_failures": failures,
    }
    for old_date in sorted(days, reverse=True)[30:]:
        days.pop(old_date, None)
    archive = {"generated_utc": now_utc().isoformat(), "latest_date": today, "available_dates": sorted(days.keys(), reverse=True), "days": days}
    write_json(BRIEFING_FILE, archive)
    return days[today]


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
    daily = publish_daily_digest(stories, failures)
    write_json(DATA / "status.json", {
        "last_monitor_utc": now_utc().isoformat(),
        "source_failures": failures,
        "stories_checked": len(stories),
        "new_alerts_sent": len(new_sent),
        "daily_stories": daily["story_count"],
        "daily_sources": daily["source_count"],
    })
    if failures:
        print(f"{len(failures)} source(s) could not be reached.")

def briefing():
    stories, failures = fetch_all()
    daily = publish_daily_digest(stories, failures)
    priority = [item for item in daily["stories"] if item.get("severity") in ("CRITICAL", "HIGH")]
    headline = priority[0]["title"] if priority else (daily["stories"][0]["title"] if daily["stories"] else "No dated stories were returned today.")
    fcm_send("Your IT Pulse daily briefing is ready", headline[:180], SITE_URL)
    print(f"Daily briefing prepared with {daily['story_count']} stories from {daily['source_count']} sources.")

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
