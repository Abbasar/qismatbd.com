import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveAuthSession } from '../utils/auth';
import { apiUrl } from '../utils/api';
import { DEFAULT_STORE_CONTACT } from '../constants/storeContact';
import { useStorefront } from '../context/StorefrontContext';
import { loadGoogleIdentityScript } from '../utils/googleAuth';

function Login() {
  const { contact } = useStorefront();
  const logoSrc = (contact || DEFAULT_STORE_CONTACT).logoUrl;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleBtnRef = useRef(null);
  const navigate = useNavigate();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    let cancelled = false;
    if (!googleClientId || !googleBtnRef.current) return undefined;

    const initGoogle = async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (resp) => {
            try {
              setGoogleBusy(true);
              setError('');
              const response = await fetch(apiUrl('/api/auth/google'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: resp.credential }),
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error(data.message || 'Google login failed');
              }
              saveAuthSession({ user: data.user, token: data.token, remember });
              navigate(data.user.role === 'admin' ? '/admin' : '/');
            } catch (e) {
              setError(e.message || 'Google login failed');
            } finally {
              setGoogleBusy(false);
            }
          },
        });
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          width: 360,
          text: 'continue_with',
        });
      } catch {
        if (!cancelled) setError('Could not load Google sign-in');
      }
    };

    initGoogle();
    return () => {
      cancelled = true;
    };
  }, [googleClientId, navigate, remember]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.message || 'Login failed');
      return;
    }

    const data = await response.json();
    saveAuthSession({ user: data.user, token: data.token, remember });
    navigate(data.user.role === 'admin' ? '/admin' : '/');
  };

  return (
    <div className="mx-auto max-w-md rounded-sm border border-stone-200/80 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] sm:p-6">
      <div className="flex flex-col items-center text-center">
        <Link to="/" className="inline-block">
          <img src={logoSrc} alt="Qismat" width={120} height={38} className="h-9 w-auto object-contain" />
        </Link>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-stone-900">Welcome back</h1>
        <p className="mt-1 text-xs text-stone-500">Login to continue shopping.</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Password</label>
          <div className="relative mt-1.5">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm border border-stone-200 bg-stone-50 px-3.5 py-2.5 pr-11 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-stone-500 hover:text-stone-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <span className="text-[11px] font-semibold">{showPassword ? 'Hide' : 'Show'}</span>
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded-sm border-stone-300"
          />
          Keep me logged in
        </label>
        {error && <p className="rounded-sm bg-brand-50 px-3 py-2 text-xs text-brand-700">{error}</p>}
        <button className="w-full rounded-sm bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700">
          Login
        </button>
        {googleClientId ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">or</p>
            <div className={`flex justify-center ${googleBusy ? 'pointer-events-none opacity-70' : ''}`}>
              <div ref={googleBtnRef} />
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-stone-500">Set `VITE_GOOGLE_CLIENT_ID` to enable Google sign-in.</p>
        )}
      </form>
      <p className="mt-4 text-xs text-stone-600">
        <Link to="/forgot-password" className="font-semibold text-stone-900 hover:text-stone-700">
          Forgot password?
        </Link>
      </p>
      <p className="mt-4 text-xs text-stone-600">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-stone-900 hover:text-stone-700">
          Register here
        </Link>
      </p>
    </div>
  );
}

export default Login;