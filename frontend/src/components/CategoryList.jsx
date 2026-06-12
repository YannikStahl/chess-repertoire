import { useState } from "react";

/**
 * Label index shown to the left of the board. Clicking a label jumps the board
 * to that category's root position. Each label can carry a "setup": an ordered
 * list of your moves played wherever no explicit move is stored in that
 * category (system openings like the KID).
 *
 * props:
 *   categories – all label names
 *   active     – labels the current position belongs to (highlighted)
 *   setups     – { [category]: ["Nf6","g6",…] }
 *   onSetSetup(name, sansArray|null)
 *   onJump(name)
 */
export default function CategoryList({ categories, active = [], setups = {}, onSetSetup, onCleanup, onJump }) {
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState("");

  function openEditor(c) {
    if (editing === c) {
      setEditing(null);
      return;
    }
    setEditing(c);
    setText((setups[c] || []).join(" "));
  }

  function save(c) {
    const sans = text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    onSetSetup(c, sans.length ? sans : null);
    setEditing(null);
  }

  return (
    <section className="panel cat-list-panel">
      <header className="panel-head">
        <h2>Labels</h2>
      </header>
      {categories.length === 0 ? (
        <p className="empty">No labels yet — tag a position to create one.</p>
      ) : (
        <ul className="cat-list">
          {categories.map((c) => (
            <li key={c}>
              <div className="cat-row">
                <button
                  className={`cat-list-item${active.includes(c) ? " on" : ""}`}
                  title="Jump to this label's starting position"
                  onClick={() => onJump(c)}
                >
                  {c}
                </button>
                <button
                  className={`cat-gear${setups[c] ? " has" : ""}`}
                  title={setups[c] ? `Setup: ${setups[c].join(" ")}` : "Define a setup (moves you play regardless of the opponent)"}
                  onClick={() => openEditor(c)}
                >
                  ⚙
                </button>
              </div>
              {editing === c && (
                <div className="setup-editor">
                  <input
                    className="cat-input"
                    placeholder="Nf6 g6 Bg7 O-O d6 …"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && save(c)}
                    autoFocus
                  />
                  <button className="cat-btn" onClick={() => save(c)}>Save</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {Object.keys(setups).length > 0 && (
        <button
          className="cat-btn cleanup-btn"
          title="Remove stored moves that just follow your setups (annotated, tagged, flagged and exception lines are kept)"
          onClick={onCleanup}
        >
          🧹 Clean setup lines
        </button>
      )}
    </section>
  );
}
