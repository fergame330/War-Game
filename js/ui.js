/*
 * Interface: telas, mapa SVG (zoom/arrasto), painéis e modais.
 */
(function () {
  const D = window.WAR_DATA;
  const M = window.WAR_MAP;
  const { Game, SHAPE_NAMES, STAGE_NAMES, JOKER, isValidSet } = window.WarGame;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (s) => document.querySelector(s);

  let game = null;
  let ui = null;
  const els = { svg: $('#map'), paths: {}, badges: {}, names: {}, built: false };

  function resetUi() {
    ui = {
      source: null, // ataque: território de origem
      target: null, // ataque: território alvo
      moveSource: null, // passagem: origem
      step: 1, // colocação: quantidade por clique
      lastBattle: null,
      winnerShown: false,
      starting: true,
    };
  }

  // ------------------------------------------------------------------
  // Utilidades de DOM
  // ------------------------------------------------------------------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function s(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  function swatch(p) {
    return h('span', { class: 'swatch', style: 'background:' + game.players[p].color });
  }

  function chip(p) {
    return h('span', { class: 'chip' }, swatch(p), game.players[p].name);
  }

  const tName = (id) => D.territories[id].name;

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === id));
  }

  // ------------------------------------------------------------------
  // Avisos e modais
  // ------------------------------------------------------------------
  function toast(text, color, ms) {
    const el = h('div', { class: 'toast', style: color ? 'border-left-color:' + color : '' }, text);
    $('#toast-root').append(el);
    while ($('#toast-root').children.length > 3) $('#toast-root').firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, ms || 2600);
  }

  let modalOpen = null;
  function openModal(content, opts) {
    closeModal();
    opts = opts || {};
    const modal = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') }, content);
    const backdrop = h('div', { class: 'backdrop' }, modal);
    if (opts.dismissable !== false) {
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    }
    $('#modal-root').append(backdrop);
    modalOpen = { backdrop, opts };
    const focusable = modal.querySelector('.btn:not(:disabled)');
    if (focusable) focusable.focus();
    return modal;
  }

  function closeModal() {
    if (!modalOpen) return;
    modalOpen.backdrop.remove();
    const cb = modalOpen.opts.onClose;
    modalOpen = null;
    if (cb) cb();
  }

  function numberPicker({ title, text, min, max, value, confirmLabel, onConfirm }) {
    let v = Math.max(min, Math.min(max, value));
    const valueEl = h('div', { class: 'value' }, v);
    const range = h('input', { type: 'range', min, max, value: v, step: 1 });
    const set = (n) => {
      v = Math.max(min, Math.min(max, n));
      valueEl.textContent = v;
      range.value = v;
    };
    range.addEventListener('input', () => set(Number(range.value)));
    const modal = openModal([
      h('h2', null, title),
      h('p', { html: text }),
      h('div', { class: 'picker' },
        h('button', { onclick: () => set(v - 1) }, '−'),
        range,
        h('button', { onclick: () => set(v + 1) }, '+'),
        valueEl),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-ghost', onclick: closeModal }, 'Cancelar'),
        h('button', { class: 'btn btn-ghost', onclick: () => set(max) }, 'Máximo'),
        h('button', { class: 'btn', onclick: () => { closeModal(); onConfirm(v); } }, confirmLabel || 'Confirmar')),
    ]);
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { closeModal(); onConfirm(v); }
    });
  }

  // ------------------------------------------------------------------
  // Telas iniciais
  // ------------------------------------------------------------------
  let chosenCount = 0;
  const countGrid = $('#player-count');
  for (let n = 2; n <= 9; n++) {
    countGrid.append(h('button', {
      onclick: (e) => {
        chosenCount = n;
        countGrid.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        $('#btn-play').disabled = false;
      },
    }, n));
  }
  $('#btn-start').addEventListener('click', () => showScreen('setup-screen'));
  $('#btn-back').addEventListener('click', () => showScreen('start-screen'));
  $('#btn-play').addEventListener('click', () => chosenCount && startGame(chosenCount));

  function startGame(n) {
    resetUi();
    game = new Game(n);
    game.on(onGameEvent);
    showScreen('game-screen');
    buildMap();
    resetView();
    render();
    showOrderModal();
  }

  function showOrderModal() {
    const list = h('ol', { class: 'order-list' },
      game.players.map((p, i) =>
        h('li', null,
          h('span', { class: 'pos' }, i + 1 + 'º'),
          swatch(i),
          h('b', null, p.name),
          h('span', { class: 'info' }, game.territoriesOf(i).length + ' territórios'))));
    openModal([
      h('h2', null, 'Cores e ordem sorteadas'),
      h('p', null, 'Os territórios foram divididos entre os jogadores e cada um recebeu 1 exército. ' +
        'Quem começou com um continente inteiro coloca primeiro o bônus desse continente.'),
      list,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: closeModal }, 'Começar')),
    ], {
      onClose: () => {
        ui.starting = false;
        announceTurn();
      },
    });
  }

  // ------------------------------------------------------------------
  // Eventos do jogo
  // ------------------------------------------------------------------
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function onGameEvent(type, payload) {
    if (type === 'turn') {
      setTab('turn');
      ui.source = ui.target = ui.moveSource = null;
      ui.lastBattle = null;
      if (!ui.starting) announceTurn();
    } else if (type === 'cards') {
      const names = payload.map((x) => game.players[x.player].name);
      toast('Cartas entregues para: ' + names.join(', '), null, 4000);
    } else if (type === 'trade-choose') {
      setTimeout(() => { if (game.stage === 'trade' && game.tradeSub === 'choose') showTradeModal(); }, 0);
    }
    scheduleRender();
  }

  function announceTurn() {
    if (!game || game.current < 0 || game.stage === 'over') return;
    const p = game.player;
    toast('Vez de ' + p.name + ' — ' + stageLabel(), p.color);
    if (game.stage === 'trade' && game.tradeSub === 'choose') showTradeModal();
  }

  function stageLabel() {
    if (game.stage === 'trade' && game.tradeSub === 'place') return 'Colocar exércitos da troca';
    return STAGE_NAMES[game.stage];
  }

  // ------------------------------------------------------------------
  // Mapa
  // ------------------------------------------------------------------
  function buildMap() {
    if (els.built) return;
    els.built = true;
    const svg = els.svg;
    svg.setAttribute('viewBox', '0 0 ' + M.width + ' ' + M.height);

    const defs = s('defs');
    defs.innerHTML =
      '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" fill="rgba(255,255,255,.15)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,.45)" stroke-width="3"/></pattern>';
    svg.append(defs);

    svg.append(s('rect', { class: 'ocean', x: 0, y: 0, width: M.width, height: M.height }));
    svg.append(s('path', { class: 'grid-line', d: M.graticule }));

    const sea = s('g');
    for (const l of M.seaLines) {
      sea.append(s('line', { class: 'sea-line', x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }));
    }
    svg.append(sea);

    const terrs = s('g');
    const hatchLayer = s('g');
    for (const id of D.territoryIds) {
      const p = s('path', { class: 'terr', d: M.territories[id].d, 'data-id': id });
      els.paths[id] = p;
      terrs.append(p);
      const hatch = s('path', { d: M.territories[id].d, fill: 'url(#hatch)', 'pointer-events': 'none', visibility: 'hidden' });
      els.paths[id].hatch = hatch;
      hatchLayer.append(hatch);
    }
    svg.append(terrs, hatchLayer);

    const conts = s('g');
    for (const c of Object.keys(M.continents)) conts.append(s('path', { class: 'continent-outline', d: M.continents[c] }));
    svg.append(conts);

    // Ligações que atravessam a borda do mapa
    const wrapG = s('g');
    const wraps = M.seaLines.filter((l) => l.wrap);
    if (wraps.length === 2) {
      const left = wraps.find((l) => Math.min(l.x1, l.x2) < 1);
      const right = wraps.find((l) => Math.max(l.x1, l.x2) > M.width - 1);
      const t1 = s('text', { class: 'wrap-label', x: 4, y: left.y1 + 14 });
      t1.textContent = '◀ Rússia';
      const t2 = s('text', { class: 'wrap-label', x: M.width - 4, y: right.y1 + 14, 'text-anchor': 'end' });
      t2.textContent = 'Alaska ▶';
      wrapG.append(t1, t2);
    }
    svg.append(wrapG);

    const leaders = s('g');
    const badges = s('g');
    for (const id of D.territoryIds) {
      const t = M.territories[id];
      const [x, y] = t.label;
      if (t.anchor) {
        leaders.append(s('line', { class: 'leader', x1: t.anchor[0], y1: t.anchor[1], x2: x, y2: y }));
        leaders.append(s('circle', { class: 'leader-dot', cx: t.anchor[0], cy: t.anchor[1], r: 1.6 }));
      }
      const g = s('g', { class: 'badge', transform: 'translate(' + x + ',' + y + ')', 'data-id': id });
      g.pos = [x, y];
      const c = s('circle', { r: 13 });
      const txt = s('text', { y: 0.5 });
      const name = s('text', { class: 'tname', y: 25 });
      name.textContent = tName(id);
      g.append(name, c, txt);
      g.circle = c;
      g.text = txt;
      badges.append(g);
      els.badges[id] = g;
    }
    svg.append(leaders, badges);

    // interação com territórios e marcadores
    for (const id of D.territoryIds) {
      for (const el of [els.paths[id], els.badges[id]]) {
        el.addEventListener('click', (e) => {
          if (pan.suppressClick) return;
          e.stopPropagation();
          onTerritoryClick(id);
          // no toque não existe "passar o mouse": mostra a dica por alguns segundos
          if (pan.lastPointerType !== 'mouse' && !modalOpen) {
            showTooltip(id, e);
            clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(hideTooltip, 2500);
          }
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          onTerritoryRightClick(id);
        });
        el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showTooltip(id, e); });
        el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') moveTooltip(e); });
        el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTooltip(); });
      }
    }
    svg.addEventListener('click', () => {
      if (pan.suppressClick) return;
      clearSelection();
    });

    setupZoom();
  }

  // ---------- zoom e arrasto ----------
  // A viewBox sempre tem a mesma proporção da área do mapa na tela.
  const view = { x: 0, y: 0, w: 0, h: 0 };
  const pan = { pointers: new Map(), moved: false, suppressClick: false, startDist: 0, startView: null, lastPointerType: 'mouse' };
  const MIN_W = M.width / 14;
  let tooltipTimer = null;

  function mapRect() { return els.svg.getBoundingClientRect(); }
  function containerAspect() {
    const r = mapRect();
    return r.width > 0 && r.height > 0 ? r.height / r.width : M.height / M.width;
  }
  // largura da viewBox que mostra o mapa inteiro
  function fitWidth() { return Math.max(M.width, M.height / containerAspect()); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function clampView() {
    view.w = clamp(view.w, MIN_W, fitWidth());
    view.h = view.w * containerAspect();
    view.x = view.w >= M.width ? (M.width - view.w) / 2 : clamp(view.x, 0, M.width - view.w);
    view.y = view.h >= M.height ? (M.height - view.h) / 2 : clamp(view.y, 0, M.height - view.h);
  }

  // Os marcadores têm tamanho mínimo na tela (legíveis no celular) e crescem pouco ao aproximar.
  let lastBadgeScale = 0;
  function applyView() {
    els.svg.setAttribute('viewBox', [view.x, view.y, view.w, view.h].map((v) => v.toFixed(2)).join(' '));
    const px = (mapRect().width || M.width) / view.w; // pixels por unidade do mapa
    const radiusPx = clamp(13 * Math.sqrt(px * 0.63), 7.5, 20);
    const k = Math.round((radiusPx / (13 * px)) * 100) / 100;
    els.svg.classList.toggle('far', px < 0.45);
    if (k === lastBadgeScale) return;
    lastBadgeScale = k;
    for (const id of D.territoryIds) {
      const b = els.badges[id];
      b.setAttribute('transform', 'translate(' + b.pos[0] + ',' + b.pos[1] + ') scale(' + k + ')');
    }
  }

  function resetView() {
    view.w = fitWidth();
    clampView();
    applyView();
  }

  function refitView() {
    if (!view.w) return resetView();
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    clampView();
    view.x = cx - view.w / 2;
    view.y = cy - view.h / 2;
    clampView();
    applyView();
  }

  function toSvgPoint(clientX, clientY) {
    const pt = els.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(els.svg.getScreenCTM().inverse());
  }

  function zoomAt(clientX, clientY, factor) {
    const p = toSvgPoint(clientX, clientY);
    const newW = clamp(view.w / factor, MIN_W, fitWidth());
    const k = newW / view.w;
    view.x = p.x - (p.x - view.x) * k;
    view.y = p.y - (p.y - view.y) * k;
    view.w = newW;
    clampView();
    applyView();
  }

  function zoomCenter(factor) {
    const r = mapRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  function setupZoom() {
    const svg = els.svg;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    }, { passive: false });

    svg.addEventListener('pointerdown', (e) => {
      pan.lastPointerType = e.pointerType;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pan.moved = false;
      pan.startView = { ...view };
      pan.start = { x: e.clientX, y: e.clientY };
      if (pan.pointers.size === 2) {
        const [a, b] = [...pan.pointers.values()];
        pan.startDist = Math.hypot(a.x - b.x, a.y - b.y);
        pan.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });

    svg.addEventListener('pointermove', (e) => {
      if (!pan.pointers.has(e.pointerId)) return;
      pan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const scale = els.svg.getScreenCTM().a;
      if (pan.pointers.size === 1) {
        const dx = e.clientX - pan.start.x;
        const dy = e.clientY - pan.start.y;
        if (!pan.moved && Math.hypot(dx, dy) > 5) {
          pan.moved = true;
          svg.classList.add('panning');
          try { svg.setPointerCapture(e.pointerId); } catch (_) { /* ignora */ }
          hideTooltip();
        }
        if (pan.moved) {
          view.x = pan.startView.x - dx / scale;
          view.y = pan.startView.y - dy / scale;
          clampView();
          applyView();
        }
      } else if (pan.pointers.size === 2 && pan.startDist) {
        const [a, b] = [...pan.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        pan.moved = true;
        Object.assign(view, pan.startView);
        applyView();
        zoomAt(pan.mid.x, pan.mid.y, dist / pan.startDist);
      }
    });

    const end = (e) => {
      if (!pan.pointers.has(e.pointerId)) return;
      pan.pointers.delete(e.pointerId);
      if (pan.moved) {
        pan.suppressClick = true;
        setTimeout(() => { pan.suppressClick = false; }, 0);
      }
      if (pan.pointers.size === 0) {
        svg.classList.remove('panning');
        pan.startDist = 0;
      } else {
        const [rest] = [...pan.pointers.values()];
        pan.start = { ...rest };
        pan.startView = { ...view };
        pan.startDist = 0;
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    $('#zoom-in').addEventListener('click', () => zoomCenter(1.4));
    $('#zoom-out').addEventListener('click', () => zoomCenter(1 / 1.4));
    $('#zoom-reset').addEventListener('click', resetView);
    if (window.ResizeObserver) new ResizeObserver(() => refitView()).observe($('#map-wrap'));
    else window.addEventListener('resize', refitView);
  }

  // ---------- dica ao passar o mouse ----------
  const tooltip = $('#tooltip');
  function showTooltip(id, e) {
    if (pan.moved && pan.pointers.size) return;
    const t = D.territories[id];
    const o = game.owner[id];
    const lines = [
      h('div', { class: 'tt-name' }, t.name),
      h('div', { class: 'tt-muted' }, D.continents[t.continent].name),
      h('div', null, swatch(o), ' ', game.players[o].name, ' · ', game.armies[id], ' exército(s)'),
    ];
    if (game.pending[id]) lines.push(h('div', { class: 'warn' }, 'Conquistado — aguardando exércitos de ' + tName(game.pending[id])));
    if (game.stage === 'move' && o === game.current) {
      lines.push(h('div', null, 'Podem cruzar fronteira: ' + Math.max(0, Math.min(game.movable[id] || 0, game.armies[id] - 1))));
    }
    lines.push(h('div', { class: 'tt-muted' }, 'Fronteiras: ' + t.neighbors.map(tName).join(', ')));
    tooltip.replaceChildren(...lines);
    tooltip.hidden = false;
    moveTooltip(e);
  }

  function moveTooltip(e) {
    if (tooltip.hidden) return;
    const r = $('#map-wrap').getBoundingClientRect();
    let x = e.clientX - r.left + 14;
    let y = e.clientY - r.top + 14;
    if (x + tooltip.offsetWidth > r.width - 4) x = e.clientX - r.left - tooltip.offsetWidth - 14;
    if (y + tooltip.offsetHeight > r.height - 4) y = e.clientY - r.top - tooltip.offsetHeight - 14;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function hideTooltip() { tooltip.hidden = true; }

  function flash(id) {
    const p = els.paths[id];
    p.classList.remove('flash');
    void p.getBBox();
    p.classList.add('flash');
  }

  // ------------------------------------------------------------------
  // Cliques no mapa
  // ------------------------------------------------------------------
  function clearSelection() {
    if (!game) return;
    ui.source = ui.target = ui.moveSource = null;
    scheduleRender();
  }

  function onTerritoryClick(id) {
    if (!game || modalOpen || game.stage === 'over') return;
    setTab('turn');
    if (game.isPlacing()) return placeClick(id);
    if (game.stage === 'attack') return attackClick(id);
    if (game.stage === 'move') return moveClick(id);
    if (game.stage === 'trade') showTradeModal();
  }

  function onTerritoryRightClick(id) {
    if (!game || modalOpen) return;
    if (game.isPlacing()) {
      game.unplace(id, 1);
    } else {
      clearSelection();
    }
  }

  function placeClick(id) {
    if (ui.step === 'remove') {
      if (!game.unplace(id, 1)) toast('Só dá para remover exércitos colocados agora.', game.player.color);
      return;
    }
    if (!game.canPlaceOn(id)) {
      if (game.owner[id] !== game.current) toast('Esse território não é seu.', game.player.color);
      else toast('Esses exércitos só podem ir para o continente ' + D.continents[game.pool.continent].name + '.', game.player.color);
      return;
    }
    if (game.poolRemaining === 0) {
      toast('Todos os exércitos já foram colocados. Clique em Confirmar.', game.player.color);
      return;
    }
    const n = ui.step === 'all' ? game.poolRemaining : ui.step;
    game.place(id, n);
  }

  function attackClick(id) {
    const me = game.current;
    if (game.pending[id]) return occupyPrompt(id);
    if (game.owner[id] === me) {
      if (ui.source === id) {
        ui.source = ui.target = null;
      } else if (game.canAttackFrom(id)) {
        ui.source = id;
        if (ui.target && !game.isNeighbor(id, ui.target)) ui.target = null;
      } else if (game.armies[id] < 2) {
        toast('É preciso ter mais de 1 exército para atacar.', game.player.color);
      } else {
        toast(tName(id) + ' não faz fronteira com nenhum inimigo.', game.player.color);
      }
      ui.lastBattle = null;
      return scheduleRender();
    }
    // território inimigo
    if (ui.source && game.isNeighbor(ui.source, id)) {
      ui.target = id;
    } else {
      // escolhe automaticamente o território vizinho mais forte como origem
      const options = D.territories[id].neighbors
        .filter((n) => game.owner[n] === me && game.canAttackFrom(n))
        .sort((a, b) => game.armies[b] - game.armies[a]);
      if (!options.length) {
        toast('Você não tem território com mais de 1 exército vizinho a ' + tName(id) + '.', game.player.color);
        return;
      }
      ui.source = options[0];
      ui.target = id;
    }
    ui.lastBattle = null;
    scheduleRender();
  }

  function occupyPrompt(id) {
    const from = game.pending[id];
    const max = game.maxOccupy(id);
    numberPicker({
      title: 'Ocupar ' + tName(id),
      text: 'Quantos exércitos enviar de <b>' + tName(from) + '</b> (' + game.armies[from] +
        ' exércitos)? Máximo de 3 por território conquistado.',
      min: 1,
      max,
      value: max,
      confirmLabel: 'Enviar',
      onConfirm: (n) => {
        game.occupy(id, n);
        if (ui.source && !game.canAttackFrom(ui.source)) ui.source = ui.target = null;
      },
    });
  }

  function doAttack(blitz) {
    const from = ui.source, to = ui.target;
    if (!from || !to) return;
    let last = null;
    let totalAtt = 0, totalDef = 0, rolls = 0;
    do {
      const r = game.attack(from, to);
      if (!r.ok) {
        if (!last) toast(r.reason, game.player.color, 4000);
        break;
      }
      last = r;
      rolls++;
      totalAtt += r.attLoss;
      totalDef += r.defLoss;
    } while (blitz && !last.conquered && game.checkAttack(from, to).ok);
    if (!last) return;
    last.rolls = rolls;
    last.totalAtt = totalAtt;
    last.totalDef = totalDef;
    ui.lastBattle = last;
    if (last.conquered) {
      flash(to);
      ui.target = null;
      toast(game.player.name + ' conquistou ' + tName(to) + '! Clique nele quando quiser enviar exércitos.', game.player.color, 3500);
      if (last.eliminated !== null) {
        const dp = game.players[last.eliminated];
        toast(dp.name + ' foi eliminado!', dp.color, 4000);
      }
    }
    if (!game.canAttackFrom(from)) {
      ui.source = null;
      ui.target = null;
    }
    render();
  }

  function moveClick(id) {
    const me = game.current;
    if (game.owner[id] !== me) {
      toast('Só é possível passar exércitos entre seus territórios.', game.player.color);
      return;
    }
    if (ui.moveSource && ui.moveSource !== id) {
      const max = game.maxMove(ui.moveSource, id);
      if (max > 0) {
        const from = ui.moveSource;
        const free = game.freeMove(from, id);
        numberPicker({
          title: 'Passar exércitos',
          text: 'De <b>' + tName(from) + '</b> para <b>' + tName(id) + '</b>.' +
            (free ? ' Movimento livre dentro do seu continente.' : ''),
          min: 1,
          max,
          value: max,
          confirmLabel: 'Passar',
          onConfirm: (n) => {
            game.move(from, id, n);
            if (!game.moveTargets(from).length) ui.moveSource = null;
            scheduleRender();
          },
        });
        return;
      }
    }
    if (ui.moveSource === id) {
      ui.moveSource = null;
    } else if (game.moveTargets(id).length) {
      ui.moveSource = id;
    } else {
      ui.moveSource = null;
      toast('Não há exércitos que possam sair de ' + tName(id) + '.', game.player.color);
    }
    scheduleRender();
  }

  // ------------------------------------------------------------------
  // Cartas
  // ------------------------------------------------------------------
  function shapeSvg(shape, size) {
    const sz = size || 56;
    const color = { circulo: '#2e6fd8', quadrado: '#27ae60', triangulo: '#d63031', estrela: '#e0a100' }[shape];
    const shapes = {
      circulo: (c) => '<circle cx="50" cy="50" r="36" fill="' + c + '"/>',
      quadrado: (c) => '<rect x="16" y="16" width="68" height="68" rx="4" fill="' + c + '"/>',
      triangulo: (c) => '<polygon points="50,12 90,84 10,84" fill="' + c + '"/>',
      estrela: (c) => '<polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38" fill="' + c + '"/>',
    };
    let inner;
    if (shape === JOKER) {
      inner =
        '<g transform="translate(4,4) scale(.44)">' + shapes.circulo('#2e6fd8') + '</g>' +
        '<g transform="translate(52,4) scale(.44)">' + shapes.quadrado('#27ae60') + '</g>' +
        '<g transform="translate(4,52) scale(.44)">' + shapes.triangulo('#d63031') + '</g>' +
        '<g transform="translate(52,52) scale(.44)">' + shapes.estrela('#e0a100') + '</g>';
    } else {
      inner = shapes[shape](color);
    }
    const wrap = h('div', { class: 'shape' });
    wrap.innerHTML = '<svg viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '">' + inner + '</svg>';
    return wrap;
  }

  function cardEl(card, p, opts) {
    opts = opts || {};
    const t = D.territories[card.territory];
    const el = h('div', { class: 'card' + (opts.selectable ? ' selectable' : '') + (opts.selected ? ' selected' : '') },
      h('div', { class: 'stripe', style: 'background:' + D.continents[t.continent].color }),
      shapeSvg(card.shape),
      h('div', { class: 'shape-name' }, SHAPE_NAMES[card.shape]),
      h('div', { class: 'terr-name' }, t.name),
      game.owner[card.territory] === p ? h('div', { class: 'owned', title: 'Território seu: +3 exércitos nele na troca' }, 'SEU') : null);
    if (opts.onclick) el.addEventListener('click', opts.onclick);
    return el;
  }

  function showCardsModal() {
    if (!game) return;
    if (game.stage === 'trade' && game.tradeSub === 'choose') return showTradeModal();
    const p = game.current;
    const cards = game.players[p].cards;
    openModal([
      h('h2', null, 'Cartas de ', chip(p)),
      cards.length
        ? h('div', { class: 'cards-grid' }, cards.map((c) => cardEl(c, p)))
        : h('p', { class: 'empty' }, 'Nenhuma carta ainda. Conquiste pelo menos 1 território na rodada para ganhar uma carta.'),
      h('p', null, 'Junte 4 cartas do mesmo naipe (o coringa vale por qualquer naipe) para trocar na fase de trocas. ' +
        'Próxima troca vale ' + game.nextTradeValue + ' exércitos.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: closeModal }, 'Fechar')),
    ], { wide: true });
  }

  function showTradeModal() {
    if (!game || game.stage !== 'trade' || game.tradeSub !== 'choose') return;
    const p = game.current;
    const selected = new Set();
    const grid = h('div', { class: 'cards-grid' });
    const tradeBtn = h('button', { class: 'btn btn-ok', disabled: true }, 'Trocar');
    const hint = h('div', { class: 'warn' });

    const refresh = () => {
      grid.replaceChildren(
        ...game.players[p].cards.map((c) =>
          cardEl(c, p, {
            selectable: true,
            selected: selected.has(c.id),
            onclick: () => {
              if (selected.has(c.id)) selected.delete(c.id);
              else if (selected.size < 4) selected.add(c.id);
              refresh();
            },
          })));
      const chosen = game.players[p].cards.filter((c) => selected.has(c.id));
      const valid = chosen.length === 4 && isValidSet(chosen);
      tradeBtn.disabled = !valid;
      hint.textContent = chosen.length === 4 && !valid ? 'Essas 4 cartas não formam uma troca válida.' : '';
    };

    tradeBtn.addEventListener('click', () => {
      const r = game.trade([...selected]);
      if (!r.ok) {
        hint.textContent = r.reason;
        return;
      }
      closeModal();
      let msg = game.player.name + ' recebeu ' + r.value + ' exércitos pela troca.';
      if (r.bonuses.length) msg += ' +3 em ' + r.bonuses.map(tName).join(', ') + '.';
      r.bonuses.forEach(flash);
      toast(msg, game.player.color, 4000);
      render();
    });

    openModal([
      h('h2', null, 'Troca de cartas — ', chip(p)),
      aiPromptRow(),
      h('div', { class: 'trade-info' },
        h('div', null, 'Esta troca vale ', h('span', { class: 'big-number' }, game.nextTradeValue), ' exércitos'),
        h('div', { class: 'tt-muted' }, 'Trocas já feitas: ' + game.tradeCount)),
      h('p', null, 'Selecione 4 cartas do mesmo naipe (coringa vale por qualquer naipe). ' +
        'Cada carta com um território seu dá +3 exércitos nesse território.'),
      grid,
      hint,
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-ghost', onclick: () => { closeModal(); game.skipTrade(); } }, 'Não trocar'),
        h('button', {
          class: 'btn btn-ghost',
          onclick: () => {
            const set = game.findSet(p);
            selected.clear();
            if (set) set.forEach((c) => selected.add(c.id));
            refresh();
          },
        }, 'Sugerir'),
        tradeBtn),
    ], { wide: true, dismissable: false });
    refresh();
  }

  // ------------------------------------------------------------------
  // Regras
  // ------------------------------------------------------------------
  function showRules() {
    const bonuses = Object.values(D.continents).map((c) => h('li', null, h('b', null, c.name), ': ' + c.bonus));
    openModal(h('div', { class: 'rules' },
      h('h2', null, 'Regras'),
      h('h3', null, 'Início'),
      h('ul', null,
        h('li', null, 'Cores e ordem são sorteadas; os territórios são divididos igualmente (os primeiros da ordem recebem o que sobrar).'),
        h('li', null, 'Cada território começa com 1 exército. Quem começar com um continente inteiro coloca o bônus dele nesse continente.'),
        h('li', null, 'Depois, cada jogador recebe metade dos exércitos que tem (arredondado para baixo) para colocar onde quiser.')),
      h('h3', null, 'Rodada'),
      h('ul', null,
        h('li', null, 'Cada etapa passa por todos os jogadores, na ordem, antes da próxima: reforço de continentes → reforço de territórios → ataques → passagem → cartas → trocas.')),
      h('h3', null, 'Batalha'),
      h('ul', null,
        h('li', null, 'Ataca quem tem mais de 1 exército no território. O atacante rola ', h('b', null, 'exércitos − 1'), ' dados e o defensor ', h('b', null, 'exércitos'), ' dados (máximo de 3 cada).'),
        h('li', null, 'Os dados são comparados do maior para o menor; empate é vitória da defesa.'),
        h('li', null, 'Ao zerar um território ele é seu, mas você não precisa ocupá-lo na hora: clique nele para enviar de 1 a 3 exércitos.'),
        h('li', null, 'Você pode continuar atacando com o mesmo território desde que, mesmo perdendo a batalha, ainda sobrem exércitos para ocupar todos os territórios conquistados por ele + 1.')),
      h('h3', null, 'Passagem'),
      h('ul', null,
        h('li', null, 'Passe exércitos para territórios vizinhos. Só os que já estavam no território no início da passagem podem cruzar fronteiras.'),
        h('li', null, 'Dentro de um continente que é todo seu, você pode mover à vontade.')),
      h('h3', null, 'Cartas e trocas'),
      h('ul', null,
        h('li', null, 'Depois que todos fizeram a passagem, quem conquistou ao menos 1 território na rodada ganha 1 carta (bolinha, quadrado, triângulo, estrela ou coringa).'),
        h('li', null, '4 cartas do mesmo naipe valem: 4, 6, 8, 10, 12, 15, 20, 25, 30... (contagem de trocas de todos os jogadores).'),
        h('li', null, 'Carta com território seu: +3 exércitos nele. Quem elimina um jogador recebe as cartas dele.')),
      h('h3', null, 'Nova rodada'),
      h('ul', null,
        h('li', null, 'Bônus de cada continente dominado (colocado no próprio continente) + metade dos seus territórios (para baixo).'),
        h('li', null, 'Vence quem eliminar todos e dominar o mundo.')),
      h('h3', null, 'Bônus dos continentes'),
      h('ul', null, bonuses),
      h('h3', null, 'Controles'),
      h('ul', null,
        h('li', null, 'Roda do mouse ou botões +/− para zoom; arraste para mover o mapa.'),
        h('li', null, 'Na colocação, clique para adicionar e use o botão direito para remover.')),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: closeModal }, 'Fechar'))), { wide: true });
  }

  // Abas do painel (usadas no celular, onde o painel fica embaixo do mapa)
  function setTab(name) {
    $('#sidebar').dataset.tab = name;
    document.querySelectorAll('#sheet-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  }
  document.querySelectorAll('#sheet-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  setTab('turn');

  $('#btn-help').addEventListener('click', showRules);
  $('#btn-cards').addEventListener('click', showCardsModal);
  $('#btn-names').addEventListener('click', (e) => {
    els.svg.classList.toggle('no-names');
    e.currentTarget.classList.toggle('active', !els.svg.classList.contains('no-names'));
  });
  $('#btn-names').classList.add('active');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalOpen && modalOpen.opts.dismissable !== false) closeModal();
      else clearSelection();
    }
  });

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render() {
    if (!game) return;
    renderMap();
    renderTopbar();
    renderTurnPanel();
    renderPlayers();
    renderContinents();
    renderLog();
    if (game.stage === 'over' && !ui.winnerShown) {
      ui.winnerShown = true;
      setTimeout(showWinner, 400);
    }
  }

  function renderMap() {
    const me = game.current;
    const placing = game.isPlacing();
    const attackTargets = game.stage === 'attack' && ui.source ? new Set(game.attackTargets(ui.source)) : null;
    const moveTargets = game.stage === 'move' && ui.moveSource ? new Set(game.moveTargets(ui.moveSource)) : null;

    for (const id of D.territoryIds) {
      const o = game.owner[id];
      const pl = game.players[o];
      const path = els.paths[id];
      const badge = els.badges[id];
      path.style.fill = pl.color;
      const cls = ['terr'];
      const bcls = ['badge'];
      if (placing) {
        if (game.canPlaceOn(id)) cls.push('placeable');
        else cls.push('dim');
      } else if (game.stage === 'attack') {
        if (game.pending[id]) { cls.push('pending'); bcls.push('pending'); }
        if (ui.source === id) { cls.push('selected'); bcls.push('selected'); }
        if (ui.target === id) { cls.push('target'); bcls.push('target'); }
        if (attackTargets) {
          if (attackTargets.has(id)) { if (ui.target !== id) cls.push('target'); }
          else if (ui.source !== id) cls.push('dim');
        }
      } else if (game.stage === 'move') {
        if (ui.moveSource === id) { cls.push('selected'); bcls.push('selected'); }
        if (moveTargets) {
          if (moveTargets.has(id)) cls.push('target');
          else if (ui.moveSource !== id) cls.push('dim');
        } else if (o !== me) cls.push('dim');
      }
      path.setAttribute('class', cls.join(' '));
      badge.setAttribute('class', bcls.join(' '));
      path.hatch.setAttribute('visibility', game.pending[id] ? 'visible' : 'hidden');
      badge.circle.style.fill = pl.color;
      badge.text.style.fill = pl.textColor;
      badge.text.textContent = game.armies[id];
      const placed = placing && game.poolPlaced[id];
      badge.circle.setAttribute('r', game.armies[id] >= 100 ? 16 : 13);
      badge.text.style.fontSize = game.armies[id] >= 1000 ? '10px' : game.armies[id] >= 100 ? '12px' : '';
      if (placed) badge.circle.style.stroke = '#fff';
      else badge.circle.style.stroke = '';
    }
  }

  function renderTopbar() {
    $('#round-info').textContent = 'Rodada ' + game.round + ' · ' + (game.stage === 'over' ? 'Fim de jogo' : stageLabel());
    const c = $('#current-chip');
    c.replaceChildren(game.current >= 0 ? chip(game.current) : '');
    $('#btn-cards').textContent = 'Cartas' + (game.current >= 0 ? ' (' + game.player.cards.length + ')' : '');
  }

  function renderTurnPanel() {
    const panel = $('#turn-panel');
    if (game.stage === 'over') {
      panel.style.borderColor = game.players[game.winner].color;
      panel.replaceChildren(
        h('div', { class: 'stage-name' }, 'Fim de jogo'),
        h('div', { class: 'turn-head' }, swatch(game.winner), game.players[game.winner].name + ' dominou o mundo!'),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: newGame }, 'Nova partida')));
      return;
    }
    const p = game.player;
    panel.style.borderColor = p.color;
    const head = [
      h('div', { class: 'stage-name' }, stageLabel()),
      h('div', { class: 'turn-head' }, swatch(game.current), 'Vez de ' + p.name),
      aiPromptRow(),
    ];
    let body = [];
    if (game.isPlacing()) body = placementPanel();
    else if (game.stage === 'attack') body = attackPanel();
    else if (game.stage === 'move') body = movePanel();
    else if (game.stage === 'trade') {
      body = [
        h('p', { class: 'instructions' }, 'Você tem cartas para trocar.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: showTradeModal }, 'Abrir troca de cartas')),
      ];
    }
    panel.replaceChildren(...head, ...body.filter(Boolean));
  }

  // ---------- prompt para IA ----------
  function aiPromptRow() {
    if (!window.WarAiPrompt || !WarAiPrompt.canBuildAiPrompt(game)) return null;
    return h('div', { class: 'ai-row' },
      h('button', {
        class: 'btn btn-small btn-ghost',
        title: 'Baixa um arquivo com as regras, o estado do jogo e a ação da vez para enviar a uma IA',
        onclick: downloadAiPrompt,
      }, '🤖 Baixar prompt p/ IA'),
      h('button', { class: 'btn btn-small btn-ghost', title: 'Copiar o prompt', onclick: copyAiPrompt }, 'Copiar'));
  }

  function downloadAiPrompt() {
    const text = WarAiPrompt.buildAiPrompt(game);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: WarAiPrompt.aiPromptFileName(game) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Prompt baixado. Envie para a IA e aplique a ação que ela responder.', game.player.color);
  }

  function copyAiPrompt() {
    const text = WarAiPrompt.buildAiPrompt(game);
    const done = () => toast('Prompt copiado.', game.player.color);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (_) { toast('Não foi possível copiar; use o botão de baixar.'); }
    ta.remove();
  }

  function placementPanel() {
    const pool = game.pool;
    const remaining = game.poolRemaining;
    const where = pool.continent
      ? h('span', null, 'somente no continente ', h('b', null, D.continents[pool.continent].name))
      : h('span', null, 'em qualquer território seu');
    const steps = [1, 5, 10, 'all', 'remove'].map((st) =>
      h('button', {
        class: 'btn btn-small btn-ghost' + (ui.step === st ? ' active' : ''),
        title: st === 'remove' ? 'Clique em um território para tirar 1 exército colocado agora' : null,
        onclick: () => { ui.step = st; render(); },
      }, st === 'all' ? 'Todos' : st === 'remove' ? '−1' : '+' + st));
    return [
      h('p', { class: 'instructions' },
        'Coloque ', h('b', null, pool.amount), pool.amount === 1 ? ' exército (' : ' exércitos (', pool.label, ') ', where, '.',
        game.pools.length > 1 ? ' Etapa ' + (game.poolIndex + 1) + ' de ' + game.pools.length + '.' : ''),
      h('div', null, h('span', { class: 'big-number' }, remaining), ' ', h('span', { class: 'tt-muted' }, remaining === 1 ? 'restante' : 'restantes')),
      h('div', { class: 'step-row' }, h('span', null, 'Por clique:'), steps),
      h('p', { class: 'instructions hint' }, 'Toque/clique em um território destacado para adicionar. Para tirar, use −1 (ou o botão direito do mouse).'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-ghost', onclick: () => game.resetPool(), disabled: !Object.keys(game.poolPlaced).length }, 'Desfazer'),
        h('button', { class: 'btn btn-ok', onclick: () => game.confirmPool(), disabled: remaining !== 0 }, 'Confirmar')),
    ];
  }

  function attackPanel() {
    const out = [];
    const pendings = Object.entries(game.pending);
    out.push(h('p', { class: 'instructions hint' },
      'Selecione um território seu com mais de 1 exército e depois um inimigo vizinho. ' +
      'Clicar direto em um inimigo escolhe seu vizinho mais forte.'));
    if (pendings.length) {
      out.push(h('div', { class: 'warn' },
        'Conquistados aguardando exércitos: ',
        ...pendings.map(([t, src], i) => [
          i ? ', ' : '',
          h('a', { href: '#', style: 'color:inherit', onclick: (e) => { e.preventDefault(); occupyPrompt(t); } }, tName(t)),
          ' (de ' + tName(src) + ')',
        ]),
        '. Clique neles para ocupar.'));
    }

    if (ui.source) {
      const b = h('div', { class: 'battle' });
      const src = ui.source, tgt = ui.target;
      b.append(h('div', { class: 'battle-title' },
        h('span', null, swatch(game.current), ' ', tName(src), ' (' + game.armies[src] + ')'),
        h('span', { class: 'vs' }, tgt ? 'ataca' : ''),
        tgt ? h('span', null, tName(tgt), ' (' + game.armies[tgt] + ') ', swatch(game.owner[tgt])) : h('span', { class: 'vs' }, 'escolha o alvo')));
      if (tgt) {
        const chk = game.checkAttack(src, tgt);
        if (chk.attDice) {
          b.append(h('div', { class: 'tt-muted', style: 'font-size:12px;margin-top:4px' },
            'Dados: ' + chk.attDice + ' de ataque × ' + chk.defDice + ' de defesa'));
        }
        if (!chk.ok) b.append(h('div', { class: 'warn' }, chk.reason));
        b.append(h('div', { class: 'actions' },
          h('button', { class: 'btn btn-danger', disabled: !chk.ok, onclick: () => doAttack(false) }, 'Atacar'),
          h('button', { class: 'btn btn-ghost', disabled: !chk.ok, onclick: () => doAttack(true) }, 'Atacar até conquistar')));
      }
      if (ui.lastBattle) b.append(battleResult(ui.lastBattle));
      out.push(b);
    } else if (ui.lastBattle) {
      out.push(h('div', { class: 'battle' }, battleResult(ui.lastBattle)));
    }

    out.push(h('div', { class: 'actions' },
      h('button', {
        class: 'btn',
        disabled: pendings.length > 0,
        title: pendings.length ? 'Ocupe primeiro os territórios conquistados' : '',
        onclick: () => {
          ui.source = ui.target = null;
          ui.lastBattle = null;
          game.endAttack();
        },
      }, 'Encerrar ataques')));
    return out;
  }

  function battleResult(r) {
    // um dado fica apagado quando perdeu a comparação
    const dice = (arr, kind, loserMark) =>
      h('div', { class: 'dice' }, arr.map((v, i) =>
        h('div', { class: 'die ' + kind + (r.pairs[i] === loserMark ? ' lost' : '') }, v)));
    const wrap = h('div', null,
      h('div', { class: 'dice-rows' },
        h('span', { class: 'lbl' }, 'Ataque'), dice(r.att, 'att', 'def'),
        h('span', { class: 'lbl' }, 'Defesa'), dice(r.def, 'def', 'att')));
    const res = h('div', { class: 'battle-result' });
    if (r.rolls > 1) res.append(r.rolls + ' batalhas · ');
    res.append(
      h('span', { class: 'bad' }, 'Ataque perdeu ' + (r.rolls > 1 ? r.totalAtt : r.attLoss)),
      ' · ',
      h('span', { class: 'good' }, 'Defesa perdeu ' + (r.rolls > 1 ? r.totalDef : r.defLoss)));
    if (r.conquered) res.append(h('div', { class: 'good' }, tName(r.to) + ' conquistado!'));
    wrap.append(res);
    return wrap;
  }

  function movePanel() {
    const owned = game.continentsOf(game.current)
      .filter((c) => D.territoryIds.filter((id) => D.territories[id].continent === c).length > 1);
    return [
      h('p', { class: 'instructions hint' },
        'Clique no território de origem e depois no destino (vizinho). Só os exércitos que já estavam no território ' +
        'no início da passagem podem cruzar uma fronteira, e sempre fica pelo menos 1.'),
      owned.length
        ? h('p', { class: 'instructions' }, 'Movimento livre dentro de: ', h('b', null, owned.map((c) => D.continents[c].name).join(', ')), '.')
        : null,
      game.conqueredThisTurn ? h('p', { class: 'instructions' }, 'Você conquistou território nesta rodada: ganhará 1 carta quando todos terminarem a passagem.') : null,
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn',
          onclick: () => {
            ui.moveSource = null;
            game.endTurn();
          },
        }, 'Encerrar passagem')),
    ];
  }

  function renderPlayers() {
    const rows = game.players.map((p, i) => {
      const terrs = game.territoriesOf(i).length;
      return h('tr', { class: (i === game.current && game.stage !== 'over' ? 'current' : '') + (p.alive ? '' : ' dead') },
        h('td', { class: 'tt-muted' }, i + 1 + 'º'),
        h('td', null, h('span', { class: 'name' }, swatch(i), p.name)),
        h('td', { class: 'num' }, terrs),
        h('td', { class: 'num' }, game.totalArmies(i)),
        h('td', { class: 'num' }, p.cards.length));
    });
    $('#players-panel').replaceChildren(
      h('table', { class: 'players-table' },
        h('thead', null, h('tr', null,
          h('th', null, ''), h('th', null, 'Jogador'),
          h('th', { class: 'num' }, 'Terr.'), h('th', { class: 'num' }, 'Exérc.'), h('th', { class: 'num' }, 'Cartas'))),
        h('tbody', null, rows)));
  }

  function renderContinents() {
    const rows = Object.entries(D.continents).map(([c, info]) => {
      const owner = game.players.findIndex((p, i) => p.alive && game.ownsContinent(i, c));
      return h('div', { class: 'cont-row' },
        h('span', { class: 'cdot', style: 'background:' + info.color }),
        h('span', { class: 'cname' }, info.name),
        h('span', { class: 'owner', title: owner >= 0 ? 'Dominado por ' + game.players[owner].name : '' }, owner >= 0 ? swatch(owner) : ''),
        h('span', { class: 'bonus' }, '+' + info.bonus));
    });
    $('#continents-panel').replaceChildren(...rows);
  }

  let lastLogLen = -1;
  function renderLog() {
    if (game.logs.length === lastLogLen) return;
    lastLogLen = game.logs.length;
    const items = game.logs.slice(-100).reverse().map((l) =>
      h('div', { style: l.player !== null ? 'border-left-color:' + game.players[l.player].color : '' }, l.text));
    $('#log-panel').replaceChildren(...items);
  }

  function showWinner() {
    const w = game.winner;
    openModal(h('div', { class: 'winner-box' },
      h('div', { class: 'trophy' }, '🏆'),
      h('h2', null, game.players[w].name + ' dominou o mundo!'),
      h('p', null, 'Vitória na rodada ' + game.round + ' após ' + game.tradeCount + ' troca(s) de cartas.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-ghost', onclick: closeModal }, 'Ver o mapa'),
        h('button', { class: 'btn', onclick: () => { closeModal(); newGame(); } }, 'Nova partida'))));
  }

  // acesso para depuração pelo console do navegador
  window.WarUI = { get game() { return game; }, render };

  function newGame() {
    game = null;
    lastLogLen = -1;
    chosenCount = 0;
    countGrid.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
    $('#btn-play').disabled = true;
    $('#toast-root').replaceChildren();
    showScreen('start-screen');
  }
})();
