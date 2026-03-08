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

const SCROLL_SPEED_START    = 240;
const SCROLL_SPEED_MAX      = 900;
const SCROLL_RAMP_PER_MS    = 0.00006;

const JUMP_DURATION         = 260;
const SPAWN_INTERVAL_START  = 1800;
const SPAWN_INTERVAL_MIN    = 550;
const OBS_SPEED_START       = 330;
const OBS_SPEED_MAX         = 1200;
const OBS_SPEED_RAMP_PER_MS = 0.00006;
const SPAWN_SHRINK_PER_MS   = 0.024;

const SLIDE_SCORE_THRESHOLD  = 50;
const SLIDE_SPEED            = 280;

// ── Event system ──────────────────────────────────────────────────────────────
const EVENT_MILESTONE_EVERY  = 50;
const EVENT_RANDOM_INTERVAL  = 15000;
const EVENT_RANDOM_CHANCE    = 0.55;
// After this score, multiple events can stack simultaneously
const MULTI_EVENT_THRESHOLD  = 500;

const WALL_SQUEEZE_DURATION  = 4000;
const WALL_WIDTH_SQUEEZED    = 72;
const WALL_WIDTH_NORMAL      = 36;
const DARK_DURATION          = 3500;
const SHAKE_DURATION         = 2000;
const SHAKE_INTENSITY        = 6;

const TRAIL_COUNT   = 5;
const PLAYER_Y_FRAC = 0.62;

// Sprite sheet is 768×96 (8 frames × 96px each).
// Player div is 48×48, so we render sheet at half size: 384×48.
// Each frame offset = 96/2 = 48px.
const FRAME_W  = 96;   // actual frame size in the PNG
const FRAME_H  = 96;
const ANIM_FPS = 10;

const MAX_DELTA_MS = 50;

type Wall      = 'left' | 'right';
type EventType = 'squeeze' | 'dark' | 'shake';

interface ActiveEvent {
  type:      EventType;
  startedAt: number;   // ts when this event began — each event tracks its own age
}

interface Obstacle {
  id:          number;
  wall:        Wall;
  y:           number;
  speed:       number;
  rotation:    number;
  sliding:     boolean;
  slideX:      number;
  slideDir:    1 | -1;
  slideSpeed:  number;
  wobblePhase: number;
}

function wallX(wall: Wall, arenaW: number, wallW: number): number {
  return wall === 'left'
    ? wallW - 4
    : arenaW - wallW - PLAYER_W + 4;
}

function obstacleX(wall: Wall, arenaW: number, wallW: number): number {
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
  const arenaRef      = useRef<HTMLDivElement>(null);
  const playerRef     = useRef<HTMLDivElement>(null);
  const spriteRef     = useRef<HTMLDivElement>(null);
  const scoreRef      = useRef<HTMLSpanElement>(null);
  const speedRef      = useRef<HTMLSpanElement>(null);
  const leftWallRef   = useRef<HTMLDivElement>(null);
  const rightWallRef  = useRef<HTMLDivElement>(null);
  const poolRef       = useRef<Map<number, HTMLDivElement>>(new Map());
  const trailRefs     = useRef<HTMLDivElement[]>([]);
  const darknessRef   = useRef<HTMLDivElement>(null);
  const eventLabelRef = useRef<HTMLDivElement>(null);

  const g = useRef({
    wall:          'left' as Wall,
    jumping:       false,
    jumpStart:     0,
    jumpFromWall:  'left' as Wall,
    obstacles:     [] as Obstacle[],
    score:         0,
    scrollSpeed:   SCROLL_SPEED_START,
    obsSpeed:      OBS_SPEED_START,
    wallOffset:    0,
    lastSpawn:     0,
    spawnInterval: SPAWN_INTERVAL_START,
    startTime:     0,
    lastTs:        0,
    running:       false,
    dead:          false,
    raf:           0,
    idCounter:     0,
    trailPositions:    [] as { x: number; y: number }[],
    slidingObstacleId: -1,

    // Event system — array so multiple can run simultaneously
    activeEvents:     [] as ActiveEvent[],
    lastMilestone:    0,
    lastRandomCheck:  0,
    currentWallW:     WALL_WIDTH_NORMAL,

    animFrame:    0,
    lastAnimTick: 0,
    frameCount:   0,
  });

  const [phase, setPhase]         = useState<'playing' | 'dead'>('playing');
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

  // ── Sprite animation ────────────────────────────────────────────────────────
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
      // Sheet is 768×96, rendered at half size (384×48) to fit 48×48 div.
      // Each frame step = FRAME_W/2 = 48px.
      spriteRef.current.style.backgroundPosition = `${-(state.animFrame * FRAME_W / 2)}px 0px`;
      spriteRef.current.style.transform = onRightWall ? 'scaleX(-1)' : 'scaleX(1)';
    }
  };

  // ── Jump ────────────────────────────────────────────────────────────────────
  const jump = useCallback(() => {
    const state = g.current;
    if (!state.running || state.dead || state.jumping) return;
    state.jumping      = true;
    state.jumpStart    = performance.now();
    state.jumpFromWall = state.wall;
    state.wall         = state.wall === 'left' ? 'right' : 'left';
    state.trailPositions = [];
    state.animFrame    = 4;
  }, []);

  // ── Main loop ───────────────────────────────────────────────────────────────
  const loop = useCallback((ts: number) => {
    const state = g.current;
    if (!state.running || state.dead) return;

    const rawDelta = state.lastTs === 0 ? 16.667 : ts - state.lastTs;
    const delta    = Math.min(rawDelta, MAX_DELTA_MS);
    const dt       = delta / 1000;
    state.lastTs   = ts;
    state.frameCount++;

    const { w, h } = getArena();
    const fixedY = h * PLAYER_Y_FRAC;

    const elapsed = ts - state.startTime;
    state.scrollSpeed = Math.min(SCROLL_SPEED_MAX, SCROLL_SPEED_START + elapsed * SCROLL_RAMP_PER_MS);
    state.obsSpeed    = Math.min(OBS_SPEED_MAX,    OBS_SPEED_START    + elapsed * OBS_SPEED_RAMP_PER_MS);

    state.wallOffset = (state.wallOffset + state.scrollSpeed * dt) % WALL_TILE_H;
    const bgPos = `0px ${state.wallOffset}px`;
    if (leftWallRef.current)  leftWallRef.current.style.backgroundPosition = bgPos;
    if (rightWallRef.current) rightWallRef.current.style.backgroundPosition = bgPos;

    // ── Player position ────────────────────────────────────────────────────
    const targetX = wallX(state.wall, w, state.currentWallW);
    const fromX   = wallX(state.jumpFromWall, w, state.currentWallW);
    let px: number, py: number, rot = 0, scaleX = 1, scaleY = 1;

    if (state.jumping) {
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
      py = fixedY + Math.sin(elapsed * 0.006) * 1.5;
    }

    updateSprite(ts, state.jumping, state.wall === 'right');

    // ── Event system ──────────────────────────────────────────────────────
    const allTypes: EventType[] = ['squeeze', 'dark', 'shake'];

    const pickEvent = (): EventType => {
      // After threshold, any event can stack — pick truly random
      const roll = Math.random();
      if (roll < 0.34) return 'shake';
      if (roll < 0.67) return 'squeeze';
      return 'dark';
    };

    const triggerEvent = (type: EventType) => {
      const multiAllowed = state.score >= MULTI_EVENT_THRESHOLD;
      const alreadyActive = state.activeEvents.some(ev => ev.type === type);
      // Before threshold: only one event at a time
      // After threshold: allow stacking, but not duplicates of same type
      if (alreadyActive) return;
      if (!multiAllowed && state.activeEvents.length > 0) return;

      state.activeEvents.push({ type, startedAt: ts });

      if (type === 'dark' && eventLabelRef.current) {
        eventLabelRef.current.textContent = '🌑 LIGHTS OUT!';
        eventLabelRef.current.style.opacity = '1';
        setTimeout(() => {
          if (eventLabelRef.current) eventLabelRef.current.style.opacity = '0';
        }, 1200);
      }
    };

    const milestone = Math.floor(state.score / EVENT_MILESTONE_EVERY);
    if (milestone > state.lastMilestone && state.score > 0) {
      state.lastMilestone = milestone;
      triggerEvent(pickEvent());
    }

    if (state.lastRandomCheck === 0) state.lastRandomCheck = ts;
    if (ts - state.lastRandomCheck > EVENT_RANDOM_INTERVAL) {
      state.lastRandomCheck = ts;
      if (Math.random() < EVENT_RANDOM_CHANCE) triggerEvent(pickEvent());
    }

    // ── Resolve each active event independently using its own startedAt ───
    // Track wall squeeze across events
    let squeezeActive = false;

    state.activeEvents = state.activeEvents.filter(ev => {
      const age = ts - ev.startedAt;   // ← each event has its own age

      if (ev.type === 'squeeze') {
        const rampIn  = Math.min(1, age / 500);
        const rampOut = age > WALL_SQUEEZE_DURATION - 500
          ? 1 - (WALL_SQUEEZE_DURATION - age) / 500 : 0;
        const t = Math.max(rampIn - rampOut, 0);
        state.currentWallW = WALL_WIDTH_NORMAL + (WALL_WIDTH_SQUEEZED - WALL_WIDTH_NORMAL) * t;
        if (leftWallRef.current) {
          leftWallRef.current.style.width = `${state.currentWallW}px`;
          leftWallRef.current.style.backgroundSize = `${state.currentWallW}px ${WALL_TILE_H}px`;
        }
        if (rightWallRef.current) {
          rightWallRef.current.style.width = `${state.currentWallW}px`;
          rightWallRef.current.style.backgroundSize = `${state.currentWallW}px ${WALL_TILE_H}px`;
        }
        squeezeActive = true;
        if (age >= WALL_SQUEEZE_DURATION) {
          state.currentWallW = WALL_WIDTH_NORMAL;
          if (leftWallRef.current)  leftWallRef.current.style.width = `${WALL_WIDTH_NORMAL}px`;
          if (rightWallRef.current) rightWallRef.current.style.width = `${WALL_WIDTH_NORMAL}px`;
          return false; // remove from array
        }
        return true;
      }

      if (ev.type === 'dark') {
        let alpha = 0;
        if (age < 400)                          alpha = age / 400 * 0.88;
        else if (age < DARK_DURATION - 400)     alpha = 0.88;
        else                                    alpha = (1 - (age - (DARK_DURATION - 400)) / 400) * 0.88;
        if (darknessRef.current) darknessRef.current.style.opacity = String(Math.max(0, alpha));
        if (age >= DARK_DURATION) {
          if (darknessRef.current) darknessRef.current.style.opacity = '0';
          return false;
        }
        return true;
      }

      if (ev.type === 'shake') {
        const intensity = SHAKE_INTENSITY * (1 - age / SHAKE_DURATION);
        const sx = (Math.random() - 0.5) * 2 * intensity;
        const sy = (Math.random() - 0.5) * 2 * intensity;
        if (arenaRef.current) arenaRef.current.style.transform = `translate(${sx}px, ${sy}px)`;
        if (age >= SHAKE_DURATION) {
          if (arenaRef.current) arenaRef.current.style.transform = 'none';
          return false;
        }
        return true;
      }

      return false;
    });

    // If no squeeze is running, ensure wall is back to normal
    if (!squeezeActive) state.currentWallW = WALL_WIDTH_NORMAL;

    // ── Spawn obstacles ────────────────────────────────────────────────────
    const hardMode = state.score >= SLIDE_SCORE_THRESHOLD;
    const intervalMultiplier = hardMode ? 1.4 : 1.0;
    if (state.lastSpawn === 0 || ts - state.lastSpawn > state.spawnInterval) {
      state.lastSpawn     = ts;
      state.spawnInterval = Math.max(
        SPAWN_INTERVAL_MIN * intervalMultiplier,
        (SPAWN_INTERVAL_START - elapsed * SPAWN_SHRINK_PER_MS) * intervalMultiplier
      );
      const spawnWall: Wall = Math.random() < 0.5 ? 'left' : 'right';
      const newId = ++state.idCounter;
      const shouldSlide = hardMode && state.slidingObstacleId === -1 && Math.random() < 0.30;
      if (shouldSlide) state.slidingObstacleId = newId;
      const startX = spawnWall === 'left'
        ? state.currentWallW - OBSTACLE_W / 2
        : w - state.currentWallW - OBSTACLE_W / 2;
      state.obstacles.push({
        id: newId, wall: spawnWall,
        y: -OBSTACLE_H - 10,
        speed: state.obsSpeed,
        rotation: 0,
        sliding: shouldSlide,
        slideX: startX,
        slideDir: spawnWall === 'left' ? 1 : -1,
        slideSpeed: SLIDE_SPEED,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }

    // ── Move obstacles ─────────────────────────────────────────────────────
    const offScreen = state.obstacles.filter(o => o.y >= h + OBSTACLE_H + 20);
    for (const o of offScreen) {
      if (o.id === state.slidingObstacleId) state.slidingObstacleId = -1;
    }
    state.obstacles = state.obstacles.filter(o => o.y < h + OBSTACLE_H + 20);

    const isShaking = state.activeEvents.some(ev => ev.type === 'shake');
    const shakeSpeedMult = isShaking ? 2.0 : 1.0;

    for (const o of state.obstacles) {
      o.y       += o.speed * dt * shakeSpeedMult;
      o.rotation = (o.rotation + 180 * dt * shakeSpeedMult) % 360;
      if (o.sliding) {
        o.slideX += o.slideDir * o.slideSpeed * dt;
        const minX = state.currentWallW - OBSTACLE_W / 2;
        const maxX = w - state.currentWallW - OBSTACLE_W / 2;
        if (o.slideX <= minX) { o.slideX = minX; o.slideDir = 1;  }
        if (o.slideX >= maxX) { o.slideX = maxX; o.slideDir = -1; }
        o.wall = o.slideX < w / 2 ? 'left' : 'right';
      }
    }

    // ── Collision ──────────────────────────────────────────────────────────
    for (const o of state.obstacles) {
      const ox = o.sliding ? o.slideX : obstacleX(o.wall, w, state.currentWallW);
      if (px+5 < ox+OBSTACLE_W && px+PLAYER_W-5 > ox && py+5 < o.y+OBSTACLE_H && py+PLAYER_H-5 > o.y) {
        state.dead = true; state.running = false;
        // Clean up all event effects immediately
        if (darknessRef.current)  darknessRef.current.style.opacity = '0';
        if (arenaRef.current)     arenaRef.current.style.transform = 'none';
        if (leftWallRef.current)  leftWallRef.current.style.width = `${WALL_WIDTH_NORMAL}px`;
        if (rightWallRef.current) rightWallRef.current.style.width = `${WALL_WIDTH_NORMAL}px`;
        state.activeEvents = [];
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

    // ── Score ──────────────────────────────────────────────────────────────
    state.score += state.scrollSpeed * 0.03 * dt;
    if (scoreRef.current) scoreRef.current.textContent = Math.floor(state.score).toString();
    if (speedRef.current) {
      const lvl = Math.min(10, Math.floor(1 + (state.scrollSpeed - SCROLL_SPEED_START) / (SCROLL_SPEED_MAX - SCROLL_SPEED_START) * 9));
      speedRef.current.textContent = `LVL ${lvl}`;
    }

    // ── Render player ──────────────────────────────────────────────────────
    if (playerRef.current) {
      playerRef.current.style.transform =
        `translate(${px}px,${py}px) rotate(${rot}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
    }

    // ── Trail ghosts ───────────────────────────────────────────────────────
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
        div.style.backgroundPosition = `${-(state.animFrame * FRAME_W / 2)}px 0px`;
        div.style.transform = `translate(${pos.x}px,${pos.y}px) scale(${1 - i * 0.06})`;
        div.style.opacity   = String(0.75 - i * 0.12);
        div.style.display   = 'block';
      } else {
        div.style.display = 'none';
      }
    }

    // ── Obstacle DOM pool ──────────────────────────────────────────────────
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
            'z-index:25;pointer-events:none;will-change:transform;',
            'background-image:url(/sprites/obstacle.png);',
            `background-size:${OBSTACLE_W}px ${OBSTACLE_H}px;`,
            'background-repeat:no-repeat;image-rendering:pixelated;',
            'transform-origin:center center;',
          ].join('');
          arena.appendChild(div);
          poolRef.current.set(o.id, div);
        }
        const baseX  = o.sliding ? o.slideX : obstacleX(o.wall, w, state.currentWallW);
        const wobble = isShaking
          ? Math.sin(ts * 0.018 + o.wobblePhase) * 10
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

  // ── Start ──────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    for (const [, div] of poolRef.current) div.remove();
    poolRef.current.clear();
    const now   = performance.now();
    const state = g.current;
    Object.assign(state, {
      wall: 'left', jumping: false, jumpStart: 0, jumpFromWall: 'left',
      obstacles: [], score: 0,
      scrollSpeed: SCROLL_SPEED_START, obsSpeed: OBS_SPEED_START,
      wallOffset: 0, lastSpawn: 0, spawnInterval: SPAWN_INTERVAL_START,
      startTime: now, lastTs: 0,
      dead: false, idCounter: 0, trailPositions: [],
      animFrame: 0, lastAnimTick: 0, running: true, frameCount: 0,
      slidingObstacleId: -1,
      activeEvents: [],          // ← array, not single event
      lastMilestone: 0, lastRandomCheck: 0,
      currentWallW: WALL_WIDTH_NORMAL,
    });
    // Clean up any lingering DOM effects from previous game
    if (darknessRef.current)  darknessRef.current.style.opacity = '0';
    if (arenaRef.current)     arenaRef.current.style.transform  = 'none';
    if (leftWallRef.current)  leftWallRef.current.style.width   = `${WALL_WIDTH_NORMAL}px`;
    if (rightWallRef.current) rightWallRef.current.style.width  = `${WALL_WIDTH_NORMAL}px`;
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

  // ── JSX ────────────────────────────────────────────────────────────────────
  // Sprite sheet is 768×96. Rendered at half size = 384×48 to fit 48×48 div.
  const SHEET_W = FRAME_W * 8 / 2;   // 384
  const SHEET_H = FRAME_H / 2;        // 48

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
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />

        <div ref={leftWallRef} className="absolute top-0 left-0 h-full pointer-events-none" style={{
          zIndex: 10, width: `${WALL_WIDTH}px`,
          backgroundImage: 'url(/sprites/wall_tile.png)',
          backgroundSize: `${WALL_WIDTH}px ${WALL_TILE_H}px`,
          backgroundRepeat: 'repeat-y',
          boxShadow: `4px 0 20px ${pokemon.glow}55`,
        }} />

        <div ref={rightWallRef} className="absolute top-0 right-0 h-full pointer-events-none" style={{
          zIndex: 10, width: `${WALL_WIDTH}px`,
          backgroundImage: 'url(/sprites/wall_tile_right.png)',
          backgroundSize: `${WALL_WIDTH}px ${WALL_TILE_H}px`,
          backgroundRepeat: 'repeat-y',
          boxShadow: `-4px 0 20px ${pokemon.glow}55`,
        }} />

        {[...Array(TRAIL_COUNT)].map((_, i) => (
          <div key={i} ref={el => { if (el) trailRefs.current[i] = el; }}
            className="absolute pointer-events-none"
            style={{
              zIndex: 21, width: `${PLAYER_W}px`, height: `${PLAYER_H}px`,
              top: 0, left: 0, display: 'none', willChange: 'transform',
              backgroundImage: `url(/sprites/${pokemon.name.toLowerCase()}_sheet.png)`,
              backgroundSize: `${SHEET_W}px ${SHEET_H}px`,
              backgroundRepeat: 'no-repeat', backgroundPosition: '0px 0px',
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
            backgroundSize: `${SHEET_W}px ${SHEET_H}px`,
            backgroundRepeat: 'no-repeat', backgroundPosition: '0px 0px',
            imageRendering: 'pixelated', willChange: 'background-position, transform',
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
                fontFamily: "'Press Start 2P', monospace", fontSize: '0.55rem',
                color: '#FFD700', textShadow: '0 0 16px #FFD700, 0 0 30px #FFD70088',
                animation: 'pulse 0.6s ease-in-out infinite alternate',
              }}>★ NEW HIGHSCORE! ★</div>
            )}
            {!newRecord && highScore > 0 && (
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.35rem', color: '#888' }}>
                BEST: {highScore}
              </div>
            )}
            <div className="text-gray-500" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.38rem' }}>
              {deathScore > 1000 ? 'LEGENDARY!' : deathScore > 500 ? 'IMPRESSIVE!' : deathScore > 250 ? 'KEEP TRYING!' : "DON'T GIVE UP!"}
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

      {/* Darkness overlay — outside arena to escape stacking context */}
      <div ref={darknessRef} className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 50, background: 'black', opacity: 0 }} />

      {/* Event label */}
      <div ref={eventLabelRef} className="absolute left-0 right-0 flex justify-center pointer-events-none"
        style={{
          zIndex: 51, top: '50%', transform: 'translateY(-50%)',
          opacity: 0, transition: 'opacity 0.3s',
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 'clamp(0.6rem, 3.5vw, 0.85rem)',
          color: '#ffffff', textShadow: '0 0 12px #ff4444, 0 0 30px #ff000088',
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