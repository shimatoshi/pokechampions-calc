#!/usr/bin/env node
// static/img/ の .webp を全列挙し、sw.js の SPRITE_PRECACHE 配列を書き換える。
// スプライトを追加/削除したら `node scripts/gen-sprite-list.mjs` を実行すること。
// （実行後はSWのCACHEバージョンも手動でbumpする。配信スナップショットを一括差し替えするため）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');
const imgDir = join(root, 'img');
const swPath = join(root, 'sw.js');

const sprites = readdirSync(imgDir)
  .filter(f => f.endsWith('.webp'))
  .sort();

const block = sprites.map(f => `  './img/${f}',`).join('\n');
const sw = readFileSync(swPath, 'utf8');

const re = /const SPRITE_PRECACHE = \[\n[\s\S]*?\n\];/;
if (!re.test(sw)) {
  console.error('SPRITE_PRECACHE 配列が sw.js に見つかりません');
  process.exit(1);
}
const next = sw.replace(re, `const SPRITE_PRECACHE = [\n${block}\n];`);
writeFileSync(swPath, next);
console.log(`SPRITE_PRECACHE updated: ${sprites.length} sprites`);
