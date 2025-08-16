import React, { useState } from 'react'
import { enhance } from '../lib/api'

/**
 * SceneCard
 *
 * NOTE:
 * This component is now wrapped in a fixed-width, flex-shrink container so that
 * parent layouts can place multiple <SceneCard> elements inside a horizontal
 * flexbox with `overflow-x-auto`.  Each card therefore behaves like an
 * “inline-slide” in a horizontally scrolling carousel.
 *
 * The parent (e.g. Scene list) should add:
 *   <div className="flex overflow-x-auto space-x-4">
 *      {scenes.map(s => <SceneCard key={s.id} … />)}
 *   </div>
 */
export default function SceneCard({ scene, overallConcept, onUpdate }) {
  const [concept, setConcept] = useState(scene.concept)
  const [busy, setBusy] = useState(false)

  const doEnhance = async () => {
    setBusy(true)
    try {
      const baseShots = scene.shots.map(s => ({ id: s.id, title: s.title, action: s.action }))
      const out = await enhance({
        overallConcept,
        sceneId: scene.id,
        concept,
        shots: baseShots
      })
      const merged = {
        ...scene,
        concept,
        shots: out.shots
      }
      onUpdate(merged)
    } finally { setBusy(false) }
  }

  return (
    /* ------------------------------------------------------------------
       flex-shrink-0 ensures the card keeps its width when placed in a
       horizontal flex container.  w-80 (~20rem) gives a consistent card
       width; adjust if design changes.  The inner `.card` retains visual
       styling.
    ------------------------------------------------------------------ */
    <div className="flex-shrink-0 w-80">
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
    </div>
  )
}
