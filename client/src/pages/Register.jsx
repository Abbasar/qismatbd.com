import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveAuthSession } from '../utils/auth';
import { apiUrl } from '../utils/api';
import { DEFAULT_STORE_CONTACT } from '../constants/storeContact';
import { useStorefront } from '../context/StorefrontContext';
import { loadGoogleIdentityScript } from '../utils/googleAuth';

function Register() {
  const { contact } = useStorefront();
  const logoSrc = (contact || DEFAULT_STORE_CONTACT).logoUrl;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [showVerifyStep, setShowVerifyStep] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
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
              if (!response.ok) throw new Error(data.message || 'Google signup failed');
              saveAuthSession({ user: data.user, token: data.token, remember: true });
              navigate(data.user.role === 'admin' ? '/admin' : '/');
            } catch (e) {
              setError(e.message || 'Google signup failed');
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
          text: 'signup_with',
        });
      } catch {
        if (!cancelled) setError('Could not load Google sign-in');
      }
    };

    initGoogle();
    return () => {
      cancelled = true;
    };
  }, [googleClientId, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setPasswordHint('');

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) {
      setError('Please enter a valid email');
      return;
    }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
    if (!strong) {
      setError('Password must be 8+ chars with upper, lower, and number');
      return;
    }

    const response = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.message || 'Register failed');
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (data.requiresVerification) {
      setPendingEmail(data.email || email.trim().toLowerCase());
      setShowVerifyStep(true);
      setInfo(data.message || 'Verification code sent to your email');
      return;
    }
    saveAuthSession({ user: data.user, token: data.token, remember: true });
    navigate('/');
  };

  const verifyEmailCode = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError('Please enter the 6-digit verification code');
      return;
    }
    setVerifyBusy(true);
    try {
      const response = await fetch(apiUrl('/api/auth/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code: verificationCode.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Verification failed');
      saveAuthSession({ user: data.user, token: data.token, remember: true });
      navigate('/');
    } catch (e) {
      setError(e.message || 'Verification failed');
    } finally {
      setVerifyBusy(false);
    }
  };

  const resendCode = async () => {
    setError('');
    setInfo('');
    try {
      const response = await fetch(apiUrl('/api/auth/resend-verification-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not resend code');
      setInfo(data.message || 'Verification code resent');
    } catch (e) {
      setError(e.message || 'Could not resend code');
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-sm border border-stone-200/80 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] sm:p-6">
      <div className="flex flex-col items-center text-center">
        <Link to="/" className="inline-block">
          <img src={logoSrc} alt="Qismat" width={120} height={38} className="h-9 w-auto object-contain" />
        </Link>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-stone-900">Create account</h1>
        <p className="mt-1 text-xs text-stone-500">Fast signup, minimal checkout.</p>
      </div>
      <form onSubmit={showVerifyStep ? verifyEmailCode : handleSubmit} className="mt-6 space-y-4">
        {showVerifyStep ? (
          <>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Verification code</label>
              <input
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1.5 w-full rounded-sm border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-center text-sm tracking-[0.35em] outline-none transition focus:border-stone-400 focus:bg-white"
                inputMode="numeric"
                placeholder="000000"
                required
              />
              <p className="mt-2 text-xs text-stone-500">Code sent to: {pendingEmail}</p>
            </div>
            <button
              disabled={verifyBusy}
              className="w-full rounded-sm bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {verifyBusy ? 'Verifying...' : 'Verify and create account'}
            </button>
            <button
              type="button"
              onClick={resendCode}
              className="w-full rounded-sm border border-stone-200 px-5 py-2.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
            >
              Resend code
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Full name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-sm border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                required
              />
            </div>
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
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  const next = e.target.value;
                  setPassword(next);
                  if (next.length && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(next)) {
                    setPasswordHint('Use at least 8 chars, 1 uppercase, 1 lowercase, and 1 number.');
                  } else {
                    setPasswordHint('');
                  }
                }}
                className="mt-1.5 w-full rounded-sm border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                required
              />
              {passwordHint ? <p className="mt-2 text-xs text-peach-700">{passwordHint}</p> : null}
            </div>
            <button className="w-full rounded-sm bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700">
              Register
            </button>
          </>
        )}
        {info && <p className="rounded-sm bg-sage-50 px-3 py-2 text-xs text-sage-700">{info}</p>}
        {!showVerifyStep && googleClientId ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">or</p>
            <div className={`flex justify-center ${googleBusy ? 'pointer-events-none opacity-70' : ''}`}>
              <div ref={googleBtnRef} />
            </div>
          </div>
        ) : !showVerifyStep ? (
          <p className="text-center text-xs text-stone-500">Set `VITE_GOOGLE_CLIENT_ID` to enable Google sign-up.</p>
        ) : null}
        {error && <p className="rounded-sm bg-brand-50 px-3 py-2 text-xs text-brand-700">{error}</p>}
      </form>
      <p className="mt-4 text-xs text-stone-600">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-stone-900 hover:text-stone-700">
          Login here
        </Link>
      </p>
    </div>
  );
}

export default Register;