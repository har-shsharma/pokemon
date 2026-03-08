import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useState } from 'react'
import Particles from './Particles';
import pokemons from '../data/pokemons.json';
import { PickScreenProps, Pokemon } from '../utils/interfaces';
import { Direction } from '../utils/types';


function PickScreen({ name, onPick }: PickScreenProps) {
    const [index, setIndex] = useState<number>(0);
    const [animating, setAnimating] = useState<boolean>(false);
    const [direction, setDirection] = useState<Direction | null>(null);

    const pokemon = pokemons[index];

    const navigate = (dir: Direction): void => {
        if (animating) return;
        setDirection(dir);
        setAnimating(true);
        setTimeout(() => {
            setIndex((prev) =>
                dir === "right"
                    ? (prev + 1) % pokemons.length
                    : (prev - 1 + pokemons.length) % pokemons.length
            );
            setAnimating(false);
        }, 250);
    };

    return (
        <div
            className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden transition-all duration-700"
            style={{ background: "#0a0a0f" }}
        >
            <div
                className="absolute inset-0 transition-opacity duration-700"
                style={{
                    background: `radial-gradient(ellipse at 50% 40%, ${pokemon.glow}22 0%, transparent 70%)`,
                }}
            />
            <Particles color={pokemon.glow} />

            <div className="relative z-20 flex flex-col items-center gap-6 w-full max-w-sm px-4">
                <div className="text-center">
                    <div
                        className="text-gray-400 tracking-widest"
                        style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "0.45rem" }}
                    >
                        WELCOME, TRAINER
                    </div>
                    <div
                        className="font-black mt-1 text-white"
                        style={{
                            fontFamily: "'Press Start 2P', monospace",
                            fontSize: "clamp(0.8rem, 4vw, 1.2rem)",
                            textShadow: `0 0 20px ${pokemon.glow}`,
                        }}
                    >
                        {name}
                    </div>
                    <div
                        className="text-gray-500 mt-2 tracking-widest"
                        style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "0.4rem" }}
                    >
                        CHOOSE YOUR PARTNER
                    </div>
                </div>

                <div className="relative w-full flex items-center justify-center gap-4">
                    <button
                        onClick={() => navigate("left")}
                        className="z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-110"
                        style={{
                            background: "rgba(255,255,255,0.06)",
                            border: `1px solid ${pokemon.glow}44`,
                            boxShadow: `0 0 15px ${pokemon.glow}22`,
                            color: pokemon.glow,
                        }}
                    >
                        <ChevronLeft size={22} strokeWidth={2.5} />
                    </button>

                    <div
                        className="flex-1 rounded-3xl overflow-hidden relative flex flex-col items-center py-8 px-4"
                        style={{
                            background: `linear-gradient(160deg, ${pokemon.glow}18, rgba(0,0,0,0.4))`,
                            border: `1.5px solid ${pokemon.glow}44`,
                            boxShadow: `0 0 40px ${pokemon.glow}33, inset 0 1px 0 rgba(255,255,255,0.06)`,
                            opacity: animating ? 0 : 1,
                            transform: animating
                                ? `translateX(${direction === "right" ? "-30px" : "30px"})`
                                : "translateX(0)",
                            transition: "opacity 0.25s, transform 0.25s",
                        }}
                    >
                        <div
                            className="absolute top-4 right-4 px-3 py-1 rounded-full font-bold tracking-widest"
                            style={{
                                fontFamily: "'Press Start 2P', monospace",
                                fontSize: "0.35rem",
                                background: `${pokemon.glow}33`,
                                color: pokemon.glow,
                                border: `1px solid ${pokemon.glow}66`,
                            }}
                        >
                            {pokemon.emoji} {pokemon.type.toUpperCase()}
                        </div>

                        <div
                            className="w-40 h-40 flex items-center justify-center"
                            style={{ filter: `drop-shadow(0 0 30px ${pokemon.glow}88)` }}
                        >
                            <img
                                src={pokemon.image}
                                alt={pokemon.name}
                                className="w-full h-full object-contain"
                                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                    e.currentTarget.style.display = "none";
                                    const sibling = e.currentTarget.nextSibling as HTMLElement | null;
                                    if (sibling) sibling.style.display = "flex";
                                }}
                            />
                            <div className="w-full h-full items-center justify-center text-7xl" style={{ display: "none" }}>
                                {pokemon.emoji}
                            </div>
                        </div>

                        <div
                            className="mt-4 font-black text-white tracking-widest"
                            style={{
                                fontFamily: "'Press Start 2P', monospace",
                                fontSize: "1rem",
                                textShadow: `0 0 15px ${pokemon.glow}`,
                            }}
                        >
                            {pokemon.name}
                        </div>

                        <div className="flex gap-2 mt-4">
                            {pokemons.map((_, i) => (
                                <div
                                    key={i}
                                    className="rounded-full transition-all duration-300"
                                    style={{
                                        width: i === index ? "16px" : "6px",
                                        height: "6px",
                                        background: i === index ? pokemon.glow : "rgba(255,255,255,0.2)",
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => navigate("right")}
                        className="z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-110"
                        style={{
                            background: "rgba(255,255,255,0.06)",
                            border: `1px solid ${pokemon.glow}44`,
                            boxShadow: `0 0 15px ${pokemon.glow}22`,
                            color: pokemon.glow,
                        }}
                    >
                        <ChevronRight size={22} strokeWidth={2.5} />
                    </button>
                </div>

                <button
                    onClick={() => onPick(pokemons[index])}
                    className="w-full py-4 rounded-xl font-black tracking-widest relative overflow-hidden group transition-transform active:scale-95"
                    style={{
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: "0.55rem",
                        background: `linear-gradient(135deg, ${pokemon.glow}, ${pokemon.glow}88)`,
                        boxShadow: `0 0 30px ${pokemon.glow}55`,
                        color: "#000",
                    }}
                >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity bg-white" />
                    ▶ CHOOSE {pokemon.name.toUpperCase()}!
                </button>
            </div>

            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
      `}</style>
        </div>
    );
}

export default PickScreen
