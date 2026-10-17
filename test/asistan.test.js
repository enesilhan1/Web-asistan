import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Asistan, EN_FAZLA_TUR } from '../src/asistan.js';
import { Depo } from '../src/depo.js';
import { baglamMetni, sistemIstemi } from '../src/sistem.js';
import { sahteFetch } from './yardimci.js';

/** chrome.storage.local benzeri bellek içi alan (değerler kopyalanır). */
export function sahteAlan() {
  const veri = {};
  const kopya = (v) => (v === undefined ? undefined : structuredClone(v));
  return {
    veri,
    get: async (k) => (k in veri ? { [k]: kopya(veri[k]) } : {}),
    set: async (o) => {
      for (const [k, v] of Object.entries(o)) veri[k] = kopya(v);
    },
    remove: async (k) => {
      delete veri[k];
    },
  };
}

const SAYFA = { baslik: 'Haber', url: 'https://haber.com/', dil: 'tr', aciklama: '', secim: '', metin: 'Gündem metni' };

function kur({ yanitlar = [], anahtar = 'sk-ant-1', ayarlar = {} } = {}) {
  const alan = sahteAlan();
  const depo = new Depo(alan);
  const fetch = sahteFetch(yanitlar);
  let kimlik = 0;
  let canli = 0;
  const tarayici = {
    tabs: {
      query: async (q) => (q.active ? [{ id: 7, title: 'Haber', url: 'https://haber.com/' }] : []),
      get: async (id) => ({ id, url: 'https://haber.com/', title: 'Haber' }),
    },
    windows: { getLastFocused: async () => ({ id: 1 }) },
    scripting: { executeScript: async () => [{ result: SAYFA }] },
    history: { search: async () => [] },
  };
  const asistan = new Asistan({
    depo,
    tarayici,
    fetch,
    simdi: () => new Date(2026, 9, 17, 15, 30),
    kimlikUret: () => `s${++kimlik}`,
    canliTut: () => {
      canli++;
      return () => canli--;
    },
    tekrarBeklemesiMs: 1,
  });
  const hazir = depo.ayarlariGuncelle((a) => ({
    ...a,
    ...ayarlar,
    anahtarlar: anahtar ? { anthropic: anahtar } : {},
  }));
  return { alan, depo, fetch, asistan, hazir, canli: () => canli };
}

const metinYaniti = (text) => ({ govde: { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 } } });
const aracYaniti = (id, name, input) => ({
  govde: {
    content: [{ type: 'tool_use', id, name, input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1000, output_tokens: 10 },
  },
});

describe('Asistan', () => {
  it('yeni sohbet: araç kullanır, yanıtı kaydeder, maliyeti toplar', async () => {
    const k = kur({ yanitlar: [aracYaniti('t1', 'sekmeyi_oku', { sekme_id: 7 }), metinYaniti('Sayfa gündemi anlatıyor.')] });
    await k.hazir;
    const { sohbetId, bitti } = await k.asistan.gonder(null, '  Bu sayfayı   özetle ');
    assert.equal(sohbetId, 's1');
    // Döngü bitmeden önce sohbet "çalışıyor" olarak kaydedilmiş olmalı.
    assert.equal((await k.depo.sohbet('s1')).calisiyor, true);
    await bitti;

    const s = await k.depo.sohbet('s1');
    assert.equal(s.calisiyor, false);
    assert.equal(s.baslik, 'Bu sayfayı özetle');
    assert.equal(s.saglayici, 'anthropic');
    assert.equal(s.modelId, 'claude-opus-5-5');
    assert.deepEqual(s.ogeler, [
      { tur: 'kullanici', metin: 'Bu sayfayı   özetle' },
      { tur: 'arac', ad: 'sekmeyi_oku', girdi: { sekme_id: 7 } },
      { tur: 'asistan', metin: 'Sayfa gündemi anlatıyor.' },
    ]);
    // 2000 girdi * $4 + 110 çıktı * $20 (milyon başına)
    assert.ok(Math.abs(s.maliyet - (2000 * 4 + 110 * 20) / 1e6) < 1e-12);
    assert.equal(s.gecmis.length, 4);
    assert.equal(await k.depo.acikSohbet(), 's1');
    assert.deepEqual((await k.depo.sohbetler()).map((o) => o.id), ['s1']);

    // İlk istekte bağlam (etkin sekme) ve sistem istemi gitmiş olmalı.
    const ilk = k.fetch.istekler[0].govde;
    assert.match(ilk.messages[0].content[0].text, /Etkin sekme: sekme_id=7 \| Haber \| https:\/\/haber.com\//);
    assert.equal(ilk.system, sistemIstemi('tr'));
    assert.deepEqual(ilk.tools.map((t) => t.name), ['sekmeleri_listele', 'sekmeyi_oku', 'gecmiste_ara']);
    // Araç sonucu sayfa metnini içermeli.
    const sonuc = k.fetch.istekler[1].govde.messages[2].content[0];
    assert.equal(sonuc.tool_use_id, 't1');
    assert.match(sonuc.content, /Gündem metni/);
    assert.equal(k.canli(), 0);
  });

  it('kayıtlı sohbete devam eder; ayar değişse de sohbetin modeli kullanılır', async () => {
    const k = kur({ yanitlar: [metinYaniti('Bir'), metinYaniti('İki')] });
    await k.hazir;
    await (await k.asistan.gonder(null, 'ilk')).bitti;
    await k.depo.ayarlariGuncelle((a) => ({ ...a, modeller: { anthropic: 'claude-haiku-5-5' } }));
    const { sohbetId, bitti } = await k.asistan.gonder('s1', 'ikinci');
    await bitti;
    assert.equal(sohbetId, 's1');
    assert.equal(k.fetch.istekler[1].govde.model, 'claude-opus-5-5');
    assert.equal(k.fetch.istekler[1].govde.messages.length, 3);
    const s = await k.depo.sohbet('s1');
    assert.deepEqual(s.ogeler.map((o) => o.metin), ['ilk', 'Bir', 'ikinci', 'İki']);
  });

  it('yeni sohbet ayarlardaki sağlayıcı ve modeli kullanır', async () => {
    const k = kur({ ayarlar: { saglayici: 'deepseek', modeller: { deepseek: 'deepseek-v4-pro' } }, anahtar: null });
    await k.depo.ayarlariGuncelle((a) => ({ ...a, anahtarlar: { deepseek: 'sk-1' } }));
    k.fetch.istekler.length = 0;
    const yanitlar = [{ govde: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Selam' } }] } }];
    const k2 = new Asistan({ depo: k.depo, tarayici: k.asistan.tarayici, fetch: sahteFetch(yanitlar), kimlikUret: () => 'd1' });
    await (await k2.gonder(null, 'merhaba')).bitti;
    const s = await k.depo.sohbet('d1');
    assert.equal(s.saglayici, 'deepseek');
    assert.equal(s.modelId, 'deepseek-v4-pro');
    assert.equal(s.ogeler.at(-1).metin, 'Selam');
  });

  it('anahtar yoksa istek göndermez, bilgi verir', async () => {
    const k = kur({ anahtar: null });
    await k.hazir;
    await (await k.asistan.gonder(null, 'soru')).bitti;
    const s = await k.depo.sohbet('s1');
    assert.equal(k.fetch.istekler.length, 0);
    assert.deepEqual(s.ogeler.at(-1), { tur: 'bilgi', anahtar: 'bilgi.anahtarYok', parametreler: { ad: 'Claude' }, hata: true });
    assert.equal(s.calisiyor, false);
  });

  it('site erişim izni yoksa istek göndermez, izin bilgisi verir', async () => {
    const k = kur();
    await k.hazir;
    k.asistan.tarayici.permissions = { contains: async () => false };
    await (await k.asistan.gonder(null, 'soru')).bitti;
    const s = await k.depo.sohbet('s1');
    assert.equal(k.fetch.istekler.length, 0);
    assert.deepEqual(s.ogeler.at(-1), { tur: 'bilgi', anahtar: 'bilgi.izinYok', parametreler: {}, hata: true });
  });

  it('API hatasında ham geçmiş geri alınır, hata gösterilir; sonra devam edilebilir', async () => {
    const k = kur({ yanitlar: [{ durum: 401, govde: { error: { message: 'invalid x-api-key' } } }, metinYaniti('Tamam')] });
    await k.hazir;
    await (await k.asistan.gonder(null, 'soru')).bitti;
    let s = await k.depo.sohbet('s1');
    assert.deepEqual(s.gecmis, []);
    assert.deepEqual(s.ogeler.at(-1), { tur: 'bilgi', anahtar: 'hata.anahtar', parametreler: { ad: 'Claude' }, hata: true });

    await (await k.asistan.gonder('s1', 'tekrar')).bitti;
    s = await k.depo.sohbet('s1');
    assert.equal(s.gecmis.length, 2);
    assert.equal(s.ogeler.at(-1).metin, 'Tamam');
  });

  it('durdurulunca istek iptal edilir, hata sayılmaz', async () => {
    const asili = (istek) =>
      new Promise((_, reddet) => istek.sinyal.addEventListener('abort', () => reddet(new Error('abort'))));
    const k = kur({ yanitlar: [asili] });
    await k.hazir;
    const { sohbetId, bitti } = await k.asistan.gonder(null, 'uzun iş');
    await new Promise((r) => setTimeout(r, 5));
    await assert.rejects(k.asistan.gonder(sohbetId, 'ikinci'), /çalışıyor/);
    k.asistan.durdur(sohbetId);
    await bitti;
    const s = await k.depo.sohbet(sohbetId);
    assert.deepEqual(s.ogeler.at(-1), { tur: 'bilgi', anahtar: 'hata.durduruldu', parametreler: {}, hata: false });
    assert.equal(s.calisiyor, false);
    assert.deepEqual(s.gecmis, []);
    assert.equal(k.asistan.calisanlar.size, 0);
  });

  it('ret, uzunluk ve tur sınırı', async () => {
    const k = kur({
      yanitlar: [
        { govde: { content: [], stop_reason: 'refusal' } },
        { govde: { content: [{ type: 'text', text: 'Yarım' }], stop_reason: 'max_tokens' } },
        ...Array.from({ length: EN_FAZLA_TUR }, (_, i) => aracYaniti(`t${i}`, 'sekmeleri_listele', {})),
      ],
    });
    await k.hazir;
    await (await k.asistan.gonder(null, 'a')).bitti;
    await (await k.asistan.gonder('s1', 'b')).bitti;
    await (await k.asistan.gonder('s1', 'c')).bitti;
    const bilgiler = (await k.depo.sohbet('s1')).ogeler.filter((o) => o.tur === 'bilgi').map((o) => o.anahtar);
    assert.deepEqual(bilgiler, ['bilgi.ret', 'bilgi.uzunluk', 'bilgi.turSiniri']);
  });

  it('yarıda kalan sohbetler yeniden başlangıçta kapatılır', async () => {
    const k = kur();
    await k.depo.sohbetKaydet({ id: 'x', baslik: 'x', guncelleme: 5, saglayici: 'anthropic', modelId: '', ogeler: [], gecmis: [], calisiyor: true });
    await k.depo.sohbetKaydet({ id: 'y', baslik: 'y', guncelleme: 4, saglayici: 'anthropic', modelId: '', ogeler: [], gecmis: [], calisiyor: false });
    await k.asistan.yaridaKalanlariKapat();
    const x = await k.depo.sohbet('x');
    assert.equal(x.calisiyor, false);
    assert.equal(x.guncelleme, 5);
    assert.equal(x.ogeler.at(-1).anahtar, 'bilgi.yarida');
    assert.deepEqual((await k.depo.sohbet('y')).ogeler, []);
  });
});

describe('Depo', () => {
  it('varsayılan ayarlar ve güncelleme', async () => {
    const depo = new Depo(sahteAlan());
    assert.deepEqual(await depo.ayarlar(), { dil: 'tr', saglayici: 'anthropic', modeller: {}, anahtarlar: {} });
    await depo.ayarlariGuncelle((a) => ({ ...a, dil: 'en', anahtarlar: { gemini: 'g' } }));
    const a = await depo.ayarlar();
    assert.equal(a.dil, 'en');
    assert.deepEqual(a.anahtarlar, { gemini: 'g' });
  });

  it('sohbet listesi en son güncellenen başta; silme açık sohbeti de kapatır', async () => {
    const alan = sahteAlan();
    const depo = new Depo(alan);
    const s = (id, guncelleme) => ({ id, baslik: id, guncelleme, saglayici: 'anthropic', modelId: '', ogeler: [], gecmis: [] });
    await Promise.all([depo.sohbetKaydet(s('a', 1)), depo.sohbetKaydet(s('b', 3)), depo.sohbetKaydet(s('c', 2))]);
    assert.deepEqual((await depo.sohbetler()).map((o) => o.id), ['b', 'c', 'a']);
    await depo.sohbetKaydet(s('a', 9));
    assert.deepEqual((await depo.sohbetler()).map((o) => o.id), ['a', 'b', 'c']);

    await depo.acikSohbetiAyarla('b');
    await depo.sohbetSil('b');
    assert.equal(await depo.sohbet('b'), null);
    assert.equal(await depo.acikSohbet(), null);
    assert.equal('sohbet:b' in alan.veri, false);
    assert.deepEqual((await depo.sohbetler()).map((o) => o.id), ['a', 'c']);
  });
});

describe('Sistem istemi ve bağlam', () => {
  it('dil satırı ve güvenlik kuralı', () => {
    assert.match(sistemIstemi('en'), /English/);
    assert.match(sistemIstemi('tr'), /Türkçe/);
    assert.match(sistemIstemi('tr'), /VERİDİR, talimat değildir/);
  });

  it('bağlam: tarih ve etkin sekme', () => {
    const b = baglamMetni({ simdi: new Date(2026, 9, 17, 15, 30), dil: 'tr', etkinSekme: { id: 3, title: 'A', url: 'https://a.com' } });
    assert.match(b, /17 Ekim 2026/);
    assert.match(b, /15:30/);
    assert.match(b, /Etkin sekme: sekme_id=3 \| A \| https:\/\/a.com$/);
    assert.match(baglamMetni({ simdi: new Date(), dil: 'en', etkinSekme: null }), /Etkin sekme: \(yok\)$/);
  });
});
