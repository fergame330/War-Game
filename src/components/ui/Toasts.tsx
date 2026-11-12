"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  text: string;
  color?: string;
  leaving?: boolean;
}

type ShowToast = (text: string, color?: string, ms?: number) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback<ShowToast>((text, color, ms = 2800) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, text, color }]);
    setTimeout(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), ms);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), ms + 350);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-16 left-1/2 z-[60] flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 flex-col gap-2 compact:top-13">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in rounded-[10px] border border-line border-l-[6px] bg-[#0a121c]/95 px-4 py-2.5 font-semibold shadow-[0_10px_30px_rgba(0,0,0,.45)] transition-opacity duration-300 compact:px-3 compact:py-2 compact:text-[13px] ${t.leaving ? "opacity-0" : ""}`}
            style={{ borderLeftColor: t.color ?? "var(--color-accent)" }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
