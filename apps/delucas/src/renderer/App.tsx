/**
 * App — top-level shell with two-tab routing: Dashboard | Add & fix.
 *
 * No react-router needed — the app is two screens, a simple useState is enough.
 */

import React, { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { AddFix } from "./pages/AddFix";
import { Settings } from "./pages/Settings";

type Tab = "dashboard" | "addfix" | "settings";

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, active, onClick }: TabButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* App header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <h1 className="text-lg font-bold text-primary tracking-tight">DeLuca&apos;s</h1>
        <nav className="flex" role="tablist" aria-label="Main navigation">
          <TabButton
            label="Dashboard"
            active={tab === "dashboard"}
            onClick={() => setTab("dashboard")}
          />
          <TabButton
            label="Add & fix"
            active={tab === "addfix"}
            onClick={() => setTab("addfix")}
          />
          <TabButton
            label="Settings"
            active={tab === "settings"}
            onClick={() => setTab("settings")}
          />
        </nav>
      </header>

      {/* Tab content */}
      <main className="px-6 py-6 max-w-4xl mx-auto" role="tabpanel">
        {tab === "dashboard" ? (
          <Dashboard onGoToReview={() => setTab("addfix")} />
        ) : tab === "addfix" ? (
          <AddFix />
        ) : (
          <Settings />
        )}
      </main>
    </div>
  );
}
