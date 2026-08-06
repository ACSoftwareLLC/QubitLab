export type PatchNoteType = 'feature' | 'fix' | 'balance' | 'other';

export type PatchNote = {
  type: PatchNoteType;
  text: string;
};

export type Release = {
  version: string;
  title: string;
  date: string | null;
  notes: PatchNote[];
};

const TYPE_KEYWORDS: Record<string, PatchNoteType> = {
  added: 'feature',
  implemented: 'feature',
  created: 'feature',
  configured: 'feature',
  enabled: 'feature',
  verified: 'feature',
  documented: 'feature',
  removed: 'balance',
  replaced: 'balance',
  converted: 'balance',
  updated: 'balance',
  fixed: 'fix',
  resolved: 'fix',
};

export function classifyNote(text: string): PatchNoteType {
  const lower = text.toLowerCase();
  for (const [keyword, type] of Object.entries(TYPE_KEYWORDS)) {
    if (lower.startsWith(keyword)) return type;
  }
  return 'other';
}

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  const lines = markdown.split('\n');
  let current: Release | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const headerMatch = line.match(/^## \[(\d+\.\d+\.\d+)\]\s*(?:[—-]\s*(.*))?$/);
    if (headerMatch) {
      if (current) releases.push(current);
      current = {
        version: headerMatch[1],
        title: headerMatch[2]?.trim() ?? '',
        date: null,
        notes: [],
      };
      continue;
    }

    if (!current) continue;

    const noteMatch = line.match(/^[-*]\s+(.+)$/);
    if (noteMatch) {
      const text = noteMatch[1].trim();
      current.notes.push({ type: classifyNote(text), text });
    }
  }

  if (current) releases.push(current);
  return releases;
}
