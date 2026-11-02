# Building

| | |
|---|---|
| Node | 22+ (built-in `fetch` and `WebSocket`) |
| Claude | Claude Code signed in, for `npm run build` |
| Cloudflare | `wrangler` login and `CLOUDFLARE_ACCOUNT_ID` in `.env`, for deploys |
| Chrome | For `Tools/screenshots.mjs` |

## First run

```sh
npm install
cp Tools/sample-edition.json public/edition.json
npm run dev            # wrangler dev on port 6262, reachable from your phone on the same network
npm test
```

`npm run build` replaces the sample with today's real edition (about a minute: feeds, then one Claude call).

## Layout

```
build.mjs                  edition builder (FEEDS, MAX_AGE_H, PROMPT live at the top)
test.mjs                   parser checks
public/index.html          reader
public/sw.js               service worker
public/manifest.webmanifest, icon-*.png, fonts/
Tools/sample-edition.json  made-up edition for demos and screenshots
Tools/screenshots.mjs      headless Chrome capture
licenses/OFL.txt           font licence
```

## Changing the edition

- Feeds: edit `FEEDS` in `build.mjs`. A new section also needs a label in `LABEL` in `index.html`, an age in
  `MAX_AGE_H` and a line in `PROMPT`.
- Mix and length: edit the counts and word limits in `PROMPT`.

## Deploying

```sh
cp .env.example .env     # set CLOUDFLARE_ACCOUNT_ID
npm run publish          # build + wrangler deploy
```

For a new paper each morning, run `npm run publish` from launchd, cron or any scheduler on a machine
that is signed in to Claude Code.

## Regenerating screenshots

```sh
node Tools/screenshots.mjs
```

It serves `public/` on port 6299 with the sample edition swapped in and writes four 1600 px PNGs to
`docs/screenshots/`. Nothing is fetched from the feeds and Claude is never called.
