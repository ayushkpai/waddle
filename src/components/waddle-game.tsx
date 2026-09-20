"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const W = 800;
const H = 450;
const GROUND_Y = 350;
const GRAVITY = 2200;
const JUMP_V = 730;
const PLAYER_X = 120;
const FISH_POINTS = 50;

type SpeedLevel = "slow" | "normal" | "fast";

type SpeedConfig = {
  label: string;
  emoji: string;
  hint: string;
  start: number;
  max: number;
  accel: number;
};

const SPEEDS: Record<SpeedLevel, SpeedConfig> = {
  slow: {
    label: "Slow",
    emoji: "🐢",
    hint: "Easy pace, lots of time to jump",
    start: 170,
    max: 600,
    accel: 5,
  },
  normal: {
    label: "Normal",
    emoji: "🐧",
    hint: "A proper waddle",
    start: 215,
    max: 780,
    accel: 6,
  },
  fast: {
    label: "Fast",
    emoji: "💨",
    hint: "Blink and you'll miss it",
    start: 280,
    max: 1000,
    accel: 9,
  },
};

type Kind = "ice" | "snowman" | "fish";

type Entity = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind;
  phase: number;
};

type Phase = "ready" | "playing" | "over";

type GameState = {
  phase: Phase;
  speed: number;
  dist: number;
  py: number;
  vy: number;
  onGround: boolean;
  entities: Entity[];
  spawnTimer: number;
  fish: number;
  time: number;
  flakes: { x: number; y: number; s: number; v: number }[];
  audio: AudioContext | null;
  best: number;
};

export default function WaddleGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const s = useRef<GameState>({
    phase: "ready",
    speed: SPEEDS.normal.start,
    dist: 0,
    py: GROUND_Y,
    vy: 0,
    onGround: true,
    entities: [],
    spawnTimer: 0.8,
    fish: 0,
    time: 0,
    flakes: [],
    audio: null,
    best: 0,
  });

  const [phase, setPhase] = useState<Phase>("ready");
  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [speedLevel, setSpeedLevel] = useState<SpeedLevel>("normal");
  const speedRef = useRef<SpeedLevel>("normal");

  const scoreOf = useCallback((st: GameState) => Math.floor(st.dist / 10) + st.fish * FISH_POINTS, []);

  const setPlaying = useCallback(() => {
    const st = s.current;
    st.entities = [];
    st.dist = 0;
    st.fish = 0;
    st.py = GROUND_Y;
    st.vy = 0;
    st.onGround = true;
    st.speed = SPEEDS[speedRef.current].start;
    st.spawnTimer = 0.7;
    st.phase = "playing";
    setFinalScore(0);
    setPhase("playing");
    beep(st, 480, 0.12, "triangle");
  }, []);

  const start = useCallback(() => {
    setPlaying();
  }, [setPlaying]);

  const restart = useCallback(() => {
    setPlaying();
  }, [setPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    s.current.flakes = Array.from({ length: 40 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      s: 1 + Math.random() * 2.5,
      v: 20 + Math.random() * 40,
    }));

    let raf = 0;
    let last = performance.now();

    const jump = () => {
      const g = s.current;
      if (g.onGround) {
        g.vy = -JUMP_V;
        g.onGround = false;
        beep(g, 620, 0.09, "sine");
      }
    };

    const over = () => {
      const g = s.current;
      g.phase = "over";
      const sc = scoreOf(g);
      setFinalScore(sc);
      const nb = sc > g.best;
      if (nb) {
        g.best = sc;
        setBest(sc);
      }
      setIsNewBest(nb);
      setPhase("over");
      beep(g, 180, 0.25, "sawtooth");
    };

    const update = (dt: number) => {
      const g = s.current;
      g.time += dt;

      for (const f of g.flakes) {
        f.y += f.v * dt;
        f.x += Math.sin(g.time * 2 + f.y * 0.02) * 18 * dt;
        if (f.y > H) {
          f.y = -5;
          f.x = Math.random() * W;
        }
      }

      if (g.phase !== "playing") return;

      const c = SPEEDS[speedRef.current];
      g.speed = Math.min(c.max, g.speed + c.accel * dt);
      g.dist += g.speed * dt;

      if (!g.onGround) {
        g.vy += GRAVITY * dt;
        g.py += g.vy * dt;
        if (g.py >= GROUND_Y) {
          g.py = GROUND_Y;
          g.vy = 0;
          g.onGround = true;
        }
      }

      g.spawnTimer -= dt;
      if (g.spawnTimer <= 0) {
        const gap = 0.32 + Math.random() * 0.35;
        g.spawnTimer = gap * (W / g.speed) * 0.85;
        const roll = Math.random();
        if (roll < 0.24) {
          const h = 70 + Math.random() * 70;
          g.entities.push({
            x: W + 40,
            y: GROUND_Y - h,
            w: 30,
            h,
            kind: "fish",
            phase: Math.random() * Math.PI * 2,
          });
        } else if (roll < 0.68) {
          const hgt = 44 + Math.random() * 34;
          const wdt = 34 + Math.random() * 14;
          g.entities.push({
            x: W + 40,
            y: GROUND_Y - hgt,
            w: wdt,
            h: hgt,
            kind: "ice",
            phase: (Math.random() - 0.5) * 0.12,
          });
        } else {
          g.entities.push({
            x: W + 40,
            y: GROUND_Y - 64,
            w: 46,
            h: 64,
            kind: "snowman",
            phase: 0,
          });
        }
      }

      for (const e of g.entities) {
        e.x -= g.speed * dt;
        e.phase += dt * 4;
      }

      const pb = { x: PLAYER_X - 16, y: g.py - 32, w: 34, h: 34 };

      for (let i = g.entities.length - 1; i >= 0; i--) {
        const e = g.entities[i];
        if (e.x + e.w < 0) {
          g.entities.splice(i, 1);
          continue;
        }
        if (e.kind === "fish") {
          const fy = e.y + Math.sin(e.phase) * 10;
          const fx = e.x;
          if (
            pb.x < fx + 22 &&
            pb.x + pb.w > fx - 16 &&
            pb.y < fy + 12 &&
            pb.y + pb.h > fy - 14
          ) {
            g.entities.splice(i, 1);
            g.fish += 1;
            beep(g, 880, 0.08, "square");
          }
          continue;
        }
        const hit =
          Math.max(e.x, pb.x) < Math.min(e.x + e.w, pb.x + pb.w) &&
          Math.max(e.y, pb.y) < Math.min(e.y + e.h, pb.y + pb.h);
        if (hit) {
          over();
          return;
        }
      }
    };

    const drawGround = () => {
      ctx.fillStyle = "#eef2f7";
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      ctx.fillStyle = "#dbe4ef";
      ctx.fillRect(0, GROUND_Y, W, 6);
      const off = (s.current.dist % 56) * -1;
      ctx.strokeStyle = "rgba(148,163,184,0.25)";
      ctx.lineWidth = 1;
      for (let x = off; x < W; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 22);
        ctx.lineTo(x + 28, GROUND_Y + 22);
        ctx.stroke();
      }
    };

    const drawMountains = (amp: number, color: string, scroll: number) => {
      ctx.fillStyle = color;
      const p = (s.current.dist * scroll) % 240;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      for (let x = -120 + p; x < W + 120; x += 120) {
        ctx.lineTo(x + 60, GROUND_Y - amp);
        ctx.lineTo(x + 120, GROUND_Y);
      }
      ctx.closePath();
      ctx.fill();
    };

    const drawPenguin = (t: number) => {
      const g = s.current;
      const x = PLAYER_X;
      const y = g.py;
      const running = g.onGround;
      const bob = running ? Math.abs(Math.sin(t * 14)) * 3 : 0;
      const tilt = running ? Math.sin(t * 14) * 0.06 : -g.vy * 0.0004;

      ctx.save();
      ctx.translate(x, y - bob + (running ? 0 : Math.min(Math.abs(g.vy) * 0.05, 8)));
      ctx.rotate(tilt);

      if (running) {
        const swing = Math.sin(t * 14) * 7;
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.ellipse(-9 + swing, 8, 6, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(9 - swing * 2, 10, 6, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.ellipse(-9, 10, 6, 4.5, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(10, 10, 6, 4.5, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      const arm = running ? Math.sin(t * 14) * 0.5 : Math.min(Math.abs(g.vy) * 0.002, 2.2);
      ctx.save();
      ctx.translate(0, -6);
      ctx.rotate(arm);
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.ellipse(14, -16, 7, 16, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 30, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.ellipse(7, 10, 15, 18, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(8, -14, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(9.5, -13, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(10.5, -14, 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fb923c";
      ctx.beginPath();
      ctx.moveTo(24, -8);
      ctx.lineTo(32, -5);
      ctx.lineTo(24, -2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawFish = (e: Entity) => {
      const y = e.y + Math.sin(e.phase) * 10;
      const x = e.x;
      ctx.fillStyle = "#fb923c";
      ctx.beginPath();
      ctx.ellipse(x, y, 13, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 12, y);
      ctx.lineTo(x + 6, y - 8);
      ctx.lineTo(x + 6, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - 4, y - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(x - 3, y - 2, 1.2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawIce = (e: Entity) => {
      const x = e.x + e.w / 2;
      ctx.save();
      ctx.translate(x, e.y + e.h);
      ctx.rotate(Math.min(Math.max(e.phase, -0.06), 0.06));
      ctx.fillStyle = "#bcd7ef";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-e.w / 2 - 4, 0);
      ctx.lineTo(0, -e.h);
      ctx.lineTo(e.w / 2 + 4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -e.h);
      ctx.stroke();
      ctx.restore();
    };

    const drawSnowman = (e: Entity) => {
      const x = e.x + e.w / 2;
      const baseY = e.y + e.h;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, baseY - 20, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, baseY - 44, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(x - 5, baseY - 46, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 5, baseY - 46, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fb923c";
      ctx.beginPath();
      ctx.moveTo(x - 2, baseY - 40);
      ctx.lineTo(x + 16, baseY - 36);
      ctx.lineTo(x - 2, baseY - 32);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 20, baseY - 24);
      ctx.lineTo(x - 34, baseY - 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 18, baseY - 24);
      ctx.lineTo(x + 34, baseY - 16);
      ctx.stroke();
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);

      const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      grad.addColorStop(0, "#7cb8ff");
      grad.addColorStop(1, "#dcf0ff");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, GROUND_Y);

      ctx.fillStyle = "#fff7d6";
      ctx.beginPath();
      ctx.arc(680, 70, 34, 0, Math.PI * 2);
      ctx.fill();

      drawMountains(120, "rgba(148,163,184,0.45)", 0.02);
      drawMountains(70, "rgba(203,213,225,0.65)", 0.05);
      drawGround();

      for (const e of s.current.entities) {
        if (e.kind === "ice") drawIce(e);
        else if (e.kind === "snowman") drawSnowman(e);
        else drawFish(e);
      }

      if (s.current.phase === "playing") {
        const HUD_SCORE = scoreOf(s.current);
        ctx.font = "bold 22px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(15,23,42,0.85)";
        ctx.fillText(`${HUD_SCORE}`, 20, 34);
        ctx.font = "bold 16px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "rgba(15,23,42,0.65)";
        ctx.fillText(`🐟 ${s.current.fish}`, 20, 58);
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(15,23,42,0.55)";
        ctx.fillText(`BEST ${Math.max(s.current.best, HUD_SCORE)}`, W - 20, 34);
        ctx.textAlign = "left";
      }

      drawPenguin(t);

      ctx.fillStyle = "#ffffff";
      for (const f of s.current.flakes) {
        ctx.globalAlpha = Math.min(1, 0.5 + f.s / 4);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      update(dt);
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.code === "ArrowUp" || ev.code === "KeyW") {
        ev.preventDefault();
        if (s.current.phase === "ready") setPlaying();
        else if (s.current.phase === "playing") jump();
      } else if (ev.code === "Enter" && s.current.phase === "over") {
        setPlaying();
      }
    };

    const onPointer = (e: Event) => {
      e.preventDefault();
      if (s.current.phase === "ready") setPlaying();
      else if (s.current.phase === "playing") jump();
    };

    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onPointer);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, [scoreOf, setPlaying]);

  return (
    <div className="flex w-full flex-col items-center gap-6 py-10">
      <header className="flex w-full max-w-3xl items-end justify-between px-2">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Waddle
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            An endless runner. Waddle, jump, and grab the fish.
          </p>
        </div>
      </header>

      <div className="relative w-full max-w-3xl select-none overflow-hidden rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block h-auto w-full cursor-pointer"
          aria-label="Waddle runner game"
        />

        {phase === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/40 p-6 text-center text-white backdrop-blur-sm">
            <p className="text-5xl">🐧</p>
            <h2 className="text-2xl font-black">Ready to waddle?</h2>
            <p className="max-w-sm text-sm text-slate-200">
              Press <kbd className="rounded bg-white/20 px-1.5 py-0.5">Space</kbd>, click, or tap to
              jump. Grab fish, dodge icebergs and snowmen.
            </p>
            <div className="mt-1 flex gap-2">
              {(Object.keys(SPEEDS) as SpeedLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => {
                    setSpeedLevel(lvl);
                    speedRef.current = lvl;
                  }}
                  className={`flex w-28 flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-center transition ${
                    speedLevel === lvl
                      ? "border-orange-400 bg-orange-500/90 shadow-lg"
                      : "border-white/20 bg-white/10 hover:bg-white/20"
                  }`}
                >
                  <span className="text-xl">{SPEEDS[lvl].emoji}</span>
                  <span className="text-sm font-bold">{SPEEDS[lvl].label}</span>
                  <span className="text-[11px] font-normal leading-tight text-slate-200">
                    {SPEEDS[lvl].hint}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={start}
              className="mt-2 rounded-full bg-orange-500 px-6 py-2.5 font-bold text-white shadow-lg transition hover:bg-orange-400"
            >
              Start waddling
            </button>
          </div>
        )}

        {phase === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/50 p-6 text-center text-white backdrop-blur-sm">
            <p className="text-5xl">💤</p>
            <h2 className="text-2xl font-black">Waddle over!</h2>
            <p className="text-sm text-slate-200">
              Score{" "}
              <span className="text-2xl font-black text-white">{finalScore}</span>
            </p>
            <p className="text-sm text-slate-300">
              Best {best}
              {isNewBest && <span className="ml-2 font-bold text-orange-400">New best!</span>}
            </p>
            <button
              onClick={restart}
              className="mt-1 rounded-full bg-orange-500 px-6 py-2.5 font-bold text-white shadow-lg transition hover:bg-orange-400"
            >
              Waddle again
            </button>
          </div>
        )}
      </div>

      <p className="max-w-xl text-center text-sm text-slate-400 dark:text-slate-500">
        Space / click jumps. Speed builds over time, so start waddling.
      </p>
    </div>
  );
}

function beep(st: GameState, freq: number, dur: number, type: OscillatorType) {
  try {
    if (!st.audio) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      st.audio = new Ctor();
    }
    if (st.audio.state === "suspended") void st.audio.resume();
    const osc = st.audio.createOscillator();
    const gain = st.audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, st.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, st.audio.currentTime + dur);
    osc.connect(gain);
    gain.connect(st.audio.destination);
    osc.start();
    osc.stop(st.audio.currentTime + dur);
  } catch {
    /* audio is optional */
  }
}