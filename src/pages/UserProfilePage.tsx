import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getUserProfile, type PublicUserProfile } from "../api/users";
import { AdminBadge } from "../components/AdminBadge";
import { QuantumField } from "../components/QuantumField";

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    const load = async () => {
      setProfile(null);
      setError(null);
      try {
        const p = await getUserProfile(username);
        if (!cancelled) setProfile(p);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load profile",
          );
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        {error && <div className="auth-message error">{error}</div>}

        {!profile && !error && <p className="page-muted">Loading profile…</p>}

        {profile && (
          <div className="profile-card">
            <div className="profile-header">
              {profile.pfpUrl ? (
                <img className="profile-avatar" src={profile.pfpUrl} alt="" />
              ) : (
                <span className="profile-avatar profile-avatar-fallback">
                  {profile.displayName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="profile-titles">
                <h1 className="profile-name">
                  {profile.displayName}
                  {profile.badge === "admin" && (
                    <AdminBadge className="profile-admin-badge" />
                  )}
                </h1>
                <p className="profile-username">@{profile.username}</p>
                <p className="profile-joined">
                  Member since {profile.memberSince ?? "—"}
                </p>
              </div>
            </div>

            {profile.bio ? (
              <div className="profile-section">
                <h2>About</h2>
                <p className="profile-bio">{profile.bio}</p>
              </div>
            ) : (
              <p className="page-muted">This user has not written a bio yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
