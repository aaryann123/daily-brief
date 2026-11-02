import assert from "node:assert";
import { parseFeed } from "./build.mjs";

const rss = `<rss><channel><item><title><![CDATA[AI &amp; you]]></title><link>https://a.com/1</link>
<description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
<media:content url="https://a.com/i.jpg" medium="image"/></item></channel></rss>`;
const atom = `<feed><entry><title>Atom post</title><link rel="alternate" type="text/html" href="https://b.com/2"/>
<summary>Short</summary><updated>2026-11-01T08:00:00Z</updated></entry></feed>`;

const [r] = parseFeed(rss);
assert.deepEqual([r.title, r.link, r.summary, r.image], ["AI & you", "https://a.com/1", "Hello world", "https://a.com/i.jpg"]);
assert.equal(r.date.toISOString(), "2026-11-02T10:00:00.000Z");
const [a] = parseFeed(atom);
assert.deepEqual([a.title, a.link, a.summary], ["Atom post", "https://b.com/2", "Short"]);
console.log("ok");
