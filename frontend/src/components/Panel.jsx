import { useState } from "react";
import { figurine, sideToMove } from "../chess-utils.js";

/**
 * The position-centric editor: everything about the *current* node.
 *
 * props:
 *  epd, node ({annotation, moves} | undefined)
 *  repColor       – which repertoire is open
 *  pendingMove    – last board move not yet in the repertoire, or null
 *  onAddPending() – add pendingMove (and the line leading to it) to the graph
 *  lastStored     – SAN of the move that led here, if it *is* stored, else null
 *  onRemoveLast() – remove that move from the repertoire
 *  lastMoveSan    – SAN of the last played move (stored or not), or null
 *  lastQuality    – its quality marker ("risky" | "blunder" | null)
 *  onSetLastQuality(quality) – set/clear the marker on the last played move
 *  onPlayMove(move)
 *  onDeleteMove(san)
 *  onSetQuality(san, quality)  – quality ∈ "risky" | "blunder" | null
 *  onAnnotate(text)
 *  allCategories       – every category name in use (for suggestions)
 *  inheritedCategories – categories this position inherits from an ancestor
 *  onAddCategory(name) – tag the current position (descendants inherit it)
 *  onRemoveCategory(name) – remove a tag from the current position
 */
export default function Panel({ epd, node, repColor, pendingMove, onAddPending, lastStored, onRemoveLast, lastMoveSan, lastQuality, onSetLastQuality, onPlayMove, onDeleteMove, onSetQuality, onAnnotate, allCategories = [], inheritedCategories = [], onAddCategory, onRemoveCategory }) {
  const [cat, setCat] = useState("");
  const cats = (node && node.categories) || [];
  const tag = () => {
    onAddCategory(cat);
    setCat("");
  };
  const myTurn = sideToMove(epd) === repColor;
  const moves = (node && node.moves) || [];
  const mine = moves.filter((m) => m.mine);
  const replies = moves.filter((m) => !m.mine);
  const hasConflict = mine.some((m) => m.conflict);

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{myTurn ? "Your move" : "Opponent to move"}</h2>
        {hasConflict && <span className="conflict-badge" title="Multiple repertoire moves at this position — pick one and delete the rest">conflict</span>}
      </header>

      {pendingMove && (
        <button className="add-move" onClick={onAddPending}>
          + Add {figurine(pendingMove.san)} to repertoire
        </button>
      )}

      {!pendingMove && lastStored && (
        <button className="remove-move" onClick={onRemoveLast}>
          − Remove {figurine(lastStored)} from repertoire
        </button>
      )}

      {lastMoveSan && (
        <div className="quality-row">
          <span className="quality-label">Mark {figurine(lastMoveSan)}</span>
          <button
            className={`q-btn q-risky${lastQuality === "risky" ? " on" : ""}`}
            title="Risky move"
            onClick={() => onSetLastQuality(lastQuality === "risky" ? null : "risky")}
          >
            <b>?</b> Risky
          </button>
          <button
            className={`q-btn q-blunder${lastQuality === "blunder" ? " on" : ""}`}
            title="Blunder"
            onClick={() => onSetLastQuality(lastQuality === "blunder" ? null : "blunder")}
          >
            <b>?!</b> Blunder
          </button>
        </div>
      )}

      <div className="move-group">
        <span className="group-label">{myTurn ? "Repertoire move" : "Repertoire moves (you)"}</span>
        <div className="chips">
          {mine.length === 0 && <span className="empty">none yet</span>}
          {mine.map((m) => (
            <MoveChip key={m.san} move={m} kind={m.conflict ? "conflict" : "mine"} onPlay={onPlayMove} onDelete={onDeleteMove} onSetQuality={onSetQuality} />
          ))}
        </div>
      </div>

      <div className="move-group">
        <span className="group-label">Expected replies</span>
        <div className="chips">
          {replies.length === 0 && <span className="empty">none yet</span>}
          {replies.map((m) => (
            <MoveChip key={m.san} move={m} kind="reply" onPlay={onPlayMove} onDelete={onDeleteMove} onSetQuality={onSetQuality} />
          ))}
        </div>
      </div>

      <div className="move-group">
        <span className="group-label">Categories</span>
        <div className="chips">
          {cats.length === 0 && inheritedCategories.length === 0 && <span className="empty">none</span>}
          {cats.map((c) => (
            <span key={c} className="chip chip-cat">
              <span className="chip-move">{c}</span>
              <button className="chip-x" title="Remove category" onClick={() => onRemoveCategory(c)}>×</button>
            </span>
          ))}
          {inheritedCategories.map((c) => (
            <span key={c} className="chip chip-cat chip-inherited" title="Inherited from an earlier move — remove it there">
              <span className="chip-move">{c}</span>
            </span>
          ))}
        </div>
        <div className="cat-add">
          <input
            list="category-options"
            className="cat-input"
            placeholder="Add or create category…"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tag()}
          />
          <datalist id="category-options">
            {allCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button className="cat-btn" onClick={tag} title="Everything that follows inherits this category">Tag from here</button>
        </div>
      </div>

      <div className="move-group">
        <span className="group-label">Annotation</span>
        <textarea
          className="annotation"
          placeholder="Plans, ideas, what to watch for in this position…"
          value={(node && node.annotation) || ""}
          onChange={(e) => onAnnotate(e.target.value)}
          rows={4}
        />
      </div>
    </section>
  );
}

// Move-quality markers. Click cycles none → risky (?) → blunder (?!) → none.
const QUALITY = { risky: { glyph: "?", title: "Risky move" }, blunder: { glyph: "?!", title: "Blunder" } };
const QUALITY_CYCLE = [null, "risky", "blunder"];
const nextQuality = (cur) => QUALITY_CYCLE[(QUALITY_CYCLE.indexOf(cur || null) + 1) % QUALITY_CYCLE.length];

function MoveChip({ move, kind, onPlay, onDelete, onSetQuality }) {
  const q = move.quality && QUALITY[move.quality];
  return (
    <span className={`chip chip-${kind}`}>
      <button className="chip-move" onClick={() => onPlay(move)}>{figurine(move.san)}</button>
      <button
        className={`chip-q${move.quality ? " q-" + move.quality : ""}`}
        title={q ? `${q.title} — click to change` : "Mark move quality (risky / blunder)"}
        onClick={() => onSetQuality(move.san, nextQuality(move.quality))}
      >
        {q ? q.glyph : "⚑"}
      </button>
      <button
        className="chip-x"
        title="Remove from repertoire"
        onClick={() => onDelete(move.san)}
      >
        ×
      </button>
    </span>
  );
}
