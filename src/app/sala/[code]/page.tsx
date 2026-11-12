import { Suspense } from "react";
import type { Metadata } from "next";
import { RoomClient } from "@/components/online/RoomClient";
import { Screen } from "@/components/ui/Screen";

export const metadata: Metadata = { title: "Sala — Guerra Mundial" };

async function Room({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomClient code={code.toUpperCase()} />;
}

export default function RoomPage({ params }: PageProps<"/sala/[code]">) {
  return (
    <Suspense
      fallback={
        <Screen>
          <p className="text-muted">Carregando sala…</p>
        </Screen>
      }
    >
      <Room params={params} />
    </Suspense>
  );
}
