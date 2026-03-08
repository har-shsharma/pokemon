import { useEffect, useState } from 'react'
import { CountdownColors, CountdownScreenProps, Pokemon } from '../utils/interfaces';
import { CountdownPhase } from '../utils/types';

function CountdownScreen({ pokemon, name, onDone }: CountdownScreenProps) {
   const [count, setCount] = useState<number>(3);
    const [phase, setPhase] = useState<CountdownPhase>("counting");
  
    const COUNTDOWN_COLORS: CountdownColors = {
      3: "#FF4444",
      2: "#FF9900",
      1: "#FFD700",
      go: "#00FF88",
    };
  
    useEffect(() => {
      if (count > 0) {
        const t = setTimeout(() => setCount((c) => c - 1), 1000);
        return () => clearTimeout(t);
      } else {
        setPhase("go");
        const t = setTimeout(onDone, 900);
        return () => clearTimeout(t);
      }
    }, [count, onDone]);
  
    const display: string | number = phase === "go" ? "GO!" : count;
    const currentColor: string =
      phase === "go"
        ? COUNTDOWN_COLORS.go
        : COUNTDOWN_COLORS[count as keyof Omit<CountdownColors, "go">] ?? "#fff";
  
    return (
      <div
        className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden"
        style={{ background: "#0a0a0f" }}
      >
        <div
          className="absolute inset-0 transition-all duration-300"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, ${currentColor}18 0%, transparent 60%)`,
          }}
        />
  
        <div
          className="absolute inset-0 flex items-center justify-center opacity-10"
          style={{ filter: `drop-shadow(0 0 60px ${pokemon.glow})` }}
        >
          <img
            src={pokemon.image}
            alt=""
            className="w-64 h-64 object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>
  
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div
            className="text-gray-400 tracking-widest"
            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "0.45rem" }}
          >
            {name} &amp; {pokemon.name} — GET READY!
          </div>
  
          <div
            key={String(display)}
            className="font-black"
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: "clamp(5rem, 25vw, 10rem)",
              color: currentColor,
              textShadow: `0 0 60px ${currentColor}, 0 0 120px ${currentColor}55`,
              animation: "popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            {display}
          </div>
  
          {phase !== "go" && (
            <div className="flex gap-3">
              {([3, 2, 1] as const).map((n) => (
                <div
                  key={n}
                  className="w-3 h-3 rounded-full transition-all duration-300"
                  style={{
                    background: count <= n ? COUNTDOWN_COLORS[n] : "rgba(255,255,255,0.15)",
                    boxShadow: count <= n ? `0 0 10px ${COUNTDOWN_COLORS[n]}` : "none",
                  }}
                />
              ))}
            </div>
          )}
        </div>
  
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
          @keyframes popIn {
            0% { transform: scale(0.3); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
}

export default CountdownScreen
