# Architecture

```
 RSS / Atom feeds ──► build.mjs ──► Claude (Agent SDK, one turn, no tools)
                         │                 │ ids + headlines + summaries
                         │◄────────────────┘
                         ▼
               public/edition.json ──► wrangler deploy ──► phone
                                                      (index.html + sw.js)
```

| File | Responsibility |
|---|---|
| `build.mjs` | Fetch feeds, filter by age, prompt Claude, validate the reply, add og:image fallbacks, write the edition |
| `public/index.html` | Render the cover, cards, quote and end page. Page-turn geometry, gestures, resume position |
| `public/sw.js` | Network first, cache fallback |
| `test.mjs` | Parser checks for RSS 2.0 and Atom |

## The editor is untrusted

Claude only gets numbered candidates and returns ids. `edit()` keeps a card only if its id exists, then
copies `link`, `source` and `image` from the feed item, so a model mistake can't produce a fake URL. The
reader escapes every string before it goes into HTML. If the reply isn't valid JSON or has fewer than six
usable cards, the build tries once more and then fails, leaving yesterday's edition in place.

## The page turn

Pages are stacked, and only the current one is visible. During a turn:

1. The corner `C` travels toward the spine and rises in a sine arc, so the fold runs on a diagonal.
2. The corner is held within the page's reach of both spine ends, so the paper never stretches.
3. The fold line is the perpendicular bisector of `C` and the finger point `F`. `cut()` clips the page to one
   side of that line with a `clip-path: polygon()`.
4. A clone of the page (the "flap") is clipped to the other side and mirrored across the line with a
   reflection `matrix()`. It shows the back of the paper.
5. Two gradients fake light: a bright crease that darkens toward the corner on the flap, and a shadow cast
   on the next page.

Letting go past 20% of the way, or flicking faster than 0.5 px/ms, completes the turn with a cubic ease.

## Things that bit us

- **A drag that ended on a link opened it.** The click handler now runs in the capture phase and cancels
  the click if the pointer moved.
- **Feeds dated in the future** (time-zone mistakes) jumped to the top. Items with a future date are dropped.
- **Many feeds carry no image.** The build fetches the article and reads `og:image`, with a 10 s timeout per card.
