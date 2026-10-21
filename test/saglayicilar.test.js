import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { modelBul } from '../src/yz/katalog.js';
import { istemciOlustur } from '../src/yz/istemciler.js';
import { geminiSemasi } from '../src/yz/gemini.js';
import { YanitSonu } from '../src/yz/ortak.js';
import { ARAC, sahteFetch } from './yardimci.js';

const SISTEM = 'Sistem istemi';
const sonuc = (cagri, metin, hata = false) => ({ cagri, metin, hata });

function istemci(saglayici, modelId, yanitlar) {
  const fetch = sahteFetch(yanitlar);
  const i = istemciOlustur({
    model: modelBul(saglayici, modelId),
    apiAnahtari: 'anahtar-123',
    fetch,
    tekrarBeklemesiMs: 1,
  });
  return { i, fetch };
}

describe('Anthropic', () => {
  it('istek biçimi, araç çağrısı ve sonuç döngüsü', async () => {
    const { i, fetch } = istemci('anthropic', 'claude-opus-5-5', [
      {
        govde: {
          content: [
            { type: 'thinking', thinking: '...', signature: 'imza' },
            { type: 'text', text: 'Bakıyorum.' },
            { type: 'tool_use', id: 'tu_1', name: 'sekmeyi_oku', input: { sekme_id: 7 } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 5, output_tokens: 30 },
        },
      },
      { govde: { content: [{ type: 'text', text: 'Özet' }], stop_reason: 'end_turn', usage: {} } },
    ]);

    i.kullaniciEkle('BAĞLAM', 'Bu sayfayı özetle');
    const y = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });

    const ist = fetch.istekler[0];
    assert.equal(ist.adres, 'https://api.anthropic.com/v1/messages');
    assert.equal(ist.basliklar['x-api-key'], 'anahtar-123');
    assert.equal(ist.basliklar['anthropic-version'], '2023-06-01');
    assert.equal(ist.basliklar['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(ist.basliklar['anthropic-beta'], 'server-side-fallback-2026-07-01');
    assert.equal(ist.govde.model, 'claude-opus-5-5');
    assert.equal(ist.govde.system, SISTEM);
    assert.equal(ist.govde.fallbacks, 'default');
    assert.deepEqual(ist.govde.output_config, { effort: 'medium' });
    assert.deepEqual(ist.govde.tools[0], { name: ARAC.ad, description: ARAC.aciklama, input_schema: ARAC.sema });
    assert.deepEqual(ist.govde.messages[0].content.map((c) => c.text), ['BAĞLAM', 'Bu sayfayı özetle']);

    assert.equal(y.son, YanitSonu.ARAC);
    assert.deepEqual(y.metinler, ['Bakıyorum.']);
    assert.deepEqual(y.cagrilar, [{ id: 'tu_1', ad: 'sekmeyi_oku', girdi: { sekme_id: 7 } }]);
    assert.deepEqual(y.kullanim, { girdi: 100, onbellekOkunan: 20, onbellekYazilan: 5, cikti: 30 });

    i.sonuclariEkle([sonuc(y.cagrilar[0], 'sayfa metni'), sonuc({ id: 'x', ad: 'a' }, 'olmadı', true)]);
    const y2 = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });
    assert.equal(y2.son, YanitSonu.BITTI);

    const mesajlar = fetch.istekler[1].govde.messages;
    // Düşünme bloğu (imzasıyla) aynen geri gönderilir.
    assert.equal(mesajlar[1].content[0].signature, 'imza');
    assert.deepEqual(mesajlar[2].content, [
      { type: 'tool_result', tool_use_id: 'tu_1', content: 'sayfa metni' },
      { type: 'tool_result', tool_use_id: 'x', content: 'olmadı', is_error: true },
    ]);
  });

  it('Haiku ve elle yazılan modelde yedek model gönderilmez', async () => {
    for (const id of ['claude-haiku-5-5', 'claude-ozel-1']) {
      const { i, fetch } = istemci('anthropic', id, [{ govde: { content: [], stop_reason: 'end_turn' } }]);
      i.kullaniciEkle('b', 'm');
      await i.yanitAl({ sistem: SISTEM, araclar: [] });
      assert.equal(fetch.istekler[0].govde.fallbacks, undefined);
      assert.equal(fetch.istekler[0].basliklar['anthropic-beta'], undefined);
      assert.equal(fetch.istekler[0].govde.model, id);
    }
  });

  it('bakiye hatası ve ret', async () => {
    const { i } = istemci('anthropic', '', [
      { durum: 400, govde: { error: { message: 'Your credit balance is too low' } } },
    ]);
    i.kullaniciEkle('b', 'm');
    await assert.rejects(i.yanitAl({ sistem: SISTEM, araclar: [] }), { anahtar: 'hata.bakiye.anthropic' });

    const r = istemci('anthropic', '', [{ govde: { content: [], stop_reason: 'refusal' } }]);
    r.i.kullaniciEkle('b', 'm');
    assert.equal((await r.i.yanitAl({ sistem: SISTEM, araclar: [] })).son, YanitSonu.RET);
  });
});

describe('OpenAI', () => {
  it('Responses API biçimi ve araç döngüsü', async () => {
    const { i, fetch } = istemci('openai', '', [
      {
        govde: {
          output: [
            { type: 'reasoning', id: 'rs_1', encrypted_content: 'şifreli' },
            { type: 'function_call', call_id: 'call_1', name: 'sekmeyi_oku', arguments: '{"sekme_id":3}' },
          ],
          usage: { input_tokens: 50, input_tokens_details: { cached_tokens: 10 }, output_tokens: 7 },
        },
      },
      {
        govde: {
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'Tamam' }] }],
          usage: {},
        },
      },
    ]);

    i.kullaniciEkle('BAĞLAM', 'soru');
    const y = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });
    const ist = fetch.istekler[0];
    assert.equal(ist.adres, 'https://api.openai.com/v1/responses');
    assert.equal(ist.basliklar.authorization, 'Bearer anahtar-123');
    assert.equal(ist.govde.model, 'gpt-6.1-sol');
    assert.equal(ist.govde.instructions, SISTEM);
    assert.equal(ist.govde.store, false);
    assert.deepEqual(ist.govde.include, ['reasoning.encrypted_content']);
    assert.deepEqual(ist.govde.tools[0], {
      type: 'function', name: ARAC.ad, description: ARAC.aciklama, parameters: ARAC.sema,
    });

    assert.equal(y.son, YanitSonu.ARAC);
    assert.deepEqual(y.cagrilar, [{ id: 'call_1', ad: 'sekmeyi_oku', girdi: { sekme_id: 3 } }]);
    assert.deepEqual(y.kullanim, { girdi: 40, onbellekOkunan: 10, onbellekYazilan: 0, cikti: 7 });

    i.sonuclariEkle([sonuc(y.cagrilar[0], 'metin'), sonuc({ id: 'call_2', ad: 'x' }, 'yok', true)]);
    const y2 = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });
    assert.deepEqual(y2.metinler, ['Tamam']);
    assert.equal(y2.son, YanitSonu.BITTI);

    const girdi = fetch.istekler[1].govde.input;
    assert.equal(girdi[1].encrypted_content, 'şifreli');
    assert.deepEqual(girdi.slice(3), [
      { type: 'function_call_output', call_id: 'call_1', output: 'metin' },
      { type: 'function_call_output', call_id: 'call_2', output: 'HATA: yok' },
    ]);
  });

  it('kota bitince özel hata, ret ve uzunluk', async () => {
    const k = istemci('openai', '', [
      { durum: 429, govde: { error: { message: 'You exceeded your current quota' } } },
    ]);
    k.i.kullaniciEkle('b', 'm');
    await assert.rejects(k.i.yanitAl({ sistem: SISTEM, araclar: [] }), { anahtar: 'hata.bakiye.openai' });

    const r = istemci('openai', '', [
      { govde: { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'hayır' }] }] } },
      { govde: { output: [], incomplete_details: { reason: 'max_output_tokens' } } },
    ]);
    r.i.kullaniciEkle('b', 'm');
    assert.equal((await r.i.yanitAl({ sistem: SISTEM, araclar: [] })).son, YanitSonu.RET);
    assert.equal((await r.i.yanitAl({ sistem: SISTEM, araclar: [] })).son, YanitSonu.UZUNLUK);
  });
});

describe('DeepSeek', () => {
  it('reasoning_content aynen geri gönderilir', async () => {
    const { i, fetch } = istemci('deepseek', '', [
      {
        govde: {
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: '',
                reasoning_content: 'düşünce',
                tool_calls: [
                  { id: 'c1', type: 'function', function: { name: 'sekmeyi_oku', arguments: '{"sekme_id":5}' } },
                ],
              },
            },
          ],
          usage: { prompt_cache_miss_tokens: 9, prompt_cache_hit_tokens: 4, completion_tokens: 3 },
        },
      },
      { govde: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Bitti' } }] } },
    ]);

    i.kullaniciEkle('BAĞLAM', 'soru');
    const y = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });
    const ist = fetch.istekler[0];
    assert.equal(ist.adres, 'https://api.deepseek.com/chat/completions');
    assert.equal(ist.basliklar.authorization, 'Bearer anahtar-123');
    assert.deepEqual(ist.govde.messages, [
      { role: 'system', content: SISTEM },
      { role: 'user', content: 'BAĞLAM\n\nsoru' },
    ]);
    assert.equal(ist.govde.tools[0].function.name, ARAC.ad);
    assert.equal(y.son, YanitSonu.ARAC);
    assert.deepEqual(y.metinler, []);
    assert.deepEqual(y.kullanim, { girdi: 9, onbellekOkunan: 4, onbellekYazilan: 0, cikti: 3 });

    i.sonuclariEkle([sonuc(y.cagrilar[0], 'metin')]);
    const y2 = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });
    assert.deepEqual(y2.metinler, ['Bitti']);
    const m = fetch.istekler[1].govde.messages;
    assert.equal(m[2].reasoning_content, 'düşünce');
    assert.deepEqual(m[3], { role: 'tool', tool_call_id: 'c1', content: 'metin' });
  });

  it('402 bakiye hatası', async () => {
    const { i } = istemci('deepseek', '', [{ durum: 402, govde: { error: { message: 'Insufficient Balance' } } }]);
    i.kullaniciEkle('b', 'm');
    await assert.rejects(i.yanitAl({ sistem: SISTEM, araclar: [] }), { anahtar: 'hata.bakiye.deepseek' });
  });
});

describe('Gemini', () => {
  it('imzalı parçalar aynen geri gönderilir, şema büyük harfe çevrilir', async () => {
    const { i, fetch } = istemci('gemini', '', [
      {
        govde: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { text: 'düşünüyorum', thought: true },
                  { functionCall: { name: 'sekmeyi_oku', args: { sekme_id: 2 } }, thoughtSignature: 'imza' },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 30, cachedContentTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
        },
      },
      { govde: { candidates: [{ content: { role: 'model', parts: [{ text: 'Özet' }] }, finishReason: 'STOP' }] } },
    ]);

    i.kullaniciEkle('BAĞLAM', 'soru');
    const y = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });
    const ist = fetch.istekler[0];
    assert.equal(
      ist.adres,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    );
    assert.equal(ist.basliklar['x-goog-api-key'], 'anahtar-123');
    assert.deepEqual(ist.govde.systemInstruction, { parts: [{ text: SISTEM }] });
    assert.equal(ist.govde.tools[0].functionDeclarations[0].parameters.type, 'OBJECT');
    assert.equal(ist.govde.tools[0].functionDeclarations[0].parameters.properties.sekme_id.type, 'INTEGER');

    assert.equal(y.son, YanitSonu.ARAC);
    assert.deepEqual(y.metinler, []);
    assert.deepEqual(y.cagrilar, [{ id: 'sekmeyi_oku#1', ad: 'sekmeyi_oku', girdi: { sekme_id: 2 } }]);
    assert.deepEqual(y.kullanim, { girdi: 20, onbellekOkunan: 10, onbellekYazilan: 0, cikti: 7 });

    i.sonuclariEkle([sonuc(y.cagrilar[0], 'metin')]);
    const y2 = await i.yanitAl({ sistem: SISTEM, araclar: [ARAC] });
    assert.deepEqual(y2.metinler, ['Özet']);
    const c = fetch.istekler[1].govde.contents;
    assert.equal(c[1].parts[1].thoughtSignature, 'imza');
    // Kimliksiz çağrının yanıtında id gönderilmez.
    assert.deepEqual(c[2], {
      role: 'user',
      parts: [{ functionResponse: { name: 'sekmeyi_oku', response: { sonuc: 'metin' } } }],
    });
  });

  it('parametresiz araçta şema gönderilmez', async () => {
    const { i, fetch } = istemci('gemini', '', [{ govde: { candidates: [{ content: { parts: [] } }] } }]);
    i.kullaniciEkle('b', 'm');
    await i.yanitAl({ sistem: SISTEM, araclar: [{ ad: 'liste', aciklama: 'a', sema: { type: 'object', properties: {} } }] });
    assert.deepEqual(fetch.istekler[0].govde.tools[0].functionDeclarations[0], { name: 'liste', description: 'a' });
  });

  it('aday yoksa ret, kimlikli çağrıda id geri gönderilir', async () => {
    const r = istemci('gemini', '', [{ govde: { promptFeedback: { blockReason: 'SAFETY' } } }]);
    r.i.kullaniciEkle('b', 'm');
    assert.equal((await r.i.yanitAl({ sistem: SISTEM, araclar: [] })).son, YanitSonu.RET);

    const { i } = istemci('gemini', '', []);
    i.sonuclariEkle([sonuc({ id: 'abc', ad: 'x' }, 'hata', true)]);
    assert.deepEqual(i.gecmis[0].parts[0].functionResponse, { name: 'x', id: 'abc', response: { hata: 'hata' } });
  });

  it('geçersiz anahtar ve kota hataları', async () => {
    const a = istemci('gemini', '', [{ durum: 400, govde: { error: { message: 'API key not valid' } } }]);
    a.i.kullaniciEkle('b', 'm');
    await assert.rejects(a.i.yanitAl({ sistem: SISTEM, araclar: [] }), { anahtar: 'hata.anahtar' });

    const k = istemci('gemini', '', [{ durum: 429, govde: [{ error: { message: 'Resource has been exhausted' } }] }]);
    k.i.kullaniciEkle('b', 'm');
    await assert.rejects(k.i.yanitAl({ sistem: SISTEM, araclar: [] }), { anahtar: 'hata.kota.gemini' });
  });

  it('geminiSemasi iç içe türleri çevirir, diğer alanları korur', () => {
    assert.deepEqual(
      geminiSemasi({
        type: 'object',
        properties: { liste: { type: 'array', items: { type: 'string', enum: ['a'] } } },
        required: ['liste'],
      }),
      {
        type: 'OBJECT',
        properties: { liste: { type: 'ARRAY', items: { type: 'STRING', enum: ['a'] } } },
        required: ['liste'],
      },
    );
  });
});

describe('Ortak istemci davranışı', () => {
  it('geriAl son kullanıcı mesajından önceki hale döndürür', () => {
    const { i } = istemci('anthropic', '', []);
    i.kullaniciEkle('b', 'ilk');
    i.gecmis.push({ role: 'assistant', content: [] });
    i.kullaniciEkle('b', 'ikinci');
    i.gecmis.push({ role: 'assistant', content: [] });
    i.geriAl();
    assert.equal(i.gecmis.length, 2);
  });

  it('kayıtlı geçmişle devam eder (aynı dizi yerinde güncellenir)', async () => {
    const gecmis = [{ role: 'user', content: 'eski' }, { role: 'assistant', content: 'eski yanıt' }];
    const fetch = sahteFetch([{ govde: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'yeni' } }] } }]);
    const i = istemciOlustur({ model: modelBul('deepseek'), apiAnahtari: 'k', gecmis, fetch });
    i.kullaniciEkle('b', 'm');
    await i.yanitAl({ sistem: SISTEM, araclar: [] });
    assert.equal(gecmis.length, 4);
    assert.equal(fetch.istekler[0].govde.messages.length, 4);
    i.geriAl();
    assert.equal(gecmis.length, 2);
  });
});

describe('Eski araç sonuçlarının kısaltılması', () => {
  const buyuk = (harf) => harf.repeat(50_000);
  const cagri = (id) => ({ id, ad: 'sekmeyi_oku', girdi: {} });

  /** Her sağlayıcıda 6 tur sonuç ekler; kalan metinleri döner. */
  function doldur(saglayici) {
    const { i } = istemci(saglayici, '', []);
    i.kullaniciEkle('b', 'm');
    for (const h of 'abcdef') i.sonuclariEkle([{ cagri: cagri(`c${h}`), metin: buyuk(h) }]);
    return i;
  }

  for (const saglayici of ['anthropic', 'openai', 'deepseek', 'gemini']) {
    it(`${saglayici}: sınır aşılınca en eskiler kısaltılır, son tur korunur`, () => {
      const i = doldur(saglayici);
      assert.equal(i.aracSonuclari().length, 6);
      // 300 bin > 200 bin: toplam 80 bine inene kadar eskiden yeniye.
      assert.equal(i.eskiSonuclariKisalt({ sonKorunan: 1 }), 5);
      const uzunluklar = i.aracSonuclari().map((s) => s.uzunluk);
      assert.equal(uzunluklar.at(-1), 50_000);
      assert.ok(uzunluklar.slice(0, 5).every((u) => u < 200));
      // Biçim bozulmadı: araç kimlikleri yerinde, istek gövdesi JSON'a çevrilebilir.
      assert.ok(JSON.stringify(i.gecmis).includes('ce'));
      assert.match(JSON.stringify(i.gecmis), /yer açmak amacıyla kaldırıldı/);
      // Sınırın altındayken hiçbir şey yapmaz.
      assert.equal(i.eskiSonuclariKisalt({ sonKorunan: 1 }), 0);
    });
  }

  it('alt sınıra inince durur; son korunanlara dokunmaz', () => {
    const i = doldur('anthropic');
    // 300 bin → iki kısaltmada ~200,2 bin (notlar dahil) ≤ 210 bin.
    assert.equal(i.eskiSonuclariKisalt({ ust: 100_000, alt: 210_000, sonKorunan: 0 }), 2);
    assert.equal(i.eskiSonuclariKisalt({ ust: 0, alt: 0, sonKorunan: 6 }), 0);
  });
});
