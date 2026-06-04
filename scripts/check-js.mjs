// JSモジュール検証: 構文エラー + import/export名の不整合を検出
// 用法: node --experimental-vm-modules scripts/check-js.mjs
// デプロイ前CI(pages.yml)とローカル検証の両方で使う
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js');
const cache = {};

function load(file) {
  if (cache[file]) return cache[file];
  const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
  const m = new vm.SourceTextModule(src, { identifier: file });
  cache[file] = m;
  return m;
}

// 静的importの解決。link()がexport名の存在まで検証してくれる
const linker = (spec) => load(spec.replace(/^\.\//, ''));

let failed = false;
for (const f of fs.readdirSync(jsDir).filter(x => x.endsWith('.js')).sort()) {
  try {
    const m = load(f);
    if (m.status === 'unlinked') await m.link(linker);
    console.log(`OK  ${f}`);
  } catch (e) {
    failed = true;
    console.error(`NG  ${f}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
