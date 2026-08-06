import { useEffect, useState } from 'react';
import { QuantumField } from '../components/QuantumField';
import { parseChangelog, type Release, type PatchNoteType } from '../utils/changelog';

const badgeClass = (type: PatchNoteType) => {
  switch (type) {
    case 'feature':
      return 'patch-badge feature';
    case 'fix':
      return 'patch-badge fix';
    case 'balance':
      return 'patch-badge balance';
    default:
      return 'patch-badge';
  }
};

const badgeLabel = (type: PatchNoteType) => {
  switch (type) {
    case 'feature':
      return 'New';
    case 'fix':
      return 'Fix';
    case 'balance':
      return 'Balance';
    default:
      return type;
  }
};

export function PatchNotesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/CHANGELOG.md')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load patch notes.');
        return res.text();
      })
      .then((text) => {
        setReleases(parseChangelog(text));
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      });
  }, []);

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        <div className="content-header">
          <h1 className="content-title">
            <i className="bi bi-megaphone" /> Patch notes
          </h1>
          <p className="content-subtitle">A changelog of features, fixes, and balance tweaks.</p>
        </div>

        {loading && <p>Loading patch notes…</p>}
        {error && <p>Error: {error}</p>}

        {!loading && !error && (
          <div className="patch-timeline">
            {releases.map((release, index) => (
              <div
                key={release.version}
                className="patch-release"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="patch-release-marker">
                  <span className="patch-dot" />
                  <span className="patch-line" />
                </div>
                <div className="patch-release-body">
                  <div className="patch-release-header">
                    <h2 className="patch-version">v{release.version}</h2>
                    {release.title && <span className="patch-date">{release.title}</span>}
                  </div>
                  <ul className="patch-notes">
                    {release.notes.map((note, i) => (
                      <li key={i} className="patch-note">
                        <span className={badgeClass(note.type)}>{badgeLabel(note.type)}</span>
                        <span className="patch-note-text">{note.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
