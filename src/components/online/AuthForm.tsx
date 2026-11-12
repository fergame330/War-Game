"use client";

import { useState } from "react";
import { api, type MeUser } from "@/lib/online/client";

/** Entrar ou criar conta (usuário + senha). */
export function AuthForm({ onDone }: { onDone: (user: MeUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await api<{ user: MeUser }>(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        body: { username, password },
      });
      onDone(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-80 flex-col gap-3 text-left">
      <div className="flex rounded-lg border border-line p-0.5">
        {(
          [
            ["login", "Entrar"],
            ["register", "Criar conta"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setMode(k);
              setError("");
            }}
            className={`flex-1 cursor-pointer rounded-md py-1.5 font-semibold ${mode === k ? "bg-accent text-[#1b1300]" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Usuário</span>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={20} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Senha</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={6}
        />
      </label>
      {error && <p className="text-[13px] text-[#ffb4a8]">{error}</p>}
      <button className="btn" disabled={busy}>
        {mode === "login" ? "Entrar" : "Criar conta"}
      </button>
    </form>
  );
}
