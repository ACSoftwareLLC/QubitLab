import { Link } from 'react-router-dom';
import { AdminBadge } from './AdminBadge';

interface AuthorChipProps {
  username: string;
  displayName?: string;
  pfpUrl?: string | null;
  isAdmin?: boolean;
  className?: string;
}

export function AuthorChip({
  username,
  displayName,
  pfpUrl,
  isAdmin,
  className,
}: AuthorChipProps) {
  const name = displayName || username;
  return (
    <Link to={`/user/${encodeURIComponent(username)}`} className={`author-chip ${className ?? ''}`}>
      {pfpUrl ? (
        <img className="author-chip-avatar" src={pfpUrl} alt="" />
      ) : (
        <span className="author-chip-avatar author-chip-fallback">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="author-chip-name">{name}</span>
      {isAdmin && <AdminBadge />}
    </Link>
  );
}
