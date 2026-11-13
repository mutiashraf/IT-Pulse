// IT Pulse: simple client-side news reader. No login, API keys or notification setup required.
const RSS_BRIDGE = "https://api.rss2json.com/v1/api.json?rss_url=";
const SOURCES = [
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", category: "security" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", category: "security" },
  { name: "Microsoft Security Blog", url: "https://www.microsoft.com/en-us/security/blog/feed/", category: "cloud" }
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
  if (/vulnerab|cve-|ransomware|malware|phishing|breach|hacked|exploit|zero.day|patch|cyber|security/.test(text)) return "security";
  if (/azure|aws|microsoft 365|outage|cloudflare|google cloud|service disruption/.test(text)) return "cloud";
  if (/windows|linux|cisco|vmware|network|router|server|infrastructure/.test(text)) return "systems";
  if (/artificial intelligence|\bai\b|openai|chatgpt|model release|machine learning/.test(text)) return "ai";
  return sourceCategory || "systems";
}

function priorityFor(item, category) {
  const text = (item.title + " " + (item.description || "")).toLowerCase();
  if (/actively exploited|zero.day|critical vulnerability|ransomware|emergency patch|mass exploitation/.test(text)) return "High priority";
  if (category === "security") return "Security";
  return "Technology";
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
  }).filter(item => item.title && /^https?:\/\//i.test(item.url));
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
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 40);
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
