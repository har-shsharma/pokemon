'use client'

import { useEffect, useState } from "react"
import { ParticlesProps } from "../utils/interfaces"

type Particle = {
  size: number
  left: number
  top: number
  opacity: number
  duration: number
  delay: number
}

function Particles({ color = "#ffffff" }: ParticlesProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    const p = Array.from({ length: 20 }).map(() => ({
      size: Math.random() * 4 + 2,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.5 + 0.1,
      duration: Math.random() * 6 + 4,
      delay: Math.random() * 4
    }))

    setParticles(p)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: "50%",
            background: color,
            left: `${p.left}%`,
            top: `${p.top}%`,
            opacity: p.opacity,
            animation: `float ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

export default Particles