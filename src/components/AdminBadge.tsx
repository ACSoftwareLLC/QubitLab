interface AdminBadgeProps {
  className?: string;
}

export function AdminBadge({ className }: AdminBadgeProps) {
  return (
    <i
      className={`bi bi-shield-fill-check admin-badge ${className ?? ''}`}
      title="Admin"
      aria-label="Admin"
    />
  );
}
