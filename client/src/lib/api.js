const BASE = import.meta.env.VITE_API_URL || '/api';
export const getToken = () => localStorage.getItem('cs_token');
export const setToken = (t) => (t ? localStorage.setItem('cs_token', t) : localStorage.removeItem('cs_token'));

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(BASE + path, { method, headers, body: payload }); }
  catch { throw new ApiError(0, 'Cannot reach the server. Check your internet connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) window.dispatchEvent(new Event('cs-unauthorized'));
    throw new ApiError(res.status, data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

// Download a protected file (evidence, CSV, PDF) with the login token attached.
export async function download(path, filename) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Could not download the file');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
