import { YzHatasi } from './ortak.js';

const ZAMAN_ASIMI_MS = 3 * 60 * 1000;
const DENEME_SAYISI = 3;

/**
 * Bütün sağlayıcıların ortak HTTP gönderimi: JSON POST, yoğunluk ve geçici
 * ağ hatalarında 2 kez daha deneme, hataları dil anahtarlı [YzHatasi]'na
 * çevirme. Kullanıcı durdurursa ([sinyal]) hemen `hata.durduruldu` atar.
 */
export class JsonIstegi {
  /**
   * @param {{fetch?: typeof fetch, tekrarBeklemesiMs?: number,
   *   zamanAsimiMs?: number}} [p]
   */
  constructor({ fetch: f, tekrarBeklemesiMs = 2000, zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
    this.fetch = f ?? ((...a) => globalThis.fetch(...a));
    this.tekrarBeklemesiMs = tekrarBeklemesiMs;
    this.zamanAsimiMs = zamanAsimiMs;
  }

  /**
   * @param {string} adres
   * @param {{basliklar: Record<string,string>, govde: object,
   *   saglayiciAdi: string, sinyal?: AbortSignal,
   *   hataCevir?: (durum: number, mesaj: string) => YzHatasi|null}} p
   * [hataCevir] sağlayıcıya özel durumları (bakiye, kota...) tanır;
   * tanımadıklarına null döndürür, ortak mesaj kullanılır.
   */
  async gonder(adres, { basliklar, govde, saglayiciAdi, sinyal, hataCevir }) {
    const istek = JSON.stringify(govde);
    const ad = { ad: saglayiciAdi };

    for (let deneme = 0; ; deneme++) {
      const sonDeneme = deneme === DENEME_SAYISI - 1;
      const bekle = (ms) => uyu(ms ?? this.tekrarBeklemesiMs * (deneme + 1), sinyal);

      const zamanAsimi = new AbortController();
      const sayac = setTimeout(() => zamanAsimi.abort(), this.zamanAsimiMs);
      let yanit;
      try {
        yanit = await this.fetch(adres, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...basliklar },
          body: istek,
          signal: sinyal ? AbortSignal.any([sinyal, zamanAsimi.signal]) : zamanAsimi.signal,
        });
      } catch (e) {
        if (sinyal?.aborted) throw new YzHatasi('hata.durduruldu');
        const zamanAsti = zamanAsimi.signal.aborted;
        if (sonDeneme) throw new YzHatasi(zamanAsti ? 'hata.zamanAsimi' : 'hata.baglanti', ad);
        await bekle();
        continue;
      } finally {
        clearTimeout(sayac);
      }

      let metin;
      try {
        metin = await yanit.text();
      } catch {
        if (sinyal?.aborted) throw new YzHatasi('hata.durduruldu');
        if (sonDeneme) throw new YzHatasi('hata.baglanti', ad);
        await bekle();
        continue;
      }

      if (yanit.status === 200) {
        try {
          return JSON.parse(metin);
        } catch {
          throw new YzHatasi('hata.bozukYanit', ad);
        }
      }

      const mesaj = hataMesaji(metin);
      const ozel = hataCevir?.(yanit.status, mesaj);
      if (ozel) throw ozel;

      const tekrarlanabilir = yanit.status === 429 || yanit.status === 408 || yanit.status >= 500;
      if (tekrarlanabilir && !sonDeneme) {
        const saniye = Number.parseInt(yanit.headers.get('retry-after') ?? '', 10);
        await bekle(Number.isFinite(saniye) && saniye <= 30 ? saniye * 1000 : undefined);
        continue;
      }
      throw ortakHata(yanit.status, mesaj, saglayiciAdi);
    }
  }
}

function uyu(ms, sinyal) {
  return new Promise((coz, reddet) => {
    if (sinyal?.aborted) return reddet(new YzHatasi('hata.durduruldu'));
    const t = setTimeout(() => {
      sinyal?.removeEventListener('abort', iptal);
      coz();
    }, ms);
    const iptal = () => {
      clearTimeout(t);
      reddet(new YzHatasi('hata.durduruldu'));
    };
    sinyal?.addEventListener('abort', iptal, { once: true });
  });
}

/** Sağlayıcının hata gövdesindeki açıklama (bulunamazsa boş). */
export function hataMesaji(govde) {
  try {
    const j = JSON.parse(govde);
    const e = Array.isArray(j) ? j[0]?.error : j?.error;
    if (e && typeof e === 'object') return String(e.message ?? '');
    if (typeof e === 'string') return e;
  } catch {
    // boş döner
  }
  return '';
}

function ortakHata(durum, mesaj, ad) {
  if (durum === 401) return new YzHatasi('hata.anahtar', { ad });
  if (durum === 403) return new YzHatasi('hata.izin', { ad });
  if (durum === 404) return new YzHatasi('hata.model', { ad, mesaj });
  if (durum === 429) return new YzHatasi('hata.kota', { ad });
  if (durum >= 500) return new YzHatasi('hata.yogun', { ad });
  return new YzHatasi('hata.reddetti', { ad, durum, mesaj });
}
