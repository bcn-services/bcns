"use client";

import { useState, useTransition } from "react";
import { Button } from "@bcn-services/ui";
import { mintAgentLogin, type MintResult } from "./actions";

/**
 * The password comes back once and lives in React state for that render only.
 * Nothing writes it to localStorage, a cookie or the URL — a reload loses it,
 * which is the intended behaviour: mint again to rotate.
 */
export function MintForm() {
  const [result, setResult] = useState<MintResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(await mintAgentLogin());
            })
          }
        >
          {pending ? "Minting…" : result?.ok ? "Mint a new agent login" : "Mint agent login"}
        </Button>
      </div>

      {result && !result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.message}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="rounded-md border border-primary/40 bg-primary/10 p-4 text-sm">
          <p className="font-medium text-primary">
            Copy this now — the password is shown once and is not stored anywhere.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-mono break-all">{result.email}</dd>
            <dt className="text-muted-foreground">Password</dt>
            <dd className="font-mono break-all">{result.password}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
