import React, { useEffect, useState } from 'react'
import { fetchJob, listJobs } from '../lib/api'

export default function VeoQueue() {
  const [jobs, setJobs] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    const j = await listJobs();
    setJobs(j.jobs)
    setRefreshing(false)
  }

  const pull = async (id) => {
    await fetchJob(id)
    await refresh()
  }

  useEffect(() => { refresh() }, [])

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Veo Job Queue</h3>
        <button className="btn" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="space-y-2">
        {jobs.map(j => (
          <div key={j.id} className="rounded-xl border border-zinc-800 p-3 bg-black/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{j.title}</div>
                <div className="text-xs text-zinc-400">{j.status}</div>
              </div>
              <div className="space-x-2">
                {j.status !== 'DONE' ? (
                  <button className="btn" onClick={() => pull(j.id)}>Fetch</button>
                ) : (
                  <a className="btn" href={j.file} target="_blank">Download</a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
