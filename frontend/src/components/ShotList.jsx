import React, { useState } from 'react'
import { submit } from '../lib/api'

export default function ShotList({ scene, onGenerate = () => {} }) {
  function Shot({ sh }) {
    const [prompt, setPrompt] = useState(sh.prompt || '')
    const [busy, setBusy] = useState(false)

    const doGenerate = async () => {
      setBusy(true)
      try {
        // minimal payload: reuse existing submit route signature
        await submit({ shots: [{ id: sh.id, title: sh.title, prompt }] })
        onGenerate()                // notify parent to refresh queue
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="rounded-xl border border-zinc-800 p-3 bg-black/20">
        <div className="flex space-x-3">
          {/* left column could house thumbnail or future controls */}
          <div className="flex-1 space-y-2">
            <div className="font-medium">
              {sh.title}{' '}
              <span className="text-xs text-zinc-400">
                ({sh.duration_sec || sh.durationSec || 8}s)
              </span>
            </div>
            <div className="text-zinc-300 text-sm">{sh.action}</div>
            <textarea
              className="input w-full text-xs"
              rows={3}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={doGenerate} disabled={busy}>
                {busy ? 'Generating…' : 'Generate'}
              </button>
              <button className="btn flex-1 opacity-60 cursor-not-allowed" disabled>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h4 className="font-medium mb-2">Shots</h4>
      <div className="space-y-2">
        {scene.shots.map((sh) => (
          <Shot key={sh.id} sh={sh} />
        ))}
      </div>
    </div>
  )
}
