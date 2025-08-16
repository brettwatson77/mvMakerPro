import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { listJobs, remove, sync } from '../lib/api'

/**
 * VeoQueue
 * Exposes its `refresh` method through a ref so the parent can
 * trigger a queue refresh programmatically after submitting shots.
 */
function VeoQueue (props, ref) {
  const [jobs, setJobs] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const refresh = async () => {
    setRefreshing(true)
    const j = await listJobs();
    setJobs(j.jobs)
    setRefreshing(false)
  }

  const doRemove = async (id) => {
    await remove(id)
    await refresh()
  }

  const doSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await sync()
      setSyncResult(result)
      await refresh() // Refresh the job list after syncing
    } catch (error) {
      setSyncResult({ error: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])

  /* ---------- expose imperative handle to parent ------------ */
  useImperativeHandle(ref, () => ({ refresh }), [refresh])

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Veo Job Queue</h3>
        <div className="flex space-x-2">
          <button 
            className="btn bg-blue-700 hover:bg-blue-800" 
            onClick={doSync} 
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Sync Missed Videos'}
          </button>
          <button className="btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      
      {syncResult && (
        <div className={`p-3 rounded-md ${syncResult.error ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}>
          {syncResult.error ? (
            <p>Sync error: {syncResult.error}</p>
          ) : (
            <p>
              Sync complete: Found {syncResult.remoteCount} videos, 
              downloaded {syncResult.synced} new videos
              {syncResult.errors?.length > 0 && ` (${syncResult.errors.length} errors)`}
            </p>
          )}
        </div>
      )}
      
      <div className="space-y-2">
        {jobs.map(j => (
          <div key={j.id} className="rounded-xl border border-zinc-800 p-3 bg-black/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{j.title}</div>
                <div className="text-xs text-zinc-400">{j.status}</div>
              </div>
              <div className="space-x-2">
                {j.status === 'DONE' && (
                  <a className="btn" href={j.file} target="_blank">Download</a>
                )}
                <button className="btn bg-red-700 hover:bg-red-800" onClick={() => doRemove(j.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default forwardRef(VeoQueue)
