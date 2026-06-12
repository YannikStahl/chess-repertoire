import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { api } from "../api.js";
import GameViewer from "./GameViewer.jsx";

// Parse a pasted PGN into a stored-game shape (mainline + per-move comments).
// Variations are dropped; comments are kept and attached to their move.
function parsePgn(pgnText) {
  const c = new Chess();
  c.loadPgn(pgnText); // throws on invalid PGN
  const h = c.getHeaders ? c.getHeaders() : c.header();
  const comments = {};
  for (const cm of c.getComments()) comments[cm.fen] = cm.comment;
  const moves = c.history({ verbose: true }).map((m) => ({
    san: m.san,
    uci: m.from + m.to + (m.promotion || ""),
    comment: (comments[m.after] || "").trim(),
  }));
  if (moves.length === 0) throw new Error("no moves found");
  const dateStr = h.Date || h.UTCDate || "";
  const year = /^\d{4}/.test(dateStr) ? parseInt(dateStr.slice(0, 4), 10) : null;
  const clean = (v) => (v && v !== "?" ? v : "");
  return {
    white: clean(h.White),
    black: clean(h.Black),
    event: clean(h.Event),
    result: h.Result || "*",
    year: year && year > 0 ? year : null,
    moves,
  };
}

export default function GamesView() {
  const [data, setData] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [selectedId, setSelectedId] = useState(null);
  const [activeTags, setActiveTags] = useState([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api
      .getGames()
      .then((d) => {
        setData(d);
        if (d.games[0]) setSelectedId(d.games[0].id);
      })
      .catch(() => setData({ version: 1, games: [], unreachable: true }));
  }, []);

  const saveTimer = useRef(null);
  function mutate(fn) {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      setSaveState("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(
        () => api.saveGames(next).then(() => setSaveState("saved")).catch(() => setSaveState("error")),
        800
      );
      return next;
    });
  }

  if (!data) return <div className="loading">Loading games…</div>;

  const allTags = [...new Set(data.games.flatMap((g) => g.tags || []))].sort((a, b) => a.localeCompare(b));
  const filtered = data.games.filter((g) => activeTags.every((t) => (g.tags || []).includes(t)));
  const selected = data.games.find((g) => g.id === selectedId);

  function addGame(parsed, meta) {
    const id = `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const game = {
      id,
      white: meta.white,
      black: meta.black,
      year: meta.year,
      event: meta.event,
      result: parsed.result,
      tags: meta.tags,
      note: "",
      moves: parsed.moves,
      createdAt: new Date().toISOString(),
    };
    mutate((d) => d.games.unshift(game));
    setSelectedId(id);
    setAdding(false);
  }

  function updateGame(id, patch) {
    mutate((d) => {
      const g = d.games.find((x) => x.id === id);
      if (g) Object.assign(g, patch);
    });
  }

  function setComment(id, i, text) {
    mutate((d) => {
      const g = d.games.find((x) => x.id === id);
      if (g && g.moves[i]) g.moves[i].comment = text;
    });
  }

  function deleteGame(id) {
    if (!window.confirm("Delete this game?")) return;
    mutate((d) => {
      d.games = d.games.filter((x) => x.id !== id);
    });
    if (selectedId === id) setSelectedId(data.games.find((x) => x.id !== id)?.id || null);
  }

  function toggleTag(t) {
    setActiveTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  return (
    <main className="main games-layout">
      <aside className="games-sidebar">
        <div className="games-side-head">
          <h2>Games</h2>
          <span className={`save save-${saveState}`}>{saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : "save failed"}</span>
          <button className="tb-btn" onClick={() => setAdding(true)}>+ Add</button>
        </div>

        {allTags.length > 0 && (
          <div className="cat-filter games-tagfilter">
            {allTags.map((t) => (
              <button key={t} className={activeTags.includes(t) ? "on" : ""} onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </div>
        )}

        <ul className="games-list">
          {filtered.length === 0 && <li className="empty">No games{activeTags.length ? " with those tags" : " yet"}.</li>}
          {filtered.map((g) => (
            <li key={g.id}>
              <button className={`game-item${g.id === selectedId && !adding ? " on" : ""}`} onClick={() => { setSelectedId(g.id); setAdding(false); }}>
                <span className="g-players">{g.white || "?"} – {g.black || "?"}</span>
                <span className="g-meta">{[g.event, g.year].filter(Boolean).join(" · ") || "—"}</span>
                {(g.tags || []).length > 0 && (
                  <span className="g-tags">{g.tags.map((t) => <span key={t} className="g-tag">{t}</span>)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="games-main">
        {data.unreachable && <p className="empty add-game-error">Games API unreachable — restart the backend to enable the games library.</p>}
        {adding ? (
          <AddGameForm onCancel={() => setAdding(false)} onAdd={addGame} allTags={allTags} />
        ) : selected ? (
          <GameViewer
            key={selected.id}
            game={selected}
            allTags={allTags}
            onUpdate={(patch) => updateGame(selected.id, patch)}
            onSetComment={(i, text) => setComment(selected.id, i, text)}
            onDelete={() => deleteGame(selected.id)}
          />
        ) : (
          <p className="empty games-empty">No game selected. Add one with its PGN to get started.</p>
        )}
      </section>
    </main>
  );
}

function AddGameForm({ onCancel, onAdd, allTags }) {
  const [pgn, setPgn] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState({ white: "", black: "", year: "", event: "", tags: [] });
  const [tagInput, setTagInput] = useState("");

  function onPgnChange(text) {
    setPgn(text);
    if (!text.trim()) {
      setParsed(null);
      setError("");
      return;
    }
    try {
      const p = parsePgn(text);
      setParsed(p);
      setMeta((m) => ({ ...m, white: p.white, black: p.black, year: p.year || "", event: p.event }));
      setError("");
    } catch (e) {
      setParsed(null);
      setError("Couldn't read that PGN: " + e.message);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !meta.tags.includes(t)) setMeta((m) => ({ ...m, tags: [...m.tags, t] }));
    setTagInput("");
  }

  function save() {
    if (!parsed) return;
    onAdd(parsed, {
      white: meta.white,
      black: meta.black,
      year: meta.year ? parseInt(meta.year, 10) || null : null,
      event: meta.event,
      tags: meta.tags,
    });
  }

  return (
    <section className="panel add-game">
      <header className="panel-head">
        <h2>Add a game</h2>
        <button className="ml-reset" onClick={onCancel}>cancel</button>
      </header>
      <span className="group-label">Paste PGN</span>
      <textarea
        className="annotation"
        rows={7}
        placeholder="[White &quot;…&quot;] … 1. e4 e5 2. Nf3 … or just the moves"
        value={pgn}
        onChange={(e) => onPgnChange(e.target.value)}
      />
      {error && <p className="empty add-game-error">{error}</p>}
      {parsed && (
        <>
          <p className="muted">{parsed.moves.length} moves read{parsed.moves.some((m) => m.comment) ? " · comments imported" : ""}.</p>
          <div className="game-names">
            <input className="cat-input" placeholder="White" value={meta.white} onChange={(e) => setMeta((m) => ({ ...m, white: e.target.value }))} />
            <span className="g-vs">vs</span>
            <input className="cat-input" placeholder="Black" value={meta.black} onChange={(e) => setMeta((m) => ({ ...m, black: e.target.value }))} />
          </div>
          <div className="game-meta-row">
            <input className="cat-input g-year" placeholder="Year" inputMode="numeric" value={meta.year} onChange={(e) => setMeta((m) => ({ ...m, year: e.target.value }))} />
            <input className="cat-input" placeholder="Event / tournament" value={meta.event} onChange={(e) => setMeta((m) => ({ ...m, event: e.target.value }))} />
          </div>
          <span className="group-label">Tags</span>
          <div className="chips">
            {meta.tags.map((t) => (
              <span key={t} className="chip chip-cat">
                <span className="chip-move">{t}</span>
                <button className="chip-x" onClick={() => setMeta((m) => ({ ...m, tags: m.tags.filter((x) => x !== t) }))}>×</button>
              </span>
            ))}
          </div>
          <div className="cat-add">
            <input list="add-tag-options" className="cat-input" placeholder="Add tag…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} />
            <datalist id="add-tag-options">
              {allTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button className="cat-btn" onClick={addTag}>Add</button>
          </div>
          <button className="add-move" onClick={save}>Save game</button>
        </>
      )}
    </section>
  );
}
