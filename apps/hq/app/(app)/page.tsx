import { TodayNate } from "@/components/TodayNate";
import { TodayBrandon } from "@/components/TodayBrandon";
import { getSession } from "@/lib/session";

export default async function TodayPage({ searchParams }: { searchParams: { all?: string } }) {
  const { profile } = await getSession();
  if (profile?.handle === "brandon") return <TodayBrandon all={searchParams.all === "1"} />;
  return <TodayNate />;
}
