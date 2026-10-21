// Gezinme araçları (docs/SPEC.md §3, §9): bir adresi açıp okuma ve sayfanın
// kopyasında bölümleri açarak okuma. Kullanıcının sekmelerine dokunulmaz;
// gerekirse arka plan sekmesi açılıp iş bitince kapatılır.

import { eksikGorunuyor, htmldenMetin } from './html_metin.js';
import { AracHatasi, baslangicAl, sayfaCiktisi, sayfaMetni } from './sayfa.js';
import { siteAnahtari } from './site.js';
import { okunabilirMi } from './kisitli.js';

const INDIRME_ZAMAN_ASIMI_MS = 20_000;
const SEKME_YUKLEME_ZAMAN_ASIMI_MS = 25_000;
/** Sekme "yüklendi" dedikten sonra JavaScript'in içeriği çizmesi için. */
const CIZIM_BEKLEMESI_MS = 1200;
const EN_FAZLA_INDIRME = 5 * 1024 * 1024;
/** Bölüm açma turları (açılan bölümün içinde yeni bölümler çıkabilir). */
const GENISLETME_TURU = 3;

/**
 * Araçların dış dünyası.
 * @typedef {Object} Ortam
 * @property {any} tarayici                 chrome/browser ya da sahtesi
 * @property {typeof fetch} [fetch]
 * @property {(url: string) => Promise<boolean>} [siteIzni]  site onayı (§9); yoksa hep izinli
 * @property {AbortSignal} [sinyal]
 * @property {number} [beklemeCarpani]      testlerde beklemeleri kısaltmak için
 */

export function bekle(ms, sinyal) {
  return new Promise((coz, reddet) => {
    if (sinyal?.aborted) return reddet(new AracHatasi('Durduruldu.'));
    const t = setTimeout(() => {
      sinyal?.removeEventListener('abort', iptal);
      coz();
    }, ms);
    const iptal = () => {
      clearTimeout(t);
      reddet(new AracHatasi('Durduruldu.'));
    };
    sinyal?.addEventListener('abort', iptal, { once: true });
  });
}

const sure = (ortam, ms) => ms * (ortam.beklemeCarpani ?? 1);

/** Gidilecek adresi doğrular. */
function adresAl(ham) {
  let u;
  try {
    u = new URL(String(ham ?? '').trim());
  } catch {
    throw new AracHatasi('"url" geçerli bir tam adres olmalı (https://... ile başlayan).');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new AracHatasi('Yalnızca http(s) adreslerine gidilebilir.');
  }
  if (!okunabilirMi(u.href)) {
    throw new AracHatasi(`Tarayıcı bu sayfanın eklentilerce okunmasına izin vermiyor (${u.href}).`);
  }
  return u.href;
}

/** Site onayı; reddedilirse modele açıklayıcı hata. */
export async function izinIste(ortam, url) {
  if (!ortam.siteIzni) return;
  if (await ortam.siteIzni(url)) return;
  throw new AracHatasi(
    `Kullanıcı ${siteAnahtari(url)} sitesine gitmeye izin vermedi. Bu siteye gitme; ` +
      'gerekirse başka bir kaynak kullan ya da kullanıcıya sor.',
  );
}

/** Yönlendirme başka siteye götürdüyse o site için de onay gerekir. */
async function sonAdresIzni(ortam, istenen, son) {
  if (son && siteAnahtari(son) !== siteAnahtari(istenen)) await izinIste(ortam, son);
}

// ------------------------------------------------------------- sayfayi_ac

export async function sayfayiAc(girdi, ortam) {
  const url = adresAl(girdi?.url);
  const baslangic = baslangicAl(girdi);
  const yontem = girdi?.yontem ?? 'otomatik';
  if (!['otomatik', 'sekme'].includes(yontem)) throw new AracHatasi('"yontem" "otomatik" ya da "sekme" olmalı.');
  await izinIste(ortam, url);

  let not;
  if (yontem === 'otomatik') {
    const sonuc = await indir(url, ortam);
    if (sonuc.sayfa && !(sonuc.html && eksikGorunuyor(sonuc.sayfa))) {
      return sayfaCiktisi(sonuc.sayfa, baslangic, { devamIpucu: 'sayfayi_ac aracını aynı url ve' });
    }
    not = sonuc.sayfa
      ? 'Arka planda indirilen içerik çok kısaydı ya da JavaScript ile yükleniyor görünüyordu; sayfa arka plan sekmesinde açılıp okundu.'
      : `Sayfa arka planda indirilemedi (${sonuc.neden}); arka plan sekmesinde açılıp okundu.`;
  }

  const sayfa = await sekmedeAc(ortam, url, (id) => sekmedenOku(ortam, id));
  return sayfaCiktisi(sayfa, baslangic, {
    not,
    devamIpucu: 'sayfayi_ac aracını aynı url, yontem="sekme" ve',
  });
}

/**
 * Sayfayı arka planda indirir. Başarısızsa {neden} döner (sekme denenecek);
 * kesin hatalarda (404, PDF...) AracHatasi fırlatır.
 */
async function indir(url, ortam) {
  const f = ortam.fetch ?? ((...a) => globalThis.fetch(...a));
  const zamanAsimi = AbortSignal.timeout(sure(ortam, INDIRME_ZAMAN_ASIMI_MS));
  let yanit;
  try {
    yanit = await f(url, {
      credentials: 'include',
      redirect: 'follow',
      headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8' },
      signal: ortam.sinyal ? AbortSignal.any([ortam.sinyal, zamanAsimi]) : zamanAsimi,
    });
  } catch {
    if (ortam.sinyal?.aborted) throw new AracHatasi('Durduruldu.');
    return { neden: 'bağlantı hatası ya da zaman aşımı' };
  }

  const son = yanit.url || url;
  await sonAdresIzni(ortam, url, son);

  if (yanit.status === 404 || yanit.status === 410) {
    throw new AracHatasi(`Sayfa bulunamadı (${yanit.status}): ${son}`);
  }
  if (!yanit.ok) return { neden: `HTTP ${yanit.status}` };

  const tur = (yanit.headers.get('content-type') ?? '').toLowerCase();
  if (tur.includes('application/pdf')) {
    throw new AracHatasi('Bu adres bir PDF dosyası; PDF okunamıyor.');
  }
  if (/^(image|audio|video|font)\//.test(tur) || tur.includes('application/zip') || tur.includes('octet-stream')) {
    throw new AracHatasi(`Bu adres metin değil (${tur.split(';')[0]}); okunamıyor.`);
  }

  let govde = await yanit.text();
  if (govde.length > EN_FAZLA_INDIRME) govde = govde.slice(0, EN_FAZLA_INDIRME);

  const html = !tur || tur.includes('html') || tur.includes('xhtml');
  if (html) return { html: true, sayfa: htmldenMetin(govde, son) };
  // Düz metin, JSON, XML, Markdown, kaynak kod...
  return { html: false, sayfa: { baslik: '', url: son, metin: govde.replace(/\r/g, '') } };
}

// ------------------------------------------------------------ arka plan sekmesi

/**
 * Adresi arka plan sekmesinde açar, [islem]'i çalıştırır, sekmeyi kapatır.
 * Yönlendirmeyle başka siteye gidildiyse onay ister.
 */
export async function sekmedeAc(ortam, url, islem) {
  const { tarayici } = ortam;
  let sekme;
  try {
    sekme = await tarayici.tabs.create({ url, active: false });
  } catch (e) {
    throw new AracHatasi(`Arka plan sekmesi açılamadı (${e?.message ?? e}).`);
  }
  try {
    const yuklenen = await yuklenmesiniBekle(ortam, sekme.id);
    await bekle(sure(ortam, CIZIM_BEKLEMESI_MS), ortam.sinyal);
    if (!okunabilirMi(yuklenen.url ?? url)) {
      throw new AracHatasi(`Sayfa okunamayan bir adrese yönlendi (${yuklenen.url}).`);
    }
    await sonAdresIzni(ortam, url, yuklenen.url);
    return await islem(sekme.id);
  } finally {
    try {
      await tarayici.tabs.remove(sekme.id);
    } catch {
      // kullanıcı kapatmış olabilir
    }
  }
}

async function yuklenmesiniBekle(ortam, id) {
  const bitis = Date.now() + sure(ortam, SEKME_YUKLEME_ZAMAN_ASIMI_MS);
  let s;
  for (;;) {
    try {
      s = await ortam.tarayici.tabs.get(id);
    } catch {
      throw new AracHatasi('Arka plan sekmesi beklenmedik şekilde kapandı.');
    }
    // Firefox yeni sekmeyi gezinme başlamadan bir an "complete" + about:blank
    // olarak bildiriyor; gerçek adrese geçmeden yüklendi sayılmaz.
    const yuklendi = s.status === 'complete' && s.url && s.url !== 'about:blank';
    // Zaman aşımında da devam edilir: yavaş sitelerin çoğu bu sürede okunabilir hale gelir.
    if (yuklendi || Date.now() > bitis) return s;
    await bekle(sure(ortam, 250), ortam.sinyal);
  }
}

async function sekmedenOku(ortam, id) {
  let sonuc;
  try {
    const [cerceve] = await ortam.tarayici.scripting.executeScript({ target: { tabId: id }, func: sayfaMetni });
    sonuc = cerceve?.result;
  } catch (e) {
    throw new AracHatasi(`Sayfa okunamadı (${e?.message ?? 'bilinmeyen hata'}).`);
  }
  if (!sonuc) throw new AracHatasi('Sayfadan metin alınamadı.');
  return sonuc;
}

// --------------------------------------------------- sayfayi_genisleterek_oku

export async function genisleterekOku(girdi, ortam) {
  const baslangic = baslangicAl(girdi);
  let url = girdi?.url;
  if (girdi?.sekme_id != null) {
    if (!Number.isInteger(girdi.sekme_id)) throw new AracHatasi('"sekme_id" bir tam sayı olmalı.');
    try {
      url = (await ortam.tarayici.tabs.get(girdi.sekme_id)).url;
    } catch {
      throw new AracHatasi(`${girdi.sekme_id} kimlikli sekme yok (kapatılmış olabilir).`);
    }
  }
  if (!url) throw new AracHatasi('"url" ya da "sekme_id" verilmeli.');
  url = adresAl(url);
  const hedef = typeof girdi?.tiklanacak === 'string' ? girdi.tiklanacak.trim().slice(0, 100) : '';
  await izinIste(ortam, url);

  let toplam = 0;
  const sayfa = await sekmedeAc(ortam, url, async (id) => {
    for (let tur = 0; tur < GENISLETME_TURU; tur++) {
      let n = 0;
      try {
        const [c] = await ortam.tarayici.scripting.executeScript({
          target: { tabId: id },
          func: bolumleriAc,
          args: [hedef],
        });
        n = c?.result ?? 0;
      } catch (e) {
        throw new AracHatasi(`Sayfada bölümler açılamadı (${e?.message ?? 'bilinmeyen hata'}).`);
      }
      toplam += n;
      if (!n) break;
      await bekle(sure(ortam, 900), ortam.sinyal);
    }
    return sekmedenOku(ortam, id);
  });

  const not =
    (hedef ? `"${hedef}" yazan öğeler arandı. ` : '') +
    (toplam ? `${toplam} bölüm/düğme açıldı (sayfanın arka plandaki kopyasında).` : 'Açılacak bölüm bulunamadı.');
  return sayfaCiktisi(sayfa, baslangic, {
    not,
    devamIpucu: 'sayfayi_genisleterek_oku aracını aynı girdilerle ve',
  });
}

/**
 * Sayfanın içinde çalışır: kapalı bölümleri açar, açtığı öğe sayısını döner.
 * Kendi kendine yeterli olmalı. Güvenlik: form içindeki öğelere, giriş
 * alanlarına, başka sayfaya giden bağlantılara ve riskli işlem düğmelerine
 * (sil, satın al, gönder, takip et...) asla tıklamaz; bir öğeye bir kez
 * tıklar (ikinci tıklama bölümü kapatabilir).
 * @param {string} hedef  boş değilse yalnızca metninde bu geçen öğeler
 */
export function bolumleriAc(hedef) {
  // Kelime başı sınırı Türkçe harfleri de tanısın diye  yerine Unicode harf
  // kontrolü; kelime sonu serbest (ekli halleri de yakalar: "takip edin").
  const kelimeBasi = (liste) => new RegExp(`(?<![\p{L}\p{N}])(?:${liste})`, 'iu');
  const RISKLI = kelimeBasi(
    'sil|kaldır|delete|remove|satın|sepete|buy|purchase|order|sipariş|öde|pay|checkout|gönder|submit|send|post|paylaş|share|abone|subscribe|takip|follow|beğen|like|star|kabul|accept|onayla|confirm|agree|çıkış|logout|log out|sign out|sign in|giriş|login|kaydol|sign up|register|kaydet|save|yükle|upload|indir|download|bildir|report|engelle|block',
  );
  const DAHA_FAZLA = kelimeBasi(
    '(?:show|see|read|load|view)\\s*(?:more|all|full)|expand|more$|daha fazla|devamını|tümünü|tamamını|hepsini|genişlet',
  );
  const kucuk = (t) => t.toLocaleLowerCase('tr');
  const aranan = hedef ? kucuk(hedef) : '';

  const guvenli = (el) => {
    if (el.closest('form')) return false;
    if (el.matches('input, select, textarea, option, [type="submit"], [type="reset"], [contenteditable="true"]')) return false;
    if (el.tagName === 'A') {
      const href = (el.getAttribute('href') ?? '').trim();
      if (href && !href.startsWith('#') && !/^javascript:/i.test(href)) return false;
    }
    if (el.dataset.webAsistaniAcildi) return false;
    return true;
  };

  let sayi = 0;
  if (!aranan) {
    for (const d of document.querySelectorAll('details:not([open])')) {
      d.open = true;
      sayi++;
    }
  }
  const adaylar = document.querySelectorAll(
    'button, [role="button"], [role="tab"], [aria-expanded="false"], summary, a[href^="#"], a[href^="javascript:"], a:not([href])',
  );
  for (const el of adaylar) {
    if (sayi >= 60) break;
    if (!guvenli(el)) continue;
    const metin = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim();
    if (metin.length > 80 || RISKLI.test(metin)) continue;
    const uygun = aranan
      ? kucuk(metin).includes(aranan)
      : el.getAttribute('aria-expanded') === 'false' || DAHA_FAZLA.test(metin);
    if (!uygun) continue;
    el.dataset.webAsistaniAcildi = '1';
    el.click();
    sayi++;
  }
  return sayi;
}
