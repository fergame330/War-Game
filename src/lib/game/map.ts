import raw from "./mapdata.json";
import type { ContinentId, TerritoryId } from "./data";

export interface SeaLine {
  a: TerritoryId;
  b: TerritoryId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  wrap?: boolean;
}

export interface MapData {
  width: number;
  height: number;
  territories: Record<TerritoryId, { d: string; label: [number, number]; anchor?: [number, number] }>;
  continents: Record<ContinentId, string>;
  graticule: string;
  seaLines: SeaLine[];
}

/** Geometria do mapa gerada por tools/build-map.mjs. */
export const MAP = raw as unknown as MapData;
