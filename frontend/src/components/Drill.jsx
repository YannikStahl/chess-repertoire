import { useMemo, useState } from "react";
import PositionDrill from "./PositionDrill.jsx";
import LineDrill from "./LineDrill.jsx";

// Drill hub: owns the category filter and the Positions/Lines mode toggle, then
// delegates to the matching drill. Inner drills are keyed by mode+category so
// switching starts a fresh session.
export default function Drill({ rep, training, categoryMembers, onGrade }) {
  const categories = useMemo(() => [...categoryMembers.keys()].sort((a, b) => a.localeCompare(b)), [categoryMembers]);
  const [category, setCategory] = useState(null);
  const [mode, setMode] = useState("positions"); // positions | lines

  return (
    <div className="drill-hub">
      <div className="drill-controls">
        <div className="seg">
          <button className={mode === "positions" ? "on" : ""} onClick={() => setMode("positions")}>Positions</button>
          <button className={mode === "lines" ? "on" : ""} onClick={() => setMode("lines")}>Lines</button>
        </div>
        {categories.length > 0 && (
          <div className="cat-filter">
            <button className={category === null ? "on" : ""} onClick={() => setCategory(null)}>All</button>
            {categories.map((c) => (
              <button key={c} className={category === c ? "on" : ""} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "positions" ? (
        <PositionDrill key={`p:${category}`} rep={rep} training={training} category={category} categoryMembers={categoryMembers} onGrade={onGrade} />
      ) : (
        <LineDrill key={`l:${category}`} rep={rep} training={training} category={category} onGrade={onGrade} />
      )}
    </div>
  );
}
