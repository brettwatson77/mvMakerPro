/**
 * backend/services/poller.js
 * 
 * Background polling service for Veo job status updates.
 * Periodically checks for pending jobs and updates their status.
 */
import { getPendingJobs, pollAndDownload } from './veo3.js';

/**
 * Poll for pending jobs and update their status.
 * This function is called periodically by the poller.
 */
async function poll() {
  console.log('[poller] checking for pending jobs...');
  
  // Get all pending jobs from the database
  const pendingJobs = getPendingJobs();
  
  if (pendingJobs.length === 0) {
    console.log('[poller] no pending jobs found');
    return;
  }
  
  console.log(`[poller] found ${pendingJobs.length} pending job(s)`);
  
  // Process each pending job
  for (const job of pendingJobs) {
    console.log(`[poller] processing job ${job.id} (operation: ${job.op_name})`);
    
    try {
      // Poll the Google API for the current status and download if complete
      const result = await pollAndDownload(job.id);
      console.log(`[poller] ✅ job ${job.id} completed successfully, video saved to ${result.file}`);
    } catch (error) {
      console.error(`[poller] ❌ error processing job ${job.id}:`, error.message || error);
      // Continue with other jobs even if one fails
    }
  }
  
  console.log('[poller] finished processing pending jobs');
}

/**
 * Start the background poller.
 * This function should be called when the server starts.
 */
export function start() {
  console.log('[poller] starting background job poller (15s interval)');
  
  // Run the poller immediately once
  poll().catch(err => console.error('[poller] initial poll error:', err));
  
  // Then set up the interval for subsequent polls
  const intervalId = setInterval(() => {
    poll().catch(err => console.error('[poller] interval poll error:', err));
  }, 15000); // 15 seconds
  
  return intervalId; // Return the interval ID in case we need to stop it later
}
