import axios from 'axios';

const API = axios.create({ baseURL: 'http://localhost:3011/api' });

export const plan = (payload) => API.post('/plan', payload).then(r => r.data);
export const enhance = (payload) => API.post('/plan/enhance', payload).then(r => r.data);
export const submit = (payload) => API.post('/veo/submit', payload).then(r => r.data);
export const fetchJob = (id) => API.post('/veo/fetch', { id }).then(r => r.data);
export const listJobs = () => API.get('/veo/jobs').then(r => r.data);
export const remove = (id) => API.delete(`/veo/jobs/${id}`).then(r => r.data);
