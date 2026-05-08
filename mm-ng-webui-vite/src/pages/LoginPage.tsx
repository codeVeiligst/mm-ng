import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/status';
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [auth.isAuthenticated, from, navigate]);

  if (auth.isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await auth.login(username, password);
      navigate(from, { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">M</span>
          <div>
            <h1>MineMeld</h1>
            <p>mm-ng WebUI</p>
          </div>
        </div>
        {auth.canUseOidc ? (
          <div className="login-auth-option">
            <span className="session-label">Single sign-on</span>
            <button className="button primary" type="button" onClick={auth.loginWithOidc}>
              Sign in with OIDC
            </button>
          </div>
        ) : null}
        <form onSubmit={submit} className="login-form">
          {auth.canUseOidc ? <span className="login-divider">or use a local MineMeld account</span> : <span className="session-label">Local account</span>}
          <label>
            Username
            <input value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input
              value={password}
              type="password"
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
