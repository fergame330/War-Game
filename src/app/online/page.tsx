import type { Metadata } from "next";
import { OnlineHome } from "@/components/online/OnlineHome";

export const metadata: Metadata = { title: "Jogar online — Guerra Mundial" };

export default function OnlinePage() {
  return <OnlineHome />;
}
