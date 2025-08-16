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
    <div className="w-full">
      {/* -------- Center-constrained content -------- */}
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Veo3 Scene Planner</h1>
        <StatusBar />
        <ScenePlanner onPlan={setPlan} />
      </div>

      {/* -------- Full-width horizontally scrolling scene list -------- */}
      {plan && (
        <div className="w-full overflow-x-auto py-2">
          <div className="flex space-x-4 px-6">
            {plan.scenes.map(s => (
              <div key={s.id} className="space-y-3">
                <SceneCard
                  scene={s}
                  overallConcept={plan.description}
                  onUpdate={updateScene}
                />
                <ShotList scene={s} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
