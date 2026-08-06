import { describe, it, expect } from 'vitest';
import { classifyNote, parseChangelog } from './changelog';

describe('classifyNote', () => {
  it('classifies known keywords', () => {
    expect(classifyNote('Added a new feature')).toBe('feature');
    expect(classifyNote('Implemented login flow')).toBe('feature');
    expect(classifyNote('Fixed a race condition')).toBe('fix');
    expect(classifyNote('Removed legacy auth server')).toBe('balance');
    expect(classifyNote('Something else entirely')).toBe('other');
  });
});

describe('parseChangelog', () => {
  it('parses version headers and bullet notes', () => {
    const md = `## [0.2.0] — Title here
- Added a thing.
- Fixed a bug.

## [0.1.0]
- Initial release.`;

    const releases = parseChangelog(md);
    expect(releases).toHaveLength(2);
    expect(releases[0].version).toBe('0.2.0');
    expect(releases[0].title).toBe('Title here');
    expect(releases[0].notes).toHaveLength(2);
    expect(releases[0].notes[0]).toEqual({ type: 'feature', text: 'Added a thing.' });
    expect(releases[0].notes[1]).toEqual({ type: 'fix', text: 'Fixed a bug.' });
    expect(releases[1].version).toBe('0.1.0');
    expect(releases[1].title).toBe('');
    expect(releases[1].notes).toHaveLength(1);
  });
});
