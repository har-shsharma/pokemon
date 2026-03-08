'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { GameScreenProps } from '../utils/interfaces';

// ─── Constants ────────────────────────────────────────────────────────────────
const WALL_WIDTH           = 36;
const PLAYER_W             = 48;
const PLAYER_H             = 48;
const OBSTACLE_W           = 36;
const OBSTACLE_H           = 36;
const WALL_TILE_H          = 80;

// Speed is now in px/second (not px/frame) — consistent on all devices
const SCROLL_SPEED_START    = 240;      // px/s  (was 4 px/frame × 60)
const SCROLL_SPEED_MAX      = 900;      // px/s  (was 15 px/frame × 60)
// Old ramp: frame*0.001 at 60fps = 0.06 px/s per second = 0.00006 px/s per ms
const SCROLL_RAMP_PER_MS    = 0.00006;

const JUMP_DURATION         = 260;      // ms — already time-based, unchanged
const SPAWN_INTERVAL_START  = 1800;     // ms
const SPAWN_INTERVAL_MIN    = 550;      // ms
const OBS_SPEED_START       = 330;      // px/s  (was 5.5 × 60)
const OBS_SPEED_MAX         = 1200;     // px/s  (was 20 × 60)
const OBS_SPEED_RAMP_PER_MS = 0.00006;
// Old spawn shrink: frame*0.4 at 60fps = elapsed_ms/1000*60*0.4 = elapsed_ms*0.024
const SPAWN_SHRINK_PER_MS   = 0.024;

// Horizontal slide feature — unlocks after this score
const SLIDE_SCORE_THRESHOLD = 100;
const SLIDE_SPEED           = 280;  // px/s horizontal travel

// ── Event system ─────────────────────────────────────────────────────────────
const EVENT_MILESTONE_EVERY  = 100;   // guaranteed event every N score points
const EVENT_RANDOM_INTERVAL  = 15000; // ms — random event check interval
const EVENT_RANDOM_CHANCE    = 0.55;  // 55% chance on each random check

// Wall-squeeze event
const WALL_SQUEEZE_DURATION  = 4000;  // ms walls stay wide
const WALL_WIDTH_SQUEEZED    = 72;    // px — double normal width
const WALL_WIDTH_NORMAL      = 36;    // px

// Darkness event
const DARK_DURATION          = 3500;  // ms

// Shake event
const SHAKE_DURATION         = 2000;  // ms
const SHAKE_INTENSITY        = 6;     // max px offset



const TRAIL_COUNT   = 5;
const PLAYER_Y_FRAC = 0.62;

const FRAME_W  = 48;
const FRAME_H  = 48;
const ANIM_FPS = 10;

// Delta time cap: if tab was backgrounded we might get a huge ts jump.
// Cap at 50ms so game lags rather than teleporting obstacles.
const MAX_DELTA_MS = 50;

type Wall = 'left' | 'right';

interface Obstacle {
  id: number;
  wall: Wall;
  y: number;
  speed: number;      // px/s vertical
  rotation: number;
  // Horizontal slide (active when score > 500)
  sliding:   boolean;
  slideX:    number;
  slideDir:  1 | -1;
  slideSpeed: number;
  // Earthquake wobble — random X jitter added during shake event
  wobblePhase: number; // random phase offset so each ball wobbles differently
}

function wallX(wall: Wall, arenaW: number , wallW: number): number {
  return wall === 'left'
    ? wallW - 4
    : arenaW - wallW - PLAYER_W + 4;
}

function obstacleX(wall: Wall, arenaW: number, wallW = WALL_WIDTH_NORMAL): number {
  return wall === 'left'
    ? wallW - OBSTACLE_W / 2
    : arenaW - wallW - OBSTACLE_W / 2;
}

function easeNinjaX(t: number): number { return 1 - Math.pow(1 - t, 3); }
function ninjaYOffset(t: number): number {
  return t < 0.3 ? -55 * (t / 0.3) : -55 * (1 - (t - 0.3) / 0.7);
}

// ─── Component ────────────────────────────────────────────────────────────────
function GameScreen({ pokemon, name }: GameScreenProps) {
  const arenaRef     = useRef<HTMLDivElement>(null);
  const playerRef    = useRef<HTMLDivElement>(null);
  const spriteRef    = useRef<HTMLDivElement>(null);
  const scoreRef     = useRef<HTMLSpanElement>(null);
  const speedRef     = useRef<HTMLSpanElement>(null);
  const leftWallRef  = useRef<HTMLDivElement>(null);
  const rightWallRef = useRef<HTMLDivElement>(null);
  const poolRef      = useRef<Map<number, HTMLDivElement>>(new Map());
  const trailRefs      = useRef<HTMLDivElement[]>([]);
  const darknessRef    = useRef<HTMLDivElement>(null);
  const eventLabelRef  = useRef<HTMLDivElement>(null);

  const g = useRef({
    wall:           'left' as Wall,
    jumping:        false,
    jumpStart:      0,
    jumpFromWall:   'left' as Wall,
    obstacles:      [] as Obstacle[],
    score:          0,
    scrollSpeed:    SCROLL_SPEED_START,  // px/s
    obsSpeed:       OBS_SPEED_START,     // px/s
    wallOffset:     0,
    lastSpawn:      0,
    spawnInterval:  SPAWN_INTERVAL_START,
    startTime:      0,   // real timestamp when game started — drives speed ramp
    lastTs:         0,   // timestamp of previous frame — for delta calculation
    running:        false,
    dead:           false,
    raf:            0,
    idCounter:      0,
    trailPositions:    [] as { x: number; y: number }[],
    slidingObstacleId: -1,   // id of the one obstacle currently sliding (-1 = none)

    // ── Event system ──────────────────────────────────────────────────────
    lastMilestone:    0,     // last score milestone that fired an event
    lastRandomCheck:  0,     // ts of last random event check
    activeEvent:      'none' as 'none'|'squeeze'|'dark'|'shake',
    eventStart:       0,     // ts when current event began
    currentWallW:     WALL_WIDTH_NORMAL, // animated wall width (px)


    animFrame:      0,
    lastAnimTick:   0,
    // track frame parity for trail spacing (still frame-count based, doesn't affect gameplay)
    frameCount:     0,
  });

  const [phase, setPhase]           = useState<'playing' | 'dead'>('playing');
  const [deathScore, setDeathScore] = useState(0);
  const [highScore,  setHighScore]  = useState<number>(() => {
    try { return parseInt(localStorage.getItem('pokemon_highscore') ?? '0', 10) || 0; }
    catch { return 0; }
  });
  const [newRecord, setNewRecord] = useState(false);

  const getArena = () => {
    const el = arenaRef.current;
    if (!el) return { w: 320, h: 600 };
    return { w: el.clientWidth, h: el.clientHeight };
  };

  // ── Sprite animation ──────────────────────────────────────────────────────
  const updateSprite = (ts: number, jumping: boolean, onRightWall: boolean) => {
    const state = g.current;
    if (ts - state.lastAnimTick > 1000 / ANIM_FPS) {
      state.lastAnimTick = ts;
      if (jumping) {
        const jf = state.animFrame >= 4 ? state.animFrame : 4;
        state.animFrame = Math.min(7, jf + 1);
      } else {
        state.animFrame = state.animFrame >= 4 ? 0 : (state.animFrame + 1) % 4;
      }
    }
    if (spriteRef.current) {
      spriteRef.current.style.backgroundPosition = `${-(state.animFrame * FRAME_W)}px 0px`;
      spriteRef.current.style.transform = onRightWall ? 'scaleX(-1)' : 'scaleX(1)';
    }
  };

  // ── Jump ──────────────────────────────────────────────────────────────────
  const jump = useCallback(() => {
    const state = g.current;
    if (!state.running || state.dead || state.jumping) return;
    state.jumping        = true;
    state.jumpStart      = performance.now();
    state.jumpFromWall   = state.wall;
    state.wall           = state.wall === 'left' ? 'right' : 'left';
    state.trailPositions = [];
    state.animFrame      = 4;
  }, []);

  // ── Main loop ─────────────────────────────────────────────────────────────
  const loop = useCallback((ts: number) => {
    const state = g.current;
    if (!state.running || state.dead) return;

    // ── Delta time ──────────────────────────────────────────────────────────
    // dt is in SECONDS. All movement = speed(px/s) × dt(s) = px moved this frame.
    // This makes movement identical on 30Hz, 60Hz, 120Hz, 144Hz screens.
    const rawDelta = state.lastTs === 0 ? 16.667 : ts - state.lastTs;
    const delta    = Math.min(rawDelta, MAX_DELTA_MS); // cap: don't teleport after tab switch
    const dt       = delta / 1000;                     // convert ms → seconds
    state.lastTs   = ts;
    state.frameCount++;

    const { w, h } = getArena();
    const fixedY = h * PLAYER_Y_FRAC;

    // ── Speed ramp — driven by real elapsed time, not frame count ───────────
    const elapsed = ts - state.startTime; // ms since game started
    state.scrollSpeed = Math.min(SCROLL_SPEED_MAX, SCROLL_SPEED_START + elapsed * SCROLL_RAMP_PER_MS);
    state.obsSpeed    = Math.min(OBS_SPEED_MAX,    OBS_SPEED_START    + elapsed * OBS_SPEED_RAMP_PER_MS);

    // ── Wall scroll — multiply by dt so px/frame becomes px/s × s ───────────
    state.wallOffset = (state.wallOffset + state.scrollSpeed * dt) % WALL_TILE_H;
    const bgPos = `0px ${state.wallOffset}px`;
    if (leftWallRef.current)  leftWallRef.current.style.backgroundPosition = bgPos;
    if (rightWallRef.current) rightWallRef.current.style.backgroundPosition = bgPos;

    // ── Player position ──────────────────────────────────────────────────────
    const targetX = wallX(state.wall, w , state.currentWallW);
    const fromX   = wallX(state.jumpFromWall, w , state.currentWallW);
    let px: number, py: number, rot = 0, scaleX = 1, scaleY = 1;

    if (state.jumping) {
      // Jump uses ts directly — always been time-based, no change needed
      const t = Math.min((ts - state.jumpStart) / JUMP_DURATION, 1);
      px = fromX + (targetX - fromX) * easeNinjaX(t);
      py = fixedY + ninjaYOffset(t);

      const dir = state.wall === 'right' ? 1 : -1;
      if (t < 0.5) {
        rot    = dir * 20 * (t / 0.5);
        scaleX = 1 - 0.12 * Math.sin(t * Math.PI);
        scaleY = 1 + 0.12 * Math.sin(t * Math.PI);
      } else {
        rot = dir * 20 * (1 - (t - 0.5) / 0.5);
      }
      if (t > 0.88) {
        const lt = (t - 0.88) / 0.12;
        scaleX = 1 + 0.25 * Math.sin(lt * Math.PI);
        scaleY = 1 - 0.18 * Math.sin(lt * Math.PI);
      }
      if (t >= 1) { state.jumping = false; px = targetX; py = fixedY; }
    } else {
      px = targetX;
      // Idle bob — use elapsed real time so bob speed is consistent too
      py = fixedY + Math.sin(elapsed * 0.006) * 1.5;
    }

    updateSprite(ts, state.jumping, state.wall === 'right');

    // ── Event system ─────────────────────────────────────────────────────────
    const pickEvent = (): typeof state.activeEvent => {
      const roll = Math.random();
      if (roll < 0.34) return 'shake';
      if (roll < 0.67) return 'squeeze';
      return 'dark';
    };

    const triggerEvent = (type: typeof state.activeEvent) => {
      if (state.activeEvent !== 'none') return; // don't stack events
      state.activeEvent = type;
      state.eventStart  = ts;
      // Only announce darkness — shake and squeeze hit silently for surprise
      if (eventLabelRef.current) {
        const label = type === 'dark' ? '🌑 LIGHTS OUT!' : '';
        eventLabelRef.current.textContent = label;
        eventLabelRef.current.style.opacity = label ? '1' : '0';
        if (label) {
          setTimeout(() => {
            if (eventLabelRef.current) eventLabelRef.current.style.opacity = '0';
          }, 1200);
        }
      }
    };

    // Milestone trigger — every EVENT_MILESTONE_EVERY score points
    const milestone = Math.floor(state.score / EVENT_MILESTONE_EVERY);
    if (milestone > state.lastMilestone && state.score > 0) {
      state.lastMilestone = milestone;
      triggerEvent(pickEvent());
    }

    // Random trigger — every EVENT_RANDOM_INTERVAL ms
    if (state.lastRandomCheck === 0) state.lastRandomCheck = ts;
    if (ts - state.lastRandomCheck > EVENT_RANDOM_INTERVAL) {
      state.lastRandomCheck = ts;
      if (Math.random() < EVENT_RANDOM_CHANCE) triggerEvent(pickEvent());
    }

    // ── Resolve active event each frame ───────────────────────────────────
    const eventAge = ts - state.eventStart;

    if (state.activeEvent === 'squeeze') {
      // Animate wall width: ramp up in first 500ms, hold, ramp back in last 500ms
      const rampIn  = Math.min(1, eventAge / 500);
      const rampOut = eventAge > WALL_SQUEEZE_DURATION - 500
        ? 1 - (WALL_SQUEEZE_DURATION - eventAge) / 500 : 0;
      const t = Math.max(rampIn - rampOut, 0);
      state.currentWallW = WALL_WIDTH_NORMAL + (WALL_WIDTH_SQUEEZED - WALL_WIDTH_NORMAL) * t;
      // Apply to wall DOM refs
      if (leftWallRef.current) {
        leftWallRef.current.style.width = `${state.currentWallW}px`;
        leftWallRef.current.style.backgroundSize = `${state.currentWallW}px ${WALL_TILE_H}px`;
      }
      if (rightWallRef.current) {
        rightWallRef.current.style.width = `${state.currentWallW}px`;
        rightWallRef.current.style.backgroundSize = `${state.currentWallW}px ${WALL_TILE_H}px`;
      }
      if (eventAge >= WALL_SQUEEZE_DURATION) {
        state.activeEvent  = 'none';
        state.currentWallW = WALL_WIDTH_NORMAL;
        if (leftWallRef.current)  leftWallRef.current.style.width  = `${WALL_WIDTH_NORMAL}px`;
        if (rightWallRef.current) rightWallRef.current.style.width = `${WALL_WIDTH_NORMAL}px`;
      }
    }

    if (state.activeEvent === 'dark') {
      // Fade in darkness, hold, fade out
      let alpha = 0;
      if (eventAge < 400)                              alpha = eventAge / 400 * 0.88;
      else if (eventAge < DARK_DURATION - 400)         alpha = 0.88;
      else                                             alpha = (1 - (eventAge - (DARK_DURATION - 400)) / 400) * 0.88;
      if (darknessRef.current) darknessRef.current.style.opacity = String(Math.max(0, alpha));
      if (eventAge >= DARK_DURATION) {
        state.activeEvent = 'none';
        if (darknessRef.current) darknessRef.current.style.opacity = '0';
      }
    }

    if (state.activeEvent === 'shake') {
      const intensity = SHAKE_INTENSITY * (1 - eventAge / SHAKE_DURATION);
      const sx = (Math.random() - 0.5) * 2 * intensity;
      const sy = (Math.random() - 0.5) * 2 * intensity;
      if (arenaRef.current) arenaRef.current.style.transform = `translate(${sx}px, ${sy}px)`;
      if (eventAge >= SHAKE_DURATION) {
        state.activeEvent = 'none';
        if (arenaRef.current) arenaRef.current.style.transform = 'none';
      }
    }



    // ── Spawn obstacles ──────────────────────────────────────────────────────
    const hardMode = state.score >= SLIDE_SCORE_THRESHOLD;
    // When hard mode: widen spawn interval by 40% so fewer obstacles overall
    const intervalMultiplier = hardMode ? 1.4 : 1.0;
    if (state.lastSpawn === 0 || ts - state.lastSpawn > state.spawnInterval) {
      state.lastSpawn     = ts;
      state.spawnInterval = Math.max(
        SPAWN_INTERVAL_MIN * intervalMultiplier,
        (SPAWN_INTERVAL_START - elapsed * SPAWN_SHRINK_PER_MS) * intervalMultiplier
      );
      const spawnWall: Wall = Math.random() < 0.5 ? 'left' : 'right';
      const newId = ++state.idCounter;

      // Decide if this obstacle should slide: only in hard mode, only if no
      // other obstacle is currently sliding, and only 30% of the time
      const shouldSlide = hardMode
        && state.slidingObstacleId === -1
        && Math.random() < 0.30;

      if (shouldSlide) state.slidingObstacleId = newId;

      // slideX starts at the wall edge this obstacle spawns on
      const startX = spawnWall === 'left'
        ? state.currentWallW - OBSTACLE_W / 2
        : w - state.currentWallW - OBSTACLE_W / 2;

      state.obstacles.push({
        id:         newId,
        wall:       spawnWall,
        y:          -OBSTACLE_H - 10,
        speed:      state.obsSpeed,
        rotation:   0,
        sliding:    shouldSlide,
        slideX:     startX,
        slideDir:    spawnWall === 'left' ? 1 : -1,
        slideSpeed:  SLIDE_SPEED,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }

    // ── Move obstacles — multiply by dt ─────────────────────────────────────
    // Clear slidingObstacleId if that obstacle left the screen
    const offScreen = state.obstacles.filter(o => o.y >= h + OBSTACLE_H + 20);
    for (const o of offScreen) {
      if (o.id === state.slidingObstacleId) state.slidingObstacleId = -1;
    }
    state.obstacles = state.obstacles.filter(o => o.y < h + OBSTACLE_H + 20);

    // During earthquake obstacles fall 2× faster — feels like gravity broke
    const shakeSpeedMult = state.activeEvent === 'shake' ? 2.0 : 1.0;

    for (const o of state.obstacles) {
      o.y        += o.speed * dt * shakeSpeedMult;
      o.rotation  = (o.rotation + 180 * dt * shakeSpeedMult) % 360;

      if (o.sliding) {
        // Move horizontally, bounce off walls
        o.slideX += o.slideDir * o.slideSpeed * dt;
        const minX = state.currentWallW - OBSTACLE_W / 2;
        const maxX = w - state.currentWallW - OBSTACLE_W / 2;
        if (o.slideX <= minX) { o.slideX = minX; o.slideDir = 1;  }
        if (o.slideX >= maxX) { o.slideX = maxX; o.slideDir = -1; }
        // Keep wall in sync so collision uses slideX
        o.wall = o.slideX < w / 2 ? 'left' : 'right';
      }
    }

    // ── Collision ────────────────────────────────────────────────────────────
    for (const o of state.obstacles) {
      const ox = o.sliding ? o.slideX : obstacleX(o.wall, w, state.currentWallW);
      if (px+5 < ox+OBSTACLE_W && px+PLAYER_W-5 > ox && py+5 < o.y+OBSTACLE_H && py+PLAYER_H-5 > o.y) {
        state.dead = true; state.running = false; 

         // Reset all event effects immediately
    if (darknessRef.current) darknessRef.current.style.opacity = '0';
    if (arenaRef.current) arenaRef.current.style.transform = 'none';
    if (leftWallRef.current)  leftWallRef.current.style.width  = `${WALL_WIDTH_NORMAL}px`;
    if (rightWallRef.current) rightWallRef.current.style.width = `${WALL_WIDTH_NORMAL}px`;
    state.activeEvent = 'none';

        const finalScore = Math.floor(state.score);
        setDeathScore(finalScore);
        setHighScore(prev => {
          if (finalScore > prev) {
            try { localStorage.setItem('pokemon_highscore', String(finalScore)); } catch {}
            setNewRecord(true);
            return finalScore;
          }
          setNewRecord(false);
          return prev;
        });
        setPhase('dead');
        return;
      }
    }

    // ── Score — multiply by dt ───────────────────────────────────────────────
    state.score += state.scrollSpeed * 0.03 * dt;
    if (scoreRef.current) scoreRef.current.textContent = Math.floor(state.score).toString();
    if (speedRef.current) {
      const lvl = Math.min(10, Math.floor(1 + (state.scrollSpeed - SCROLL_SPEED_START) / (SCROLL_SPEED_MAX - SCROLL_SPEED_START) * 9));
      speedRef.current.textContent = `LVL ${lvl}`;
    }

    // ── Render player ────────────────────────────────────────────────────────
    if (playerRef.current) {
      playerRef.current.style.transform =
        `translate(${px}px,${py}px) rotate(${rot}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
    }

    // ── Trail ghosts ─────────────────────────────────────────────────────────
    if (state.jumping) {
      if (state.frameCount % 2 === 0) {
        state.trailPositions.unshift({ x: px, y: py });
        if (state.trailPositions.length > TRAIL_COUNT) state.trailPositions.length = TRAIL_COUNT;
      }
    } else {
      if (state.trailPositions.length > 0) state.trailPositions = [];
    }

    for (let i = 0; i < TRAIL_COUNT; i++) {
      const div = trailRefs.current[i];
      if (!div) continue;
      const pos = state.trailPositions[i];
      if (pos && state.jumping) {
        div.style.backgroundPosition = `${-(state.animFrame * FRAME_W)}px 0px`;
        div.style.transform = `translate(${pos.x}px,${pos.y}px) scale(${1 - i * 0.06})`;
        div.style.opacity = String(0.75 - i * 0.12);
        div.style.display = 'block';
      } else {
        div.style.display = 'none';
      }
    }

    // ── Obstacle DOM pool ────────────────────────────────────────────────────
    const arena = arenaRef.current;
    if (arena) {
      const alive = new Set(state.obstacles.map(o => o.id));
      for (const [id, div] of poolRef.current) {
        if (!alive.has(id)) { div.remove(); poolRef.current.delete(id); }
      }
      for (const o of state.obstacles) {
        let div = poolRef.current.get(o.id);
        if (!div) {
          div = document.createElement('div');
          div.style.cssText = [
            'position:absolute;top:0;left:0;',
            `width:${OBSTACLE_W}px;height:${OBSTACLE_H}px;`,
            'z-index:25;',
            'pointer-events:none;',
            'will-change:transform;',
            'background-image:url(/sprites/obstacle.png);',
            `background-size:${OBSTACLE_W}px ${OBSTACLE_H}px;`,
            'background-repeat:no-repeat;',
            'image-rendering:pixelated;',
            'transform-origin:center center;',
          ].join('');
          arena.appendChild(div);
          poolRef.current.set(o.id, div);
        }
        const baseX = o.sliding ? o.slideX : obstacleX(o.wall, w, state.currentWallW);
        // During earthquake: add sinusoidal X wobble, each obstacle has unique phase
        const wobble = state.activeEvent === 'shake'
          ? Math.sin(ts * 0.018 + o.wobblePhase) * 10   // ±10px, fast flicker
          : 0;
        const ox = baseX + wobble;
        div.style.transform = `translate(${ox}px, ${o.y}px) rotate(${o.rotation}deg)`;
        div.style.filter = o.sliding
          ? 'drop-shadow(0 0 8px #fff) drop-shadow(0 0 16px #ff4444) brightness(1.3)'
          : 'none';
      }
    }

    state.raf = requestAnimationFrame(loop);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    for (const [, div] of poolRef.current) div.remove();
    poolRef.current.clear();
    const now = performance.now();
    const state = g.current;
    Object.assign(state, {
      wall: 'left', jumping: false, jumpStart: 0, jumpFromWall: 'left',
      obstacles: [], score: 0,
      scrollSpeed: SCROLL_SPEED_START,
      obsSpeed: OBS_SPEED_START,
      wallOffset: 0, lastSpawn: 0, spawnInterval: SPAWN_INTERVAL_START,
      startTime: now,  // anchor for elapsed-time ramp
      lastTs: 0,       // reset so first delta defaults to 16.67ms
      dead: false, idCounter: 0, trailPositions: [],
      animFrame: 0, lastAnimTick: 0, running: true, frameCount: 0, slidingObstacleId: -1,
      lastMilestone: 0, lastRandomCheck: 0, activeEvent: 'none', eventStart: 0,
      currentWallW: WALL_WIDTH_NORMAL,
    });
    setNewRecord(false);
    setPhase('playing');
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => {
    const t = setTimeout(startGame, 80);
    return () => { clearTimeout(t); cancelAnimationFrame(g.current.raf); g.current.running = false; };
  }, [startGame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
      e.preventDefault();
      if (phase === 'dead') startGame(); else jump();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, jump, startGame]);

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden select-none" style={{ background: '#0a0a0f' }}>

      {/* HUD */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b z-20 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.7)', borderColor: `${pokemon.glow}33`, backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
            style={{ background: `${pokemon.glow}22`, border: `1px solid ${pokemon.glow}55` }}>
            {pokemon.emoji}
          </div>
          <div>
            <div className="text-white font-bold leading-none"
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.45rem' }}>{pokemon.name}</div>
            <div className="text-gray-500 leading-none mt-0.5"
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.32rem' }}>{name}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span ref={speedRef} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.38rem', color: '#ff6b00' }}>LVL 1</span>
          <div className="flex flex-col items-end gap-0.5">
            <span ref={scoreRef} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.5rem', color: pokemon.glow }}>0</span>
            {highScore > 0 && (
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.28rem', color: '#555' }}>
                BEST {highScore}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Arena */}
      <div ref={arenaRef} className="relative flex-1 overflow-hidden" style={{ cursor: 'pointer' }}
        onClick={() => phase === 'dead' ? startGame() : jump()}>

        <div className="absolute inset-0" style={{
          zIndex: 0,
          backgroundImage: 'url(/sprites/background.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} />

        <div ref={leftWallRef} className="absolute top-0 left-0 h-full pointer-events-none" style={{
          zIndex: 10,
          width: `${WALL_WIDTH}px`,
          backgroundImage: 'url(/sprites/wall_tile.png)',
          backgroundSize: `${WALL_WIDTH}px ${WALL_TILE_H}px`,
          backgroundRepeat: 'repeat-y',
          boxShadow: `4px 0 20px ${pokemon.glow}55`,
        }} />

        <div ref={rightWallRef} className="absolute top-0 right-0 h-full pointer-events-none" style={{
          zIndex: 10,
          width: `${WALL_WIDTH}px`,
          backgroundImage: 'url(/sprites/wall_tile_right.png)',
          backgroundSize: `${WALL_WIDTH}px ${WALL_TILE_H}px`,
          backgroundRepeat: 'repeat-y',
          boxShadow: `-4px 0 20px ${pokemon.glow}55`,
        }} />

        {[...Array(TRAIL_COUNT)].map((_, i) => (
          <div key={i} ref={el => { if (el) trailRefs.current[i] = el; }}
            className="absolute pointer-events-none"
            style={{
              zIndex: 21,
              width: `${PLAYER_W}px`,
              height: `${PLAYER_H}px`,
              top: 0, left: 0,
              display: 'none',
              willChange: 'transform',
              backgroundImage: `url(/sprites/${pokemon.name.toLowerCase()}_sheet.png)`,
              backgroundSize: `${FRAME_W * 8}px ${FRAME_H}px`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '0px 0px',
              imageRendering: 'pixelated',
              filter: `blur(${1 + i * 1.5}px) saturate(2) brightness(1.4) drop-shadow(0 0 ${4 + i*3}px ${pokemon.glow})`,
            }}
          />
        ))}

        <div ref={playerRef} className="absolute"
          style={{ zIndex: 20, width: `${PLAYER_W}px`, height: `${PLAYER_H}px`, top: 0, left: 0, willChange: 'transform', transformOrigin: 'center center' }}>
          <div className="absolute inset-0 rounded-xl" style={{
            background: `radial-gradient(ellipse at 50% 60%, ${pokemon.glow}55 0%, transparent 70%)`,
            transform: 'scale(1.5)',
          }} />
          <div ref={spriteRef} style={{
            width: `${PLAYER_W}px`, height: `${PLAYER_H}px`,
            backgroundImage: `url(/sprites/${pokemon.name.toLowerCase()}_sheet.png)`,
            backgroundSize: `${FRAME_W * 8}px ${FRAME_H}px`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: '0px 0px',
            imageRendering: 'pixelated',
            willChange: 'background-position, transform',
            filter: `drop-shadow(0 0 5px ${pokemon.glow}bb)`,
          }} />
        </div>

        {phase === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5"
            style={{ zIndex: 30, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(0.8rem,4vw,1.1rem)', color: '#FF4444', textShadow: '0 0 20px #FF4444' }}>
              GAME OVER
            </div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.5rem', color: pokemon.glow }}>
              SCORE: {deathScore}
            </div>
            {newRecord && (
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.55rem',
                color: '#FFD700',
                textShadow: '0 0 16px #FFD700, 0 0 30px #FFD70088',
                animation: 'pulse 0.6s ease-in-out infinite alternate',
              }}>
                ★ NEW HIGHSCORE! ★
              </div>
            )}
            {!newRecord && highScore > 0 && (
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.35rem', color: '#888' }}>
                BEST: {highScore}
              </div>
            )}
            <div className="text-gray-500" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.38rem' }}>
              {deathScore > 80 ? 'LEGENDARY!' : deathScore > 40 ? 'IMPRESSIVE!' : deathScore > 15 ? 'KEEP TRYING!' : "DON'T GIVE UP!"}
            </div>
            <button onClick={(e) => { e.stopPropagation(); startGame(); }}
              className="mt-2 px-8 py-3 rounded-xl font-black tracking-widest transition-transform active:scale-95 hover:scale-105"
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.55rem', background: 'linear-gradient(135deg,#FF4444,#FF6B00)', color: '#fff', boxShadow: '0 0 24px #FF444466' }}>
              ↺ RETRY
            </button>
          </div>
        )}

        {phase === 'playing' && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none" style={{ zIndex: 30 }}>
            <div className="text-gray-600" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.3rem' }}>
              TAP · SPACE · ARROW TO JUMP
            </div>
          </div>
        )}
      </div>

      {/* Darkness overlay — OUTSIDE arena so stacking context doesn't clip it */}
      <div ref={darknessRef} className="absolute inset-0 pointer-events-none" style={{
        zIndex: 50,
        background: 'black',
        opacity: 0,
      }} />

      {/* Event label — sits above darkness */}
      <div ref={eventLabelRef} className="absolute left-0 right-0 flex justify-center pointer-events-none"
        style={{
          zIndex: 51,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: 0,
          transition: 'opacity 0.3s',
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 'clamp(0.6rem, 3.5vw, 0.85rem)',
          color: '#ffffff',
          textShadow: '0 0 12px #ff4444, 0 0 30px #ff000088',
          letterSpacing: '0.05em',
        }}
      />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes pulse {
          from { transform: scale(1);    opacity: 1;    }
          to   { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

export default GameScreen;