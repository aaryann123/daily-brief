// Builds today's edition: pull RSS feeds, let Claude (Agent SDK, Max plan) pick and summarise, write public/edition.json.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFileSync } from "node:fs";

const FEEDS = {
  ai: [
    "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://arstechnica.com/ai/feed/",
    "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    "https://hnrss.org/frontpage?points=200",
  ],
  world: [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://feeds.npr.org/1004/rss.xml",
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://www.theguardian.com/world/rss",
  ],
  long: ["https://aeon.co/feed.rss", "https://longreads.com/feed/", "https://api.quantamagazine.org/feed/"],
  good: ["https://www.positive.news/feed/", "https://www.goodnewsnetwork.org/feed/", "https://www.smithsonianmag.com/rss/latest_articles/"],
};
const MAX_AGE_H = { ai: 36, world: 24, long: 24 * 10, good: 24 * 4 };

const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const tag = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1];
const text = (html = "") => decode(decode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// ponytail: regex RSS/Atom parsing, good enough for these well-formed feeds; swap in an XML parser if one breaks.
export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  return blocks.map((b) => {
    const link = text(tag(b, "link")) || b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] || b.match(/<link[^>]*href="([^"]+)"/)?.[1];
    const body = tag(b, "content:encoded") || tag(b, "content") || "";
    const image =
      b.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/)?.[1] ||
      b.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/)?.[1] ||
      decode(body).match(/<img[^>]*src="([^"]+)"/)?.[1];
    return {
      title: text(tag(b, "title")),
      link: decode(link || "").trim(),
      summary: text(tag(b, "description") || tag(b, "summary") || body).slice(0, 320),
      date: new Date(text(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"))),
      image: image ? decode(image) : undefined,
    };
  }).filter((i) => i.title && i.link?.startsWith("http"));
}

async function gather() {
  const items = [];
  await Promise.all(Object.entries(FEEDS).flatMap(([section, urls]) => urls.map(async (url) => {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 daily-brief" }, signal: AbortSignal.timeout(15000) });
      const source = new URL(url).hostname.replace(/^(www|feeds|api)\./, "").replace(/^bbci\.co\.uk/, "bbc.co.uk");
      const fresh = parseFeed(await res.text()).filter((i) => !(Date.now() - i.date < 0) && Date.now() - i.date < MAX_AGE_H[section] * 3600e3);
      for (const i of fresh.slice(0, 15)) items.push({ ...i, section, source });
    } catch (e) { console.warn("feed failed:", url, e.message); }
  })));
  return items.map((i, n) => ({ ...i, id: n }));
}

const PROMPT = (items) => `You are the editor of a calm, smart daily brief read on a phone in about four minutes.
Today is ${new Date().toDateString()}. From the candidate stories below, build today's edition:
- 4 "ai" cards: the most significant AI news (launches, research, policy, business). Skip minor product tweaks, listicles and duplicates.
- 4 "world" cards: the most important world news, varied regions and topics, no duplicates of the same event.
- 1 "long" card: the single most interesting long-form read.
- 1 "good" card: a genuinely uplifting or wondrous story (science, nature, people).
- 1 quote: a real quote; set "work" to the book, speech or interview it comes from only if you are certain, otherwise "", that suits today's mood, max 25 words. Never invent one, and avoid famous misattributions (e.g. the Sagan "something incredible is waiting to be known" line is not his).

For each card write:
- "headline": your own punchy headline, max 9 words, no clickbait, no trailing period.
- "summary": 2 plain sentences, max 45 words, what happened and why it matters. Only use facts in the candidate text.
Return ONLY JSON, no prose, shaped like:
{"cards":[{"id":12,"section":"ai","headline":"...","summary":"..."}],"quote":{"text":"...","author":"...","work":"..."}}

Candidates (id | section | source | title | snippet):
${items.map((i) => `${i.id} | ${i.section} | ${i.source} | ${i.title} | ${i.summary}`).join("\n")}`;

async function edit(items) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let out = "";
    for await (const m of query({ prompt: PROMPT(items), options: { model: "sonnet", tools: [], maxTurns: 1 } })) {
      if (m.type === "result") out = m.subtype === "success" ? m.result : "";
    }
    try {
      const ed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
      // Model output is untrusted: keep only cards that point at a real candidate, and take link/source/image from the feed.
      const cards = ed.cards.filter((c) => items[c.id] && c.headline && c.summary).map((c) => {
        const i = items[c.id];
        return { section: i.section, headline: String(c.headline), summary: String(c.summary), source: i.source, link: i.link, image: i.image };
      });
      if (cards.length >= 6) return { date: new Date().toISOString(), cards, quote: ed.quote?.text ? { text: String(ed.quote.text), author: String(ed.quote.author || ""), work: String(ed.quote.work || "") } : undefined };
    } catch (e) { console.warn(`attempt ${attempt}: bad JSON`, e.message); }
  }
  throw new Error("Claude did not return a usable edition");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const items = await gather();
  console.log(`${items.length} candidates`);
  const edition = await edit(items);
  // Many feeds carry no image; fall back to the article's og:image.
  await Promise.all(edition.cards.filter((c) => !c.image).map(async (c) => {
    try {
      const html = await (await fetch(c.link, { headers: { "user-agent": "Mozilla/5.0 daily-brief" }, signal: AbortSignal.timeout(10000) })).text();
      const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1] || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/)?.[1];
      if (og?.startsWith("http")) c.image = decode(og);
    } catch {}
  }));
  writeFileSync(new URL("./public/edition.json", import.meta.url), JSON.stringify(edition, null, 2));
  console.log(`wrote ${edition.cards.length} cards`);
}
