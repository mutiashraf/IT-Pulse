// IT Pulse: simple client-side news reader. No login, API keys or notification setup required.
const RSS_BRIDGE = "https://api.rss2json.com/v1/api.json?rss_url=";
const SOURCES = [
  { name: "Cisco Security Advisories", url: "https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml", category: "networking" },
  { name: "Cisco Event Responses", url: "https://sec.cloudapps.cisco.com/security/center/eventResponses_20.xml", category: "networking" },
  { name: "Fortinet PSIRT", url: "https://filestore.fortinet.com/fortiguard/rss/ir.xml", category: "networking" },
  { name: "Fortinet Outbreak Alerts", url: "https://filestore.fortinet.com/fortiguard/rss/outbreakalert.xml", category: "security" },
  { name: "Fortinet Firmware Updates", url: "https://pub.kb.fortinet.com/rss/firmware.xml", category: "networking" },
  { name: "Palo Alto Security Advisories", url: "https://security.paloaltonetworks.com/rss.xml", category: "networking" },
  { name: "Microsoft Security Update Guide", url: "https://api.msrc.microsoft.com/update-guide/rss", category: "security" },
  { name: "Microsoft Security Blog", url: "https://www.microsoft.com/en-us/security/blog/feed/", category: "security" },
  { name: "Microsoft 365 Blog", url: "https://www.microsoft.com/en-us/microsoft-365/blog/feed/", category: "productivity" },
  { name: "Azure Updates", url: "https://www.microsoft.com/releasecommunications/api/v2/azure/rss", category: "cloud" },
  { name: "Azure Blog", url: "https://azure.microsoft.com/en-us/blog/feed/", category: "cloud" },
  { name: "Azure Status", url: "https://azure.status.microsoft/status/feed/", category: "cloud" },
  { name: "AWS What's New", url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/", category: "cloud" },
  { name: "AWS Security Bulletins", url: "https://aws.amazon.com/security/security-bulletins/rss/feed/", category: "security" },
  { name: "AWS Status", url: "https://status.aws.amazon.com/rss/all.rss", category: "cloud" },
  { name: "AWS News Blog", url: "https://aws.amazon.com/blogs/aws/feed/", category: "cloud" },
  { name: "Google Cloud Status", url: "https://status.cloud.google.com/en/feed.atom", category: "cloud" },
  { name: "Google Cloud Blog", url: "https://cloudblog.withgoogle.com/rss/", category: "cloud" },
  { name: "Google Cloud Release Notes", url: "https://docs.cloud.google.com/feeds/gcp-release-notes.xml", category: "cloud" },
  { name: "Google Cloud Security Bulletins", url: "https://docs.cloud.google.com/feeds/google-cloud-security-bulletins.xml", category: "security" },
  { name: "Google Chrome Releases", url: "https://chromereleases.googleblog.com/feeds/posts/default", category: "systems" },
  { name: "Ubuntu Security Notices", url: "https://ubuntu.com/security/notices/rss.xml", category: "security" },
  { name: "Red Hat Security Blog", url: "https://www.redhat.com/en/rss/blog/channel/security", category: "security" },
  { name: "CISA Advisories", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml", category: "security" },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", category: "security" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", category: "security" },
  { name: "Cloudflare Status", url: "https://www.cloudflarestatus.com/history.rss", category: "networking" },
  { name: "Dawn Technology", url: "https://www.dawn.com/feeds/tech", category: "technology" }
];
const CACHE_KEY = "it-pulse-news-v1";
const CACHE_AGE = 15 * 60 * 1000;
const newsList = document.querySelector("#newsList");
const feedStatus = document.querySelector("#feedStatus");
const feedMeta = document.querySelector("#feedMeta");
const refreshButton = document.querySelector("#refreshFeed");
const searchInput = document.querySelector("#searchNews");
const categoryFilter = document.querySelector("#categoryFilter");
let stories = [];

function categoryFor(item, sourceCategory) {
  const text = (item.title + " " + (item.description || "")).toLowerCase();
  if (/internet|network|router|routing|bgp|dns|dhcp|\bisp\b|broadband|wi-?fi|wireless|ethernet|firewall|switch|connectivity|packet loss|latency|peering|fiber|fibre|telecom|\bcdn\b|ddos|cloudflare|cisco|unifi|mikrotik|fortinet|palo alto/.test(text) || sourceCategory === "networking") return "networking";
  if (/outlook|microsoft 365|office 365|\bteams\b|exchange online|sharepoint|onedrive/.test(text)) return "productivity";
  if (/azure|aws|amazon web services|google cloud|gcp|cloud status|service disruption/.test(text)) return "cloud";
  if (/windows|linux|ubuntu|debian|red hat|vmware|server|infrastructure|chrome release/.test(text)) return "systems";
  if (/vulnerab|cve-|ransomware|malware|phishing|breach|hacked|exploit|zero.day|patch|cyber|security/.test(text)) return "security";
  if (/artificial intelligence|\bai\b|openai|chatgpt|model release|machine learning/.test(text)) return "ai";
  return sourceCategory || "technology";
}

function categoryRank(category) {
  const order = { networking: 0, security: 1, cloud: 2, systems: 3, productivity: 4, ai: 5, technology: 6 };
  return Object.prototype.hasOwnProperty.call(order, category) ? order[category] : 7;
}

function priorityFor(item, category) {
  const text = (item.title + " " + (item.description || "")).toLowerCase();
  if (/actively exploited|zero.day|critical vulnerability|ransomware|emergency patch|mass exploitation/.test(text)) return "High priority";
  if (category === "security") return "Security";
  return "Technology";
}

function isReadableEnglish(value) {
  // Skip entries using non-Latin writing systems so the feed stays readable in English.
  return !/[\u0590-\u0DFF\u0E00-\u0EFF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0400-\u052F]/u.test(value || "");
}

function cleanText(value) {
  const node = document.createElement("div");
  node.innerHTML = value || "";
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

async function fetchSource(source) {
  const endpoint = RSS_BRIDGE + encodeURIComponent(source.url);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(source.name + " returned HTTP " + response.status);
  const data = await response.json();
  if (data.status !== "ok" || !Array.isArray(data.items)) throw new Error(data.message || source.name + " feed could not be read");
  return data.items.map(item => {
    const title = cleanText(item.title);
    const description = cleanText(item.description || item.content);
    const category = categoryFor({ title, description }, source.category);
    return {
      title,
      description: description.slice(0, 280),
      url: item.link,
      source: source.name,
      category,
      priority: priorityFor({ title, description }, category),
      date: item.pubDate || ""
    };
  }).filter(item => item.title && isReadableEnglish(item.title + " " + item.description) && /^https?:\/\//i.test(item.url));
}

function renderStories() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const filtered = stories.filter(story =>
    (category === "all" || story.category === category) &&
    (!query || (story.title + " " + story.description + " " + story.source).toLowerCase().includes(query))
  );
  newsList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = stories.length ? "No stories match your search. Try another keyword or category." : "No stories are available yet. Tap Refresh to try again.";
    newsList.append(empty);
    return;
  }
  for (const story of filtered) {
    const article = document.createElement("article");
    article.className = "news-item";
    const top = document.createElement("div");
    top.className = "news-meta";
    const tag = document.createElement("span");
    tag.className = "tag tag-" + story.category;
    tag.textContent = story.priority;
    const source = document.createElement("span");
    source.textContent = story.source;
    top.append(tag, source);
    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = story.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = story.title;
    title.append(link);
    const summary = document.createElement("p");
    summary.className = "news-summary";
    summary.textContent = story.description || "Open the original story to read the full update.";
    const bottom = document.createElement("div");
    bottom.className = "news-bottom";
    const date = document.createElement("time");
    const parsed = new Date(story.date);
    date.textContent = Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const read = document.createElement("a");
    read.href = story.url;
    read.target = "_blank";
    read.rel = "noopener noreferrer";
    read.textContent = "Read source ↗";
    bottom.append(date, read);
    article.append(top, title, summary, bottom);
    newsList.append(article);
  }
}

async function loadNews(force = false) {
  refreshButton.disabled = true;
  feedStatus.textContent = "Fetching latest stories from trusted publishers…";
  feedStatus.className = "status";
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.savedAt < CACHE_AGE && Array.isArray(cached.stories)) {
        stories = cached.stories;
        renderStories();
        feedMeta.textContent = "Updated " + new Date(cached.savedAt).toLocaleTimeString();
        feedStatus.textContent = "Showing recently fetched stories.";
        refreshButton.disabled = false;
        return;
      }
    } catch { /* Ignore an invalid local cache and fetch fresh stories. */ }
  }
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const fresh = results.filter(result => result.status === "fulfilled").flatMap(result => result.value);
  const failures = results.filter(result => result.status === "rejected");
  const seen = new Set();
  stories = fresh.filter(story => {
    const key = story.url || story.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 40);
  if (stories.length) {
    const savedAt = Date.now();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt, stories })); } catch { /* Storage is optional. */ }
    feedMeta.textContent = stories.length + " stories · Updated " + new Date(savedAt).toLocaleTimeString();
    feedStatus.textContent = failures.length ? "Some sources could not be reached; showing the sources that responded." : "Latest stories loaded.";
    feedStatus.className = "status ok";
  } else {
    feedMeta.textContent = "Feed unavailable";
    feedStatus.textContent = "Could not load the news feeds. Check your internet connection or try again shortly. The RSS feed service may also be temporarily unavailable.";
    feedStatus.className = "status error";
  }
  renderStories();
  refreshButton.disabled = false;
}

refreshButton.addEventListener("click", () => loadNews(true));
searchInput.addEventListener("input", renderStories);
categoryFilter.addEventListener("change", renderStories);
loadNews();


async function loadPublishedData() {
  const alertsBox = document.querySelector("#criticalAlerts");
  const briefingBox = document.querySelector("#dailyBriefing");
  const alertMeta = document.querySelector("#alertMeta");
  const briefingMeta = document.querySelector("#briefingMeta");
  const monitorStatus = document.querySelector("#monitorStatus");
  const cacheBust = "?v=" + Date.now();
  try {
    const statusResponse = await fetch("./data/status.json" + cacheBust, { cache: "no-store" });
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      monitorStatus.textContent = statusData.last_monitor_utc ? new Date(statusData.last_monitor_utc).toLocaleString() : "No successful run recorded";
    }
  } catch {
    monitorStatus.textContent = "Waiting for the first successful monitoring run.";
  }
  try {
    const response = await fetch("./data/latest.json" + cacheBust, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      alertMeta.textContent = (data.alerts || []).length + " stored high-priority alerts";
      alertsBox.replaceChildren();
      const alerts = data.alerts || [];
      if (!alerts.length) {
        alertsBox.textContent = "No critical or high-priority alerts have been recorded.";
      } else {
        for (const item of alerts.slice(0, 8)) {
          const article = document.createElement("article");
          article.className = "news-item";
          const tag = document.createElement("span");
          tag.className = "tag tag-security";
          tag.textContent = item.severity || "ALERT";
          const title = document.createElement("h3");
          const link = document.createElement("a");
          link.href = item.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = item.title;
          title.append(link);
          const detail = document.createElement("p");
          detail.className = "news-summary";
          detail.textContent = (item.source || "Source") + " · " + (item.published || "Publication date not supplied");
          article.append(tag, title, detail);
          alertsBox.append(article);
        }
      }
    }
  } catch {
    alertMeta.textContent = "Monitoring data is not available yet.";
  }
  try {
    const response = await fetch("./data/briefing.json" + cacheBust, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      briefingMeta.textContent = "Generated " + new Date(data.generated_utc).toLocaleString() + " · Last 24 hours";
      briefingBox.replaceChildren();
      const sections = data.sections || {};
      for (const [category, items] of Object.entries(sections)) {
        const heading = document.createElement("h3");
        heading.textContent = category;
        briefingBox.append(heading);
        for (const item of items.slice(0, 5)) {
          const article = document.createElement("article");
          article.className = "news-item";
          const title = document.createElement("h3");
          const link = document.createElement("a");
          link.href = item.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = item.title;
          title.append(link);
          const summary = document.createElement("p");
          summary.className = "news-summary";
          summary.textContent = item.summary || "Open the source for details.";
          const meta = document.createElement("p");
          meta.className = "news-bottom";
          meta.textContent = (item.severity || "INFORMATIONAL") + " · " + item.source + " · " + (item.published || "Date not supplied");
          article.append(title, summary, meta);
          briefingBox.append(article);
        }
      }
      if (!briefingBox.children.length) briefingBox.textContent = "No recent feed items were available for this briefing.";
    }
  } catch {
    briefingMeta.textContent = "The first briefing has not been published yet.";
  }
}

async function registerPushReceiver() {
  const status = document.querySelector("#pushStatus");
  const permission = document.querySelector("#permissionStatus");
  permission.textContent = ("Notification" in window) ? Notification.permission : "Not supported by this browser";
  if (!("serviceWorker" in navigator)) {
    status.textContent = "Service workers are not supported.";
    return;
  }
  try {
    await navigator.serviceWorker.register("./firebase-messaging-sw.js", { scope: "./" });
    status.textContent = "Firebase background receiver registered. Sender test still needs to pass.";
  } catch {
    status.textContent = "Could not register the Firebase service worker.";
  }
}

registerPushReceiver();
loadPublishedData();
