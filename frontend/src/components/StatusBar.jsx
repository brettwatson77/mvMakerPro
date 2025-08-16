import React, { useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import VeoQueue from './VeoQueue';
import { getQueueStatus } from '../lib/api';

/**
 * StatusBar component
 * 
 * Displays the current system status, including:
 * - Whether the queue is active or paused due to rate limits
 * - When the queue will resume if paused
 * - Current queue length
 * - Collapsible section containing the full VeoQueue component
 */
export default function StatusBar() {
  const [status, setStatus] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Format the time until queue resumes in a friendly way
  const getResumeTimeInfo = () => {
    if (!status?.isPaused || !status?.pausedUntil) return null;
    
    try {
      const resumeDate = new Date(status.pausedUntil);
      return {
        formatted: format(resumeDate, 'MMM d, h:mm a'),
        relative: formatDistanceToNow(resumeDate, { addSuffix: true })
      };
    } catch (e) {
      console.error('Error formatting resume time:', e);
      return { formatted: 'unknown time', relative: 'soon' };
    }
  };

  // Fetch queue status on component mount and every 5 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoading(true);
        const response = await getQueueStatus();
        if (response.ok && response.status) {
          setStatus(response.status);
          setError(null);
        } else {
          setError('Failed to fetch queue status');
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch queue status');
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchStatus();
    
    // Set up interval for polling
    const intervalId = setInterval(fetchStatus, 5000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  // Determine status message and color
  const getStatusInfo = () => {
    if (loading && !status) {
      return { message: 'Loading system status...', color: 'bg-gray-700' };
    }
    
    if (error) {
      return { message: `Error: ${error}`, color: 'bg-red-700' };
    }
    
    if (!status) {
      return { message: 'Status unavailable', color: 'bg-gray-700' };
    }
    
    if (status.isPaused) {
      const resumeInfo = getResumeTimeInfo();
      return { 
        message: `System Rate Limited - Queue Paused - Resumes ${resumeInfo?.relative || 'soon'}`, 
        color: 'bg-amber-700'
      };
    }
    
    if (status.isProcessing) {
      return { message: 'System Active - Processing Video', color: 'bg-blue-700' };
    }
    
    if (status.length > 0) {
      return { message: `System Ready - ${status.length} item(s) in queue`, color: 'bg-green-700' };
    }
    
    return { message: 'System Ready - Queue Empty', color: 'bg-green-700' };
  };

  const statusInfo = getStatusInfo();
  const resumeTimeInfo = getResumeTimeInfo();

  return (
    <div className="mb-4">
      {/* Status Bar */}
      <div 
        className={`${statusInfo.color} text-white p-3 rounded-t-lg flex justify-between items-center cursor-pointer`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${status?.isPaused ? 'bg-amber-300 animate-pulse' : 'bg-green-300'}`}></div>
          <span className="font-medium">{statusInfo.message}</span>
        </div>
        <div className="flex items-center">
          {status?.isPaused && resumeTimeInfo && (
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
          <VeoQueue />
        </div>
      )}
    </div>
  );
}
