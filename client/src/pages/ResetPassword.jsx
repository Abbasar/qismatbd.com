import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiUrl } from '../utils/api';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!token) {
      setError('Reset token missing. Please use the email link.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Reset failed');
      setMessage(data.message || 'Password reset successful. You can login now.');
      setPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError(e.message || 'Could not reset password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl rounded-sm border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-3xl font-semibold text-stone-900">Reset password</h1>
      <p className="mt-2 text-sm text-stone-600">Set a new secure password for your account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-sm border border-stone-200 bg-stone-50 px-4 py-3"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-2 w-full rounded-sm border border-stone-200 bg-stone-50 px-4 py-3"
            required
          />
        </div>
        {error ? <p className="rounded-sm bg-brand-50 px-4 py-3 text-sm text-brand-700">{error}</p> : null}
        {message ? <p className="rounded-sm bg-sage-50 px-4 py-3 text-sm text-sage-700">{message}</p> : null}
        <button disabled={busy} className="w-full rounded-sm bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {busy ? 'Updating...' : 'Reset password'}
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

export default ResetPassword;
