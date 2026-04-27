import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';

const ERROR_MESSAGES: Record<string, string> = {
  expired: 'That sign-in link has expired or already been used. Please request a new one.',
  invalid: 'That sign-in link is not valid.',
};

export default function AuthCallbackScreen() {
  const { consumeAuthToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(hash);
    const token = params.get('token');
    const errCode = params.get('error');

    if (token) {
      consumeAuthToken(token).then(() => {
        // Clear the token from the URL before navigating away
        window.history.replaceState(null, '', '/');
        navigate('/', { replace: true });
      });
    } else {
      setError(ERROR_MESSAGES[errCode ?? ''] ?? 'Sign-in failed. Please try again.');
    }
  }, [consumeAuthToken, navigate]);

  if (error) {
    return (
      <div className="screen home-screen">
        <h1 className="title">Sign-in failed</h1>
        <p className="subtitle">{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="screen home-screen">
      <p className="subtitle">Signing you in&hellip;</p>
    </div>
  );
}
