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
  
  // Process each pending job with exponential-backoff support
  for (const job of pendingJobs) {
    processJob(job);
  }
  
  console.log('[poller] finished processing pending jobs');
}

/**
 * Process an individual job with retry support.
 * Implements exponential back-off when the Google API returns 429.
 */
const MAX_RETRIES = 5;
const BASE_DELAY = 30_000; // 30 seconds

function processJob(job, retries = 0) {
  console.log(`[poller] processing job ${job.id} (operation: ${job.op_name}) [try #${retries + 1}]`);

  pollAndDownload(job.id)
    .then(res => {
      console.log(`[poller] ✅ job ${job.id} completed successfully, video saved to ${res.file}`);
    })
    .catch(err => {
      // Detect 429 (too many requests) for exponential back-off
      const status = err?.response?.status;
      if (status === 429 && retries < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retries); // 30s, 60s, 120s, ...
        console.warn(`[poller] ⚠️ 429 received for job ${job.id}. Retrying in ${delay / 1000}s (retry ${retries + 1}/${MAX_RETRIES})`);
        setTimeout(() => processJob(job, retries + 1), delay);
      } else {
        console.error(`[poller] ❌ error processing job ${job.id}:`, err.message || err);
      }
    });
}

/**
 * Start the background poller.
 * This function should be called when the server starts.
 */
export function start() {
  console.log('[poller] starting background job poller (150s interval)');
  
  // Run the poller immediately once
  poll().catch(err => console.error('[poller] initial poll error:', err));
  
  // Then set up the interval for subsequent polls
  const intervalId = setInterval(() => {
    poll().catch(err => console.error('[poller] interval poll error:', err));
  }, 150000); // 150 seconds (2.5 minutes)
  
  return intervalId; // Return the interval ID in case we need to stop it later
}
