# saltline-game

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/danzosubianto/saltline-game/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/danzosubianto/saltline-game/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

An original round-based tactical FPS for the browser, built with three.js.
Wardens vs Jackals at the Brineworks — a coastal salt plant at dawn.

The Jackals carry a breach charge to **Cistern A** or **Silo B** and plant
it. You play a **Warden**: hold the sites, and if the charge goes down,
defuse it before the fuse runs out. First to 7 rounds takes the match.

## Run it

```sh
node serve.ts
```

---

Entered on [make.fun](https://make.fun/?ref=qy81p54j&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards

## Play

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Open the page, click to play. No build step — the game is plain ES modules
under `game/`, with three.js 0.187.0 vendored under `game/vendor/three/`.

| Key | Action |
| --- | --- |
| WASD / mouse | move / look (pointer lock) |
| Click | fire (right-click: Osprey scope) |
| R | reload |
| Ctrl / C | crouch |
| 1 / 2 | sidearm / primary |
| G | throw frag charge |
| B, then 1–6 | buy menu |
| E (hold) | defuse the charge |

## The game

- **Gunplay that punishes movement.** Spread blooms while you run and
  shrinks when you stop or crouch; headshots deal 4× damage; a Kevlar vest
  soaks 60% of each hit until it is spent.
- **Five invented weapons** — Kestrel P9 sidearm, Marten SMG, Boar-12
  shotgun, Halberd AR, Osprey DMR — plus a throwable frag charge, bought
  with round scrip in a 12-second buy phase. Kills, plants, wins and losses
  all pay; the dead lose their kit.
- **Bots with jobs.** Jackal bots run a carrier/escort/lurk plan to a site,
  plant, and guard the charge; Warden bots hold posts, rotate on noise and
  sightings, and push the defuse. They hear gunfire, react after a human
  delay, strafe in fights, and retreat to their range band.
- **One original map.** The Brineworks: two plant sites (a teal cistern, a
  rust silo yard), a pump hall at mid, three lanes with real sightlines,
  salt piles and crates for cover — everything from one block list that
  drives both the meshes and the colliders, plus a waypoint graph the bots
  path through.
- **All sound is synthesized** with WebAudio — shots, reloads, hitmarkers,
  the charge's beeper, the detonation. No audio files, no external loads.

## Layout

- `game/src/` — the game, one job per module: `world` (map + pathing),
  `actors` (fighters + loadouts), `player` (controls + view model),
  `combat` (hitscan + grenades), `bots` (AI), `round` (match structure),
  `hud` (DOM interface), `audio` (synth), `input`, `config`, `util`.
  The simulation runs on a fixed 1/60 step, separate from rendering.
- `main.ts` — the make.fun entry point: copies `game/` + `screenshots/`
  to the output directory and writes the dossier.
- `shots.json` — the staged screenshot scenes (`?shot=menu|buy|play|planted`).

MIT licensed.
