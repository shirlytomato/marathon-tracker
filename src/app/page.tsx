import Tracker from "@/components/Tracker";
import { loadRaces } from "@/lib/races";

export const dynamic = "force-static";

export default function Home() {
  return <Tracker races={loadRaces()} nowIso={new Date().toISOString()} />;
}
