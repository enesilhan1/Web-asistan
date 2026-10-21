// GitHub araçları (docs/SPEC.md §10): repo bilgisi ve dosya ağacı GitHub
// API'sinden, dosya içerikleri raw.githubusercontent.com'dan. Hepsi
// "github.com" sitesi sayılır (§9). İsteğe bağlı token yalnızca GitHub'a
// gönderilir.

import { izinIste } from './gezinme.js';
import { AracHatasi, baslangicAl, sayfaCiktisi } from './sayfa.js';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const EN_FAZLA_SATIR = 1500;
const EN_FAZLA_DOSYA = 5 * 1024 * 1024;

/**
 * "sahip/repo", "https://github.com/sahip/repo/..." ya da
 * "git@github.com:sahip/repo.git" → {sahip, ad}.
 */
export function depoCoz(ham) {
  const t = String(ham ?? '').trim();
  const m =
    t.match(/^(?:https?:\/\/)?(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+)/i) ??
    t.match(/^git@github\.com:([\w.-]+)\/([\w.-]+)/i) ??
    t.match(/^([\w.-]+)\/([\w.-]+)\/?$/);
  if (!m) throw new AracHatasi('"depo" "sahip/repo" biçiminde ya da bir GitHub repo adresi olmalı.');
  return { sahip: m[1], ad: m[2].replace(/\.git$/i, '') };
}

const yolKodla = (yol) => yol.split('/').map(encodeURIComponent).join('/');

async function githubIstegi(ortam, url, { json = true } = {}) {
  const f = ortam.fetch ?? ((...a) => globalThis.fetch(...a));
  const basliklar = json
    ? { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }
    : {};
  if (ortam.githubAnahtari) basliklar.authorization = `Bearer ${ortam.githubAnahtari}`;
  const zamanAsimi = AbortSignal.timeout(30_000);
  let yanit;
  try {
    yanit = await f(url, {
      headers: basliklar,
      credentials: 'omit',
      signal: ortam.sinyal ? AbortSignal.any([ortam.sinyal, zamanAsimi]) : zamanAsimi,
    });
  } catch {
    if (ortam.sinyal?.aborted) throw new AracHatasi('Durduruldu.');
    throw new AracHatasi("GitHub'a bağlanılamadı (internet bağlantısı ya da zaman aşımı).");
  }

  if (yanit.ok) return json ? yanit.json() : yanit.text();

  const kalan = yanit.headers.get('x-ratelimit-remaining');
  if ((yanit.status === 403 || yanit.status === 429) && (kalan === '0' || yanit.status === 429)) {
    const sifirlanma = Number(yanit.headers.get('x-ratelimit-reset'));
    const dakika = Number.isFinite(sifirlanma) && sifirlanma > 0 ? Math.max(1, Math.ceil((sifirlanma * 1000 - Date.now()) / 60000)) : null;
    throw new AracHatasi(
      'GitHub istek sınırına ulaşıldı' +
        (dakika ? ` (yaklaşık ${dakika} dakika sonra sıfırlanır)` : '') +
        (ortam.githubAnahtari
          ? '.'
          : ". Anahtarsız sınır saatte 60 istek; kullanıcı Ayarlar'a GitHub token'ı girerse sınır yükselir.") +
        ' Bu sırada sayfayi_ac ile github.com sayfalarını gezebilirsin.',
    );
  }
  if (yanit.status === 401) {
    throw new AracHatasi("GitHub token'ı geçersiz ya da süresi dolmuş; kullanıcı Ayarlar'dan kontrol etmeli.");
  }
  if (yanit.status === 404) {
    throw new AracHatasi(
      'Bulunamadı (404). Repo, dal ya da dosya yolu yanlış olabilir' +
        (ortam.githubAnahtari ? '.' : "; repo özel ise kullanıcı Ayarlar'a GitHub token'ı girmeli."),
    );
  }
  throw new AracHatasi(`GitHub isteği başarısız oldu (HTTP ${yanit.status}).`);
}

function boyutYaz(bayt) {
  if (bayt == null) return '';
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toFixed(1)} KB`;
  return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
}

export async function githubRepoAgaci(girdi, ortam) {
  const { sahip, ad } = depoCoz(girdi?.depo);
  await izinIste(ortam, 'https://github.com/');
  const repo = await githubIstegi(ortam, `${API}/repos/${sahip}/${ad}`);
  const dal = String(girdi?.dal ?? '').trim() || repo.default_branch;
  const agac = await githubIstegi(ortam, `${API}/repos/${sahip}/${ad}/git/trees/${encodeURIComponent(dal)}?recursive=1`);

  const onek = String(girdi?.yol ?? '').trim().replace(/^\/+/, '');
  const kayitlar = (agac.tree ?? [])
    .filter((k) => !onek || k.path === onek.replace(/\/$/, '') || k.path.startsWith(onek.endsWith('/') ? onek : `${onek}/`))
    .sort((a, b) => a.path.localeCompare(b.path));

  const dosya = kayitlar.filter((k) => k.type === 'blob').length;
  const klasor = kayitlar.filter((k) => k.type === 'tree').length;
  const satirlar = [
    `Repo: ${repo.full_name}${repo.description ? ` — ${repo.description}` : ''}`,
    `Adres: ${repo.html_url}`,
  ];
  const bilgi = [
    repo.language && `Ana dil: ${repo.language}`,
    `Yıldız: ${repo.stargazers_count ?? 0}`,
    `Fork: ${repo.forks_count ?? 0}`,
    `Varsayılan dal: ${repo.default_branch}`,
    repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' && `Lisans: ${repo.license.spdx_id}`,
    repo.archived && 'Arşivlenmiş',
    repo.fork && 'Bu bir fork',
    repo.private && 'Özel repo',
  ].filter(Boolean);
  satirlar.push(bilgi.join(' | '));
  if (repo.topics?.length) satirlar.push(`Konular: ${repo.topics.join(', ')}`);
  if (repo.homepage) satirlar.push(`Web sitesi: ${repo.homepage}`);
  satirlar.push(
    `Dal: ${dal}${onek ? ` | Klasör: ${onek}` : ''} | ${dosya} dosya, ${klasor} klasör` +
      (agac.truncated ? ' | UYARI: repo çok büyük, GitHub ağacın bir kısmını verdi; "yol" ile klasör klasör bak.' : ''),
  );
  satirlar.push('--- DOSYA AĞACI (klasörler "/" ile biter) ---');
  if (!kayitlar.length) satirlar.push(onek ? `"${onek}" altında bir şey yok.` : '(boş repo)');
  for (const k of kayitlar.slice(0, EN_FAZLA_SATIR)) {
    if (k.type === 'tree') satirlar.push(`${k.path}/`);
    else if (k.type === 'commit') satirlar.push(`${k.path} (alt modül)`);
    else satirlar.push(`${k.path} (${boyutYaz(k.size)})`);
  }
  if (kayitlar.length > EN_FAZLA_SATIR) {
    satirlar.push(`… ve ${kayitlar.length - EN_FAZLA_SATIR} kayıt daha. "yol" ile bir klasöre daralt.`);
  }
  satirlar.push('--- DOSYA AĞACI SONU ---');
  satirlar.push('Dosyaları github_dosya_oku ile oku (README, paket/yapılandırma dosyaları ve giriş noktalarından başlamak iyi olur).');
  return satirlar.join('\n');
}

export async function githubDosyaOku(girdi, ortam) {
  const { sahip, ad } = depoCoz(girdi?.depo);
  const yol = String(girdi?.yol ?? '').trim().replace(/^\/+/, '');
  if (!yol) throw new AracHatasi('"yol" boş olamaz (ör. "README.md").');
  const baslangic = baslangicAl(girdi);
  // HEAD: reponun varsayılan dalı (API isteği harcamadan).
  const dal = String(girdi?.dal ?? '').trim() || 'HEAD';
  await izinIste(ortam, 'https://github.com/');

  let metin = await githubIstegi(ortam, `${RAW}/${sahip}/${ad}/${yolKodla(dal)}/${yolKodla(yol)}`, { json: false });
  if (metin.slice(0, 8000).includes('\u0000')) {
    throw new AracHatasi(`${yol} ikili (metin olmayan) bir dosya; okunamaz.`);
  }
  if (metin.length > EN_FAZLA_DOSYA) metin = metin.slice(0, EN_FAZLA_DOSYA);
  return sayfaCiktisi(
    {
      baslik: `${sahip}/${ad}: ${yol}`,
      url: `https://github.com/${sahip}/${ad}/blob/${yolKodla(dal)}/${yolKodla(yol)}`,
      metin: metin.replace(/\r/g, '').trimEnd(),
    },
    baslangic,
    { devamIpucu: 'github_dosya_oku aracını aynı depo/yol ve' },
  );
}
