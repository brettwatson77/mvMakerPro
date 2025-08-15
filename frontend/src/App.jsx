import React, { useState, useRef } from 'react'
import ScenePlanner from './components/ScenePlanner.jsx'
import SceneCard from './components/SceneCard.jsx'
import ShotList from './components/ShotList.jsx'
import VeoQueue from './components/VeoQueue.jsx'

export default function App() {
  const [plan, setPlan] = useState(null)
  /* ref gives us imperative access to VeoQueue.refresh() */
  const queueRef = useRef(null)

  const updateScene = (updated) => {
    setPlan(p => ({ ...p, scenes: p.scenes.map(s => s.id === updated.id ? updated : s) }))
  }

  /* Called after a shot (or scene) is submitted for generation */
  const refreshQueue = () => {
    queueRef.current?.refresh?.()
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Veo3 Scene Planner</h1>
      <ScenePlanner onPlan={setPlan} />

      {plan && (
        <div className="grid md:grid-cols-2 gap-4">
          {plan.scenes.map(s => (
            <div key={s.id} className="space-y-3">
              <SceneCard scene={s} onUpdate={updateScene} />
              <ShotList scene={s} onGenerate={refreshQueue} />
            </div>
          ))}
        </div>
      )}

      <VeoQueue ref={queueRef} />
    </div>
  )
}
