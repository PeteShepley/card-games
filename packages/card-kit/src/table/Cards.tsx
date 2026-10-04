import type { ReactNode } from "react";

// A player's name with a dot that pulses while the table waits on them,
// styled by table.css. The cards themselves are drawn on the canvas.

export function Nameplate({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span className={`nameplate${active ? " nameplate--active" : ""}`}>
      <span className="nameplate__dot" />
      {children}
    </span>
  );
}
