# snerdChinese

A quiet, distraction-free page with every HSK 1–6 word (HSK 2.0 lists, about 5,000 words).

**Live site:** https://jacobgoodchild.github.io/snerdChinese/

## How it works

- **Click** a word to open a panel right under its row:
  - pinyin, meaning, HSK level and audio
  - a card for each character: the stroke drawing coloured by part (teal = meaning part, amber = sound part), the type of character, and a plain-English explanation
  - **sound family:** other HSK characters that share the same sound part (情 → 请 晴 清 睛 精)
  - **don't confuse with:** classic look-alikes (己 / 已 / 巳, 未 / 末 …)
  - click a part (like 青) to see its own breakdown, or ▶ strokes to watch the stroke order
  - up to three real example sentences from Tatoeba, with pinyin and English you can show or hide
- **Double-click**, or press **Space** while a word is open, to mark it reviewed. The tile turns soft sage green, then slowly fades to amber (about 2 weeks) and terracotta (about 4 weeks).
- Each level's header shows how many words you've reviewed, and how many are fading.

### Keyboard

| key | does |
| --- | --- |
| `space` | mark the open word reviewed |
| `r` | speak the word |
| `p` / `e` | show/hide the sentence's pinyin / English |
| `←` `→` | previous / next word |
| `d` | open your most faded word |
| `/` | search by characters, pinyin (tones optional) or English |
| `esc` | close |

Progress is saved in your browser (`localStorage`). Use **export / import** in the header to back it up or move it to another device.

## Development

```bash
npm install
npm run dev
```

```bash
npm test            # unit + data checks
npm run build
npm run test:e2e    # browser test (needs Playwright + Chromium)
```

## Rebuilding the data

The JSON in `public/data/` is generated from open datasets and committed, so the site needs no backend:

```bash
npm run data
```

See [`public/data/LICENSES.md`](public/data/LICENSES.md) for sources and licences. Example sentences only appear where Tatoeba has a real match; the app never makes them up.

## Deploying

Pushes to `main` run the tests, build and deploy via `.github/workflows/deploy.yml`.
In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
