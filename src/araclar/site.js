// Site onayı için "site" kimliği (docs/SPEC.md §9): kayıtlı alan adı
// (ör. docs.github.com → github.com, www.hepsiburada.com.tr →
// hepsiburada.com.tr). Tam Public Suffix List yerine yaygın ikinci düzey
// uzantıların listesi kullanılır; listede olmayan bir uzantıda site biraz
// dar tutulur (daha çok onay sorulur, daha az değil).

const IKINCI_DUZEY = new Set([
  // Türkiye
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr', 'k12.tr', 'gen.tr', 'av.tr', 'bel.tr',
  'pol.tr', 'tsk.tr', 'web.tr', 'biz.tr', 'info.tr', 'name.tr', 'tv.tr', 'dr.tr',
  // Yaygın diğerleri
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr', 'ac.kr', 'go.kr',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'co.nz', 'org.nz', 'ac.nz', 'govt.nz',
  'co.za', 'org.za', 'gov.za', 'ac.za',
  'com.mx', 'com.ar', 'com.co', 'com.sg', 'com.hk', 'com.tw', 'com.my', 'com.ua',
  'co.id', 'co.il', 'com.pl', 'com.ru', 'com.sa', 'com.eg', 'com.pk', 'com.ng',
  // Kullanıcılara alt alan adı veren barındırma servisleri: her alt alan ayrı site.
  'github.io', 'gitlab.io', 'pages.dev', 'vercel.app', 'netlify.app', 'herokuapp.com',
  'blogspot.com', 'wordpress.com', 'web.app', 'firebaseapp.com', 'workers.dev',
]);

/** Adres karşılaştırması için anahtar: çapasız (#...) tam adres; geçersizse null. */
export function adresAnahtari(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Adresin site kimliği; http(s) değilse null.
 * @param {string} url
 */
export function siteAnahtari(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const ana = u.hostname.toLowerCase().replace(/\.$/, '');
  // IP adresi ya da tek parçalı ad (localhost): olduğu gibi.
  if (/^[\d.]+$/.test(ana) || ana.includes(':') || !ana.includes('.')) return ana;
  const parcalar = ana.split('.');
  const son2 = parcalar.slice(-2).join('.');
  const n = IKINCI_DUZEY.has(son2) ? 3 : 2;
  return parcalar.slice(-n).join('.');
}
