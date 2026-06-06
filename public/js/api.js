// Lightweight API client with token storage and offline awareness.
const TOKEN_KEY = 'sedts.token';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(v) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },
  user: null,
};

async function request(method, path, body, { raw = false, isForm = false } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload;
  if (isForm) {
    payload = body; // FormData; browser sets content-type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 401) {
    auth.token = null;
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Session expired.');
  }
  if (raw) {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.blob();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
  postForm: (p, form) => request('POST', p, form, { isForm: true }),
  putForm: (p, form) => request('PUT', p, form, { isForm: true }),
  blob: (method, p, b) => request(method, p, b, { raw: true }),
};
