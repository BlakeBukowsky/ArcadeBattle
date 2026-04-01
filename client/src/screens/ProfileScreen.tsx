import { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useGame } from '../context/GameContext.tsx';

export default function ProfileScreen() {
  const { user, updateProfile, logout } = useAuth();
  const game = useGame();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  if (!user) {
    return (
      <div className="screen profile-screen">
        <h1>Profile</h1>
        <p className="profile-guest-message">Sign in to create a profile.</p>
        <button className="btn btn-secondary" onClick={() => game.setScreen('home')}>
          Back
        </button>
      </div>
    );
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setMessage({ text: 'Display name cannot be empty', type: 'error' });
      return;
    }
    if (displayName.trim().length > 30) {
      setMessage({ text: 'Display name must be 30 characters or less', type: 'error' });
      return;
    }

    setSaving(true);
    setMessage(null);
    const success = await updateProfile(displayName.trim(), avatarUrl.trim() || undefined);
    setSaving(false);

    if (success) {
      setMessage({ text: 'Profile updated!', type: 'success' });
    } else {
      setMessage({ text: 'Failed to update profile', type: 'error' });
    }
  }

  return (
    <div className="screen profile-screen">
      <h1>Profile</h1>

      <div className="profile-card">
        <div className="profile-avatar-section">
          {(avatarUrl || user.avatarUrl) ? (
            <img src={avatarUrl || user.avatarUrl} alt="" className="profile-avatar-large" />
          ) : (
            <div className="profile-avatar-placeholder">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="profile-form">
          <label className="profile-label">
            Display Name
            <input
              type="text"
              className="profile-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              placeholder="Enter display name"
            />
          </label>

          <label className="profile-label">
            Avatar URL
            <input
              type="text"
              className="profile-input"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
            <span className="profile-hint">Paste a link to any image, or leave blank to use your OAuth avatar</span>
          </label>
        </div>

        {message && (
          <div className={`profile-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="profile-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn btn-secondary" onClick={() => game.setScreen('home')}>
            Back
          </button>
        </div>
      </div>

      <div className="profile-account-section">
        <p className="profile-account-id">Account ID: {user.id}</p>
        <button className="btn btn-small profile-logout" onClick={() => { logout(); game.setScreen('home'); }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
