import React, { useState } from 'react'
import { enhance } from '../lib/api'

export default function SceneCard({ scene, onUpdate }) {
  const [concept, setConcept] = useState(scene.concept)
  const [busy, setBusy] = useState(false)

  const doEnhance = async () => {
    setBusy(true)
    try {
      const baseShots = scene.shots.map(s => ({ id: s.id, title: s.title, action: s.action }))
      const out = await enhance({ sceneId: scene.id, concept, shots: baseShots })
      const merged = {
        ...scene,
        concept,
        shots: out.shots
      }
      onUpdate(merged)
    } finally { setBusy(false) }
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-semibold">{scene.title}</h3>
        <span className="text-sm text-zinc-400">{scene.start_sec ?? scene.start}–{scene.end_sec ?? scene.end}s</span>
      </div>
      <textarea className="input" value={concept} onChange={e=>setConcept(e.target.value)} />
      <div className="flex gap-3">
        <button
          className="btn flex-1"
          onClick={doEnhance}
          disabled={busy}
        >
          {busy ? 'Enhancing…' : 'Refine Shots'}
        </button>

        {/* Placeholder for future scene-level generation – disabled until backend route is wired */}
        <button
          className="btn flex-1 opacity-60 cursor-not-allowed"
          disabled
          title="Coming soon"
        >
          Generate All
        </button>
      </div>
    </div>
  )
}
