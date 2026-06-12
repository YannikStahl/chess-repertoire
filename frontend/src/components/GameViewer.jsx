import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import Board from "./Board.jsx";
import MoveList from "./MoveList.jsx";
import EvalBar from "./EvalBar.jsx";
import EngineSuggestions from "./EngineSuggestions.jsx";
import { useEngine } from "../useEngine.js";
import { START_FEN } from "../chess-utils.js";

const noop = () => {};
const never = () => false;

// Replay a game's moves into board positions.
function replay(moves) {
  const chess = new Chess(START_FEN);
  return moves.map((m) => {
    let made;
    try {
      made = chess.move(m.san);
    } catch {
      made = chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci.slice(4) || undefined });
    }
    return { san: made.san, from: made.from, to: made.to, fenAfter: chess.fen() };
  });
}

/**
 * View and annotate one stored game. Mounted with key={game.id} so navigation
 * resets when switching games.
 *
 * props:
 *   game, allTags
 *   onUpdate(patch)            – patch metadata (players/year/event/tags/note)
 *   onSetComment(moveIndex, text)
 *   onDelete()
 */
export default function GameViewer({ game, allTags = [], onUpdate, onSetComment, onDelete }) {
  const plies = useMemo(() => replay(game.moves), [game.moves]);
  const [cursor, setCursor] = useState(0);
  const [orientation, setOrientation] = useState("white");
  const [tagInput, setTagInput] = useState("");
  const [showEngine, setShowEngine] = useState(true);
  const [engineSource, setEngineSource] = useState("local");

  const fen = cursor > 0 ? plies[cursor - 1].fenAfter : START_FEN;
  const engineEv = useEngine(fen, 5, engineSource, showEngine);
  const lastMove = cursor > 0 ? [plies[cursor - 1].from, plies[cursor - 1].to] : null;
  const comment = cursor > 0 ? game.moves[cursor - 1].comment || "" : "";

  // ← / → step through the game.
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") {
        setCursor((c) => Math.max(0, c - 1));
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        setCursor((c) => Math.min(plies.length, c + 1));
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plies.length]);

  const tags = game.tags || [];
  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) onUpdate({ tags: [...tags, t] });
    setTagInput("");
  }

  return (
    <div className="game-viewer">
      <div className="board-col">
        <div className="board-row">
          {showEngine && <EvalBar ev={engineEv} />}
          <Board fen={fen} orientation={orientation} lastMove={lastMove} movableColor={null} />
        </div>
        <div className="game-board-tools">
          <button className="tb-btn" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>⇅ Flip</button>
          <button className={`tb-btn${showEngine ? " on" : ""}`} onClick={() => setShowEngine((v) => !v)}>Engine: {showEngine ? "on" : "off"}</button>
          {showEngine && (
            <button className="tb-btn" onClick={() => setEngineSource((s) => (s === "local" ? "cloud" : "local"))}>
              {engineSource === "local" ? "Stockfish 18" : "Cloud"}
            </button>
          )}
          <span className="muted">{cursor} / {plies.length}</span>
        </div>
      </div>

      <div className="game-side">
        <section className="panel game-meta-panel">
          <div className="game-names">
            <input className="cat-input" placeholder="White" value={game.white} onChange={(e) => onUpdate({ white: e.target.value })} />
            <span className="g-vs">vs</span>
            <input className="cat-input" placeholder="Black" value={game.black} onChange={(e) => onUpdate({ black: e.target.value })} />
          </div>
          <div className="game-meta-row">
            <input className="cat-input g-year" placeholder="Year" inputMode="numeric" value={game.year || ""} onChange={(e) => onUpdate({ year: e.target.value ? parseInt(e.target.value, 10) || null : null })} />
            <input className="cat-input" placeholder="Event / tournament" value={game.event || ""} onChange={(e) => onUpdate({ event: e.target.value })} />
            <span className="g-result">{game.result || "*"}</span>
          </div>

          <span className="group-label">Tags</span>
          <div className="chips">
            {tags.length === 0 && <span className="empty">none</span>}
            {tags.map((t) => (
              <span key={t} className="chip chip-cat">
                <span className="chip-move">{t}</span>
                <button className="chip-x" title="Remove tag" onClick={() => onUpdate({ tags: tags.filter((x) => x !== t) })}>×</button>
              </span>
            ))}
          </div>
          <div className="cat-add">
            <input
              list="game-tag-options"
              className="cat-input"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
            />
            <datalist id="game-tag-options">
              {allTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button className="cat-btn" onClick={addTag}>Add</button>
          </div>

          <button className="remove-move game-delete" onClick={onDelete}>Delete game</button>
        </section>

        <MoveList history={game.moves} cursor={cursor} onGoTo={setCursor} />

        {showEngine && <EngineSuggestions fen={fen} ev={engineEv} source={engineSource} onPlaySan={noop} inRepertoire={never} />}

        <section className="panel">
          <span className="group-label">Move annotation</span>
          {cursor > 0 ? (
            <textarea
              className="annotation"
              placeholder={`Note on ${game.moves[cursor - 1].san}…`}
              value={comment}
              onChange={(e) => onSetComment(cursor - 1, e.target.value)}
              rows={3}
            />
          ) : (
            <p className="empty">Step into the game (→) to annotate a move.</p>
          )}

          <span className="group-label">Game note</span>
          <textarea
            className="annotation"
            placeholder="Why this game is memorable, key ideas…"
            value={game.note || ""}
            onChange={(e) => onUpdate({ note: e.target.value })}
            rows={3}
          />
        </section>
      </div>
    </div>
  );
}
