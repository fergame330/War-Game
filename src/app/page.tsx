import Link from "next/link";
import { Box, Screen, Title } from "@/components/ui/Screen";

export default function Home() {
  return (
    <Screen>
      <Box>
        <Title />
        <p className="mb-8 text-muted">Conquiste territórios, domine continentes e conquiste o mundo.</p>
        <div className="flex flex-col items-center gap-3">
          <Link href="/local" className="btn btn-big w-full max-w-72">
            Jogar no mesmo aparelho
          </Link>
          <Link href="/online" className="btn btn-big btn-ghost w-full max-w-72">
            Jogar online
          </Link>
        </div>
      </Box>
    </Screen>
  );
}
