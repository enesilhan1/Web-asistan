// Sağlayıcıdan bağımsız ortak türler ve yardımcılar.

/**
 * Kullanıcıya gösterilecek hata. Metin dil dosyasından ([anahtar]) gelir,
 * böylece arayüz dili değişince eski hatalar da çevrilir.
 */
export class YzHatasi extends Error {
  constructor(anahtar, parametreler = {}) {
    super(anahtar);
    this.name = 'YzHatasi';
    this.anahtar = anahtar;
    this.parametreler = parametreler;
  }
}

/** Yanıtın neden bittiği. */
export const YanitSonu = Object.freeze({
  BITTI: 'bitti', // Model sözünü bitirdi.
  ARAC: 'arac', // Model araç çağırdı; sonuçlar gönderilip devam edilmeli.
  UZUNLUK: 'uzunluk', // Çıktı sınırına takıldı.
  RET: 'ret', // Model ya da güvenlik filtresi isteği reddetti.
});

/**
 * @typedef {{ad: string, aciklama: string, sema: object}} AracTanimi
 * @typedef {{id: string, ad: string, girdi: object}} AracCagrisi
 * @typedef {{cagri: AracCagrisi, metin: string, hata?: boolean}} AracSonucu
 * @typedef {{metinler: string[], cagrilar: AracCagrisi[], son: string,
 *   kullanim: import('./katalog.js').Kullanim}} YzYaniti
 */

/**
 * Konuşma geçmişini sağlayıcının kendi biçiminde tutan istemcilerin ortak
 * kısmı. Geçmiş API'ye hiç değiştirilmeden, yalnızca sonuna eklenerek
 * gönderilir (düşünme blokları, imzalar vb. dahil; bazı sağlayıcılar bunu
 * zorunlu tutuyor). Geçmiş düz JSON olduğu için olduğu gibi saklanabilir.
 */
export class GecmisliIstemci {
  /**
   * @param {{model: import('./katalog.js').YzModeli, apiAnahtari: string,
   *   gecmis?: object[], istek: import('./http_istegi.js').JsonIstegi}} p
   */
  constructor({ model, apiAnahtari, gecmis = [], istek }) {
    this.model = model;
    this.apiAnahtari = apiAnahtari;
    this.gecmis = gecmis;
    this.istek = istek;
    this._kontrolNoktasi = gecmis.length;
  }

  /** Sağlayıcının kullanıcı mesajı biçimi. */
  kullaniciMesaji(_baglam, _metin) {
    throw new Error('alt sınıf tanımlamalı');
  }

  /** Kullanıcının yeni mesajı: önce güncel bağlam, sonra mesajın kendisi. */
  kullaniciEkle(baglam, metin) {
    this._kontrolNoktasi = this.gecmis.length;
    this.gecmis.push(this.kullaniciMesaji(baglam, metin));
  }

  /** Hata olunca geçmişi son kullanıcı mesajından önceki haline döndürür. */
  geriAl() {
    this.gecmis.splice(this._kontrolNoktasi);
  }

  /**
   * Geçmişteki araç sonucu metinleri, eskiden yeniye. Her biri metnin
   * uzunluğunu ve onu yer tutucuyla değiştiren fonksiyonu verir.
   * @returns {{uzunluk: number, kisalt: (yeni: string) => void}[]}
   */
  aracSonuclari() {
    throw new Error('alt sınıf tanımlamalı');
  }

  /**
   * Adım sınırı olmadığı için sohbet uzayabilir (docs/SPEC.md §5). Araç
   * sonuçlarının toplamı [ust] karakteri geçerse en eskilerden başlayarak
   * yer tutucuyla değiştirir, toplam [alt]'a inene kadar. Son [sonKorunan]
   * sonuca (az önce eklenen tur) dokunmaz. Kısaltılan sonuç sayısını döner.
   * Önbelleği her turda bozmamak için arada bir ve topluca yapılır.
   */
  eskiSonuclariKisalt({ ust = 200_000, alt = 80_000, sonKorunan = 0 } = {}) {
    const sonuclar = this.aracSonuclari();
    let toplam = sonuclar.reduce((t, s) => t + s.uzunluk, 0);
    if (toplam <= ust) return 0;
    let sayi = 0;
    for (const s of sonuclar.slice(0, Math.max(0, sonuclar.length - sonKorunan))) {
      if (toplam <= alt) break;
      if (s.uzunluk <= KISALTMA_NOTU.length) continue;
      toplam -= s.uzunluk - KISALTMA_NOTU.length;
      s.kisalt(KISALTMA_NOTU);
      sayi++;
    }
    return sayi;
  }
}

export const KISALTMA_NOTU =
  '[Bu eski araç sonucu sohbet uzadığı için yer açmak amacıyla kaldırıldı; gerekirse aracı tekrar çağır.]';

/** Metin alanı için aracSonuclari öğesi. */
export function metinAlani(nesne, alan) {
  return {
    uzunluk: String(nesne[alan] ?? '').length,
    kisalt: (yeni) => {
      nesne[alan] = yeni;
    },
  };
}

/**
 * Araç argümanları bazı sağlayıcılarda JSON metni olarak gelir; bozuksa boş
 * döner (doğrulama hatası modele geri bildirilir).
 */
export function argumanlariCoz(ham) {
  if (ham && typeof ham === 'object' && !Array.isArray(ham)) return { ...ham };
  try {
    const j = JSON.parse(String(ham));
    if (j && typeof j === 'object' && !Array.isArray(j)) return j;
  } catch {
    // boş döner
  }
  return {};
}

/** Kullanım nesnesindeki bir sayı (yoksa 0). */
export function sayi(nesne, anahtar) {
  const v = nesne?.[anahtar];
  return typeof v === 'number' ? Math.trunc(v) : 0;
}
