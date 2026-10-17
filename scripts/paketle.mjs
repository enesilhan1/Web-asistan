// Eklentiyi tarayıcı mağazasına / Firefox imzalamaya yüklenecek ZIP olarak
// paketler: dist/web-asistani-<sürüm>.zip. Yalnızca commit'lenmiş dosyaları
// alır (git archive); testler ve belgeler pakete girmez.
//   npm run paketle

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const kok = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('manifest.json', kok), 'utf8'));
const degisiklik = execFileSync('git', ['status', '--porcelain', '--', 'manifest.json', '_locales', 'icons', 'popup', 'src'], {
  cwd: kok,
  encoding: 'utf8',
}).trim();
if (degisiklik) {
  console.error('Commit edilmemiş değişiklikler var (pakete girmez):\n' + degisiklik);
  process.exit(1);
}

mkdirSync(new URL('dist', kok), { recursive: true });
const hedef = `dist/web-asistani-${version}.zip`;
execFileSync('git', ['archive', '--format=zip', '-o', hedef, 'HEAD', 'manifest.json', '_locales', 'icons', 'popup', 'src'], {
  cwd: kok,
});
console.log(`Hazır: ${hedef}`);
