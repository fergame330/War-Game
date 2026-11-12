"use client";

import { useEffect, useState } from "react";
import { api, type MeUser } from "@/lib/online/client";

/** Usuário logado: undefined enquanto carrega, null se não estiver logado. */
export function useMe() {
  const [me, setMe] = useState<MeUser | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api<{ user: MeUser | null }>("/api/auth/me")
      .then((r) => alive && setMe(r.user))
      .catch(() => alive && setMe(null));
    return () => {
      alive = false;
    };
  }, []);
  return [me, setMe] as const;
}
