import { Board, type Section } from "@/components/Board";
import { TodayBrandon } from "@/components/TodayBrandon";
import { getSession } from "@/lib/session";

// Headings per handle, from the variant-g prototype (?as=nate|brandon). Rows arrive with later items.
const HEADINGS: Record<"nate" | "brandon", { title: string; hot?: boolean; sub?: string }[]> = {
  nate: [
    { title: "Approve", hot: true },
    { title: "Fires", hot: true },
    { title: "Waiting on you" },
    { title: "Your tasks" },
  ],
  brandon: [
    { title: "Follow-ups", hot: true },
    { title: "Calls due", sub: "by fit" },
    { title: "Consults" },
    { title: "Your tasks" },
  ],
};

export default async function TodayPage({ searchParams }: { searchParams: { all?: string } }) {
  const { profile } = await getSession();
  const handle = profile?.handle ?? "nate";
  if (handle === "brandon") return <TodayBrandon all={searchParams.all === "1"} />;
  const name = handle.charAt(0).toUpperCase() + handle.slice(1);
  const sections: Section[] = HEADINGS[handle].map((h, i) => ({ id: `s${i}`, rows: [], ...h }));
  return (
    <Board
      head={
        <>
          <h1>Today, {name}</h1>
          <p className="date">Nothing queued yet.</p>
        </>
      }
      sections={sections}
      idle={<p className="hint">Nothing waiting. Enjoy the quiet.</p>}
    />
  );
}
