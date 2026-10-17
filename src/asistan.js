// Sohbet döngüsü: kullanıcının mesajını sağlayıcıya gönderir, araç
// çağrılarını çalıştırır, model sözünü bitirene kadar devam eder. Arka planda
// (service worker) çalışır; her adımda sohbet kaydedilir, popup değişikliği
// depodan izler. Böylece popup kapansa da yanıt kaybolmaz (docs/SPEC.md §6).

import { ARACLAR, aracCalistir } from './araclar/araclar.js';
import { baglamMetni, sistemIstemi } from './sistem.js';
import { siteIzniVarMi } from './tarayici.js';
import { istemciOlustur } from './yz/istemciler.js';
import { maliyet, modelBul, saglayiciBul } from './yz/katalog.js';
import { YanitSonu, YzHatasi } from './yz/ortak.js';

/** Bir kullanıcı mesajı için en fazla model turu (her turda birden çok araç olabilir). */
export const EN_FAZLA_TUR = 10;
const BASLIK_UZUNLUGU = 60;

/**
 * Sohbet öğeleri (ekranda gösterilen):
 *   {tur: 'kullanici', metin}
 *   {tur: 'asistan', metin}
 *   {tur: 'arac', ad, girdi}                       asistanın kullandığı araç
 *   {tur: 'bilgi', anahtar, parametreler, hata}    dil anahtarlı durum/hata
 */
export class Asistan {
  /**
   * @param {{depo: import('./depo.js').Depo, tarayici: any, fetch?: typeof fetch,
   *   simdi?: () => Date, kimlikUret?: () => string, canliTut?: () => (() => void),
   *   tekrarBeklemesiMs?: number}} p
   * [canliTut] çalışma süresince service worker'ın kapanmamasını sağlar;
   * döndürdüğü fonksiyon bunu bitirir.
   */
  constructor({ depo, tarayici, fetch, simdi = () => new Date(), kimlikUret, canliTut, tekrarBeklemesiMs }) {
    this.depo = depo;
    this.tarayici = tarayici;
    this.fetch = fetch;
    this.simdi = simdi;
    this.kimlikUret = kimlikUret ?? (() => crypto.randomUUID());
    this.canliTut = canliTut ?? (() => () => {});
    this.tekrarBeklemesiMs = tekrarBeklemesiMs;
    /** @type {Map<string, AbortController>} çalışan sohbetler */
    this.calisanlar = new Map();
  }

  /**
   * Kullanıcının mesajını sohbete ekler ve yanıt döngüsünü başlatır.
   * [sohbetId] boşsa geçerli ayarlarla yeni sohbet açılır. Sohbet kimliğini
   * ve döngünün bitişini (bitti) döndürür.
   */
  async gonder(sohbetId, metin) {
    const temiz = (metin ?? '').trim();
    if (!temiz) throw new Error('boş mesaj');
    if (sohbetId && this.calisanlar.has(sohbetId)) throw new Error('sohbet zaten çalışıyor');
    // Aşağıdaki beklemeler sırasında aynı sohbete ikinci bir mesaj girmesin.
    const durdurucu = new AbortController();
    if (sohbetId) this.calisanlar.set(sohbetId, durdurucu);

    let ayarlar;
    let sohbet;
    try {
      ayarlar = await this.depo.ayarlar();
      sohbet = await this.depo.sohbet(sohbetId);
    } catch (e) {
      if (sohbetId) this.calisanlar.delete(sohbetId);
      throw e;
    }
    if (!sohbet) {
      const model = modelBul(ayarlar.saglayici, ayarlar.modeller[ayarlar.saglayici]);
      const zaman = this.simdi().getTime();
      sohbet = {
        id: this.kimlikUret(),
        baslik: temiz.replace(/\s+/g, ' ').slice(0, BASLIK_UZUNLUGU),
        olusturma: zaman,
        guncelleme: zaman,
        saglayici: model.saglayici,
        modelId: model.id,
        ogeler: [],
        gecmis: [],
        maliyet: 0,
        maliyetBilinmiyor: false,
        calisiyor: false,
      };
    }

    if (sohbetId && sohbet.id !== sohbetId) this.calisanlar.delete(sohbetId);
    this.calisanlar.set(sohbet.id, durdurucu);
    sohbet.ogeler.push({ tur: 'kullanici', metin: temiz });
    sohbet.calisiyor = true;
    await this._kaydet(sohbet);
    await this.depo.acikSohbetiAyarla(sohbet.id);

    const bitti = this._dongu(sohbet, ayarlar, temiz, durdurucu.signal);
    return { sohbetId: sohbet.id, bitti };
  }

  /** Çalışan sohbeti durdurur (bekleyen istek iptal edilir). */
  durdur(sohbetId) {
    this.calisanlar.get(sohbetId)?.abort();
  }

  /**
   * Service worker yeniden başladığında yarıda kalmış sohbetleri kapatır
   * (önceki çalışma tarayıcı tarafından sonlandırılmış demektir).
   */
  async yaridaKalanlariKapat() {
    for (const ozet of await this.depo.sohbetler()) {
      if (this.calisanlar.has(ozet.id)) continue;
      const s = await this.depo.sohbet(ozet.id);
      if (!s?.calisiyor) continue;
      s.calisiyor = false;
      s.ogeler.push({ tur: 'bilgi', anahtar: 'bilgi.yarida', parametreler: {}, hata: true });
      await this._kaydet(s, { guncellemeyiDegistirme: true });
    }
  }

  async _dongu(sohbet, ayarlar, metin, sinyal) {
    const bitir = this.canliTut();
    const model = modelBul(sohbet.saglayici, sohbet.modelId);
    const ad = saglayiciBul(model.saglayici).kisaAd;
    const bilgi = (anahtar, parametreler = {}, hata = false) =>
      sohbet.ogeler.push({ tur: 'bilgi', anahtar, parametreler, hata });

    const anahtar = (ayarlar.anahtarlar[sohbet.saglayici] ?? '').trim();
    // Site erişimi olmadan sayfalar okunamaz; Firefox'ta sağlayıcıya bağlantı
    // da engellenebilir.
    const izinYok = !(await siteIzniVarMi(this.tarayici));
    if (!anahtar || izinYok) {
      if (!anahtar) bilgi('bilgi.anahtarYok', { ad }, true);
      else bilgi('bilgi.izinYok', {}, true);
      sohbet.calisiyor = false;
      this.calisanlar.delete(sohbet.id);
      await this._kaydet(sohbet);
      bitir();
      return;
    }

    const istemci = istemciOlustur({
      model,
      apiAnahtari: anahtar,
      gecmis: sohbet.gecmis,
      fetch: this.fetch,
      tekrarBeklemesiMs: this.tekrarBeklemesiMs,
    });

    try {
      istemci.kullaniciEkle(
        baglamMetni({ simdi: this.simdi(), dil: ayarlar.dil, etkinSekme: await this._etkinSekme() }),
        metin,
      );
      let tur = 0;
      for (; tur < EN_FAZLA_TUR; tur++) {
        const yanit = await istemci.yanitAl({
          sistem: sistemIstemi(ayarlar.dil),
          araclar: ARACLAR,
          sinyal,
        });
        const m = maliyet(model, yanit.kullanim);
        if (m == null) sohbet.maliyetBilinmiyor = true;
        else sohbet.maliyet += m;

        if (yanit.son === YanitSonu.RET) {
          bilgi('bilgi.ret', { ad }, true);
          break;
        }
        for (const t of yanit.metinler) {
          if (t.trim()) sohbet.ogeler.push({ tur: 'asistan', metin: t.trim() });
        }
        if (yanit.son === YanitSonu.UZUNLUK) {
          bilgi('bilgi.uzunluk');
          break;
        }
        if (yanit.son !== YanitSonu.ARAC || !yanit.cagrilar.length) break;

        for (const c of yanit.cagrilar) sohbet.ogeler.push({ tur: 'arac', ad: c.ad, girdi: c.girdi });
        await this._kaydet(sohbet);

        const sonuclar = [];
        for (const c of yanit.cagrilar) {
          if (sinyal.aborted) throw new YzHatasi('hata.durduruldu');
          sonuclar.push(await aracCalistir(c, this.tarayici));
        }
        istemci.sonuclariEkle(sonuclar);
        await this._kaydet(sohbet);
      }
      if (tur === EN_FAZLA_TUR) bilgi('bilgi.turSiniri');
    } catch (e) {
      if (e instanceof YzHatasi) {
        bilgi(e.anahtar, e.parametreler, e.anahtar !== 'hata.durduruldu');
      } else {
        bilgi('bilgi.beklenmeyen', { mesaj: String(e?.message ?? e) }, true);
      }
      // Yanıtsız kalan mesaj ham geçmişten geri alınır ki sohbet bozulmasın
      // (ekrandaki öğeler kalır).
      istemci.geriAl();
    } finally {
      sohbet.calisiyor = false;
      this.calisanlar.delete(sohbet.id);
      await this._kaydet(sohbet);
      bitir();
    }
  }

  async _etkinSekme() {
    try {
      const [s] = await this.tarayici.tabs.query({ active: true, lastFocusedWindow: true });
      return s ? { id: s.id, title: s.title, url: s.url } : null;
    } catch {
      return null;
    }
  }

  _kaydet(sohbet, { guncellemeyiDegistirme = false } = {}) {
    if (!guncellemeyiDegistirme) sohbet.guncelleme = this.simdi().getTime();
    return this.depo.sohbetKaydet(sohbet);
  }
}
