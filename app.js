// IT Pulse: simple client-side news reader. No login, API keys or notification setup required.
const RSS_BRIDGE = "https://api.rss2json.com/v1/api.json?rss_url=";
const SOURCES = [
  { name: "Cisco Security Advisories", url: "https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml", category: "security" },
  { name: "Cisco Event Responses", url: "https://sec.cloudapps.cisco.com/security/center/eventResponses_20.xml", category: "security" },
  { name: "Fortinet PSIRT", url: "https://filestore.fortinet.com/fortiguard/rss/ir.xml", category: "security" },
  { name: "Fortinet Outbreak Alerts", url: "https://filestore.fortinet.com/fortiguard/rss/outbreakalert.xml", category: "security" },
  { name: "Fortinet Firmware Updates", url: "https://pub.kb.fortinet.com/rss/firmware.xml", category: "networking" },
  { name: "Palo Alto Security Advisories", url: "https://security.paloaltonetworks.com/rss.xml", category: "security" },
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
const dateFilter = document.querySelector("#newsDateFilter");
let stories = [];
let newsArchive = null;

function categoryFor(item, sourceCategory) {
  const text = (item.title + " " + (item.description || "")).toLowerCase();
  if (/internet outage|network outage|service outage|major outage|service disruption|connectivity issue|packet loss|bgp|dns outage|isp outage|broadband outage|wifi outage|wi-fi outage|cloudflare status/.test(text)) return "networking";
  if (/vulnerab|cve-|ransomware|malware|phishing|breach|hacked|exploit|zero.day|patch|cyber|security advisory|security bulletin/.test(text)) return "security";
  if (/internet|network|router|routing|bgp|dns|dhcp|\bisp\b|broadband|wi-?fi|wireless|ethernet|firewall|switch|connectivity|packet loss|latency|peering|fiber|fibre|telecom|\bcdn\b|ddos|cloudflare/.test(text) || sourceCategory === "networking") return "networking";
  if (/outlook|microsoft 365|office 365|\bteams\b|exchange online|sharepoint|onedrive/.test(text)) return "productivity";
  if (/azure|aws|amazon web services|google cloud|gcp|cloud status|service disruption/.test(text)) return "cloud";
  if (/windows|linux|ubuntu|debian|red hat|vmware|server|infrastructure|chrome release/.test(text)) return "systems";
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

function storyScore(story) {
  const published = new Date(story.date || story.published || "");
  const ageHours = Number.isNaN(published.getTime()) ? 48 : Math.max(0, (Date.now() - published.getTime()) / 3600000);
  let score = Math.max(0, 48 - Math.min(ageHours, 48));
  const text = (story.title + " " + (story.description || story.summary || "")).toLowerCase();
  if (story.severity === "CRITICAL") score += 60;
  else if (story.severity === "HIGH") score += 35;
  if (/actively exploited|known exploited|zero.day|zero day|ransomware|major outage|service outage|service disruption|internet outage|data breach/.test(text)) score += 25;
  if (/release|general availability|available now|security update|patch|incident|degraded|resolved|maintenance/.test(text)) score += 8;
  return score;
}

function titleWords(value) {
  const stop = new Set(["the","a","an","and","or","to","of","in","on","for","with","from","by","at","is","are","was","were","new","update","updates"]);
  return new Set((value.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => word.length > 1 && !stop.has(word)));
}

function isDuplicateStory(left, right) {
  if (left.url === right.url) return true;
  const a = titleWords(left.title);
  const b = titleWords(right.title);
  if (a.size < 5 || b.size < 5) return false;
  const overlap = [...a].filter(word => b.has(word)).length / Math.min(a.size, b.size);
  const da = new Date(left.date || left.published || "");
  const db = new Date(right.date || right.published || "");
  const close = Number.isNaN(da.getTime()) || Number.isNaN(db.getTime()) || Math.abs(da - db) <= 48 * 3600000;
  return overlap >= 0.9 && close;
}

function deduplicateStories(items) {
  const ranked = [...items].sort((a, b) => storyScore(b) - storyScore(a));
  const unique = [];
  for (const story of ranked) {
    const match = unique.find(item => isDuplicateStory(item, story));
    if (!match) {
      story.also_sources = story.also_sources || [];
      unique.push(story);
    } else if (story.source !== match.source && !match.also_sources.some(item => item.source === story.source)) {
      match.also_sources.push({ source: story.source, url: story.url });
    }
  }
  return unique;
}

function balanceStories(items, limit = 40, perSource = 2) {
  const categories = new Map();
  for (const story of items) {
    if (!categories.has(story.category)) categories.set(story.category, new Map());
    const sources = categories.get(story.category);
    if (!sources.has(story.source)) sources.set(story.source, []);
    sources.get(story.source).push(story);
  }
  const selected = [];
  const categoryOrder = ["networking", "security", "cloud", "systems", "productivity", "ai", "technology"];
  for (const category of [...categories.keys()].sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b))) {
    const sources = categories.get(category);
    const names = [...sources.keys()].sort((a, b) => storyScore(sources.get(b)[0]) - storyScore(sources.get(a)[0]));
    for (let round = 0; round < perSource; round++) {
      for (const name of names) {
        const list = sources.get(name);
        if (list[round] && selected.length < limit) selected.push(list[round]);
      }
      if (selected.length >= limit) break;
    }
    if (selected.length >= limit) break;
  }
  return selected;
}

function renderStories() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const filtered = stories.filter(story =>
    (category === "all" || story.category === category) &&
    (!query || (story.title + " " + (story.description || "") + " " + story.source).toLowerCase().includes(query))
  );
  newsList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = stories.length ? "No stories match your search. Try another keyword or category." : "No stories are available for this date yet.";
    newsList.append(empty);
    return;
  }
  const categoryNames = { networking: "Internet & networking", security: "Cybersecurity", cloud: "Cloud & services", systems: "Systems & infrastructure", productivity: "Outlook & Microsoft 365", ai: "AI & technology", technology: "Technology" };
  let lastCategory = "";
  for (const story of filtered) {
    if (category === "all" && story.category !== lastCategory) {
      const heading = document.createElement("h3");
      heading.className = "feed-category-heading";
      heading.textContent = categoryNames[story.category] || story.category;
      newsList.append(heading);
      lastCategory = story.category;
    }
    const article = document.createElement("article");
    article.className = "news-item";
    const top = document.createElement("div");
    top.className = "news-meta";
    const tag = document.createElement("span");
    tag.className = "tag tag-" + story.category;
    tag.textContent = story.severity || story.priority || "Update";
    const source = document.createElement("span");
    source.textContent = story.source || "Original publisher";
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
    summary.textContent = story.description || story.summary || "Open the original story to read the full update.";
    article.append(top, title, summary);
    const additional = story.also_sources || [];
    if (additional.length) {
      const coverage = document.createElement("p");
      coverage.className = "news-summary";
      coverage.append(document.createTextNode("Also reported by: "));
      additional.forEach((item, index) => {
        if (index) coverage.append(document.createTextNode(", "));
        const sourceLink = document.createElement("a");
        sourceLink.href = item.url;
        sourceLink.target = "_blank";
        sourceLink.rel = "noopener noreferrer";
        sourceLink.textContent = item.source;
        coverage.append(sourceLink);
      });
      article.append(coverage);
    }
    const bottom = document.createElement("div");
    bottom.className = "news-bottom";
    const date = document.createElement("time");
    const parsed = new Date(story.date || story.published || "");
    date.textContent = Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const read = document.createElement("a");
    read.href = story.url;
    read.target = "_blank";
    read.rel = "noopener noreferrer";
    read.textContent = "Read original source ↗";
    bottom.append(date, read);
    article.append(bottom);
    newsList.append(article);
  }
}

function showArchiveDate(date) {
  const day = newsArchive?.days?.[date];
  if (!day) {
    stories = [];
    feedMeta.textContent = date ? "No archive is available for this date." : "No daily archive has been published yet.";
    feedStatus.textContent = "Run the IT Pulse monitoring workflow to build the daily archive.";
    feedStatus.className = "status";
    renderStories();
    return;
  }
  stories = (day.stories || []).map(item => ({
    ...item,
    date: item.published || item.date || "",
    description: item.summary || item.description || "",
    category: ({ Networking: "networking", Cybersecurity: "security", Cloud: "cloud", Microsoft: "systems", Linux: "systems", Productivity: "productivity", AI: "ai", Technology: "technology" })[item.category] || item.category || "technology"
  }));
  const sourceCount = day.source_count || new Set(stories.map(item => item.source)).size;
  feedMeta.textContent = stories.length + " selected stories · " + sourceCount + " sources · " + date;
  feedStatus.textContent = date === newsArchive.latest_date ? "Showing today's ranked news, balanced across publishers." : "Browsing archived news for " + date + ".";
  feedStatus.className = "status ok";
  renderStories();
}

async function loadNews(force = false) {
  refreshButton.disabled = true;
  feedStatus.textContent = "Collecting and ranking today's updates from trusted publishers…";
  feedStatus.className = "status";
  try {
    const response = await fetch("./data/briefing.json?v=" + Date.now(), { cache: "no-store" });
    if (response.ok) {
      const archive = await response.json();
      if (archive && archive.days && Object.keys(archive.days).length) {
        newsArchive = archive;
        const dates = archive.available_dates || Object.keys(archive.days).sort().reverse();
        const chosen = dateFilter.value && archive.days[dateFilter.value] ? dateFilter.value : (archive.latest_date || dates[0]);
        dateFilter.replaceChildren();
        for (const date of dates) {
          const option = document.createElement("option");
          option.value = date;
          option.textContent = new Date(date + "T12:00:00").toLocaleDateString(undefined, { dateStyle: "full" });
          dateFilter.append(option);
        }
        dateFilter.value = chosen;
        showArchiveDate(chosen);
        refreshButton.disabled = false;
        return;
      }
    }
  } catch { /* Use live feeds as a fallback until the first archive is generated. */ }

  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const fresh = results.filter(result => result.status === "fulfilled").flatMap(result => result.value);
  const failures = results.filter(result => result.status === "rejected");
  const unique = deduplicateStories(fresh);
  stories = balanceStories(unique, 40, 2);
  stories.sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || storyScore(b) - storyScore(a));
  feedMeta.textContent = stories.length + " balanced stories from " + new Set(stories.map(item => item.source)).size + " sources · Live fallback";
  feedStatus.textContent = failures.length ? "Some sources could not be reached; showing balanced stories from the sources that responded." : "Latest stories loaded. Daily archive will appear after the monitoring workflow runs.";
  feedStatus.className = stories.length ? "status ok" : "status error";
  renderStories();
  refreshButton.disabled = false;
}
refreshButton.addEventListener("click", () => loadNews(true));
searchInput.addEventListener("input", renderStories);
categoryFilter.addEventListener("change", renderStories);
dateFilter.addEventListener("change", () => showArchiveDate(dateFilter.value));
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
      briefingMeta.textContent = "Top stories for " + (latestDay.date || data.latest_date || "today") + " · " + (latestDay.story_count || 0) + " stories from " + (latestDay.source_count || 0) + " sources";
      briefingBox.replaceChildren();
      const latestDay = (data.days && data.days[data.latest_date]) || data;
      const sections = latestDay.sections || {};
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
