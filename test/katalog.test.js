import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { METINLER, cevir } from '../src/dil.js';
import {
  SAGLAYICILAR,
  anahtarBicimiUygun,
  maliyet,
  modelBul,
  saglayiciBul,
} from '../src/yz/katalog.js';

describe('Katalog', () => {
  it('dört sağlayıcı, ilki Claude, her modelin sağlayıcısı doğru', () => {
    assert.deepEqual(SAGLAYICILAR.map((s) => s.id), ['anthropic', 'openai', 'gemini', 'deepseek']);
    for (const s of SAGLAYICILAR) {
      assert.ok(s.modeller.length >= 2);
      for (const m of s.modeller) {
        assert.equal(m.saglayici, s.id);
        assert.ok(m.aciklama.tr && m.aciklama.en);
      }
    }
  });

  it('modelBul: boşsa varsayılan, listede yoksa elle yazılan', () => {
    assert.equal(modelBul('anthropic', '').id, 'claude-opus-5-5');
    assert.equal(modelBul('openai', undefined).id, 'gpt-6.1-sol');
    assert.equal(modelBul('gemini', 'gemini-4-argon').ad, 'Gemini 4 Argon');
    const elle = modelBul('deepseek', '  ozel-model ');
    assert.equal(elle.id, 'ozel-model');
    assert.equal(elle.elle, true);
    assert.equal(elle.saglayici, 'deepseek');
    assert.equal(saglayiciBul('yok').id, 'anthropic');
  });

  it('maliyet: önbellek fiyatları, bilinmeyen modelde null', () => {
    const m = modelBul('anthropic', 'claude-opus-5-5');
    const k = { girdi: 1e6, onbellekOkunan: 1e6, onbellekYazilan: 1e6, cikti: 1e6 };
    assert.equal(maliyet(m, k), 4 + 0.2 + 5 + 20);
    // Önbellek fiyatı yoksa girdi fiyatı kullanılır.
    assert.equal(maliyet(modelBul('gemini', ''), { onbellekOkunan: 1e6 }), 0.75);
    assert.equal(maliyet(modelBul('openai', 'ozel'), k), null);
  });

  it('anahtar ön eki kontrolü', () => {
    assert.equal(anahtarBicimiUygun('anthropic', 'sk-ant-abc'), true);
    assert.equal(anahtarBicimiUygun('anthropic', 'sk-abc'), false);
    assert.equal(anahtarBicimiUygun('gemini', 'AIza...'), true);
  });
});

describe('Dil', () => {
  it('iki dilde de aynı anahtarlar var', () => {
    assert.deepEqual(Object.keys(METINLER.en).sort(), Object.keys(METINLER.tr).sort());
  });

  it('parametreleri yerleştirir, boş parametre sonda boşluk bırakmaz', () => {
    assert.equal(cevir('tr', 'hata.yogun', { ad: 'Claude' }), 'Claude şu an çok yoğun. Birkaç dakika sonra tekrar dene.');
    assert.equal(cevir('en', 'hata.model', { mesaj: '' }), 'Model not found. Check the model name in Settings.');
    assert.equal(cevir('fr', 'hata.durduruldu'), 'Durduruldu.');
    assert.equal(cevir('tr', 'olmayan.anahtar'), 'olmayan.anahtar');
  });
});
