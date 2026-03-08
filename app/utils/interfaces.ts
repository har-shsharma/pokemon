export interface Pokemon {
  name: string;
  image: string;
  type: string;
  color: string;
  bg: string;
  glow: string;
  emoji: string;
}

export interface User {
  name: string;
  highscore: number;
}

export interface CountdownColors {
  1: string;
  2: string;
  3: string;
  go: string;
}

export interface NameScreenProps {
  onNext: (name: string) => void;
}

export interface PickScreenProps {
  name: string;
  onPick: (pokemon: Pokemon) => void;
}

export interface CountdownScreenProps {
  pokemon: Pokemon;
  name: string;
  onDone: () => void;
}

export interface GameScreenProps {
  pokemon: Pokemon;
  name: string;
}

export interface ParticlesProps {
  color?: string;
}