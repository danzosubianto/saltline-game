// round.js — the match structure: buy phase, live rounds, the breach
// charge (plant, guard, defuse, detonate), round-end rewards and the score.
// This module owns the phase machine; main.js asks it to update each fixed
// step and reads its state for the HUD.

import { Loadout } from './actors.js';
import { MATCH, TEAM } from './config.js';
import { dist2D } from './util.js';

// Defender posts: two per site and one mid, each with the angle it watches.
const WARDEN_POSTS = [
  { x: -27, z: -27, yaw: -2.2 }, // A, watching the west lane door
  { x: -40, z: -13, yaw: 2.6 }, // A, watching short
  { x: 26, z: -27, yaw: 2.2 }, // B, watching the east lane door
  { x: 40, z: -12, yaw: -2.6 }, // B, watching short
  { x: 0, z: -16, yaw: Math.PI }, // mid, watching the pump hall doors
];

const LURK_POSTS = [
  { x: -8, z: 12, yaw: 0 },
  { x: 9, z: 12, yaw: 0 },
];

export class RoundManager {
  constructor(game) {
    this.game = game;
    this.phase = 'idle'; // buy | live | end | over
    this.phaseLeft = 0;
    this.roundNumber = 0;
    this.score = { warden: 0, jackal: 0 };
    this.bombState = 'carried'; // carried | dropped | planted | exploded | defused
    this.bombPos = { x: 0, z: 0 };
    this.bombLeft = 0;
    this.bombSite = null;
    this.lastRoundWinner = null;
    this.lastRoundReason = '';
    this.beepAcc = 0;
  }

  get round() {
    return this;
  }

  startMatch() {
    this.score.warden = 0;
    this.score.jackal = 0;
    this.roundNumber = 0;
    for (const a of this.game.actors) {
      a.money = MATCH.startMoney;
      a.kills = 0;
      a.deaths = 0;
      a.loadout = new Loadout();
    }
    this.startRound();
  }

  startRound() {
    const game = this.game;
    this.roundNumber++;
    this.phase = 'buy';
    this.phaseLeft = MATCH.buySeconds;
    this.bombState = 'carried';
    this.bombSite = null;
    this.bombLeft = 0;
    game.grenades.length = 0;

    const wardens = game.actors.filter((a) => a.team === TEAM.WARDEN);
    const jackals = game.actors.filter((a) => a.team === TEAM.JACKAL);
    wardens.forEach((a, i) => a.resetForRound(game.world.spawns.warden[i], a.money));
    jackals.forEach((a, i) => a.resetForRound(game.world.spawns.jackal[i], a.money));

    // Defender posts for the warden bots (the player roams free).
    const wardenBots = wardens.filter((a) => !a.isPlayer);
    wardenBots.forEach((bot, i) => {
      bot.role = 'holder';
      bot.post = WARDEN_POSTS[i % WARDEN_POSTS.length];
      bot.setGoal(bot.post.x, bot.post.z);
    });

    // Attackers: one carrier, two escorts, two lurks at mid. The carrier
    // picks the site; escorts follow, lurks take mid and rotate late.
    const site = game.rng() < 0.5 ? game.world.sites.A : game.world.sites.B;
    jackals.forEach((bot, i) => {
      bot.site = site;
      if (i === 0) {
        bot.role = 'carrier';
        bot.hasBomb = true;
      } else if (i <= 2) {
        bot.role = 'escort';
      } else {
        bot.role = 'lurk';
        bot.post = LURK_POSTS[i - 3];
        bot.setGoal(bot.post.x, bot.post.z);
      }
    });
    // Bots shop now; the player shops through the buy menu. A vest bought
    // this round protects this round, so refresh armour after shopping.
    for (const bot of game.actors) {
      if (!bot.isPlayer) bot.buy(game);
    }
    for (const a of game.actors) {
      if (a.loadout.vest) a.armor = 100;
    }
    game.events.push({ type: 'roundStart', round: this.roundNumber });
  }

  // ---- the charge ---------------------------------------------------------

  tryPlant(actor) {
    if (this.phase !== 'live' || this.bombState !== 'carried') return false;
    if (!actor.hasBomb || !actor.alive || actor.channel) return false;
    for (const site of [this.game.world.sites.A, this.game.world.sites.B]) {
      if (dist2D(actor.pos.x, actor.pos.z, site.x, site.z) < site.r) {
        actor.channel = { kind: 'plant', left: MATCH.plantSeconds, total: MATCH.plantSeconds };
        return true;
      }
    }
    return false;
  }

  tryDefuse(actor) {
    if (this.phase !== 'live' || this.bombState !== 'planted') return false;
    if (actor.team !== TEAM.WARDEN || !actor.alive || actor.channel) return false;
    if (dist2D(actor.pos.x, actor.pos.z, this.bombPos.x, this.bombPos.z) > 1.9) return false;
    actor.channel = { kind: 'defuse', left: MATCH.defuseSeconds, total: MATCH.defuseSeconds };
    return true;
  }

  cancelChannel(actor, why) {
    if (!actor.channel) return;
    actor.channel = null;
    this.game.events.push({ type: 'channelCancel', actor, why });
  }

  updateChannels(dt) {
    for (const a of this.game.actors) {
      if (!a.channel) continue;
      if (!a.alive) {
        a.channel = null;
        continue;
      }
      a.channel.left -= dt;
      if (a.channel.kind === 'plant' && Math.random() < dt * 6) this.game.sounds.plantTick();
      if (a.channel.left > 0) continue;
      const kind = a.channel.kind;
      a.channel = null;
      if (kind === 'plant') this.completePlant(a);
      else this.completeDefuse(a);
    }
  }

  completePlant(actor) {
    const game = this.game;
    this.bombState = 'planted';
    this.bombPos = { x: actor.pos.x, z: actor.pos.z };
    this.bombLeft = MATCH.bombSeconds;
    this.bombSite = dist2D(actor.pos.x, actor.pos.z, game.world.sites.A.x, game.world.sites.A.z) <
      dist2D(actor.pos.x, actor.pos.z, game.world.sites.B.x, game.world.sites.B.z)
      ? game.world.sites.A
      : game.world.sites.B;
    actor.hasBomb = false;
    actor.money = Math.min(MATCH.maxMoney, actor.money + MATCH.plantReward);
    game.events.push({ type: 'planted', site: this.bombSite, actor });
    game.onNoise(actor.pos.x, actor.pos.z, null);
  }

  completeDefuse(actor) {
    this.bombState = 'defused';
    this.game.events.push({ type: 'defused', actor });
    this.endRound(TEAM.WARDEN, `${actor.isPlayer ? 'You defused' : 'The charge was defused'} at ${this.bombSite?.name ?? 'the site'}`);
  }

  // ---- phase machine ------------------------------------------------------

  update(dt) {
    const game = this.game;
    if (this.phase === 'buy') {
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) {
        this.phase = 'live';
        this.phaseLeft = MATCH.roundSeconds;
        game.events.push({ type: 'roundLive' });
      }
      return;
    }
    if (this.phase === 'end') {
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) {
        if (this.score.warden >= MATCH.roundsToWin || this.score.jackal >= MATCH.roundsToWin || this.roundNumber >= MATCH.maxRounds) {
          this.phase = 'over';
          game.events.push({ type: 'matchOver', winner: this.score.warden > this.score.jackal ? TEAM.WARDEN : TEAM.JACKAL });
        } else {
          this.startRound();
        }
      }
      return;
    }
    if (this.phase !== 'live') return;

    this.updateChannels(dt);

    // A dropped charge is picked up by the next Jackal to reach it.
    if (this.bombState === 'dropped') {
      for (const a of game.actors) {
        if (a.alive && a.team === TEAM.JACKAL && dist2D(a.pos.x, a.pos.z, this.bombPos.x, this.bombPos.z) < 1.6) {
          a.hasBomb = true;
          this.bombState = 'carried';
          game.events.push({ type: 'bombPickup', actor: a });
          break;
        }
      }
    }
    if (this.bombState === 'carried') {
      const carrier = game.actors.find((a) => a.hasBomb);
      if (carrier && !carrier.alive) {
        carrier.hasBomb = false;
        this.bombState = 'dropped';
        this.bombPos = { x: carrier.pos.x, z: carrier.pos.z };
        game.events.push({ type: 'bombDropped', pos: { ...this.bombPos } });
      }
    }

    // The fuse.
    if (this.bombState === 'planted') {
      this.bombLeft -= dt;
      this.beepAcc += dt;
      const urgent = this.bombLeft < 10;
      if (this.beepAcc > (urgent ? 0.35 : 0.8)) {
        this.beepAcc = 0;
        game.sounds.beep(this.bombLeft < 1);
      }
      if (this.bombLeft <= 0) {
        this.bombState = 'exploded';
        game.sounds.explosion();
        game.events.push({ type: 'explosion', x: this.bombPos.x, y: 1, z: this.bombPos.z, big: true });
        this.endRound(TEAM.JACKAL, `The charge detonated at ${this.bombSite?.name ?? 'the site'}`);
        return;
      }
    } else {
      this.phaseLeft -= dt;
    }

    // Elimination and time.
    const wardensAlive = game.actors.some((a) => a.alive && a.team === TEAM.WARDEN);
    const jackalsAlive = game.actors.some((a) => a.alive && a.team === TEAM.JACKAL);
    if (!jackalsAlive && this.bombState !== 'planted') {
      this.endRound(TEAM.WARDEN, 'Jackals eliminated');
    } else if (!wardensAlive) {
      this.endRound(TEAM.JACKAL, 'Wardens eliminated');
    } else if (this.bombState !== 'planted' && this.phaseLeft <= 0) {
      this.endRound(TEAM.WARDEN, 'Time expired — the sites hold');
    }
  }

  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    const game = this.game;
    this.phase = 'end';
    this.phaseLeft = MATCH.endSeconds;
    this.lastRoundWinner = winner;
    this.lastRoundReason = reason;
    this.score[winner]++;
    for (const a of game.actors) {
      a.channel = null;
      const reward = a.team === winner ? MATCH.winReward : MATCH.lossReward;
      a.money = Math.min(MATCH.maxMoney, a.money + reward);
      // The dead lose their kit; survivors keep theirs for the next round.
      if (!a.alive) a.loadout = new Loadout();
    }
    const playerWon = winner === TEAM.WARDEN;
    if (playerWon) game.sounds.roundWin();
    else game.sounds.roundLose();
    game.events.push({ type: 'roundEnd', winner, reason });
  }

  // What the HUD clock shows: buy countdown, round time, or the fuse.
  clockText() {
    if (this.phase === 'buy') return { label: 'BUY', seconds: Math.max(0, this.phaseLeft), urgent: false };
    if (this.bombState === 'planted') return { label: 'CHARGE', seconds: Math.max(0, this.bombLeft), urgent: this.bombLeft < 10 };
    if (this.phase === 'live') return { label: 'ROUND', seconds: Math.max(0, this.phaseLeft), urgent: this.phaseLeft < 15 };
    return { label: '', seconds: 0, urgent: false };
  }
}
