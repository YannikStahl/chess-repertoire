import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import Board from "./Board.jsx";
import { epdToFen, figurine, gradeSrs, isDue, newSrsItem, sideToMove, START_FEN } from "../chess-utils.js";

// Today's deck: every position where it's our turn and we have a repertoire move,
// optionally restricted to a category (by inherited membership). Unseen positions
// count as new (due immediately).
function buildDeck(rep, training, category, categoryMembers) {
  const inCategory = category ? categoryMembers.get(category) : null;
  const deck = [];
  for (const [epd, node] of Object.entries(rep.positions)) {
    if (sideToMove(epd) !== rep.color) continue;
    const mine = (node.moves || []).filter((m) => m.mine);
    if (mine.length === 0) continue;
    if (inCategory && !inCategory.has(epd)) continue;
    const key = `${rep.color}:${epd}`;
    const item = training.items[key] || newSrsItem();
    if (isDue(item)) deck.push({ key, epd, answers: mine, item });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Spaced-repetition single-position drill. Remounted (via key) when the category
// changes, so the deck is rebuilt fresh.
export default function PositionDrill({ rep, training, category, categoryMembers, onGrade }) {
  const [session] = useState(() => buildDeck(rep, training, category, categoryMembers));
  const [idx, setIdx] = useState(0);
  const [state, setState] = useState("ask"); // ask | correct | wrong
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [shownFen, setShownFen] = useState(null);

  const card = session[idx];
  const fen = shownFen || (card ? epdToFen(card.epd) : START_FEN);

  const annotation = useMemo(() => {
    if (!card) return "";
    const node = rep.positions[card.epd];
    return (node && node.annotation) || "";
  }, [card, rep]);

  function handleMove(from, to) {
    if (state !== "ask" || !card) return;
    const chess = new Chess(epdToFen(card.epd));
    let made;
    try {
      made = chess.move({ from, to, promotion: "q" });
    } catch {
      return;
    }
    const ok = card.answers.some((a) => a.san === made.san);
    setShownFen(chess.fen());
    if (ok) {
      setState("correct");
      setScore((s) => ({ ...s, right: 1 + s.right }));
      onGrade(card.key, gradeSrs(card.item, true));
      setTimeout(next, 700);
    } else {
      setState("wrong");
      setScore((s) => ({ ...s, wrong: 1 + s.wrong }));
      onGrade(card.key, gradeSrs(card.item, false));
    }
  }

  function next() {
    setShownFen(null);
    setState("ask");
    setIdx((i) => i + 1);
  }

  return (
    <div className="drill-layout">
      <Board fen={fen} orientation={rep.color} movableColor={card && state === "ask" ? rep.color : null} lastMove={null} onMove={handleMove} />
      <section className={`panel drill-card drill-${state}`}>
        <header className="panel-head">
          <h2>Positions</h2>
          {card && (
            <span className="muted">
              {idx + 1} / {session.length} · ✓ {score.right} ✗ {score.wrong}
            </span>
          )}
        </header>
        {!card ? (
          <p className="muted">
            {score.right + score.wrong > 0
              ? `Session: ${score.right} correct, ${score.wrong} missed.`
              : category
              ? `Nothing due in “${category}”. Pick another category or come back tomorrow.`
              : "Nothing is due. Add more lines or come back tomorrow."}
          </p>
        ) : (
          <>
            {state === "ask" && <p className="drill-prompt">Play your repertoire move.</p>}
            {state === "correct" && <p className="drill-prompt ok">Correct ✓</p>}
            {state === "wrong" && (
              <>
                <p className="drill-prompt bad">Book move: {card.answers.map((a) => figurine(a.san)).join(" or ")}</p>
                {annotation && <p className="drill-note">{annotation}</p>}
                <button className="add-move" onClick={next}>Next</button>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
