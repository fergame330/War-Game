/*
 * Gera src/lib/game/mapdata.json com os caminhos SVG de cada território.
 *
 * Fonte: Natural Earth 1:110m (pacote world-atlas). Países pequenos são
 * absorvidos pelos territórios do jogo conforme COUNTRY_TO_TERRITORY.
 *
 * Uso:  npm run build-map   (roda com tsx, pois lê os dados em TypeScript)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as topojson from 'topojson-client';
import pc from 'polygon-clipping';
import polylabel from 'polylabel';
import { CONTINENTS, TERRITORIES, TERRITORY_IDS } from '../src/lib/game/data.ts';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = { continents: CONTINENTS, territories: TERRITORIES, territoryIds: TERRITORY_IDS };

const COUNTRY_TO_TERRITORY = {
  // América do Norte
  'United States of America': 'eua', // Alasca é separado abaixo
  Canada: 'canada',
  Greenland: 'groenlandia',
  Iceland: 'groenlandia',
  Mexico: 'mexico',
  // América Central
  Guatemala: 'guatemala', Belize: 'guatemala', 'El Salvador': 'guatemala',
  Honduras: 'honduras',
  Nicaragua: 'nicaragua',
  'Costa Rica': 'costa_rica',
  Panama: 'panama',
  Cuba: 'cuba', Bahamas: 'cuba', Jamaica: 'cuba',
  Haiti: 'haiti',
  'Dominican Rep.': 'rep_dominicana', 'Puerto Rico': 'rep_dominicana',
  // América do Sul
  Brazil: 'brasil', Uruguay: 'uruguai', Argentina: 'argentina', 'Falkland Is.': 'argentina',
  Paraguay: 'paraguai', Bolivia: 'bolivia', Chile: 'chile', Peru: 'peru', Ecuador: 'equador',
  Colombia: 'colombia', Venezuela: 'venezuela', 'Trinidad and Tobago': 'venezuela',
  Guyana: 'guianas', Suriname: 'guianas',
  // África
  Algeria: 'argelia', Morocco: 'argelia', Tunisia: 'argelia',
  'W. Sahara': 'saara', Mauritania: 'saara', Mali: 'saara', Niger: 'saara',
  Ghana: 'gana', "Côte d'Ivoire": 'gana', Liberia: 'gana', 'Sierra Leone': 'gana', Guinea: 'gana',
  'Guinea-Bissau': 'gana', Senegal: 'gana', Gambia: 'gana', 'Burkina Faso': 'gana', Togo: 'gana',
  Nigeria: 'nigeria', Benin: 'nigeria', Cameroon: 'nigeria',
  Libya: 'libia',
  Chad: 'chade', 'Central African Rep.': 'chade',
  Egypt: 'egito',
  Sudan: 'sudao', 'S. Sudan': 'sudao', Eritrea: 'sudao',
  'Dem. Rep. Congo': 'congo', Congo: 'congo', Gabon: 'congo', 'Eq. Guinea': 'congo',
  Rwanda: 'congo', Burundi: 'congo',
  Ethiopia: 'etiopia', Somalia: 'etiopia', Somaliland: 'etiopia', Djibouti: 'etiopia',
  Tanzania: 'tanzania', Kenya: 'tanzania', Uganda: 'tanzania',
  Angola: 'angola', Namibia: 'angola', Zambia: 'angola',
  Mozambique: 'mocambique', Malawi: 'mocambique', Zimbabwe: 'mocambique',
  'South Africa': 'africa_do_sul', Lesotho: 'africa_do_sul', eSwatini: 'africa_do_sul', Botswana: 'africa_do_sul',
  Madagascar: 'madagascar',
  // Oriente Médio
  'Saudi Arabia': 'arabia_saudita', Qatar: 'arabia_saudita',
  Yemen: 'iemen',
  Oman: 'oma', 'United Arab Emirates': 'oma',
  Iraq: 'iraque', Kuwait: 'iraque',
  Israel: 'israel', Palestine: 'israel', Lebanon: 'israel', Jordan: 'israel', Syria: 'israel',
  Turkey: 'turquia', Cyprus: 'turquia', 'N. Cyprus': 'turquia', Georgia: 'turquia',
  Iran: 'ira', Armenia: 'ira', Azerbaijan: 'ira',
  // Europa
  Spain: 'uniao_iberica', Portugal: 'uniao_iberica',
  'United Kingdom': 'reino_unido', Ireland: 'reino_unido',
  France: 'franca', Belgium: 'franca', Luxembourg: 'franca', // Guiana Francesa separada abaixo
  Germany: 'alemanha', Netherlands: 'alemanha', Denmark: 'alemanha', Austria: 'alemanha',
  Czechia: 'alemanha', Switzerland: 'alemanha',
  Italy: 'italia',
  Poland: 'polonia', Slovakia: 'polonia', Hungary: 'polonia',
  Slovenia: 'iugoslavia', Croatia: 'iugoslavia', 'Bosnia and Herz.': 'iugoslavia', Serbia: 'iugoslavia',
  Montenegro: 'iugoslavia', Kosovo: 'iugoslavia', Macedonia: 'iugoslavia', Romania: 'iugoslavia',
  Greece: 'grecia', Albania: 'grecia', Bulgaria: 'grecia',
  Ukraine: 'ucrania', Moldova: 'ucrania',
  Belarus: 'belarus',
  Lithuania: 'lituania', Latvia: 'lituania', Estonia: 'lituania',
  Norway: 'noruega', // inclui Svalbard
  Sweden: 'suecia',
  Finland: 'finlandia',
  Russia: 'russia',
  // Ásia
  Kazakhstan: 'cazaquistao', Uzbekistan: 'cazaquistao', Turkmenistan: 'cazaquistao',
  Kyrgyzstan: 'cazaquistao', Tajikistan: 'cazaquistao',
  Afghanistan: 'afeganistao', Pakistan: 'afeganistao',
  India: 'india', Nepal: 'india', Bhutan: 'india', Bangladesh: 'india', 'Sri Lanka': 'india',
  Thailand: 'tailandia', Cambodia: 'tailandia', Laos: 'tailandia',
  China: 'china', Mongolia: 'china', Taiwan: 'china',
  Myanmar: 'myanmar',
  Vietnam: 'vietna',
  'South Korea': 'coreia_sul',
  'North Korea': 'coreia_norte',
  Japan: 'japao',
  // Oceania
  Malaysia: 'malasia', Brunei: 'malasia',
  Philippines: 'filipinas',
  Indonesia: 'indonesia', 'Timor-Leste': 'indonesia',
  'Papua New Guinea': 'papua', 'Solomon Is.': 'papua', Vanuatu: 'papua',
  Australia: 'australia', 'New Caledonia': 'australia',
  'New Zealand': 'nova_zelandia', Fiji: 'nova_zelandia',
  // Polos
  Antarctica: 'antartida', 'Fr. S. Antarctic Lands': 'antartida',
};

// Recorte de latitude do mapa e faixa do Ártico
const LAT_MIN = -72;
const LAT_MAX = 84;
// Espaço acima do mapa onde fica a calota de gelo do Ártico (separada das terras pelo mar)
const TOP_PAD = 105;

// Projeção de Miller
const WIDTH = 2000;
const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * (lat * Math.PI) / 180));
const Y_TOP = millerY(LAT_MAX);
const Y_BOTTOM = millerY(LAT_MIN);
const SCALE = WIDTH / (2 * Math.PI);
const HEIGHT = Math.round((Y_TOP - Y_BOTTOM) * SCALE) + TOP_PAD;
const project = ([lon, lat]) => [((lon + 180) / 360) * WIDTH, (Y_TOP - millerY(lat)) * SCALE + TOP_PAD];

function polygonsOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function ringCenter(ring) {
  let x = 0, y = 0;
  for (const [a, b] of ring) { x += a; y += b; }
  return [x / ring.length, y / ring.length];
}

// Decide a qual território cada polígono de um país pertence
function territoryForPolygon(countryName, poly) {
  const [lon, lat] = ringCenter(poly[0]);
  if (countryName === 'United States of America' && lat > 51 && lon < -129) return 'alaska';
  if (countryName === 'France' && lon < -40) return 'guianas';
  return COUNTRY_TO_TERRITORY[countryName];
}

// Divide polígonos que atravessam o antimeridiano (ex.: Chukotka, Fiji)
function splitAntimeridian(poly) {
  const unwrapped = poly.map((ring) => {
    const out = [ring[0].slice()];
    for (let i = 1; i < ring.length; i++) {
      let lon = ring[i][0];
      const prev = out[i - 1][0];
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
      out.push([lon, ring[i][1]]);
    }
    return out;
  });
  const outer = unwrapped[0];
  const closes = Math.abs(outer[0][0] - outer[outer.length - 1][0]) < 1e-6;
  const minLon = Math.min(...outer.map((p) => p[0]));
  const maxLon = Math.max(...outer.map((p) => p[0]));
  if (!closes || (minLon >= -180 && maxLon <= 180)) return [poly]; // anel polar ou normal
  const shifted = (off) => unwrapped.map((r) => r.map(([x, y]) => [x + off, y]));
  const box = [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]];
  const result = [];
  for (const off of [0, 360, -360]) {
    for (const piece of pc.intersection(shifted(off), box)) result.push(piece);
  }
  return result;
}

const countries = topojson.feature(world, world.objects.countries).features;
const polys = {}; // território -> lista de polígonos (lon/lat)
const missing = [];
for (const f of countries) {
  const name = f.properties.name;
  if (!COUNTRY_TO_TERRITORY[name]) { missing.push(name); continue; }
  for (const poly of polygonsOf(f.geometry).flatMap(splitAntimeridian)) {
    const t = territoryForPolygon(name, poly);
    (polys[t] = polys[t] || []).push(poly);
  }
}
if (missing.length) console.warn('Países sem território:', missing.join(', '));

const bbox = [[[-180, LAT_MIN], [180, LAT_MIN], [180, LAT_MAX], [-180, LAT_MAX], [-180, LAT_MIN]]];

const merged = {};
for (const id of DATA.territoryIds) {
  if (id === 'artico') continue;
  if (!polys[id]) throw new Error('Território sem geometria: ' + id);
  const u = pc.union(...polys[id].map((p) => [p]));
  merged[id] = pc.intersection(u, bbox);
}

// Ártico: calota de gelo desenhada (já em coordenadas do mapa), no topo, como a Antártida embaixo.
// A borda de cima é cortada pela margem do mapa e a costa de baixo é irregular.
// ruído suave determinístico (para a costa parecer natural)
function noise(x, step, seed) {
  const hash = (i) => {
    const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const i = Math.floor(x / step);
  const f = x / step - i;
  const t = f * f * (3 - 2 * f);
  return hash(i) * (1 - t) + hash(i + 1) * t - 0.5;
}
function arcticCoast(x) {
  let y = 50 + 8 * Math.sin(x / 83 + 0.5) + 4 * Math.sin(x / 37 + 2.1);
  y += 16 * noise(x, 55, 1) + 8 * noise(x, 19, 2) + 4 * noise(x, 7, 3);
  for (const [cx, depth, width] of [[230, 10, 45], [560, 14, 60], [1150, 16, 70], [1480, 9, 40], [1760, 12, 55]]) {
    y += depth * Math.exp(-(((x - cx) / width) ** 2));
  }
  return y;
}
const ARCTIC_PIECES = [[30, 940], [985, 1972]];
function arcticPiece(x0, x1) {
  const ring = [[x0, 0]];
  for (let x = x0; x <= x1; x += 3) {
    const t = Math.min(1, (x - x0) / 45, (x1 - x) / 45);
    const ease = Math.sin((Math.max(0, t) * Math.PI) / 2); // pontas arredondadas
    ring.push([x, arcticCoast(x) * ease]);
  }
  ring.push([x1, 0], [x0, 0]);
  return [ring];
}
function iceIsland(cx, cy, r, seed) {
  const ring = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rr = r * (1 + 0.25 * Math.sin(a * 3 + seed) + 0.12 * Math.sin(a * 5 + seed * 2));
    ring.push([cx + Math.cos(a) * rr * 1.5, cy + Math.sin(a) * rr]);
  }
  ring.push(ring[0]);
  return [ring];
}
const arctic = ARCTIC_PIECES.map(([a, b]) => arcticPiece(a, b)).concat([
  iceIsland(395, 80, 5, 1), iceIsland(1010, 82, 4, 2), iceIsland(1330, 80, 6, 3), iceIsland(1880, 82, 5, 4),
]);
merged.artico = arctic;
const PROJECTED = new Set(['artico']); // territórios cujas coordenadas já estão projetadas
const ARCTIC_LINES = [
  ['alaska', [-156.5, 71.2]],
  ['canada', [-78, 82]],
  ['groenlandia', [-40, 82]],
  ['noruega', [17, 78.8]],
  ['russia', [100, 78.5]],
];

function polyArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

const r1 = (v) => Math.round(v * 10) / 10;
function toPath(mp, projected) {
  let d = '';
  for (const poly of mp) {
    for (const ring of poly) {
      const pts = projected ? ring : ring.map(project);
      d += 'M' + pts.slice(0, -1).map(([x, y]) => r1(x) + ',' + r1(y)).join('L') + 'Z';
    }
  }
  return d;
}

// Posições manuais (lon, lat) para rótulos onde o automático fica ruim
const LABEL_OVERRIDES = {
  eua: [-99, 39],
  canada: [-105, 58],
  groenlandia: [-41, 73],
  alaska: [-153, 64],
  russia: [95, 63],
  noruega: [9, 61.5],
  suecia: [15.5, 62.5],
  chile: [-70.5, -27],
  antartida: [20, -69],
  indonesia: [113.5, -1],
  malasia: [102, 4],
  filipinas: [122.5, 12],
  japao: [138.5, 36.5],
  cuba: [-78.5, 21.6],
  guianas: [-56.5, 4.5],
  israel: [37.5, 32.5],
  iugoslavia: [20.5, 44.5],
  grecia: [23, 41],
  reino_unido: [-2, 53.5],
  vietna: [106, 15],
  nova_zelandia: [172, -42],
  papua: [144, -6],
  mocambique: [33, -16],
  africa_do_sul: [24, -29],
  argelia: [2.5, 28],
  saara: [-3, 19],
  gana: [-6, 10.5],
  congo: [22, -2],
  angola: [19, -14],
  tanzania: [35, -4],
  etiopia: [41, 8],
  ira: [54, 32],
  china: [102, 37],
  cazaquistao: [67, 46],
  afeganistao: [67, 32],
  alemanha: [11, 50.5],
  franca: [2.5, 47],
  lituania: [24.5, 56.5],
  ucrania: [31, 49],
  oma: [56.5, 21],
  turquia: [34, 39.2],
  honduras: [-86.6, 14.8],
  guatemala: [-90.2, 15.6],
  nicaragua: [-85, 12.8],
  costa_rica: [-84.1, 10],
  panama: [-80.2, 8.5],
  haiti: [-72.6, 19],
  rep_dominicana: [-70.3, 18.9],
};

// Territórios muito pequenos: o marcador de exércitos fica no mar, ligado por uma linha
const CALLOUTS = {
  guatemala: [-96.5, 11.5],
  honduras: [-86.5, 19.8],
  nicaragua: [-79.8, 13.8],
  costa_rica: [-89.5, 6.5],
  panama: [-81.5, 4],
  haiti: [-73, 15],
  rep_dominicana: [-67, 22],
  cuba: [-82, 25.5],
  israel: [31.5, 36],
  lituania: [19.5, 57.5],
  coreia_sul: [131.5, 37.5],
  coreia_norte: [124, 42.5],
};

// Ligações marítimas desenhadas no mapa (lon/lat)
const SEA_LINES = [
  ['groenlandia', 'reino_unido', [-14, 64.5], [-5.5, 58.3]],
  ['eua', 'cuba', [-81, 25.2], [-80.5, 22.9]],
  ['mexico', 'cuba', [-86.8, 21.2], [-84.8, 21.9]],
  ['rep_dominicana', 'venezuela', [-66, 18], [-66, 10.8]],
  ['brasil', 'gana', [-35, -5.5], [-17.2, 14.6]],
  ['argelia', 'uniao_iberica', [-2, 35.2], [-1.6, 37.3]],
  ['argelia', 'italia', [10.6, 37], [12.6, 37.8]],
  ['egito', 'arabia_saudita', [34.3, 26.5], [36.6, 25.8]],
  ['sudao', 'arabia_saudita', [39.3, 16], [42.4, 17.3]],
  ['etiopia', 'iemen', [43.2, 11.7], [43.6, 12.9]],
  ['oma', 'ira', [56.3, 26.2], [56.8, 27.1]],
  ['tanzania', 'madagascar', [40.2, -10.5], [49.2, -12.3]],
  ['mocambique', 'madagascar', [40.6, -15], [44.3, -16.4]],
  ['reino_unido', 'franca', [-1, 50.7], [-1.4, 49.6]],
  ['reino_unido', 'noruega', [-1.8, 57.5], [5.2, 59]],
  ['alemanha', 'suecia', [12.5, 55.7], [13.2, 55.9]],
  ['alemanha', 'noruega', [10.2, 57.6], [8.2, 58.1]],
  ['italia', 'grecia', [18.4, 40.1], [19.4, 40.6]],
  ['lituania', 'finlandia', [24.7, 59.5], [24.9, 60.2]],
  ['russia', 'japao', [142, 46.3], [142, 45.4]],
  ['coreia_sul', 'japao', [129.2, 35.2], [130.4, 33.7]],
  ['china', 'filipinas', [120.8, 22], [121, 18.5]],
  ['vietna', 'filipinas', [109.3, 12.5], [119.8, 16]],
  ['malasia', 'filipinas', [118.5, 7], [121.9, 7]],
  ['filipinas', 'indonesia', [125.4, 5.8], [125, 1.5]],
  ['indonesia', 'australia', [125, -9.6], [128.5, -14.8]],
  ['papua', 'australia', [142.5, -9.2], [142.5, -10.7]],
  ['australia', 'nova_zelandia', [151.5, -33], [172.6, -34.5]],
  ['argentina', 'antartida', [-66.5, -55], [-59, -63]],
  ['chile', 'antartida', [-70.5, -55.2], [-62, -64.3]],
  ['africa_do_sul', 'antartida', [20, -34.9], [20, -69.6]],
  ['australia', 'antartida', [135, -35], [135, -66]],
  ['nova_zelandia', 'antartida', [168, -46.7], [166, -71]],
  // Atravessa a borda do mapa (estreito de Bering)
  ['alaska', 'russia', [-168.5, 65.7], [-180, 65.7], 'wrap'],
  ['alaska', 'russia', [180, 65.7], [174, 65.7], 'wrap'],
];

const territories = {};
for (const id of DATA.territoryIds) {
  const mp = merged[id];
  let label;
  if (id === 'artico') {
    label = [1150, 30];
  } else if (LABEL_OVERRIDES[id]) {
    label = project(LABEL_OVERRIDES[id]);
  } else {
    let best = null, bestA = -1;
    for (const poly of mp) {
      const a = polyArea(poly[0].map(project));
      if (a > bestA) { bestA = a; best = poly; }
    }
    const p = polylabel(best.map((ring) => ring.map(project)), 0.5);
    label = [p[0], p[1]];
  }
  const t = { d: toPath(mp, PROJECTED.has(id)), label: [r1(label[0]), r1(label[1])] };
  if (CALLOUTS[id]) {
    const b = project(CALLOUTS[id]);
    t.anchor = t.label;
    t.label = [r1(b[0]), r1(b[1])];
  }
  territories[id] = t;
}

// Contornos dos continentes
// (feito já em coordenadas do mapa, pois a Arctogea junta o Ártico desenhado com a Antártida real)
const projectedOf = (id) => (PROJECTED.has(id) ? merged[id] : merged[id].map((poly) => poly.map((ring) => ring.map(project))));
const continentPaths = {};
for (const c of Object.keys(DATA.continents)) {
  const ids = DATA.territoryIds.filter((id) => DATA.territories[id].continent === c);
  continentPaths[c] = toPath(pc.union(...ids.map(projectedOf)), true);
}

// Verificação: compara fronteiras terrestres com a lista em data.js
const nb = topojson.neighbors(world.objects.countries.geometries);
const geos = world.objects.countries.geometries;
const landPairs = new Set();
geos.forEach((g, i) => {
  const a = COUNTRY_TO_TERRITORY[g.properties.name];
  for (const j of nb[i]) {
    const b = COUNTRY_TO_TERRITORY[geos[j].properties.name];
    if (a && b && a !== b) landPairs.add([a, b].sort().join('-'));
  }
});
for (const p of landPairs) {
  const [a, b] = p.split('-');
  if (a === 'franca' && (b === 'brasil' || b === 'guianas')) continue; // Guiana Francesa
  if (b === 'franca' && (a === 'brasil' || a === 'guianas')) continue;
  if (!DATA.territories[a].neighbors.includes(b)) console.log('Fronteira terrestre não listada:', p);
}

for (const [a] of ARCTIC_LINES) {
  if (!DATA.territories[a].neighbors.includes('artico')) console.log('Linha do Ártico sem fronteira:', a);
}
for (const [a, b] of SEA_LINES) {
  if (!DATA.territories[a].neighbors.includes(b)) console.log('Linha marítima sem fronteira:', a, b);
}

function graticule() {
  let d = '';
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x1, y1] = project([lon, LAT_MAX]);
    const [, y2] = project([lon, LAT_MIN]);
    d += 'M' + r1(x1) + ',' + r1(y1) + 'V' + r1(y2);
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const [x1, y] = project([-180, lat]);
    const [x2] = project([180, lat]);
    d += 'M' + r1(x1) + ',' + r1(y) + 'H' + r1(x2);
  }
  return d;
}

const out =
  JSON.stringify({
    _comment: 'Gerado por tools/build-map.mjs (não edite à mão). Geografia: Natural Earth (domínio público), via world-atlas.',
    width: WIDTH,
    height: HEIGHT,
    territories,
    continents: continentPaths,
    graticule: graticule(),
    seaLines: SEA_LINES.map(([a, b, p, q, wrap]) => {
      const [x1, y1] = project(p).map(r1);
      const [x2, y2] = project(q).map(r1);
      return wrap ? { a, b, x1, y1, x2, y2, wrap: true } : { a, b, x1, y1, x2, y2 };
    }).concat(ARCTIC_LINES.map(([a, p]) => {
      const [x1, y1] = project(p).map(r1);
      return { a, b: 'artico', x1, y1, x2: x1, y2: r1(arcticCoast(x1) - 4) };
    })),
  }) + '\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'lib', 'game', 'mapdata.json'), out);

console.log('Mapa gerado:', WIDTH + 'x' + HEIGHT, (out.length / 1024).toFixed(0) + ' KB');
