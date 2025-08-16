import React, { useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import VeoQueue from './VeoQueue';
import { 
  getQueueStatus, 
  getPollerStatus,
  startQueue,
  stopQueue,
  startPoller,
  stopPoller
} from '../lib/api';

// 👉 global sync action
import { sync as syncMissed } from '../lib/api';
/**
 * StatusBar component
 * 
 * Displays the current system status, including:
 * - Whether the queue is active or paused due to rate limits
 * - When the queue will resume if paused
 * - Current queue length
 * - Manual controls for starting/stopping queue and poller
 * - Collapsible section containing the full VeoQueue component
 */
export default function StatusBar() {
  const [queueStatus, setQueueStatus] = useState(null);
  const [pollerStatus, setPollerStatus] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [controlsLoading, setControlsLoading] = useState({
    startQueue: false,
    stopQueue: false,
    startPoller: false,
    stopPoller: false,
    sync: false
  });

  // --- sync result feedback ---
  const [syncInfo, setSyncInfo] = useState(null);

  // Format the time until queue resumes in a friendly way
  const getResumeTimeInfo = () => {
    if (!queueStatus?.isPaused || !queueStatus?.pausedUntil) return null;
    
    try {
      const resumeDate = new Date(queueStatus.pausedUntil);
      return {
        formatted: format(resumeDate, 'MMM d, h:mm a'),
        relative: formatDistanceToNow(resumeDate, { addSuffix: true })
      };
    } catch (e) {
      console.error('Error formatting resume time:', e);
      return { formatted: 'unknown time', relative: 'soon' };
    }
  };

  // Fetch queue and poller status
  const fetchStatuses = async () => {
    try {
      setLoading(true);
      
      // Fetch queue status
      const queueResponse = await getQueueStatus();
      if (queueResponse.ok && queueResponse.status) {
        setQueueStatus(queueResponse.status);
      }
      
      // Fetch poller status
      const pollerResponse = await getPollerStatus();
      if (pollerResponse.ok && pollerResponse.status) {
        setPollerStatus(pollerResponse.status);
      }
      
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch system status');
    } finally {
      setLoading(false);
    }
  };

  // Control handlers
  const handleSync = async () => {
    setControlsLoading(prev => ({ ...prev, sync: true }));
    setSyncInfo(null);
    try {
      const result = await syncMissed();
      setSyncInfo({ ok: true, ...result });
      await fetchStatuses();
    } catch (err) {
      setSyncInfo({ ok: false, error: err.message || 'Sync failed' });
    } finally {
      setControlsLoading(prev => ({ ...prev, sync: false }));
    }
  };

  const handleStartQueue = async () => {
    setControlsLoading(prev => ({ ...prev, startQueue: true }));
    try {
      await startQueue();
      await fetchStatuses();
    } catch (err) {
      setError(`Failed to start queue: ${err.message}`);
    } finally {
      setControlsLoading(prev => ({ ...prev, startQueue: false }));
    }
  };

  const handleStopQueue = async () => {
    setControlsLoading(prev => ({ ...prev, stopQueue: true }));
    try {
      await stopQueue();
      await fetchStatuses();
    } catch (err) {
      setError(`Failed to stop queue: ${err.message}`);
    } finally {
      setControlsLoading(prev => ({ ...prev, stopQueue: false }));
    }
  };

  const handleStartPoller = async () => {
    setControlsLoading(prev => ({ ...prev, startPoller: true }));
    try {
      await startPoller();
      await fetchStatuses();
    } catch (err) {
      setError(`Failed to start poller: ${err.message}`);
    } finally {
      setControlsLoading(prev => ({ ...prev, startPoller: false }));
    }
  };

  const handleStopPoller = async () => {
    setControlsLoading(prev => ({ ...prev, stopPoller: true }));
    try {
      await stopPoller();
      await fetchStatuses();
    } catch (err) {
      setError(`Failed to stop poller: ${err.message}`);
    } finally {
      setControlsLoading(prev => ({ ...prev, stopPoller: false }));
    }
  };

  // Fetch status on component mount and every 5 seconds
  useEffect(() => {
    // Initial fetch
    fetchStatuses();
    
    // Set up interval for polling
    const intervalId = setInterval(fetchStatuses, 5000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  // Determine status message and color
  const getStatusInfo = () => {
    if (loading && !queueStatus) {
      return { message: 'Loading system status...', color: 'bg-gray-700' };
    }
    
    if (error) {
      return { message: `Error: ${error}`, color: 'bg-red-700' };
    }
    
    if (!queueStatus) {
      return { message: 'Status unavailable', color: 'bg-gray-700' };
    }
    
    if (queueStatus.isPaused) {
      const resumeInfo = getResumeTimeInfo();
      return { 
        message: `System Rate Limited - Queue Paused - Resumes ${resumeInfo?.relative || 'soon'}`, 
        color: 'bg-amber-700'
      };
    }
    
    // Check if services are active
    const queueActive = queueStatus.isActive;
    const pollerActive = pollerStatus?.isActive;
    
    if (!queueActive && !pollerActive) {
      return { message: 'System Idle - Both Services Paused', color: 'bg-gray-700' };
    }
    
    if (queueStatus.isProcessing) {
      return { message: 'System Active - Processing Video', color: 'bg-blue-700' };
    }
    
    if (queueStatus.length > 0) {
      return { 
        message: `System Ready - ${queueStatus.length} item(s) in queue${!queueActive ? ' (Queue Paused)' : ''}${!pollerActive ? ' (Poller Paused)' : ''}`, 
        color: 'bg-green-700' 
      };
    }
    
    return { 
      message: `System Ready - Queue Empty${!queueActive ? ' (Queue Paused)' : ''}${!pollerActive ? ' (Poller Paused)' : ''}`, 
      color: 'bg-green-700' 
    };
  };

  const statusInfo = getStatusInfo();
  const resumeTimeInfo = getResumeTimeInfo();

  /* ------------------------------------------------------------------
   * EARLY RETURN: while the very first status fetch is still running
   * render a simple loading banner.  This prevents the component from
   * touching queueStatus / pollerStatus before they exist and avoids
   * a blank-screen crash.
   * ------------------------------------------------------------------ */
  if (loading && !queueStatus && !pollerStatus) {
    return (
      <div className="mb-4">
        <div className="bg-gray-700 text-white p-3 rounded-lg">
          Loading system status…
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Status Bar */}
      <div 
        className={`${statusInfo.color} text-white p-3 rounded-t-lg flex justify-between items-center cursor-pointer`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full mr-2 ${queueStatus?.isPaused ? 'bg-amber-300 animate-pulse' : 'bg-green-300'}`}></div>
          <span className="font-medium">{statusInfo.message}</span>
          {/* optional resume hint when compressed */}
          {queueStatus?.isPaused && resumeTimeInfo && (
            <span className="text-xs opacity-70">(resumes {resumeTimeInfo.relative})</span>
          )}
        </div>
        <div className="flex items-center">
          {/* --- Sync button lives in the top bar for global visibility --- */}
          <button
            className="btn btn-xs bg-blue-700 hover:bg-blue-800 disabled:bg-gray-600"
            onClick={e => { e.stopPropagation(); handleSync(); }}
            disabled={controlsLoading.sync}
            title="Download any videos that finished while the app was offline"
          >
            {controlsLoading.sync ? 'Syncing…' : 'Sync Videos'}
          </button>

          {queueStatus?.isPaused && resumeTimeInfo && (
            <span className="text-xs mr-4">
              Resumes: {resumeTimeInfo.formatted}
            </span>
          )}
          <svg 
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {/* Collapsible Queue Section */}
      {isExpanded && (
        <div className="border border-t-0 border-gray-700 rounded-b-lg p-4 bg-gray-900">
          {/* Manual Control Panel */}
          <div className="mb-4 p-3 border border-gray-700 rounded-lg bg-gray-800">
            <h3 className="text-lg font-medium mb-3">Manual Controls</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Queue Controls */}
              <div className="p-3 border border-gray-600 rounded-lg">
                <h4 className="font-medium mb-2">Submission Queue</h4>
                <p className="text-sm text-gray-300 mb-3">
                  Status: {queueStatus?.isActive ? 
                    <span className="text-green-400">Active</span> : 
                    <span className="text-gray-400">Paused</span>}
                </p>
                <div className="flex space-x-2">
                  <button 
                    className="btn bg-green-700 hover:bg-green-800 disabled:bg-gray-600"
                    onClick={handleStartQueue}
                    disabled={queueStatus?.isActive || controlsLoading.startQueue}
                  >
                    {controlsLoading.startQueue ? 'Starting...' : 'Start Queue'}
                  </button>
                  <button 
                    className="btn bg-red-700 hover:bg-red-800 disabled:bg-gray-600"
                    onClick={handleStopQueue}
                    disabled={!queueStatus?.isActive || controlsLoading.stopQueue}
                  >
                    {controlsLoading.stopQueue ? 'Stopping...' : 'Stop Queue'}
                  </button>
                </div>
              </div>
              
              {/* Poller Controls */}
              <div className="p-3 border border-gray-600 rounded-lg">
                <h4 className="font-medium mb-2">Status Poller</h4>
                <p className="text-sm text-gray-300 mb-3">
                  Status: {pollerStatus?.isActive ? 
                    <span className="text-green-400">Active</span> : 
                    <span className="text-gray-400">Paused</span>}
                </p>
                <div className="flex space-x-2">
                  <button 
                    className="btn bg-green-700 hover:bg-green-800 disabled:bg-gray-600"
                    onClick={handleStartPoller}
                    disabled={pollerStatus?.isActive || controlsLoading.startPoller}
                  >
                    {controlsLoading.startPoller ? 'Starting...' : 'Start Poller'}
                  </button>
                  <button 
                    className="btn bg-red-700 hover:bg-red-800 disabled:bg-gray-600"
                    onClick={handleStopPoller}
                    disabled={!pollerStatus?.isActive || controlsLoading.stopPoller}
                  >
                    {controlsLoading.stopPoller ? 'Stopping...' : 'Stop Poller'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Jobs Queue */}
          <VeoQueue />
        </div>
      )}

      {/* --- Sync result toast ----------------------------------------- */}
      {syncInfo && (
        <div
          className={`mt-2 p-3 text-sm rounded-lg ${
            syncInfo.ok
              ? 'bg-green-900/60 text-green-300'
              : 'bg-red-900/60 text-red-300'
          }`}
        >
          {syncInfo.ok ? (
            <>Sync complete. Downloaded {syncInfo.synced} new video(s).</>
          ) : (
            <>Sync failed: {syncInfo.error}</>
          )}
        </div>
      )}
    </div>
  );
}
