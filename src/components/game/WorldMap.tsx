"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CONTINENT_IDS, TERRITORY_IDS, tName, type TerritoryId } from "@/lib/game/data";
import { MAP } from "@/lib/game/map";

export interface TerritoryVisual {
  fill: string;
  classes: string;
  armies: number;
  badgeFill: string;
  badgeText: string;
  badgeClass: string;
  ring: string | null;
}

interface WorldMapProps {
  visuals: Record<TerritoryId, TerritoryVisual>;
  showNames: boolean;
  flashIds?: TerritoryId[];
  onTerritoryClick: (id: TerritoryId) => void;
  onTerritoryContext?: (id: TerritoryId) => void;
  onBackgroundClick?: () => void;
  tooltip: (id: TerritoryId) => ReactNode;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = MAP.width / 14;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function WorldMap({ visuals, showNames, flashIds, onTerritoryClick, onTerritoryContext, onBackgroundClick, tooltip }: WorldMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const view = useRef<View>({ x: 0, y: 0, w: 0, h: 0 });
  const badgeEls = useRef(new Map<TerritoryId, SVGGElement>());
  const badgeScale = useRef(1);
  const pan = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    moved: false,
    suppressClick: false,
    start: { x: 0, y: 0 },
    startView: { x: 0, y: 0, w: 0, h: 0 } as View,
    startDist: 0,
    mid: { x: 0, y: 0 },
    lastPointerType: "mouse",
  });
  const [tip, setTip] = useState<{ id: TerritoryId; x: number; y: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- visualização (viewBox sempre com a proporção da área na tela) ----------
  const aspect = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r.height / r.width : MAP.height / MAP.width;
  }, []);
  const fitWidth = useCallback(() => Math.max(MAP.width, MAP.height / aspect()), [aspect]);

  const placeBadge = useCallback((id: TerritoryId, el: SVGGElement) => {
    const [x, y] = MAP.territories[id].label;
    el.setAttribute("transform", `translate(${x},${y}) scale(${badgeScale.current})`);
  }, []);

  const applyView = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const v = view.current;
    v.w = clamp(v.w, MIN_W, fitWidth());
    v.h = v.w * aspect();
    v.x = v.w >= MAP.width ? (MAP.width - v.w) / 2 : clamp(v.x, 0, MAP.width - v.w);
    v.y = v.h >= MAP.height ? (MAP.height - v.h) / 2 : clamp(v.y, 0, MAP.height - v.h);
    svg.setAttribute("viewBox", [v.x, v.y, v.w, v.h].map((n) => n.toFixed(2)).join(" "));
    // marcadores com tamanho mínimo legível, crescendo pouco ao aproximar
    const px = (svg.getBoundingClientRect().width || MAP.width) / v.w;
    const radiusPx = clamp(13 * Math.sqrt(px * 0.63), 7.5, 20);
    const k = Math.round((radiusPx / (13 * px)) * 100) / 100;
    svg.classList.toggle("far", px < 0.45);
    if (k !== badgeScale.current) {
      badgeScale.current = k;
      badgeEls.current.forEach((el, id) => placeBadge(id, el));
    }
  }, [aspect, fitWidth, placeBadge]);

  const resetView = useCallback(() => {
    view.current.w = fitWidth();
    applyView();
  }, [applyView, fitWidth]);

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const p = toSvgPoint(clientX, clientY);
      const v = view.current;
      const newW = clamp(v.w / factor, MIN_W, fitWidth());
      const k = newW / v.w;
      v.x = p.x - (p.x - v.x) * k;
      v.y = p.y - (p.y - v.y) * k;
      v.w = newW;
      applyView();
    },
    [applyView, fitWidth]
  );

  const zoomCenter = (factor: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };

  // tamanho inicial e ao redimensionar / girar a tela
  useEffect(() => {
    resetView();
    const ro = new ResizeObserver(() => {
      const v = view.current;
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      applyView();
      v.x = cx - v.w / 2;
      v.y = cy - v.h / 2;
      applyView();
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [applyView, resetView]);

  // zoom com a roda do mouse (listener não passivo para impedir a rolagem da página)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---------- arrastar e pinça ----------
  const onPointerDown = (e: React.PointerEvent) => {
    const p = pan.current;
    p.lastPointerType = e.pointerType;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    p.moved = false;
    p.startView = { ...view.current };
    p.start = { x: e.clientX, y: e.clientY };
    if (p.pointers.size === 2) {
      const [a, b] = [...p.pointers.values()];
      p.startDist = Math.hypot(a.x - b.x, a.y - b.y);
      p.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p.pointers.has(e.pointerId)) return;
    p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = svgRef.current!;
    const scale = svg.getScreenCTM()!.a;
    if (p.pointers.size === 1) {
      const dx = e.clientX - p.start.x;
      const dy = e.clientY - p.start.y;
      if (!p.moved && Math.hypot(dx, dy) > 5) {
        p.moved = true;
        svg.classList.add("panning");
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          /* ignora */
        }
        setTip(null);
      }
      if (p.moved) {
        view.current.x = p.startView.x - dx / scale;
        view.current.y = p.startView.y - dy / scale;
        applyView();
      }
    } else if (p.pointers.size === 2 && p.startDist) {
      const [a, b] = [...p.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      p.moved = true;
      view.current = { ...p.startView };
      applyView();
      zoomAt(p.mid.x, p.mid.y, dist / p.startDist);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p.pointers.has(e.pointerId)) return;
    p.pointers.delete(e.pointerId);
    if (p.moved) {
      p.suppressClick = true;
      setTimeout(() => {
        p.suppressClick = false;
      }, 0);
    }
    if (p.pointers.size === 0) {
      svgRef.current?.classList.remove("panning");
      p.startDist = 0;
    } else {
      const [rest] = [...p.pointers.values()];
      p.start = { ...rest };
      p.startView = { ...view.current };
      p.startDist = 0;
    }
  };

  // ---------- dica ----------
  const showTip = (id: TerritoryId, clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    // mantém a dica dentro da área do mapa
    const x = Math.max(4, Math.min(clientX - r.left + 14, r.width - 250));
    const y = Math.max(4, Math.min(clientY - r.top + 14, r.height - 150));
    setTip({ id, x, y });
  };

  const handleClick = (id: TerritoryId, e: React.MouseEvent) => {
    if (pan.current.suppressClick) return;
    e.stopPropagation();
    onTerritoryClick(id);
    // no toque não existe "passar o mouse": mostra a dica por alguns segundos
    if (pan.current.lastPointerType !== "mouse") {
      showTip(id, e.clientX, e.clientY);
      if (tipTimer.current) clearTimeout(tipTimer.current);
      tipTimer.current = setTimeout(() => setTip(null), 2500);
    }
  };

  const territoryHandlers = (id: TerritoryId) => ({
    onClick: (e: React.MouseEvent) => handleClick(id, e),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onTerritoryContext?.(id);
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && !pan.current.pointers.size) showTip(id, e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && tip?.id === id) showTip(id, e.clientX, e.clientY);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") setTip(null);
    },
  });

  const wraps = MAP.seaLines.filter((l) => l.wrap);
  const leftWrap = wraps.find((l) => Math.min(l.x1, l.x2) < 1);
  const rightWrap = wraps.find((l) => Math.max(l.x1, l.x2) > MAP.width - 1);
  const flash = new Set(flashIds ?? []);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden bg-ocean" style={{ touchAction: "none" }}>
      <svg
        ref={svgRef}
        className={`map-svg block size-full ${showNames ? "" : "no-names"}`}
        viewBox={`0 0 ${MAP.width} ${MAP.height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (!pan.current.suppressClick) onBackgroundClick?.();
        }}
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(255,255,255,.15)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,.45)" strokeWidth="3" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={MAP.width} height={MAP.height} fill="var(--color-ocean)" />
        <path className="grid-line" d={MAP.graticule} />
        <g>
          {MAP.seaLines.map((l, i) => (
            <line key={i} className="sea-line" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
          ))}
        </g>
        <g>
          {TERRITORY_IDS.map((id) => {
            const v = visuals[id];
            return (
              <path
                key={id}
                d={MAP.territories[id].d}
                className={`terr ${v.classes} ${flash.has(id) ? "flash" : ""}`}
                style={{ fill: v.fill }}
                {...territoryHandlers(id)}
              />
            );
          })}
        </g>
        <g pointerEvents="none">
          {TERRITORY_IDS.filter((id) => visuals[id].classes.includes("pending")).map((id) => (
            <path key={id} d={MAP.territories[id].d} fill="url(#hatch)" />
          ))}
        </g>
        <g>
          {CONTINENT_IDS.map((c) => (
            <path key={c} className="continent-outline" d={MAP.continents[c]} />
          ))}
        </g>
        {leftWrap && (
          <text className="wrap-label" x={4} y={leftWrap.y1 + 14}>
            ◀ Rússia
          </text>
        )}
        {rightWrap && (
          <text className="wrap-label" x={MAP.width - 4} y={rightWrap.y1 + 14} textAnchor="end">
            Alaska ▶
          </text>
        )}
        <g>
          {TERRITORY_IDS.map((id) => {
            const a = MAP.territories[id].anchor;
            const [x, y] = MAP.territories[id].label;
            return a ? (
              <g key={id}>
                <line className="leader" x1={a[0]} y1={a[1]} x2={x} y2={y} />
                <circle cx={a[0]} cy={a[1]} r={1.6} fill="#fff" pointerEvents="none" />
              </g>
            ) : null;
          })}
        </g>
        <g>
          {TERRITORY_IDS.map((id) => {
            const v = visuals[id];
            const big = v.armies >= 100;
            return (
              <g
                key={id}
                className={`badge ${v.badgeClass}`}
                ref={(el) => {
                  if (el) {
                    badgeEls.current.set(id, el);
                    placeBadge(id, el);
                  } else badgeEls.current.delete(id);
                }}
                {...territoryHandlers(id)}
              >
                <text className="tname" y={27}>
                  {tName(id)}
                </text>
                {v.ring && <circle className="vassal-ring" r={17.5} style={{ stroke: v.ring }} />}
                <circle className="bc" r={big ? 16 : 13} style={{ fill: v.badgeFill }} />
                <text className="bt" y={0.5} style={{ fill: v.badgeText, fontSize: v.armies >= 1000 ? 10 : big ? 12 : undefined }}>
                  {v.armies}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 left-3 flex flex-col gap-1 compact:bottom-2 compact:left-2">
        <ZoomButton label="+" title="Aproximar" onClick={() => zoomCenter(1.4)} />
        <ZoomButton label="−" title="Afastar" onClick={() => zoomCenter(1 / 1.4)} />
        <ZoomButton label="⤢" title="Mapa inteiro" onClick={() => resetView()} />
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute z-[5] max-w-[240px] rounded-lg border border-line bg-[#0a121c]/95 px-2.5 py-1.5 text-xs leading-snug"
          style={{ left: tip.x, top: tip.y }}
        >
          {tooltip(tip.id)}
        </div>
      )}
    </div>
  );
}

function ZoomButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="size-9 cursor-pointer rounded-lg border border-line bg-panel/90 text-xl text-ink hover:border-accent compact:size-10"
    >
      {label}
    </button>
  );
}
