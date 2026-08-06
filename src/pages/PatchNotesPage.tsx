import { QuantumField } from '../components/QuantumField';

const releases = [
  {
    version: '0.9.0',
    date: '2026-08-05',
    notes: [
      { type: 'feature', text: 'New landing page for guests and home dashboard for logged-in users.' },
      { type: 'feature', text: 'Added Blog and Patch Notes pages with live animated backgrounds.' },
      { type: 'feature', text: 'Navigation now highlights Home, Blog, and Patch Notes for easier discovery.' },
      { type: 'fix', text: 'Improved auth session checks on page reload.' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-07-12',
    notes: [
      { type: 'feature', text: 'Marketplace: browse and import public circuits shared by the community.' },
      { type: 'feature', text: 'Circuit thumbnails are now auto-generated when saving.' },
      { type: 'balance', text: 'Reduced initial gate-line spacing for denser circuit layouts.' },
      { type: 'fix', text: 'Fixed gate drag preview sticking to the cursor on rapid drops.' },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-06-20',
    notes: [
      { type: 'feature', text: 'WASM simulator now runs multi-step circuits without blocking the UI.' },
      { type: 'feature', text: 'Account page: change username, password, and upload an avatar.' },
      { type: 'fix', text: 'Resolved stage zoom drift when switching between tabs.' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-05-08',
    notes: [
      { type: 'feature', text: 'Initial public beta release with visual editor and save/load.' },
      { type: 'balance', text: 'Default gate palette tuned for beginner-friendly circuits.' },
    ],
  },
];

const badgeClass = (type: string) => {
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

const badgeLabel = (type: string) => {
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
                  <span className="patch-date">{new Date(release.date).toLocaleDateString()}</span>
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
      </div>
    </div>
  );
}
