"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  /** Se false, clicar fora ou Esc não fecha. */
  dismissable?: boolean;
}

export function Modal({ children, onClose, wide, dismissable = true }: ModalProps) {
  useEffect(() => {
    if (!dismissable || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissable, onClose]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#03080e]/65 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissable && onClose) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-full w-full overflow-y-auto rounded-[14px] border border-line bg-panel p-5 shadow-[0_20px_60px_rgba(0,0,0,.5)] compact:p-4 ${wide ? "max-w-[760px]" : "max-w-[460px]"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2.5 flex flex-wrap items-center gap-2 text-xl font-bold compact:text-lg">{children}</h2>;
}

export function ModalText({ children }: { children: ReactNode }) {
  return <p className="my-2 leading-relaxed text-muted">{children}</p>;
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap gap-2 [&>.btn]:flex-1">{children}</div>;
}

interface NumberPickerProps {
  title: string;
  text: ReactNode;
  min: number;
  max: number;
  initial?: number;
  confirmLabel?: string;
  note?: (v: number) => string;
  onConfirm: (v: number) => void;
  onClose: () => void;
}

export function NumberPicker({ title, text, min, max, initial, confirmLabel = "Confirmar", note, onConfirm, onClose }: NumberPickerProps) {
  const [v, setV] = useState(Math.max(min, Math.min(max, initial ?? max)));
  const set = (n: number) => setV(Math.max(min, Math.min(max, n)));
  const confirm = () => {
    onClose();
    onConfirm(v);
  };
  return (
    <Modal onClose={onClose}>
      <ModalTitle>{title}</ModalTitle>
      <ModalText>{text}</ModalText>
      <div className="mt-3.5 mb-1 flex items-center gap-2.5" onKeyDown={(e) => e.key === "Enter" && confirm()}>
        <button className="size-9 rounded-lg border border-line bg-panel-2 text-lg" onClick={() => set(v - 1)} aria-label="Menos">
          −
        </button>
        <input
          type="range"
          className="flex-1 accent-accent"
          min={min}
          max={max}
          value={v}
          onChange={(e) => set(Number(e.target.value))}
          autoFocus
        />
        <button className="size-9 rounded-lg border border-line bg-panel-2 text-lg" onClick={() => set(v + 1)} aria-label="Mais">
          +
        </button>
        <div className="w-12 text-center text-3xl font-extrabold text-accent">{v}</div>
      </div>
      {note && <p className="mt-1 text-center font-semibold text-accent">{note(v)}</p>}
      <ModalActions>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-ghost" onClick={() => set(max)}>
          Máximo
        </button>
        <button className="btn" onClick={confirm}>
          {confirmLabel}
        </button>
      </ModalActions>
    </Modal>
  );
}
