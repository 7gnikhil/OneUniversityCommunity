"use client";

import { useState, type ReactNode } from "react";

// Instagram-style profile tab bar (owner's reference screenshot,
// 2026-11-17): icon tabs with an active underline, panels rendered
// by the server and handed in as nodes — this component only
// switches which one is visible. Tabs with a null node are omitted
// entirely (e.g. Karaoke before the covers setup exists, About on
// your own profile).

export interface ProfileTabDef {
  id: string;
  label: string;
  icon: ReactNode;
  node: ReactNode;
}

export default function ProfileTabs({ tabs }: { tabs: ProfileTabDef[] }) {
  const visible = tabs.filter((tab) => tab.node !== null && tab.node !== undefined);
  const [active, setActive] = useState<string>(visible[0]?.id ?? "");
  if (visible.length === 0) return null;
  const current = visible.find((tab) => tab.id === active) ?? visible[0];

  return (
    <div className="flex flex-col">
      <div
        className="grid border-t border-neutral-800"
        style={{
          gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
        }}
        role="tablist"
        aria-label="Profile sections"
      >
        {visible.map((tab) => {
          const isActive = tab.id === current.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => setActive(tab.id)}
              className={`-mt-px flex items-center justify-center border-t-2 py-2.5 text-lg transition ${
                isActive
                  ? "border-white text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {tab.icon}
            </button>
          );
        })}
      </div>
      <div className="pt-4">{current.node}</div>
    </div>
  );
}
