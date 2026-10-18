# LEGENDS 3V3 — Dreamcast Hoops Coaching Simulator

A 3-on-3 basketball **coaching** simulator starring 12 NBA legends, rendered in a
Dreamcast-era NBA 2K style: chunky low-poly players, painted wood court, billboard
crowd, broadcast corner camera, chunky scorebug.

You don't run the point — you **coach**. Pick a squad, set schemes on the whiteboard,
ride the hot hand, manage legs, call timeouts. The sim plays it out possession by
possession; the 3D engine is a playback of the sim's event script.

## The 12 legends (prime-era, stylized faces)

| Squad | Players |
|---|---|
| **Windy City** | Allen Iverson #3, Michael Jordan #23, Tim Duncan #21 |
| **Showtime** | Magic Johnson #32, Larry Bird #33, Hakeem Olajuwon #34 |
| **Small Ball** | Stephen Curry #30, Kevin Durant #35, Shaquille O'Neal #34 |
| **Mamba Mentality** | LeBron James #23, Kobe Bryant #8, Dirk Nowitzki #41 |

Each legend has a full attribute profile (shooting, handles, passing, defense,
athleticism, post game, clutch) plus a signature move the 3D engine animates:
Jordan's fadeaway, Iverson's crossover, Magic's no-look pass, Hakeem's Dream Shake,
Duncan's bank shot, Dirk's one-legger, Shaq's power dunks, LeBron's chase-down blocks.

## Coaching guide

**Offense**
- **Isolation** — clear out for your best scorer. High usage for the hot hand.
- **Pick & Roll** — guard + big two-man game: drives, lobs, pops.
- **Motion** — off-ball screens for open 3s and backdoor cuts. Needs shooting.
- **Post-Up** — feed the big on the block. Punishes small lineups.
- **Run & Gun** — push every possession. More shots, more 3s — heavy legs late.

**Defense**
- **Man-to-Man** — straight up, no big weaknesses.
- **Zone** — packs the paint, dares them to shoot. Elite shooting breaks it.
- **Full-Court Press** — forces turnovers vs weak handles; great passers carve it up.
- **Pack the Paint** — doubles the post, swarms drivers; leaves shooters open.

**Tempo** — Push = more possessions, faster stamina drain. Half-court = fewer
possessions, fresher legs in crunch time. Tired players shoot worse and turn it over.

**Timeouts** — 2 per game. Rest legs (+stamina) and change schemes mid-game.
**Hot hand** — pick which player the offense runs through.

Tournament: single-elim semifinal + final. AI coaches adjust schemes at halftime
and call timeouts when the game slips away.

## Run it

```sh
git pull && bun src/server.ts   # http://127.0.0.1:3034
```

Bun only, zero npm dependencies. three.js r160 is vendored in
`public/vendor/` (MIT), so the game works fully offline.

## How it works

- `src/roster.js` — players, squads, schemes (shared by tests + browser)
- `src/sim.js` — seeded, possession-based sim engine. Every possession emits an
  **event script** (passes, signature dribble moves, drives, shots with contest
  levels, rebounds, blocks, steals, fouls, free throws). Probabilities come from
  attributes × scheme matchups × stamina × clutch time.
- `public/world.js` — three.js scene: procedural low-poly player rigs (per-legend
  height/build/wingspan, front+back jersey numbers and name plates, hair
  variations, headbands, gripping hands with fingertip ball anchors), wood court
  canvas texture, arena, broadcast camera, dust puffs, debug close-up camera hook
- `public/body.js` — body physics model: per-player velocity/accel with
  athleticism-based caps, turn-rate limits, acceleration lean, speed-driven
  stride cycle with planted feet, analytic two-bone leg IK, ballistic jumps with
  crouch landings, capsule-vs-capsule collision
- `public/ball.js` — ball-possession error correction: while held/dribbling the
  ball is derived from the hand every frame; passes and shots start at the
  release hand with catch blends (dev invariant logged at game end)
- `public/playback.js` — turns the event script into animation: physics-driven
  movement, release-synced passes/shots, shot arcs with rim bounces and
  swishes, graded jump-shot variants, celebrations
- `public/audio.js` — synthesized WebAudio: ball bounces, swishes, rim clangs,
  buzzer, whistle, crowd swells, sneaker squeaks
- `public/app.js` — title → squad select → bracket → whiteboard → live game →
  box score → champion

## Tests

```sh
bun test   # 39 tests: determinism, scheme effects, attribute sanity, 100-game
           # soak, leg IK round-trip, foot planting, jump ballistics, body
           # collisions, ball-possession invariant + release anchoring over
           # full simmed games
```

Verified in headless Chromium via CDP: full flow (title → squad → bracket →
whiteboard → live 3D game → timeout → sim-to-end → box score → final) with zero
JS errors.
