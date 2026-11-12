/*
 * Dados estáticos do jogo: continentes, territórios e fronteiras.
 */

export interface ContinentInfo {
  name: string;
  bonus: number;
  color: string;
}

export const CONTINENTS = {
  na: { name: 'América do Norte', bonus: 2, color: '#c9a66b' },
  ca: { name: 'América Central', bonus: 3, color: '#d98c5f' },
  sa: { name: 'América do Sul', bonus: 4, color: '#8fb36b' },
  af: { name: 'África', bonus: 5, color: '#d6b85a' },
  me: { name: 'Oriente Médio', bonus: 2, color: '#c98f8f' },
  eu: { name: 'Europa', bonus: 4, color: '#7fa3c9' },
  as: { name: 'Ásia', bonus: 4, color: '#b98fc9' },
  oc: { name: 'Oceania', bonus: 2, color: '#6bb3a6' },
  ag: { name: 'Arctogea', bonus: 1, color: '#dbe8f2' }, // Ártico + Antártida
} as const satisfies Record<string, ContinentInfo>;

export type ContinentId = keyof typeof CONTINENTS;

// [id, nome, continente]
const LIST = [
  ['eua', 'Estados Unidos', 'na'],
  ['canada', 'Canadá', 'na'],
  ['groenlandia', 'Groenlândia', 'na'],
  ['alaska', 'Alaska', 'na'],
  ['mexico', 'México', 'na'],

  ['guatemala', 'Guatemala', 'ca'],
  ['honduras', 'Honduras', 'ca'],
  ['nicaragua', 'Nicarágua', 'ca'],
  ['costa_rica', 'Costa Rica', 'ca'],
  ['panama', 'Panamá', 'ca'],
  ['cuba', 'Cuba', 'ca'],
  ['haiti', 'Haiti', 'ca'],
  ['rep_dominicana', 'República Dominicana', 'ca'],

  ['brasil', 'Brasil', 'sa'],
  ['uruguai', 'Uruguai', 'sa'],
  ['argentina', 'Argentina', 'sa'],
  ['paraguai', 'Paraguai', 'sa'],
  ['bolivia', 'Bolívia', 'sa'],
  ['chile', 'Chile', 'sa'],
  ['peru', 'Peru', 'sa'],
  ['equador', 'Equador', 'sa'],
  ['colombia', 'Colômbia', 'sa'],
  ['venezuela', 'Venezuela', 'sa'],
  ['guianas', 'Guianas', 'sa'],

  ['argelia', 'Argélia', 'af'],
  ['saara', 'Saara', 'af'],
  ['gana', 'Gana', 'af'],
  ['nigeria', 'Nigéria', 'af'],
  ['libia', 'Líbia', 'af'],
  ['chade', 'Chade', 'af'],
  ['egito', 'Egito', 'af'],
  ['sudao', 'Sudão', 'af'],
  ['congo', 'Congo', 'af'],
  ['etiopia', 'Etiópia', 'af'],
  ['tanzania', 'Tanzânia', 'af'],
  ['angola', 'Angola', 'af'],
  ['mocambique', 'Moçambique', 'af'],
  ['africa_do_sul', 'África do Sul', 'af'],
  ['madagascar', 'Madagascar', 'af'],

  ['arabia_saudita', 'Arábia Saudita', 'me'],
  ['iemen', 'Iêmen', 'me'],
  ['oma', 'Omã', 'me'],
  ['iraque', 'Iraque', 'me'],
  ['israel', 'Israel', 'me'],
  ['turquia', 'Turquia', 'me'],
  ['ira', 'Irã', 'me'],

  ['uniao_iberica', 'União Ibérica', 'eu'],
  ['reino_unido', 'Reino Unido', 'eu'],
  ['franca', 'França', 'eu'],
  ['alemanha', 'Alemanha', 'eu'],
  ['italia', 'Itália', 'eu'],
  ['polonia', 'Polônia', 'eu'],
  ['iugoslavia', 'Iugoslávia', 'eu'],
  ['grecia', 'Grécia', 'eu'],
  ['ucrania', 'Ucrânia', 'eu'],
  ['belarus', 'Belarus', 'eu'],
  ['lituania', 'Lituânia', 'eu'],
  ['noruega', 'Noruega', 'eu'],
  ['suecia', 'Suécia', 'eu'],
  ['finlandia', 'Finlândia', 'eu'],
  ['russia', 'Rússia', 'eu'],

  ['cazaquistao', 'Cazaquistão', 'as'],
  ['afeganistao', 'Afeganistão', 'as'],
  ['india', 'Índia', 'as'],
  ['tailandia', 'Tailândia', 'as'],
  ['china', 'China', 'as'],
  ['myanmar', 'Myanmar', 'as'],
  ['vietna', 'Vietnã', 'as'],
  ['coreia_sul', 'Coreia do Sul', 'as'],
  ['coreia_norte', 'Coreia do Norte', 'as'],
  ['japao', 'Japão', 'as'],

  ['malasia', 'Malásia', 'oc'],
  ['filipinas', 'Filipinas', 'oc'],
  ['indonesia', 'Indonésia', 'oc'],
  ['papua', 'Papua-Nova Guiné', 'oc'],
  ['australia', 'Austrália', 'oc'],
  ['nova_zelandia', 'Nova Zelândia', 'oc'],

  ['antartida', 'Antártida', 'ag'],
  ['artico', 'Ártico', 'ag'],
] as const;

export type TerritoryId = (typeof LIST)[number][0];

export interface TerritoryInfo {
  id: TerritoryId;
  name: string;
  continent: ContinentId;
  neighbors: TerritoryId[];
}

// Fronteiras (bidirecionais). Fronteiras terrestres + ligações marítimas.
const BORDERS: string[] = [
  // América do Norte
  'alaska-canada', 'alaska-russia', 'alaska-artico',
  'canada-eua', 'canada-groenlandia', 'canada-artico',
  'groenlandia-artico', 'groenlandia-reino_unido',
  'eua-mexico', 'eua-cuba',

  // América Central
  'mexico-guatemala', 'mexico-cuba',
  'guatemala-honduras', 'honduras-nicaragua', 'nicaragua-costa_rica',
  'costa_rica-panama', 'panama-colombia',
  'cuba-haiti', 'haiti-rep_dominicana', 'rep_dominicana-venezuela',

  // América do Sul
  'colombia-venezuela', 'colombia-equador', 'colombia-peru', 'colombia-brasil',
  'venezuela-guianas', 'venezuela-brasil',
  'guianas-brasil',
  'equador-peru',
  'peru-brasil', 'peru-bolivia', 'peru-chile',
  'bolivia-brasil', 'bolivia-paraguai', 'bolivia-argentina', 'bolivia-chile',
  'chile-argentina', 'paraguai-brasil', 'paraguai-argentina',
  'argentina-uruguai', 'argentina-brasil', 'uruguai-brasil',
  'brasil-gana', 'argentina-antartida', 'chile-antartida',

  // África
  'argelia-saara', 'argelia-libia', 'argelia-uniao_iberica', 'argelia-italia',
  'saara-gana', 'saara-nigeria', 'saara-libia', 'saara-chade',
  'gana-nigeria',
  'nigeria-chade', 'nigeria-congo',
  'libia-chade', 'libia-egito', 'libia-sudao',
  'chade-sudao', 'chade-congo',
  'egito-sudao', 'egito-israel', 'egito-arabia_saudita',
  'sudao-etiopia', 'sudao-congo', 'sudao-tanzania', 'sudao-arabia_saudita',
  'congo-tanzania', 'congo-angola',
  'etiopia-tanzania', 'etiopia-iemen',
  'tanzania-angola', 'tanzania-mocambique', 'tanzania-madagascar',
  'angola-mocambique', 'angola-africa_do_sul',
  'mocambique-africa_do_sul', 'mocambique-madagascar',
  'africa_do_sul-antartida',

  // Oriente Médio
  'arabia_saudita-iemen', 'arabia_saudita-oma', 'arabia_saudita-iraque', 'arabia_saudita-israel',
  'iemen-oma', 'oma-ira',
  'iraque-israel', 'iraque-turquia', 'iraque-ira',
  'israel-turquia',
  'turquia-ira', 'turquia-grecia', 'turquia-russia',
  'ira-russia', 'ira-cazaquistao', 'ira-afeganistao',

  // Europa
  'uniao_iberica-franca',
  'reino_unido-franca', 'reino_unido-noruega',
  'franca-alemanha', 'franca-italia',
  'alemanha-italia', 'alemanha-polonia', 'alemanha-iugoslavia', 'alemanha-suecia', 'alemanha-noruega',
  'italia-iugoslavia', 'italia-grecia',
  'polonia-iugoslavia', 'polonia-ucrania', 'polonia-belarus', 'polonia-lituania', 'polonia-russia',
  'iugoslavia-grecia', 'iugoslavia-ucrania',
  'ucrania-belarus', 'ucrania-russia',
  'belarus-lituania', 'belarus-russia',
  'lituania-russia', 'lituania-finlandia',
  'noruega-suecia', 'noruega-finlandia', 'noruega-russia', 'noruega-artico',
  'suecia-finlandia',
  'finlandia-russia',
  'russia-artico', 'russia-cazaquistao', 'russia-china', 'russia-coreia_norte', 'russia-japao',

  // Ásia
  'cazaquistao-afeganistao', 'cazaquistao-china',
  'afeganistao-china', 'afeganistao-india',
  'india-china', 'india-myanmar',
  'china-myanmar', 'china-vietna', 'china-tailandia', 'china-coreia_norte', 'china-filipinas',
  'myanmar-tailandia',
  'tailandia-vietna', 'tailandia-malasia',
  'vietna-filipinas',
  'coreia_norte-coreia_sul', 'coreia_sul-japao',

  // Oceania
  'malasia-indonesia', 'malasia-filipinas',
  'filipinas-indonesia',
  'indonesia-papua', 'indonesia-australia',
  'papua-australia',
  'australia-nova_zelandia', 'australia-antartida',
  'nova_zelandia-antartida',
];

export const TERRITORY_IDS: TerritoryId[] = LIST.map((t) => t[0]);

export const TERRITORIES = {} as Record<TerritoryId, TerritoryInfo>;
for (const [id, name, continent] of LIST) {
  TERRITORIES[id] = { id, name, continent, neighbors: [] };
}
for (const b of BORDERS) {
  const [a, c] = b.split('-') as [TerritoryId, TerritoryId];
  if (!TERRITORIES[a] || !TERRITORIES[c]) throw new Error('Fronteira inválida: ' + b);
  if (!TERRITORIES[a].neighbors.includes(c)) TERRITORIES[a].neighbors.push(c);
  if (!TERRITORIES[c].neighbors.includes(a)) TERRITORIES[c].neighbors.push(a);
}

export const CONTINENT_IDS = Object.keys(CONTINENTS) as ContinentId[];

export const territoriesOfContinent = (c: ContinentId): TerritoryId[] =>
  TERRITORY_IDS.filter((id) => TERRITORIES[id].continent === c);

export const tName = (id: TerritoryId | string): string => TERRITORIES[id as TerritoryId]?.name ?? String(id);
export const cName = (c: ContinentId | string): string => CONTINENTS[c as ContinentId]?.name ?? String(c);
