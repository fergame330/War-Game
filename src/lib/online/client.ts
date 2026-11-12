"use client";

export interface MeUser {
  id: string;
  username: string;
}

/** fetch com JSON; lança Error com a mensagem do servidor em caso de falha. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && !(res.status === 422 && "result" in (data as object))) {
    throw new Error(data.error ?? `Erro ${res.status}`);
  }
  return data;
}
