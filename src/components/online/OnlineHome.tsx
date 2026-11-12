"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ONLINE_MODES, type OnlineModeKey } from "@/lib/game/engine";
import { api } from "@/lib/online/client";
import { Box, Screen } from "@/components/ui/Screen";
import { useToast } from "@/components/ui/Toasts";
import { AuthForm } from "./AuthForm";
import { useMe } from "./useMe";

interface MyRoom {
  code: string;
  mode: string;
  status: "LOBBY" | "PLAYING";
  players: number;
  capacity: number;
}

export function OnlineHome() {
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useMe();
  const [mode, setMode] = useState<OnlineModeKey>("1x1");
  const [reconnectTimer, setReconnectTimer] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<MyRoom[]>([]);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    api<{ rooms: MyRoom[] }>("/api/rooms")
      .then((r) => alive && setRooms(r.rooms))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [me]);

  if (me === undefined) {
    return (
      <Screen>
        <p className="text-muted">Carregando…</p>
      </Screen>
    );
  }

  if (!me) {
    return (
      <Screen>
        <Box>
          <h2 className="mb-1 text-2xl font-bold">Jogar online</h2>
          <p className="mb-5 text-muted">Entre ou crie uma conta para criar salas e jogar com outras pessoas.</p>
          <AuthForm onDone={setMe} />
          <Link href="/" className="mt-5 inline-block text-sm text-muted underline">
            Voltar
          </Link>
        </Box>
      </Screen>
    );
  }

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ code: string }>("/api/rooms", { body: { mode, reconnectTimer } });
      router.push(`/sala/${r.code}`);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    try {
      await api(`/api/rooms/${encodeURIComponent(c)}/join`, { body: {} });
      router.push(`/sala/${c}`);
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { body: {} });
    setMe(null);
  };

  return (
    <Screen>
      <Box wide>
        <div className="mb-4 flex items-center justify-between gap-2 text-sm">
          <Link href="/" className="text-muted underline">
            Início
          </Link>
          <span className="text-muted">
            Logado como <b className="text-ink">{me.username}</b> ·{" "}
            <button className="cursor-pointer underline" onClick={logout}>
              sair
            </button>
          </span>
        </div>

        <h2 className="mb-3 text-2xl font-bold">Criar sala</h2>
        <div className="grid grid-cols-4 gap-2 compact:grid-cols-3">
          {(Object.keys(ONLINE_MODES) as OnlineModeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`flex cursor-pointer flex-col items-center rounded-[10px] border-2 px-2 py-2 font-bold ${k === mode ? "border-accent bg-accent text-[#1b1300]" : "border-line bg-panel-2 hover:border-accent"}`}
            >
              {ONLINE_MODES[k].label}
              <small className="text-[11px] font-semibold opacity-75">{ONLINE_MODES[k].players} jogadores</small>
            </button>
          ))}
        </div>
        <label className="mt-3 flex cursor-pointer items-start justify-center gap-2 text-left text-[13px] text-muted">
          <input type="checkbox" className="mt-0.5 accent-accent" checked={reconnectTimer} onChange={(e) => setReconnectTimer(e.target.checked)} />
          <span>
            <b className="text-ink">Tempo de reconexão (3 min)</b>: quem cair tem 3 minutos para voltar; se não voltar, seus territórios vão para os aliados e as cartas
            são divididas.
          </span>
        </label>
        <button className="btn btn-big mt-4" disabled={busy} onClick={create}>
          Criar sala {ONLINE_MODES[mode].label}
        </button>

        <h2 className="mt-8 mb-3 text-2xl font-bold">Entrar com código</h2>
        <form onSubmit={join} className="mx-auto flex max-w-80 gap-2">
          <input
            className="input text-center font-mono text-lg tracking-[0.3em] uppercase"
            placeholder="CÓDIGO"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label="Código da sala"
          />
          <button className="btn" disabled={busy || code.trim().length < 4}>
            Entrar
          </button>
        </form>

        {rooms.length > 0 && (
          <>
            <h2 className="mt-8 mb-2 text-lg font-bold">Suas salas</h2>
            <div className="flex flex-col gap-1.5">
              {rooms.map((r) => (
                <Link key={r.code} href={`/sala/${r.code}`} className="flex items-center gap-3 rounded-lg bg-panel-2 px-3 py-2 text-left hover:bg-line">
                  <span className="font-mono font-bold">{r.code}</span>
                  <span className="text-muted">{r.mode}</span>
                  <span className="ml-auto text-xs text-muted">
                    {r.status === "PLAYING" ? "em andamento" : `aguardando ${r.players}/${r.capacity}`}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </Box>
    </Screen>
  );
}
