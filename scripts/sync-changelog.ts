import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'CHANGELOG.md');
const dest = resolve(process.cwd(), 'public', 'CHANGELOG.md');

copyFileSync(root, dest);
console.log('Synced CHANGELOG.md -> public/CHANGELOG.md');
