"use client";

import { useEffect, useState } from "react";

// The dial page's small live clock line:
//   Weekday · D Mon YYYY · HH:MM:SS
// Renders nothing until mounted so server/client markup never mismatch.
export default function LiveClock() {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    function tick(): void {
      // "Fri, 7 Nov 2026, 14:03:22" -> "Fri · 7 Nov 2026 · 14:03:22"
      const parts = formatter.format(new Date()).split(", ");
      setLabel(parts.length === 3 ? `${parts[0]} · ${parts[1]} · ${parts[2]}` : parts.join(", "));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p className="text-[11px] leading-none tracking-wide text-neutral-500" aria-live="off">
      {label || " "}
    </p>
  );
}
