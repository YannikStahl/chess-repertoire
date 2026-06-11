// Map centipawns to a white-share percentage with a soft sigmoid.
function whiteShare(cp) {
  return 50 + 50 * Math.tanh(cp / 600);
}

// Presentational: renders a normalized eval { available, depth, pvs } where
// pv scores are from White's perspective (see useEngine).
export default function EvalBar({ ev }) {
  let share = 50;
  let label = "–";
  if (ev && ev.available && ev.pvs && ev.pvs.length) {
    const pv = ev.pvs[0];
    if (pv.mate !== undefined) {
      share = pv.mate > 0 ? 99 : 1;
      label = `M${Math.abs(pv.mate)}`;
    } else if (pv.cp !== undefined) {
      share = whiteShare(pv.cp);
      label = (pv.cp >= 0 ? "+" : "−") + Math.abs(pv.cp / 100).toFixed(1);
    }
  }

  return (
    <div className="eval-bar" title={ev && ev.available ? `Evaluation, depth ${ev.depth}` : "No evaluation for this position"}>
      <div className="eval-white" style={{ height: `${share}%` }} />
      <span className="eval-label">{label}</span>
    </div>
  );
}
