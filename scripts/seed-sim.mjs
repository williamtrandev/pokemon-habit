#!/usr/bin/env node
// Seed the booted iOS simulator's AsyncStorage with deterministic creature
// states — for manual QA and as a fixture for Maestro E2E.
//
// Usage:
//   node scripts/seed-sim.mjs            # inject demo herd, relaunch app
//   node scripts/seed-sim.mjs --empty    # reset to empty state
//   node scripts/seed-sim.mjs --no-launch
//
// Mirrors RCTAsyncLocalStorage on-disk format: values >1024 chars live in a
// file named md5(key); the manifest holds null for that key.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLE_ID = 'com.anonymous.pokemon-habit';
const KEY = 'pokemon-habit:data:v3';
const TODAY = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const EMPTY = args.includes('--empty');
const NO_LAUNCH = args.includes('--no-launch');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}
function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
const streak = (days) => Object.fromEntries(Array.from({ length: days }, (_, i) => [addDays(TODAY, -i), true]));
const past = (ago, len) => Object.fromEntries(Array.from({ length: len }, (_, i) => [addDays(TODAY, -(ago + i)), true]));

function demoData() {
  const habits = [
    { id: 'h1', title: 'Uống đủ nước', reminder: { hour: 8, minute: 0 }, notificationId: null, createdAt: 1,
      completions: streak(5),
      creature: { line: [{ id: 4, name: 'Charmander' }, { id: 5, name: 'Charmeleon' }, { id: 6, name: 'Charizard' }],
        color: '#F97316', xp: 150, vitality: 92, fainted: false, branch: null, bestStreak: 5, everFinal: false, megas: [], megaPick: 0 } },
    { id: 'h2', title: 'Tập thể dục', reminder: { hour: 18, minute: 30 }, notificationId: null, createdAt: 2,
      completions: streak(16),
      creature: { line: [{ id: 1, name: 'Bulbasaur' }, { id: 2, name: 'Ivysaur' }, { id: 3, name: 'Venusaur' }],
        color: '#22C55E', xp: 660, vitality: 100, fainted: false, branch: 'legendary', bestStreak: 16, everFinal: true,
        megas: [{ id: 10033, name: 'Mega Venusaur' }], megaPick: 0 } },
    { id: 'h3', title: 'Đọc sách', reminder: null, notificationId: null, createdAt: 3,
      completions: past(6, 4),
      creature: { line: [{ id: 7, name: 'Squirtle' }, { id: 8, name: 'Wartortle' }, { id: 9, name: 'Blastoise' }],
        color: '#3B82F6', xp: 60, vitality: 0, fainted: true, branch: null, bestStreak: 4, everFinal: false, megas: [], megaPick: 0 } },
    { id: 'h4', title: 'Thiền 5 phút', reminder: { hour: 22, minute: 0 }, notificationId: null, createdAt: 4,
      completions: {},
      creature: { line: [{ id: 16, name: 'Pidgey' }, { id: 17, name: 'Pidgeotto' }, { id: 18, name: 'Pidgeot' }],
        color: '#A855F7', xp: 0, vitality: 85, fainted: false, branch: null, bestStreak: 0, everFinal: false, megas: [], megaPick: 0 } },
  ];
  return { habits, lastActiveDate: TODAY, soundOn: true, hapticsOn: true, version: 3 };
}

const data = EMPTY
  ? { habits: [], lastActiveDate: TODAY, soundOn: true, hapticsOn: true, version: 3 }
  : demoData();

// Locate the app's AsyncStorage dir on the booted sim.
let container;
try {
  container = sh(`xcrun simctl get_app_container booted ${BUNDLE_ID} data`);
} catch {
  console.error(`✗ App ${BUNDLE_ID} not installed on the booted simulator. Run \`npm run ios\` first.`);
  process.exit(1);
}
const dir = join(container, 'Library', 'Application Support', BUNDLE_ID, 'RCTAsyncLocalStorage_V1');
mkdirSync(dir, { recursive: true });

// App must be terminated or it overwrites our seed on next save().
try { sh(`xcrun simctl terminate booted ${BUNDLE_ID}`); } catch {}

const json = JSON.stringify(data);
if (json.length <= 1024) {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ [KEY]: json }));
} else {
  const md5 = createHash('md5').update(KEY).digest('hex');
  writeFileSync(join(dir, md5), json);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ [KEY]: null }));
}
console.log(`✓ Seeded ${data.habits.length} habit(s) → ${EMPTY ? 'empty' : 'demo herd'}`);

if (!NO_LAUNCH) {
  sh(`xcrun simctl launch booted ${BUNDLE_ID}`);
  console.log('✓ Relaunched app');
}
