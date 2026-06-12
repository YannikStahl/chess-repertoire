# Repertoire

A personal chess opening repertoire tool. Positions are stored as a
**transposition-aware graph** (keyed by EPD — FEN minus the move counters),
not as flat lines, so the same position reached through different move
orders is always one node.

## Features

- Board + Lichess cloud eval bar + masters database explorer
- Position-centric editing: your repertoire move (gold), expected replies,
  per-position annotations
- White and Black repertoires, separate files
- Drill mode with SM-2 spaced repetition (training state kept separate
  from repertoire data)
- PGN export (graph → spanning tree with variations, transpositions marked)
- PGN import (graph merge; conflicting repertoire moves are flagged, never
  silently overwritten)
- One-click git commit of the data directory

## Lichess API token (required for the masters explorer)

Since the February 2026 DDoS, Lichess requires being logged in to use the
opening explorer — anonymous API requests get `401 Authorization Required`.
Create a free personal access token at
<https://lichess.org/account/oauth/token> (no scopes needed) and provide it
to the backend:

```bash
# docker: put it in .env next to docker-compose.yml
echo "LICHESS_TOKEN=lip_yourtoken" > .env

# dev: export it before starting the backend
LICHESS_TOKEN=lip_yourtoken npm start
```

The eval bar / cloud eval works without a token; the masters database and
the gap finder need one.

## Run with Docker

```bash
docker compose up --build
# open http://localhost:3001
```

Data lives in `./data` (mounted as a volume). The backend initializes a git
repo there on first run. Add a remote and push for offsite backup:

```bash
cd data
git remote add origin git@github.com:you/repertoire-data.git
git push -u origin main
```

## Run for development

```bash
# terminal 1
cd backend && npm install && npm start        # API on :3001

# terminal 2
cd frontend && npm install && npm run dev     # UI on :5173, proxies /api
```

## Data model

`data/repertoire-white.json` / `data/repertoire-black.json`:

```json
{
  "version": 1,
  "color": "white",
  "positions": {
    "<epd>": {
      "annotation": "text",
      "moves": [
        { "san": "e4", "uci": "e2e4", "target": "<epd>", "mine": true }
      ]
    }
  }
}
```

`data/training.json` — SRS state, keyed `"<color>:<epd>"`. Safe to delete;
it only resets drill scheduling, never chess content.

## Notes & roadmap ideas

- Promotion is auto-queen for now (fine for opening theory).
- Conflicted positions (two "mine" moves) show a red badge — resolve by
  deleting the move you don't want.
- Ideas: variation-tree overview (reuse the PGN export walk), Lichess game
  import to diff your played games against the repertoire, per-line tags
  (e.g. "Alapin", "KID Mar del Plata"), local Stockfish via stockfish.wasm
  instead of cloud eval.
