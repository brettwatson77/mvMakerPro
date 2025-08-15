import React, { useState } from 'react'
import { plan } from '../lib/api'

export default function ScenePlanner({ onPlan }) {
  const [description, setDescription] = useState('Gritty noir story of a cat detective uncovering a family secret across eras.')
  const [length, setLength] = useState(210)
  const [aspect, setAspect] = useState('16:9')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const data = await plan({ description, songLengthSec: Number(length), aspectRatio: aspect })
      onPlan(data)
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div>
        <div className="label">Video concept</div>
        <textarea className="input min-h-[120px]" value={description} onChange={e=>setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="label">Song length (sec)</div>
          <input className="input" type="number" value={length} onChange={e=>setLength(e.target.value)} />
        </div>
        <div>
          <div className="label">Aspect ratio</div>
          <select className="input" value={aspect} onChange={e=>setAspect(e.target.value)}>
            <option>16:9</option>
            <option>9:16</option>
            <option>1:1</option>
          </select>
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Planning…' : 'Plan scenes'}</button>
    </form>
  )
}
