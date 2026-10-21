// Arka planda indirilen HTML'i okunabilir metne çevirir. Chrome'un arka plan
// betiğinde (service worker) DOMParser olmadığı için tarayıcı API'si
// kullanmadan, düz metin işlemleriyle çalışır. Gizli (display:none)
// bölümlerin metni de HTML'de olduğu için dahil olur; akordeon içerikleri
// çoğu sitede böylece okunur.

/** Sayfa başına modele verilen en fazla bağlantı sayısı. */
export const EN_FAZLA_BAGLANTI = 150;

const ADLI_VARLIKLAR = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', times: '×', euro: '€',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', check: '✓', deg: '°',
};

export function varliklariCoz(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (tum, ad) => {
    if (ad[0] === '#') {
      const kod = ad[1] === 'x' || ad[1] === 'X' ? parseInt(ad.slice(2), 16) : parseInt(ad.slice(1), 10);
      try {
        return Number.isFinite(kod) && kod > 0 ? String.fromCodePoint(kod) : tum;
      } catch {
        return tum;
      }
    }
    return ADLI_VARLIKLAR[ad.toLowerCase()] ?? tum;
  });
}

/** Sayfa içinde ve burada aynı kurallarla boşluk sadeleştirme. */
export function temizle(t) {
  return (t ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t ​]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const tekSatir = (t) => temizle(t).replace(/\s+/g, ' ');

function nitelik(etiket, ad) {
  const m = etiket.match(new RegExp(`\\s${ad}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? varliklariCoz(m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** Göreli adresi mutlak yapar; http(s) değilse null. */
export function mutlakAdres(href, taban) {
  try {
    const u = new URL(href, taban);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Sayfadaki bağlantılar: aynı sayfaya giden çapa (#...) bağlantıları ve
 * tekrarlar atılır.
 * @param {{metin: string, url: string}[]} ham
 */
export function baglantilariSadelestir(ham, sayfaUrl) {
  const sayfa = (() => {
    try {
      const u = new URL(sayfaUrl);
      u.hash = '';
      return u.href;
    } catch {
      return '';
    }
  })();
  const gorulen = new Set();
  const sonuc = [];
  for (const b of ham) {
    let u;
    try {
      u = new URL(b.url);
    } catch {
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    u.hash = '';
    if (u.href === sayfa || gorulen.has(u.href)) continue;
    gorulen.add(u.href);
    sonuc.push({ metin: tekSatir(b.metin).slice(0, 100), url: u.href });
    if (sonuc.length >= EN_FAZLA_BAGLANTI) break;
  }
  return sonuc;
}

const BLOK = 'address|article|aside|blockquote|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|header|hr|main|nav|ol|p|pre|section|table|tbody|thead|tfoot|tr|ul|summary|details';

/**
 * @param {string} html
 * @param {string} url  sayfanın (son) adresi; göreli bağlantılar buna göre çözülür
 * @returns {{baslik: string, url: string, dil: string, aciklama: string, metin: string,
 *   baglantilar: {metin: string, url: string}[]}}
 */
export function htmldenMetin(html, url) {
  let h = String(html ?? '');
  const baslik = tekSatir(varliklariCoz((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, '')));
  const dil = nitelik(h.match(/<html\b[^>]*>/i)?.[0] ?? '', 'lang') ?? '';
  const metaEtiketi = [...h.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((e) => /\b(name|property)\s*=\s*["']?(description|og:description)["'\s>]/i.test(e));
  const aciklama = metaEtiketi ? tekSatir(nitelik(metaEtiketi, 'content') ?? '').slice(0, 500) : '';
  const taban = mutlakAdres(nitelik(h.match(/<base\b[^>]*>/i)?.[0] ?? '', 'href') ?? '', url) ?? url;

  // Görünmeyen ve metin olmayan kısımlar.
  h = h
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|canvas|iframe|object|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(input|select|textarea|button)\b[^>]*\btype\s*=\s*["']?hidden[^>]*>/gi, ' ');

  // Bağlantılar: metinde [metin] olarak kalır, adresleri ayrıca toplanır.
  const baglantilar = [];
  h = h.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_, nitelikler, ic) => {
    const icMetin = tekSatir(varliklariCoz(ic.replace(/<[^>]+>/g, ' ')));
    const href = nitelik(` ${nitelikler}`, 'href');
    const mutlak = href ? mutlakAdres(href, taban) : null;
    const gorunen = icMetin || nitelik(` ${nitelikler}`, 'aria-label') || nitelik(` ${nitelikler}`, 'title') || '';
    if (mutlak) baglantilar.push({ metin: gorunen, url: mutlak });
    return ` ${gorunen} `;
  });

  h = h
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])\b[^>]*>/gi, (_, d) => `\n\n${'#'.repeat(Number(d))} `)
    .replace(/<\/h[1-6]\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<img\b[^>]*>/gi, (e) => {
      const alt = tekSatir(nitelik(e, 'alt') ?? '');
      return alt ? ` [görsel: ${alt}] ` : ' ';
    })
    .replace(new RegExp(`<\\/?(?:${BLOK})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]+>/g, '');

  return {
    baslik,
    url,
    dil,
    aciklama,
    metin: temizle(varliklariCoz(h)),
    baglantilar: baglantilariSadelestir(baglantilar, url),
  };
}

/**
 * İndirilen içeriğin JavaScript ile yüklendiği için eksik olup olmadığına dair
 * tahmin: çok az metin ya da "JavaScript'i etkinleştir" uyarısı.
 */
export function eksikGorunuyor(sayfa) {
  const m = sayfa.metin;
  if (m.length < 400) return true;
  return m.length < 3000 && /(enable|turn on|activate)\s+javascript|javascript\s+(is\s+)?(required|disabled)|javascript'?i?\s*(etkinleştir|aç)/i.test(m);
}
