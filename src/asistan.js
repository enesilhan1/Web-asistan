// Sohbet döngüsü: kullanıcının mesajını sağlayıcıya gönderir, araç
// çağrılarını çalıştırır, model sözünü bitirene kadar devam eder. Arka planda
// (service worker) çalışır; her adımda sohbet kaydedilir, popup değişikliği
// depodan izler. Böylece popup kapansa da yanıt kaybolmaz (docs/SPEC.md §6).
//
// Adım sınırı yoktur (§5): model sözünü bitirene ya da kullanıcı durdurana
// kadar devam edilir. Yeni bir siteye gitmeden önce kullanıcıdan onay
// istenir; onay o sohbet boyunca geçerlidir (§9).

import { ARACLAR, aracCalistir } from './araclar/araclar.js';
import { siteAnahtari } from './araclar/site.js';
import { baglamMetni, sistemIstemi } from './sistem.js';
import { siteIzniVarMi } from './tarayici.js';
import { istemciOlustur } from './yz/istemciler.js';
import { maliyet, modelBul, saglayiciBul } from './yz/katalog.js';
import { YanitSonu, YzHatasi } from './yz/ortak.js';

const BASLIK_UZUNLUGU = 60;

/**
 * Sohbet öğeleri (ekranda gösterilen):
 *   {tur: 'kullanici', metin}
 *   {tur: 'asistan', metin}
 *   {tur: 'arac', ad, girdi}                       asistanın kullandığı araç
 *   {tur: 'bilgi', anahtar, parametreler, hata}    dil anahtarlı durum/hata
 *   {tur: 'onay', id, site, url, durum}            site onayı; durum: bekliyor |
 *                                                  verildi | reddedildi | iptal
 * Sohbetin izinliSiteler listesi onay verilen siteleri tutar (yeni sohbette boş).
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
    /** @type {Map<string, (kabul: boolean) => void>} kullanıcı kararı bekleyen onaylar */
    this.bekleyenOnaylar = new Map();
  }

  /** Popup'tan gelen onay kararı. */
  karar(onayId, kabul) {
    this.bekleyenOnaylar.get(onayId)?.(Boolean(kabul));
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
        izinliSiteler: [],
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
      for (const o of s.ogeler) if (o.tur === 'onay' && o.durum === 'bekliyor') o.durum = 'iptal';
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

    sohbet.izinliSiteler ??= [];
    const etkinSekme = await this._etkinSekme();
    // Kullanıcının o an baktığı site bu sohbet için izinli sayılır (§9).
    const etkinSite = etkinSekme && siteAnahtari(etkinSekme.url ?? '');
    if (etkinSite && !sohbet.izinliSiteler.includes(etkinSite)) sohbet.izinliSiteler.push(etkinSite);
    const aracOrtami = {
      fetch: this.fetch,
      sinyal,
      githubAnahtari: (ayarlar.githubAnahtari ?? '').trim() || undefined,
      siteIzni: (url) => this._siteIzni(sohbet, url, sinyal),
    };

    try {
      istemci.kullaniciEkle(baglamMetni({ simdi: this.simdi(), dil: ayarlar.dil, etkinSekme }), metin);
      for (;;) {
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
          sonuclar.push(await aracCalistir(c, this.tarayici, aracOrtami));
        }
        if (sinyal.aborted) throw new YzHatasi('hata.durduruldu');
        istemci.sonuclariEkle(sonuclar);
        // Adım sınırı olmadığından sohbet modelin sınırını aşmasın (§5).
        istemci.eskiSonuclariKisalt({ sonKorunan: sonuclar.length });
        await this._kaydet(sohbet);
      }
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

  /**
   * Site onayı: sohbette izinliyse hemen evet; değilse popup'ta kullanıcıya
   * sorar ve kararını bekler. Durdurulursa hayır.
   */
  async _siteIzni(sohbet, url, sinyal) {
    const site = siteAnahtari(url);
    if (!site) return false;
    if (sohbet.izinliSiteler.includes(site)) return true;
    if (sinyal.aborted) return false;

    const oge = { tur: 'onay', id: this.kimlikUret(), site, url, durum: 'bekliyor' };
    sohbet.ogeler.push(oge);
    await this._kaydet(sohbet);
    this._rozet('?');

    const kabul = await new Promise((coz) => {
      const bitir = (k) => {
        this.bekleyenOnaylar.delete(oge.id);
        sinyal.removeEventListener('abort', iptal);
        coz(k);
      };
      const iptal = () => bitir(null);
      this.bekleyenOnaylar.set(oge.id, bitir);
      sinyal.addEventListener('abort', iptal, { once: true });
    });

    if (!this.bekleyenOnaylar.size) this._rozet('');
    oge.durum = kabul === null ? 'iptal' : kabul ? 'verildi' : 'reddedildi';
    if (kabul && !sohbet.izinliSiteler.includes(site)) sohbet.izinliSiteler.push(site);
    await this._kaydet(sohbet);
    return Boolean(kabul);
  }

  /** Onay beklenirken eklenti simgesinde işaret (popup kapalıyken fark edilsin). */
  _rozet(metin) {
    try {
      this.tarayici.action?.setBadgeText({ text: metin })?.catch?.(() => {});
      if (metin) this.tarayici.action?.setBadgeBackgroundColor({ color: '#d9480f' })?.catch?.(() => {});
    } catch {
      // rozet önemsiz
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
