import axios from 'axios';

const API = axios.create({ baseURL: 'http://localhost:3011/api' });

export const plan = (payload) => API.post('/plan', payload).then(r => r.data);
export const enhance = (payload) => API.post('/plan/enhance', payload).then(r => r.data);
export const submit = (payload) => API.post('/veo/submit', payload).then(r => r.data);
export const fetchJob = (id) => API.post('/veo/fetch', { id }).then(r => r.data);
export const listJobs = () => API.get('/veo/jobs').then(r => r.data);
export const remove = (id) => API.delete(`/veo/jobs/${id}`).then(r => r.data);

// ---------------------------------------------------------------------------
// Queue status (for global StatusBar)
// ---------------------------------------------------------------------------
export const getQueueStatus = () =>
  API.get('/veo/queue/status').then(r => r.data);

// ---------------------------------------------------------------------------
// Sync missed videos (download any files that exist remotely but not locally)
// ---------------------------------------------------------------------------
export const sync = () =>
  API.post('/veo/sync').then(r => r.data);

// ---------------------------------------------------------------------------
// Manual control: Queue processor
// ---------------------------------------------------------------------------
export const startQueue = () =>
  API.post('/veo/queue/start').then(r => r.data);

export const stopQueue = () =>
  API.post('/veo/queue/stop').then(r => r.data);

// ---------------------------------------------------------------------------
// Manual control: Background poller
// ---------------------------------------------------------------------------
export const startPoller = () =>
  API.post('/veo/poller/start').then(r => r.data);

export const stopPoller = () =>
  API.post('/veo/poller/stop').then(r => r.data);

export const getPollerStatus = () =>
  API.get('/veo/poller/status').then(r => r.data);
