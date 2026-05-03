const STORAGE_KEY = 'qismat-user';
const TOKEN_KEY = 'qismat-token';
const REMEMBER_KEY = 'qismat-remember';

export function getCurrentUser() {
  const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
  return JSON.parse(raw || 'null');
}

export function saveCurrentUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function saveAuthSession({ user, token, remember = true }) {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(STORAGE_KEY, JSON.stringify(user));
  storage.setItem(TOKEN_KEY, token);
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, '1');
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearCurrentUser() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isAdmin() {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getAuthHeader() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function hydrateSession() {
  if (localStorage.getItem(REMEMBER_KEY) === '1') return;
  const user = sessionStorage.getItem(STORAGE_KEY);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!user || !token) return;
  localStorage.setItem(STORAGE_KEY, user);
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REMEMBER_KEY, '1');
}
