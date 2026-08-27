interface TemplateBannerProps {
  name: string;
  onDismiss: () => void;
}

export function TemplateBanner({ name, onDismiss }: TemplateBannerProps) {
  return (
    <div className="template-loaded-banner" role="status">
      Loaded template: <strong>{name}</strong>
      <button
        type="button"
        aria-label="Dismiss template banner"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
