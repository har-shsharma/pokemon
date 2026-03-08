'use client';
import { useState, useEffect } from "react";
import NameScreen from "./components/NameScreen";
import PickScreen from "./components/PickScreen";
import CountdownScreen from "./components/CountdownScreen";
import GameScreen from "./components/GameScreen";
import { Pokemon, User } from "./utils/interfaces";
import { Screen } from "./utils/types";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("name");
  const [user, setUser] = useState<User | null>(null);
  const [pokemon, setPokemon] = useState<Pokemon | null>(null);

  return (
    <div className="w-screen h-[100dvh] overflow-hidden bg-black">
      {screen === "name" && (
        <NameScreen
          onNext={(name: string) => {
            setUser({ name, highscore: 0 });
            setScreen("pick");
          }}
        />
      )}

      {screen === "pick" && user && (
        <PickScreen
          name={user.name}
          onPick={(p: Pokemon) => {
            setPokemon(p);
            setScreen("countdown");
          }}
        />
      )}

      {screen === "countdown" && pokemon && user && (
        <CountdownScreen
          pokemon={pokemon}
          name={user.name}
          onDone={() => setScreen("game")}
        />
      )}

      {screen === "game" && pokemon && user && (
        <GameScreen pokemon={pokemon} name={user.name} />
      )}
    </div>
  );
}