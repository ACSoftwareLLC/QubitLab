import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import '../components/AuthPage.css';

export function AccountPage() {
  const { user, updateUsername, updatePassword, updateProfile, uploadAvatar } = useAuth();

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username ?? '');
  const [usernameMsg, setUsernameMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);

  if (!user) return null;

  const handleAvatarPick = (file: File | null) => {
    setAvatarMsg(null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleAvatarSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setAvatarMsg({ text: 'Choose an image first.', ok: false });
      return;
    }
    setUploading(true);
    const err = await uploadAvatar(file);
    setUploading(false);
    setAvatarMsg(err ? { text: err, ok: false } : { text: 'Profile picture updated.', ok: true });
    if (!err) {
      handleAvatarPick(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUsernameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUsernameMsg(null);
    const err = await updateUsername(username.trim());
    setUsernameMsg(err ? { text: err, ok: false } : { text: 'Username updated.', ok: true });
  };

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    const err = await updateProfile({
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      bio: bio.trim() || null,
    });
    setSavingProfile(false);
    setProfileMsg(err ? { text: err, ok: false } : { text: 'Profile updated.', ok: true });
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'New passwords do not match.', ok: false });
      return;
    }
    const err = await updatePassword(currentPassword, newPassword);
    if (err) {
      setPasswordMsg({ text: err, ok: false });
    } else {
      setPasswordMsg({ text: 'Password updated.', ok: true });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const shownAvatar = avatarPreview ?? user.pfpUrl;

  return (
    <div className="auth-container account-container">
      <div className="account-stack">
        <div className="auth-card">
          <h1>Profile picture</h1>
          <p className="auth-subtitle">Shown next to your username and on your circuits.</p>
          <form onSubmit={handleAvatarSubmit}>
            <div className="auth-avatar-row">
              {shownAvatar ? (
                <img className="auth-avatar" src={shownAvatar} alt="Profile" />
              ) : (
                <span className="auth-avatar app-avatar-fallback">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              )}
              <input
                ref={fileInputRef}
                className="auth-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleAvatarPick(e.target.files?.[0] ?? null)}
              />
            </div>
            <button className="auth-submit" type="submit" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload photo'}
            </button>
          </form>
          {avatarMsg && (
            <div className={`auth-message ${avatarMsg.ok ? 'success' : 'error'}`}>{avatarMsg.text}</div>
          )}
        </div>

        <div className="auth-card">
          <h1>Username</h1>
          <p className="auth-subtitle">This is how other users will see you.</p>
          <form onSubmit={handleUsernameSubmit}>
            <label className="auth-label" htmlFor="account-username">
              Username
            </label>
            <input
              id="account-username"
              className="auth-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              autoComplete="username"
            />
            <button className="auth-submit" type="submit">
              Update username
            </button>
          </form>
          {usernameMsg && (
            <div className={`auth-message ${usernameMsg.ok ? 'success' : 'error'}`}>{usernameMsg.text}</div>
          )}
        </div>

        <div className="auth-card">
          <h1>Public profile</h1>
          <p className="auth-subtitle">First and last name are optional. Shown on your public page.</p>
          <form onSubmit={handleProfileSubmit}>
            <label className="auth-label" htmlFor="account-first-name">
              First name
            </label>
            <input
              id="account-first-name"
              className="auth-input"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={64}
              placeholder="Ada"
            />

            <label className="auth-label" htmlFor="account-last-name">
              Last name
            </label>
            <input
              id="account-last-name"
              className="auth-input"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={64}
              placeholder="Lovelace"
            />

            <label className="auth-label" htmlFor="account-bio">
              About me
            </label>
            <textarea
              id="account-bio"
              className="auth-input"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="A little about yourself…"
            />

            <button className="auth-submit" type="submit" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>
          {profileMsg && (
            <div className={`auth-message ${profileMsg.ok ? 'success' : 'error'}`}>{profileMsg.text}</div>
          )}
        </div>

        <div className="auth-card">
          <h1>Password</h1>
          <p className="auth-subtitle">Changing your password signs out your other sessions.</p>
          <form onSubmit={handlePasswordSubmit}>
            <label className="auth-label" htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              className="auth-input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <label className="auth-label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              className="auth-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <label className="auth-label" htmlFor="confirm-new-password">
              Confirm new password
            </label>
            <input
              id="confirm-new-password"
              className="auth-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button className="auth-submit" type="submit">
              Change password
            </button>
          </form>
          {passwordMsg && (
            <div className={`auth-message ${passwordMsg.ok ? 'success' : 'error'}`}>{passwordMsg.text}</div>
          )}
        </div>
      </div>
    </div>
  );
}
