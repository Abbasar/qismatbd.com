import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../utils/api';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Request failed');
      setMessage(data.message || 'If this email exists, reset instructions were sent.');
    } catch (e) {
      setError(e.message || 'Could not send reset link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl rounded-sm border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-3xl font-semibold text-stone-900">Forgot password</h1>
      <p className="mt-2 text-sm text-stone-600">Enter your email to get a password reset link.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-sm border border-stone-200 bg-stone-50 px-4 py-3"
            required
          />
        </div>
        {error ? <p className="rounded-sm bg-brand-50 px-4 py-3 text-sm text-brand-700">{error}</p> : null}
        {message ? <p className="rounded-sm bg-sage-50 px-4 py-3 text-sm text-sage-700">{message}</p> : null}
        <button disabled={busy} className="w-full rounded-sm bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {busy ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        Back to{' '}
        <Link to="/login" className="font-semibold text-stone-900 hover:text-stone-700">
          Login
        </Link>
      </p>
    </div>
  );
}

export default ForgotPassword;
