import { describe, expect, it } from 'vitest';
import { TERRITORY_IDS } from './data';
import { Game, redactState } from './engine';
import { buildAiPrompt } from './aiPrompt';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function toStage(g: Game, stage: string) {
  for (let guard = 0; guard < 200 && g.stage !== stage; guard++) {
    if (g.isPlacing()) {
      const t = TERRITORY_IDS.find((x) => g.canPlaceOn(x))!;
      g.apply({ type: 'place', placements: { [t]: g.pool!.amount } }, g.current);
    } else if (g.stage === 'attack') g.apply({ type: 'endAttack' }, g.current);
    else if (g.stage === 'move') g.apply({ type: 'endMove' }, g.current);
    else if (g.stage === 'trade') g.apply({ type: 'skipTrade' }, g.current);
  }
}

describe('prompt para IA adaptado ao modo', () => {
  it('individual: modo, objetivo e cartas de eliminação', () => {
    const g = Game.create(5, { rng: seeded(1) });
    const txt = buildAiPrompt(g.toState());
    expect(txt).toContain('Individual (todos contra todos), 5 jogadores');
    expect(txt).toContain('eliminar todos os outros jogadores');
    expect(txt).toContain('recebe todas as cartas dele');
    expect(txt).toContain('Arctogea junta o Ártico e a Antártida');
    expect(txt).not.toContain('Regras das equipes');
    expect(txt).not.toContain('EQUIPE');
    expect(txt).not.toContain('Regras da partida online');
  });

  it('equipes: regras de equipe, vitória da equipe e ações de equipe', () => {
    const g = Game.create(6, { mode: 'trios', rng: seeded(2) });
    const txt = buildAiPrompt(g.toState());
    expect(txt).toContain('Trios: 2 equipes de 3 (6 jogadores)');
    expect(txt).toContain('Regras das equipes');
    expect(txt).toContain('a sua equipe vence');
    expect(txt).toContain('metade das cartas dele (arredondada para cima)');
    expect(txt).toContain('VASSALAGEM <território> PARA <aliado>');
    expect(txt).toContain('Sua equipe: Equipe');
  });

  it('online: tempo de reconexão, desistência e cartas ocultas dos outros', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(3) });
    const other = (g.current + 1) % 4;
    g.s.players[other].cards = [{ shape: 'estrela', territory: 'brasil', id: 'a' }, { shape: 'circulo', territory: 'peru', id: 'b' }];
    const red = redactState(g.toState(), g.current);
    const com = buildAiPrompt(red, { online: true, reconnectTimer: true });
    expect(com).toContain('Regras da partida online');
    expect(com).toContain('3 minutos');
    expect(com).toContain('você não vota nela');
    expect(com).toMatch(new RegExp(`${g.s.players[other].name} \\[Equipe .\\] — \\d+ territórios.*2 carta\\(s\\)`));
    const sem = buildAiPrompt(red, { online: true, reconnectTimer: false });
    expect(sem).toContain('não tem tempo de reconexão');
  });

  it('mostra quem saiu por dissolução ou desistência', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(4) });
    toStage(g, 'attack');
    const p = (g.current + 1) % 4;
    g.dissolve(p);
    const txt = buildAiPrompt(g.toState());
    expect(txt).toContain(`${g.s.players[p].name} [Equipe ${'AB'[g.s.players[p].team]}] — FORA (dissolução por desconexão)`);
  });

  it('passagem em equipe explica o envio para aliado', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(5) });
    toStage(g, 'move');
    const txt = buildAiPrompt(g.toState());
    expect(txt).toContain('Para enviar a um aliado');
    expect(txt).toContain('NENHUMA PASSAGEM');
  });
});
