import racesJson from "../../data/races.json";
import type { Race } from "@/types/race";

export function loadRaces(): Race[] {
  return racesJson as Race[];
}
