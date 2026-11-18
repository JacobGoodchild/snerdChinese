# snerdChinese

A quiet, distraction-free page of every HSK 1–6 word (HSK 2.0 lists, ~5,000 words).

- **Click** a word → a panel opens right under its row with pinyin, meaning, audio, a character-by-character breakdown (meaning part vs. sound part, coloured on the stroke drawing) and a real example sentence.
- **Double-click** a word, or press **Space** while its panel is open → marks it reviewed. The tile turns soft sage green and slowly fades to amber (~2 weeks) and then terracotta (~4 weeks) as the review gets older.
- **R** speaks the word, **← →** move between words, **Esc** closes.
- Progress lives in your browser (`localStorage`). Use **export / import** in the header to back it up.

## Running locally

```bash
npm install
npm run dev
```

## Rebuilding the data

The JSON in `public/data/` is generated from open datasets and committed, so the site needs no backend:

```bash
npm run data
```

Sources: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT),
[Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (LGPL / Arphic Public License),
[Tatoeba](https://tatoeba.org) sentences (CC-BY 2.0 FR). Example sentences are only shown where Tatoeba has a real match.

## Deploying

Pushes to `main` build and deploy via `.github/workflows/deploy.yml`. In the repo settings, set **Pages → Source** to **GitHub Actions**.
