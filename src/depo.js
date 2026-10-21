// Ayarlar ve sohbetler: yalnızca bu bilgisayarda, storage.local'da
// (docs/SPEC.md §7). Popup ve arka plan aynı modülü kullanır.
//
// Anahtarlar:
//   ayarlar          {dil, saglayici, modeller: {saglayici: modelId}, anahtarlar: {saglayici: anahtar},
//                     githubAnahtari}
//   sohbetler        [{id, baslik, guncelleme, saglayici, modelId}] (yeniden eskiye)
//   sohbet:<id>      tam sohbet (aşağıda)
//   acikSohbet       popup'ta açık sohbetin kimliği (yoksa yeni sohbet)
//
// Sohbet: {id, baslik, olusturma, guncelleme, saglayici, modelId,
//   ogeler: [...], gecmis: [sağlayıcı biçiminde ham geçmiş],
//   maliyet, maliyetBilinmiyor, calisiyor}

import { VARSAYILAN_DIL } from './dil.js';
import { VARSAYILAN_SAGLAYICI } from './yz/katalog.js';

export const VARSAYILAN_AYARLAR = Object.freeze({
  dil: VARSAYILAN_DIL,
  saglayici: VARSAYILAN_SAGLAYICI,
  modeller: {},
  anahtarlar: {},
  githubAnahtari: '',
});

export const sohbetAnahtari = (id) => `sohbet:${id}`;

export class Depo {
  /** @param {{get: Function, set: Function, remove: Function}} alan  storage.local */
  constructor(alan) {
    this.alan = alan;
    this._sira = Promise.resolve();
  }

  /** Yazmaları sıraya koyar (aynı anda iki oku-değiştir-yaz çakışmasın). */
  _sirayla(is) {
    const p = this._sira.then(is, is);
    this._sira = p.catch(() => {});
    return p;
  }

  async ayarlar() {
    const { ayarlar } = await this.alan.get('ayarlar');
    return {
      ...VARSAYILAN_AYARLAR,
      ...(ayarlar ?? {}),
      modeller: { ...(ayarlar?.modeller ?? {}) },
      anahtarlar: { ...(ayarlar?.anahtarlar ?? {}) },
    };
  }

  ayarlariGuncelle(degistir) {
    return this._sirayla(async () => {
      const a = await this.ayarlar();
      const yeni = degistir(a) ?? a;
      await this.alan.set({ ayarlar: yeni });
      return yeni;
    });
  }

  async sohbetler() {
    const { sohbetler } = await this.alan.get('sohbetler');
    return sohbetler ?? [];
  }

  async sohbet(id) {
    if (!id) return null;
    const k = sohbetAnahtari(id);
    return (await this.alan.get(k))[k] ?? null;
  }

  /** Sohbeti ve listedeki özetini kaydeder (en son güncellenen başa). */
  sohbetKaydet(sohbet) {
    return this._sirayla(async () => {
      const liste = (await this.sohbetler()).filter((s) => s.id !== sohbet.id);
      liste.unshift({
        id: sohbet.id,
        baslik: sohbet.baslik,
        guncelleme: sohbet.guncelleme,
        saglayici: sohbet.saglayici,
        modelId: sohbet.modelId,
      });
      liste.sort((a, b) => b.guncelleme - a.guncelleme);
      await this.alan.set({ [sohbetAnahtari(sohbet.id)]: sohbet, sohbetler: liste });
    });
  }

  sohbetSil(id) {
    return this._sirayla(async () => {
      const liste = (await this.sohbetler()).filter((s) => s.id !== id);
      await this.alan.set({ sohbetler: liste });
      await this.alan.remove(sohbetAnahtari(id));
      if ((await this.acikSohbet()) === id) await this.alan.remove('acikSohbet');
    });
  }

  async acikSohbet() {
    return (await this.alan.get('acikSohbet')).acikSohbet ?? null;
  }

  acikSohbetiAyarla(id) {
    return id ? this.alan.set({ acikSohbet: id }) : this.alan.remove('acikSohbet');
  }
}
