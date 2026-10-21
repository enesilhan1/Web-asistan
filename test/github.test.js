import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aracCalistir } from '../src/araclar/araclar.js';
import { depoCoz } from '../src/araclar/github.js';
import { PARCA_UZUNLUGU } from '../src/araclar/sayfa.js';

const REPO = {
  full_name: 'enes/proje',
  description: 'Deneme projesi',
  html_url: 'https://github.com/enes/proje',
  language: 'JavaScript',
  stargazers_count: 12,
  forks_count: 3,
  default_branch: 'main',
  topics: ['chrome-extension', 'ai'],
  license: { spdx_id: 'MIT' },
};
const AGAC = {
  truncated: false,
  tree: [
    { path: 'src', type: 'tree' },
    { path: 'README.md', type: 'blob', size: 2048 },
    { path: 'src/index.js', type: 'blob', size: 300 },
    { path: 'src/yz', type: 'tree' },
    { path: 'src/yz/a.js', type: 'blob', size: 5 * 1024 * 1024 },
    { path: 'vendor/lib', type: 'commit' },
  ],
};

function ag(haritasi) {
  const istekler = [];
  const f = async (url, secenek) => {
    istekler.push({ url, secenek });
    const y = haritasi[url];
    if (!y) return { ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => '' };
    return {
      ok: (y.durum ?? 200) < 400,
      status: y.durum ?? 200,
      headers: new Headers(y.basliklar ?? {}),
      json: async () => y.govde,
      text: async () => (typeof y.govde === 'string' ? y.govde : JSON.stringify(y.govde)),
    };
  };
  f.istekler = istekler;
  return f;
}

const cagir = async (ad, girdi, haritasi, ek = {}) => {
  const fetch = ag(haritasi);
  const sorulan = [];
  const s = await aracCalistir({ id: '1', ad, girdi }, {}, {
    fetch,
    siteIzni: async (url) => (sorulan.push(url), ek.izin ?? true),
    githubAnahtari: ek.anahtar,
  });
  return { ...s, fetch, sorulan };
};

describe('depoCoz', () => {
  it('farklı biçimler', () => {
    for (const g of [
      'enes/proje',
      'https://github.com/enes/proje',
      'github.com/enes/proje/tree/main/src',
      'https://www.github.com/enes/proje.git',
      'git@github.com:enes/proje.git',
    ]) {
      assert.deepEqual(depoCoz(g), { sahip: 'enes', ad: 'proje' }, g);
    }
    assert.throws(() => depoCoz('sadece-ad'), /sahip\/repo/);
  });
});

describe('github_repo_agaci', () => {
  const api = {
    'https://api.github.com/repos/enes/proje': { govde: REPO },
    'https://api.github.com/repos/enes/proje/git/trees/main?recursive=1': { govde: AGAC },
    'https://api.github.com/repos/enes/proje/git/trees/v2.0?recursive=1': { govde: { tree: [] } },
  };

  it('repo bilgisi ve sıralı ağaç; github.com onayı sorulur', async () => {
    const s = await cagir('github_repo_agaci', { depo: 'https://github.com/enes/proje' }, api);
    assert.equal(s.hata, undefined, s.metin);
    assert.deepEqual(s.sorulan, ['https://github.com/']);
    assert.match(s.metin, /^Repo: enes\/proje — Deneme projesi\nAdres: https:\/\/github.com\/enes\/proje\nAna dil: JavaScript \| Yıldız: 12 \| Fork: 3 \| Varsayılan dal: main \| Lisans: MIT\nKonular: chrome-extension, ai\n/);
    // Alt modül dosya sayılmaz.
    assert.match(s.metin, /Dal: main \| 3 dosya, 2 klasör/);
    const agac = s.metin.split('--- DOSYA AĞACI (klasörler "/" ile biter) ---\n')[1].split('\n--- DOSYA AĞACI SONU ---')[0];
    assert.deepEqual(agac.split('\n'), [
      'README.md (2.0 KB)',
      'src/',
      'src/index.js (300 B)',
      'src/yz/',
      'src/yz/a.js (5.0 MB)',
      'vendor/lib (alt modül)',
    ]);
    assert.equal(s.fetch.istekler[0].secenek.headers.authorization, undefined);
    assert.equal(s.fetch.istekler[0].secenek.credentials, 'omit');
  });

  it('yol ile daraltma, dal seçimi, token başlığı', async () => {
    const s = await cagir('github_repo_agaci', { depo: 'enes/proje', yol: '/src/yz' }, api, { anahtar: 'ghp_x' });
    assert.match(s.metin, /Klasör: src\/yz \| 1 dosya, 1 klasör/);
    assert.equal(s.fetch.istekler[0].secenek.headers.authorization, 'Bearer ghp_x');
    const d = await cagir('github_repo_agaci', { depo: 'enes/proje', dal: 'v2.0' }, api);
    assert.match(d.metin, /Dal: v2.0 \| 0 dosya/);
    assert.match(d.metin, /\(boş repo\)/);
  });

  it('onay reddedilirse istek atılmaz', async () => {
    const s = await cagir('github_repo_agaci', { depo: 'enes/proje' }, api, { izin: false });
    assert.equal(s.hata, true);
    assert.match(s.metin, /github.com sitesine gitmeye izin vermedi/);
    assert.equal(s.fetch.istekler.length, 0);
  });

  it('404, istek sınırı ve geçersiz token', async () => {
    const yok = await cagir('github_repo_agaci', { depo: 'enes/yok' }, {});
    assert.match(yok.metin, /Bulunamadı \(404\).*özel ise.*token/);

    const sinir = await cagir('github_repo_agaci', { depo: 'enes/proje' }, {
      'https://api.github.com/repos/enes/proje': {
        durum: 403,
        basliklar: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) },
      },
    });
    assert.match(sinir.metin, /istek sınırına ulaşıldı \(yaklaşık 10 dakika sonra sıfırlanır\)\. Anahtarsız sınır saatte 60/);

    const token = await cagir('github_repo_agaci', { depo: 'enes/proje' }, {
      'https://api.github.com/repos/enes/proje': { durum: 401 },
    }, { anahtar: 'eski' });
    assert.match(token.metin, /token'ı geçersiz/);
  });
});

describe('github_dosya_oku', () => {
  it('raw adresinden okur (varsayılan dal HEAD), parçalar', async () => {
    const uzun = 'x'.repeat(PARCA_UZUNLUGU) + 'SON';
    const raw = {
      'https://raw.githubusercontent.com/enes/proje/HEAD/src/index.js': { govde: 'console.log(1);\r\n' },
      'https://raw.githubusercontent.com/enes/proje/main/docs/b%C3%BCy%C3%BCk%20dosya.md': { govde: uzun },
      'https://raw.githubusercontent.com/enes/proje/HEAD/logo.png': { govde: '\u0089PNG\u0000\u0000' },
    };
    const s = await cagir('github_dosya_oku', { depo: 'enes/proje', yol: '/src/index.js' }, raw);
    assert.equal(s.hata, undefined, s.metin);
    assert.match(s.metin, /^Başlık: enes\/proje: src\/index.js\nAdres: https:\/\/github.com\/enes\/proje\/blob\/HEAD\/src\/index.js\n/);
    assert.match(s.metin, /\nconsole.log\(1\);\n--- SAYFA METNİ SONU ---$/);

    const b = await cagir('github_dosya_oku', { depo: 'enes/proje', yol: 'docs/büyük dosya.md', dal: 'main' }, raw);
    assert.match(b.metin, /Devamı için github_dosya_oku aracını aynı depo\/yol ve baslangic=30000/);
    const b2 = await cagir('github_dosya_oku', { depo: 'enes/proje', yol: 'docs/büyük dosya.md', dal: 'main', baslangic: PARCA_UZUNLUGU }, raw);
    assert.match(b2.metin, /\nSON\n/);

    const ikili = await cagir('github_dosya_oku', { depo: 'enes/proje', yol: 'logo.png' }, raw);
    assert.match(ikili.metin, /ikili/);
    assert.match((await cagir('github_dosya_oku', { depo: 'enes/proje', yol: ' ' }, raw)).metin, /"yol" boş olamaz/);
  });
});
