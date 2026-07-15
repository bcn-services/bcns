/**
 * App shell — top-level React component.
 * Routing placeholder: future phases will add react-router-dom here.
 */

import React from "react";

export default function App(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">DeLuca&apos;s</h1>
        <p className="text-muted-foreground">App scaffold — P1 complete</p>
      </div>
    </div>
  );
}
