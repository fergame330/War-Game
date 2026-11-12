import type { Metadata } from "next";
import { LocalGame } from "@/components/game/LocalGame";

export const metadata: Metadata = { title: "Partida local — Guerra Mundial" };

export default function LocalPage() {
  return <LocalGame />;
}
