/**
 * Dumps the available icon names (set `type: 'icons'`) from the Firestore
 * `icons` collection to stdout, one per line as `name — index keywords`.
 *
 * Generates the fast-lookup snapshot used by the `icons` skill:
 *   node .claude/skills/icons/scripts/dump-icon-names.mjs > .claude/skills/icons/references/icon-names.txt
 *
 * Requires: gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const SET = process.argv[2] ?? 'icons'; // optional: pass another icon set as the first arg

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();

const snap = await db.collection('icons').where('type', '==', SET).get();

const rows = snap.docs
  .map(d => d.data())
  .filter(d => !d.isArchived)
  .map(d => ({ name: d.name ?? '', index: (d.index ?? '').trim() }))
  .filter(r => r.name.length > 0);

// de-duplicate by name (icons can exist per tenant) and sort
const byName = new Map();
for (const r of rows) if (!byName.has(r.name)) byName.set(r.name, r.index);
const names = [...byName.keys()].sort((a, b) => a.localeCompare(b));

process.stdout.write(`# icon set '${SET}' — ${names.length} icons — generated ${new Date().toISOString().slice(0, 10)}\n`);
process.stdout.write(`# regenerate: node .claude/skills/icons/scripts/dump-icon-names.mjs ${SET === 'icons' ? '' : SET}\n`);
for (const name of names) {
  const index = byName.get(name);
  process.stdout.write(index ? `${name} — ${index}\n` : `${name}\n`);
}
