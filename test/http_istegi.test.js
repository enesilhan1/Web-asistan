import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JsonIstegi } from '../src/yz/http_istegi.js';
import { YzHatasi } from '../src/yz/ortak.js';
import { sahteFetch } from './yardimci.js';

const gonder = (fetch, ek = {}) =>
  new JsonIstegi({ fetch, tekrarBeklemesiMs: 1, ...ek }).gonder('https://ornek/api', {
    basliklar: { 'x-ek': '1' },
    govde: { a: 1 },
    saglayiciAdi: 'Deneme',
    ...ek,
  });

describe('JsonIstegi', () => {
  it('başarılı yanıtı çözer, başlıkları birleştirir', async () => {
    const fetch = sahteFetch([{ govde: { tamam: true } }]);
    assert.deepEqual(await gonder(fetch), { tamam: true });
    assert.deepEqual(fetch.istekler[0].basliklar, { 'content-type': 'application/json', 'x-ek': '1' });
    assert.deepEqual(fetch.istekler[0].govde, { a: 1 });
  });

  it('429 ve 5xx hatalarında tekrar dener', async () => {
    const fetch = sahteFetch([{ durum: 429 }, { durum: 503 }, { govde: { tamam: 1 } }]);
    assert.deepEqual(await gonder(fetch), { tamam: 1 });
    assert.equal(fetch.istekler.length, 3);
  });

  it('üç denemeden sonra yoğunluk hatası verir', async () => {
    const fetch = sahteFetch([{ durum: 529 }, { durum: 529 }, { durum: 529 }]);
    await assert.rejects(gonder(fetch), { anahtar: 'hata.yogun', parametreler: { ad: 'Deneme' } });
  });

  it('ağ hatasında tekrar dener, sonunda bağlantı hatası verir', async () => {
    const ok = sahteFetch([new TypeError('Failed to fetch'), { govde: {} }]);
    assert.deepEqual(await gonder(ok), {});

    const kotu = sahteFetch([new TypeError('x'), new TypeError('x'), new TypeError('x')]);
    await assert.rejects(gonder(kotu), { anahtar: 'hata.baglanti' });
  });

  it('zaman aşımında zamanAsimi hatası verir', async () => {
    const asili = (istek) =>
      new Promise((_, reddet) => istek.sinyal.addEventListener('abort', () => reddet(new Error('abort'))));
    const fetch = sahteFetch([asili, asili, asili]);
    await assert.rejects(gonder(fetch, { zamanAsimiMs: 5 }), { anahtar: 'hata.zamanAsimi' });
  });

  it('durum kodlarını ortak hatalara çevirir (tekrar denemeden)', async () => {
    const durumlar = { 401: 'hata.anahtar', 403: 'hata.izin', 404: 'hata.model', 400: 'hata.reddetti' };
    for (const [durum, anahtar] of Object.entries(durumlar)) {
      const fetch = sahteFetch([{ durum: Number(durum), govde: { error: { message: 'ayrıntı' } } }]);
      await assert.rejects(gonder(fetch), (e) => {
        assert.ok(e instanceof YzHatasi);
        assert.equal(e.anahtar, anahtar);
        return true;
      });
      assert.equal(fetch.istekler.length, 1);
    }
    const f = sahteFetch([{ durum: 400, govde: { error: { message: 'kötü istek' } } }]);
    await assert.rejects(gonder(f), { parametreler: { ad: 'Deneme', durum: 400, mesaj: 'kötü istek' } });
  });

  it('özel hata çeviricisi önce sorulur', async () => {
    const fetch = sahteFetch([{ durum: 402, govde: { error: 'para yok' } }]);
    await assert.rejects(
      gonder(fetch, { hataCevir: (d, m) => (d === 402 && m === 'para yok' ? new YzHatasi('ozel') : null) }),
      { anahtar: 'ozel' },
    );
  });

  it('kullanıcı durdurunca hemen durduruldu hatası verir', async () => {
    const d = new AbortController();
    const asili = (istek) =>
      new Promise((_, reddet) => istek.sinyal.addEventListener('abort', () => reddet(new Error('abort'))));
    const fetch = sahteFetch([asili]);
    const p = gonder(fetch, { sinyal: d.signal });
    d.abort();
    await assert.rejects(p, { anahtar: 'hata.durduruldu' });
    assert.equal(fetch.istekler.length, 1);
  });

  it('bozuk JSON yanıtında bozukYanit hatası', async () => {
    const fetch = sahteFetch([{ govde: '<html>' }]);
    await assert.rejects(gonder(fetch), { anahtar: 'hata.bozukYanit' });
  });
});
