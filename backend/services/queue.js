/**
 * backend/services/queue.js
 * 
 * Smart queue implementation for video generation requests.
 * Ensures we only send one request to the Google API every 2 minutes
 * to avoid rate limiting (429 Too Many Requests errors).
 */
import { submitShots } from './veo3.js';

// In-memory queue for storing shots waiting to be processed
const queue = [];

// Queue processing interval in milliseconds (2 minutes)
const QUEUE_INTERVAL = 120 * 1000; 

// Flag to track if the queue is currently being processed
let isProcessing = false;

/**
 * Add a shot to the processing queue
 * @param {Object} shot - The shot object to be added to the queue
 * @param {string} shot.id - Shot ID
 * @param {string} shot.title - Shot title
 * @param {string} shot.prompt - Shot prompt for video generation
 * @returns {Object} Status object with queue position
 */
export function addShotToQueue(shot) {
  // Add the shot to the end of the queue
  queue.push(shot);
  
  const position = queue.length;
  console.log(`[queue] ➕ Added shot "${shot.title}" (${shot.id}) to queue. Position: ${position}`);
  console.log(`[queue] Current queue length: ${queue.length}`);
  
  return {
    success: true,
    position,
    queueLength: queue.length
  };
}

/**
 * Process the next item in the queue
 * @returns {Promise<void>}
 */
async function processNextInQueue() {
  // If queue is empty or already processing, do nothing
  if (queue.length === 0 || isProcessing) {
    return;
  }

  try {
    // Set processing flag to prevent concurrent processing
    isProcessing = true;
    
    // Take the first shot from the queue (FIFO)
    const shot = queue[0];
    console.log(`[queue] 🔄 Processing shot "${shot.title}" (${shot.id})`);
    
    // Submit the shot to the Google API
    // Note: We're wrapping the shot in an array because submitShots expects an array
    await submitShots({ 
      shots: [shot],
      // Pass through any other options that might be needed
      model: 'preview',
      aspectRatio: '16:9'
    });
    
    // Remove the processed shot from the queue
    queue.shift();
    console.log(`[queue] ✅ Shot "${shot.title}" submitted successfully. ${queue.length} shots remaining in queue.`);
  } catch (error) {
    console.error(`[queue] ❌ Error processing shot:`, error.message || error);
    
    // If there was an error, we might want to remove the problematic shot
    // to prevent the queue from getting stuck
    if (queue.length > 0) {
      const failedShot = queue.shift();
      console.log(`[queue] ⚠️ Removed failed shot "${failedShot.title}" from queue to prevent blockage`);
    }
  } finally {
    // Reset processing flag
    isProcessing = false;
  }
}

/**
 * Start the queue processor
 * @returns {number} The interval ID for the queue processor
 */
export function start() {
  console.log(`[queue] 🚀 Starting queue processor. Processing interval: ${QUEUE_INTERVAL/1000} seconds`);
  
  // Process queue immediately once on start
  processNextInQueue().catch(err => 
    console.error('[queue] Error in initial queue processing:', err)
  );
  
  // Then set up the interval for subsequent processing
  const intervalId = setInterval(() => {
    console.log('[queue] ⏰ Queue processor waking up...');
    processNextInQueue().catch(err => 
      console.error('[queue] Error in interval queue processing:', err)
    );
  }, QUEUE_INTERVAL);
  
  return intervalId;
}

/**
 * Get the current queue status
 * @returns {Object} Queue status information
 */
export function getQueueStatus() {
  return {
    length: queue.length,
    isProcessing,
    nextItem: queue.length > 0 ? {
      id: queue[0].id,
      title: queue[0].title
    } : null
  };
}
