// hud.js — every piece of DOM the player reads: health, armour, money,
// ammunition, the round clock and score, the killfeed, the buy menu, the
// charge prompts and the menu/banner screens. The simulation never touches
// the DOM; main.js hands state to update() once per rendered frame.

import { BUY_ROWS, GEAR, MATCH, TEAM, WEAPONS } from './config.js';

function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(root) {
    this.root = root;
    // In-game layer.
    this.crosshair = el('div', 'crosshair', root);
    el('div', 'ch-dot', this.crosshair);
    this.hitmarker = el('div', 'hitmarker', root, '✕');
    this.scope = el('div', 'scope hidden', root);

    const topbar = el('div', 'topbar', root);
    this.clockLabel = el('div', 'clock-label', topbar, '');
    this.clock = el('div', 'clock', topbar, '0:00');
    const score = el('div', 'score', topbar);
    this.scoreW = el('span', 'score-w', score, '0');
    el('span', 'score-sep', score, ' — ');
    this.scoreJ = el('span', 'score-j', score, '0');
    this.roundLabel = el('div', 'round-label', topbar, '');
    this.pips = el('div', 'pips', topbar);

    this.killfeed = el('div', 'killfeed', root);

    const bottomLeft = el('div', 'panel bottom-left', root);
    const hpRow = el('div', 'bar-row', bottomLeft);
    el('span', 'bar-tag', hpRow, 'HP');
    const hpTrack = el('div', 'bar-track', hpRow);
    this.hpFill = el('div', 'bar-fill hp', hpTrack);
    this.hpText = el('span', 'bar-num', hpRow, '100');
    const arRow = el('div', 'bar-row', bottomLeft);
    el('span', 'bar-tag', arRow, 'ARM');
    const arTrack = el('div', 'bar-track', arRow);
    this.arFill = el('div', 'bar-fill ar', arTrack);
    this.arText = el('span', 'bar-num', arRow, '0');
    this.money = el('div', 'money', bottomLeft, '$800');

    const bottomRight = el('div', 'panel bottom-right', root);
    this.weaponName = el('div', 'weapon-name', bottomRight, 'Kestrel P9');
    const ammoRow = el('div', 'ammo-row', bottomRight);
    this.ammoMag = el('span', 'ammo-mag', ammoRow, '12');
    this.ammoReserve = el('span', 'ammo-reserve', ammoRow, '/ 96');
    this.gearLine = el('div', 'gear-line', bottomRight, '');

    this.prompt = el('div', 'prompt hidden', root, '');
    this.channelWrap = el('div', 'channel hidden', root);
    this.channelLabel = el('div', 'channel-label', this.channelWrap, '');
    const channelTrack = el('div', 'channel-track', this.channelWrap);
    this.channelFill = el('div', 'channel-fill', channelTrack);
    this.alert = el('div', 'alert hidden', root, '');
    this.vignette = el('div', 'vignette', root);
    this.hurtDir = el('div', 'hurt-dir hidden', root, '▲');

    // Buy menu.
    this.buyMenu = el('div', 'buy-menu hidden', root);
    el('div', 'buy-title', this.buyMenu, 'BUY — press 1–6, B to close');
    this.buyGrid = el('div', 'buy-grid', this.buyMenu);
    this.buyCards = [];
    BUY_ROWS.forEach((row, i) => {
      const card = el('div', 'buy-card', this.buyGrid);
      el('div', 'buy-key', card, String(i + 1));
      const name = el('div', 'buy-name', card, '');
      const price = el('div', 'buy-price', card, '');
      this.buyCards.push({ card, name, price, row });
    });
    this.buyMoney = el('div', 'buy-money', this.buyMenu, '');

    // Banners and screens.
    this.banner = el('div', 'banner hidden', root);
    this.bannerTitle = el('div', 'banner-title', this.banner, '');
    this.bannerSub = el('div', 'banner-sub', this.banner, '');

    this.menu = el('div', 'screen menu', root);
    el('div', 'game-title', this.menu, 'SALTLINE');
    el('div', 'game-sub', this.menu, 'Wardens vs Jackals at the Brineworks — plant or defuse the breach charge.');
    const menuCard = el('div', 'menu-card', this.menu);
    menuCard.innerHTML =
      '<p><b>Click to play.</b> First to ' + MATCH.roundsToWin + ' rounds takes the match.</p>' +
      '<p>WASD move · mouse look · click fire · R reload · <b>Ctrl/C</b> crouch · <b>1/2</b> weapons · <b>G</b> frag · <b>B</b> buy · <b>E</b> defuse (hold)</p>' +
      '<p>You defend as a <b class="w">Warden</b>. Stop the <b class="j">Jackals</b> planting at Cistern A or Silo B — or defuse the charge before it blows.</p>' +
      '<p class="dim">Stopping to aim is everything: spread blooms while you move and shrinks when you crouch. Headshots hit four times harder.</p>';
    this.menuHint = el('div', 'menu-hint', this.menu, '');

    this.overScreen = el('div', 'screen hidden', root);
    this.overTitle = el('div', 'game-title', this.overScreen, '');
    this.overSub = el('div', 'game-sub', this.overScreen, '');
    el('div', 'menu-hint', this.overScreen, 'Click to play again');

    this.deadOverlay = el('div', 'dead-overlay hidden', root, 'You are down — your team fights on');

    this.hitmarkUntil = 0;
    this.hurtUntil = 0;
  }

  showMenu(show) {
    this.menu.classList.toggle('hidden', !show);
  }

  showOver(winner, score) {
    const won = winner === TEAM.WARDEN;
    this.overTitle.textContent = won ? 'THE SITES HOLD' : 'THE BRINEWORKS FALL';
    this.overTitle.className = 'game-title ' + (won ? 'w' : 'j');
    this.overSub.textContent = `Final score — Wardens ${score.warden}, Jackals ${score.jackal}.`;
    this.overScreen.classList.remove('hidden');
  }

  hideOver() {
    this.overScreen.classList.add('hidden');
  }

  addKill(killer, victim, headshot) {
    const line = el('div', 'kill-line', this.killfeed);
    const k = el('span', killer.isPlayer ? 'kf-you' : killer.team === TEAM.WARDEN ? 'kf-w' : 'kf-j', line, killer.isPlayer ? 'YOU' : killer.name);
    void k;
    el('span', 'kf-arrow', line, headshot ? ' ⌖ ' : ' ▸ ');
    el('span', victim.isPlayer ? 'kf-you' : victim.team === TEAM.WARDEN ? 'kf-w' : 'kf-j', line, victim.isPlayer ? 'YOU' : victim.name);
    while (this.killfeed.children.length > 4) this.killfeed.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), 3600);
    setTimeout(() => line.remove(), 4300);
  }

  showBanner(title, sub, ms) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.banner.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.add('hidden'), ms);
  }

  flashHitmarker(head, killed) {
    this.hitmarker.textContent = head ? '⌖' : '✕';
    this.hitmarker.className = 'hitmarker show' + (killed ? ' kill' : '');
    this.hitmarkUntil = performance.now() + 140;
  }

  flashHurt(fromX, fromZ, player) {
    this.hurtUntil = performance.now() + 350;
    const ang = Math.atan2(-(fromX - player.pos.x), -(fromZ - player.pos.z));
    let rel = ang - player.yaw;
    this.hurtDir.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`;
    this.hurtDir.classList.remove('hidden');
  }

  setBuyOpen(open, player) {
    this.buyMenu.classList.toggle('hidden', !open);
    if (!open) return;
    this.refreshBuy(player);
  }

  refreshBuy(player) {
    this.buyMoney.textContent = `Scrip: $${player.money}`;
    for (const { card, name, price, row } of this.buyCards) {
      const L = player.loadout;
      let itemName;
      let itemPrice;
      let owned = false;
      if (row.kind === 'weapon') {
        itemName = WEAPONS[row.id].name;
        itemPrice = WEAPONS[row.id].price;
        owned = !!L.owned[row.id];
      } else if (row.id === 'vest') {
        itemName = GEAR.vest.name;
        itemPrice = GEAR.vest.price;
        owned = L.vest;
      } else {
        itemName = GEAR.frag.name;
        itemPrice = GEAR.frag.price;
        owned = L.frags > 0;
      }
      name.textContent = itemName;
      price.textContent = owned ? 'OWNED' : `$${itemPrice}`;
      card.classList.toggle('owned', owned);
      card.classList.toggle('afford', !owned && player.money >= itemPrice);
      card.classList.toggle('poor', !owned && player.money < itemPrice);
    }
  }

  update(game) {
    const player = game.player;
    const round = game.round;
    const now = performance.now();
    this.root.dataset.state = game.state;

    // Clock + score.
    const clock = round.clockText();
    this.clockLabel.textContent = clock.label;
    this.clock.textContent = fmtTime(clock.seconds);
    this.clock.classList.toggle('urgent', clock.urgent);
    this.scoreW.textContent = String(round.score.warden);
    this.scoreJ.textContent = String(round.score.jackal);
    this.roundLabel.textContent = round.phase === 'idle' ? '' : `ROUND ${round.roundNumber} · FIRST TO ${MATCH.roundsToWin}`;

    // Alive pips.
    let pipsHtml = '';
    for (const a of game.actors) {
      if (a.team === TEAM.WARDEN) pipsHtml += `<i class="pip w${a.alive ? '' : ' dead'}"></i>`;
    }
    pipsHtml += '<em></em>';
    for (const a of game.actors) {
      if (a.team === TEAM.JACKAL) pipsHtml += `<i class="pip j${a.alive ? '' : ' dead'}"></i>`;
    }
    if (this.pips.innerHTML !== pipsHtml) this.pips.innerHTML = pipsHtml;

    // Player vitals.
    this.hpFill.style.width = `${Math.max(0, player.health)}%`;
    this.hpText.textContent = String(Math.ceil(player.health));
    this.hpFill.classList.toggle('low', player.health <= 30);
    this.arFill.style.width = `${Math.max(0, player.armor)}%`;
    this.arText.textContent = String(Math.ceil(player.armor));
    this.money.textContent = `$${player.money}`;

    // Weapon.
    const L = player.loadout;
    this.weaponName.textContent = L.weapon.name + (L.reloadLeft > 0 ? ' — RELOADING' : '');
    this.ammoMag.textContent = String(L.state.mag);
    this.ammoReserve.textContent = `/ ${L.state.reserve}`;
    this.gearLine.textContent = `${L.vest ? 'VEST · ' : ''}${L.frags > 0 ? `FRAG ×${L.frags} · ` : ''}1 sidearm · 2 primary · G frag`;

    // Crosshair spread feedback: the dot grows with the current spread.
    const spreadPx = 4 + (L.weapon.spread * (1 + player.speedNow * 0.55) + L.bloom) * 900;
    this.crosshair.style.setProperty('--sp', `${spreadPx.toFixed(0)}px`);
    this.crosshair.classList.toggle('hidden', !player.alive || game.state !== 'playing');
    if (now > this.hitmarkUntil) this.hitmarker.className = 'hitmarker';

    // Scope overlay for the Osprey.
    const scoped = player.alive && L.current === 'osprey' && game.input.rightDown;
    this.scope.classList.toggle('hidden', !scoped);

    // Prompts and channel progress.
    let promptText = '';
    if (player.alive && round.phase === 'live') {
      if (round.bombState === 'planted' && !player.channel) {
        const d = Math.hypot(player.pos.x - round.bombPos.x, player.pos.z - round.bombPos.z);
        if (d < 1.9) promptText = 'Hold E to defuse the charge';
      } else if (round.phase === 'live' && round.bombState !== 'planted') {
        promptText = '';
      }
    }
    if (round.phase === 'buy' && player.alive && !game.buyOpen) promptText = 'Buy phase — press B for the buy menu';
    this.prompt.textContent = promptText;
    this.prompt.classList.toggle('hidden', !promptText);

    if (player.channel) {
      this.channelWrap.classList.remove('hidden');
      this.channelLabel.textContent = player.channel.kind === 'defuse' ? 'DEFUSING…' : 'PLANTING…';
      this.channelFill.style.width = `${(100 * (1 - player.channel.left / player.channel.total)).toFixed(1)}%`;
    } else {
      this.channelWrap.classList.add('hidden');
    }

    // Planted alert.
    if (round.bombState === 'planted' && round.phase === 'live') {
      this.alert.textContent = `⚠ CHARGE PLANTED AT ${round.bombSite ? round.bombSite.name.toUpperCase() : 'A SITE'} — ${fmtTime(round.bombLeft)}`;
      this.alert.classList.remove('hidden');
    } else {
      this.alert.classList.add('hidden');
    }

    // Hurt feedback.
    const hurting = now < this.hurtUntil;
    this.vignette.classList.toggle('show', hurting || player.health <= 25);
    if (!hurting) this.hurtDir.classList.add('hidden');

    this.deadOverlay.classList.toggle('hidden', player.alive || game.state !== 'playing');
  }
}
