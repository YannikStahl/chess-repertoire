/**
 * Label index shown to the left of the board. Clicking a label jumps the board
 * to that category's root position (where it was tagged).
 *
 * props:
 *   categories – all label names
 *   active     – labels the current position belongs to (highlighted)
 *   onJump(name)
 */
export default function CategoryList({ categories, active = [], onJump }) {
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
              <button
                className={`cat-list-item${active.includes(c) ? " on" : ""}`}
                title="Jump to this label's starting position"
                onClick={() => onJump(c)}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
