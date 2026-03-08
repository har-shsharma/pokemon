import  { ChangeEvent, useMemo, useRef, useState } from 'react'
import { debounce } from '../utils/debounce';
import Particles from './Particles';
import { NameScreenProps } from '../utils/interfaces';

function NameScreen({ onNext }: NameScreenProps) {
   const [name, setName] = useState<string>("");
    const [typed, setTyped] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
  
    const handleDebounced = useMemo(
      () => debounce((v: string) => setName(v), 400),
      []
    );
  
    const onChange = (e: ChangeEvent<HTMLInputElement>) => {
      setTyped(e.target.value);
      handleDebounced(e.target.value);
    };
  
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0f]">
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
          }}
        />
        <Particles color="#ff0050" />
  
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-5 border-[40px] border-white"
          style={{ transform: "rotate(30deg)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-5 border-[40px] border-red-500"
          style={{ transform: "rotate(-20deg)" }}
        />
  
        <div className="relative z-20 flex flex-col items-center gap-8 px-6 w-full max-w-sm">
          <div className="text-center">
            <div
              className="font-black tracking-widest"
              style={{
                fontFamily: "'Press Start 2P', monospace",
                background: "linear-gradient(135deg, #FF0050, #FF6B00, #FFD700)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 20px #FF0050)",
                fontSize: "clamp(1.5rem, 6vw, 3rem)",
              }}
            >
              POKÉMON
            </div>
            <div
              className="tracking-[0.4em] text-red-400 mt-1"
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "0.5rem" }}
            >
              BATTLE ARENA
            </div>
          </div>
  
          <div
            className="w-full rounded-2xl p-6 border border-white/10 relative overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 0 40px rgba(255,0,80,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <label
              className="block text-gray-400 mb-3 tracking-widest uppercase"
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "0.45rem" }}
            >
              Enter Your Name, Trainer
            </label>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ash Ketchum..."
              value={typed}
              onChange={onChange}
              maxLength={16}
              className="w-full bg-transparent border-b-2 border-red-500/50 focus:border-red-400 outline-none text-white pb-2 placeholder-gray-600 transition-colors"
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "1rem" }}
              autoFocus
            />
            {typed && (
              <div className="mt-3 text-gray-400" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                Hey, <span className="text-yellow-400 font-bold">{typed}</span>! Ready to battle?
              </div>
            )}
          </div>
  
          <button
            onClick={() => name && onNext(name)}
            disabled={!name}
            className="group relative w-full py-4 rounded-xl font-black tracking-widest uppercase transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed overflow-hidden"
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: "0.6rem",
              background: name ? "linear-gradient(135deg, #FF0050, #FF6B00)" : "rgba(255,255,255,0.05)",
              boxShadow: name ? "0 0 30px rgba(255,0,80,0.4), 0 4px 20px rgba(0,0,0,0.4)" : "none",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {name && (
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "linear-gradient(135deg, #FF6B00, #FFD700)" }}
              />
            )}
            <span className="relative z-10 text-white">
              {name ? "▶ START JOURNEY" : "TYPE YOUR NAME"}
            </span>
          </button>
        </div>
  
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
          @keyframes float {
            0%, 100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-20px) scale(1.1); }
          }
        `}</style>
      </div>
    );
}

export default NameScreen
