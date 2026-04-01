import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useGame } from '../context/GameContext.tsx';

export default function ProfileScreen() {
  const { user, updateProfile, uploadAvatar, logout } = useAuth();
  const game = useGame();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const avatarSrc = previewUrl || user.avatarUrl;

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
    const success = await updateProfile(displayName.trim());
    setSaving(false);

    if (success) {
      setMessage({ text: 'Profile updated!', type: 'success' });
    } else {
      setMessage({ text: 'Failed to update profile', type: 'error' });
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate client-side
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMessage({ text: 'Only PNG, JPEG, and WebP images are allowed', type: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'Image must be under 5MB', type: 'error' });
      return;
    }

    // Show local preview immediately
    setPreviewUrl(URL.createObjectURL(file));

    // Upload (resized to 256x256 by AuthContext)
    setUploading(true);
    setMessage(null);
    const url = await uploadAvatar(file);
    setUploading(false);

    if (url) {
      setPreviewUrl(null); // clear preview, use the server URL now
      setMessage({ text: 'Avatar uploaded!', type: 'success' });
    } else {
      setPreviewUrl(null);
      setMessage({ text: 'Failed to upload avatar', type: 'error' });
    }
  }

  return (
    <div className="screen profile-screen">
      <h1>Profile</h1>

      <div className="profile-card">
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="profile-avatar-large" />
            ) : (
              <div className="profile-avatar-placeholder">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="profile-avatar-overlay">
              {uploading ? 'Uploading...' : 'Change'}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <span className="profile-hint">Click avatar to upload (PNG, JPEG, WebP, max 5MB)</span>
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
