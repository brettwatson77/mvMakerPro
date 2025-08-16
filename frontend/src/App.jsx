import React, { useState } from 'react'
import ScenePlanner from './components/ScenePlanner.jsx'
import SceneCard from './components/SceneCard.jsx'
import ShotList from './components/ShotList.jsx'
import StatusBar from './components/StatusBar.jsx'

export default function App() {
  const [plan, setPlan] = useState(null)

  const updateScene = (updated) => {
    setPlan(p => ({ ...p, scenes: p.scenes.map(s => s.id === updated.id ? updated : s) }))
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Veo3 Scene Planner</h1>
      <StatusBar />
      <ScenePlanner onPlan={setPlan} />

      {plan && (
        <div className="grid md:grid-cols-2 gap-4">
          {plan.scenes.map(s => (
            <div key={s.id} className="space-y-3">
              <SceneCard scene={s} onUpdate={updateScene} />
              <ShotList scene={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
