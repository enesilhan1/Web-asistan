// Asistanın kullanabileceği yapay zekâ sağlayıcıları ve modelleri
// (docs/SPEC.md §2). Fiyatlar milyon token başına ABD doları, Ekim 2026.

/** @typedef {{tr: string, en: string}} IkiDilli */

/**
 * @typedef {Object} YzModeli
 * @property {string} saglayici
 * @property {string} id
 * @property {string} ad
 * @property {IkiDilli} aciklama
 * @property {boolean} [elle]   Kullanıcının elle yazdığı, listede olmayan model.
 * @property {number} [girdi]
 * @property {number} [onbellekOkuma]
 * @property {number} [onbellekYazma]
 * @property {number} [cikti]
 */

export const SAGLAYICILAR = [
  {
    id: 'anthropic',
    ad: 'Claude (Anthropic)',
    kisaAd: 'Claude',
    anahtarSayfasi: 'https://console.anthropic.com/settings/keys',
    anahtarOneki: 'sk-ant-',
    modeller: [
      {
        id: 'claude-opus-5-5',
        ad: 'Claude Opus 5.5',
        aciklama: { tr: 'En akıllısı (önerilen)', en: 'Most capable (recommended)' },
        girdi: 4, onbellekOkuma: 0.2, onbellekYazma: 5, cikti: 20,
      },
      {
        id: 'claude-sonnet-5-5',
        ad: 'Claude Sonnet 5.5',
        aciklama: { tr: 'Hızlı ve yaklaşık yarı fiyatına', en: 'Fast, about half the price' },
        girdi: 2, onbellekOkuma: 0.2, onbellekYazma: 2.5, cikti: 10,
      },
      {
        id: 'claude-haiku-5-5',
        ad: 'Claude Haiku 5.5',
        aciklama: { tr: 'En hızlı ve en ucuzu', en: 'Fastest and cheapest' },
        girdi: 0.1, onbellekOkuma: 0.01, onbellekYazma: 0.125, cikti: 0.5,
      },
    ],
  },
  {
    id: 'openai',
    ad: 'ChatGPT (OpenAI)',
    kisaAd: 'ChatGPT',
    anahtarSayfasi: 'https://platform.openai.com/api-keys',
    anahtarOneki: 'sk-',
    modeller: [
      {
        id: 'gpt-6.1-sol',
        ad: 'GPT-6.1 Sol',
        aciklama: { tr: 'Dengeli (önerilen)', en: 'Balanced (recommended)' },
        girdi: 2, onbellekOkuma: 0.1, cikti: 10,
      },
      {
        id: 'gpt-6-astra',
        ad: 'GPT-6 Astra',
        aciklama: { tr: 'En güçlüsü, pahalı', en: 'Most powerful, expensive' },
        girdi: 10, onbellekOkuma: 1, cikti: 50,
      },
      {
        id: 'gpt-6-luna',
        ad: 'GPT-6 Luna',
        aciklama: { tr: 'En ucuzu', en: 'Cheapest' },
        girdi: 0.1, onbellekOkuma: 0.01, cikti: 0.5,
      },
    ],
  },
  {
    id: 'gemini',
    ad: 'Gemini (Google)',
    kisaAd: 'Gemini',
    anahtarSayfasi: 'https://aistudio.google.com/apikey',
    anahtarOneki: null,
    modeller: [
      {
        id: 'gemini-3.8-flash',
        ad: 'Gemini 3.8 Flash',
        aciklama: { tr: 'Hızlı, ücretsiz kotası var (önerilen)', en: 'Fast, has a free tier (recommended)' },
        girdi: 0.75, cikti: 3.75,
      },
      {
        id: 'gemini-4-argon',
        ad: 'Gemini 4 Argon',
        aciklama: { tr: 'En güçlüsü, ücretsiz kotası yok', en: 'Most powerful, no free tier' },
        girdi: 2, cikti: 10,
      },
      {
        id: 'gemini-3.5-flash-lite',
        ad: 'Gemini 3.5 Flash-Lite',
        aciklama: { tr: 'En ucuzu, ücretsiz kotası var', en: 'Cheapest, has a free tier' },
        girdi: 0.3, cikti: 2.5,
      },
    ],
  },
  {
    id: 'deepseek',
    ad: 'DeepSeek',
    kisaAd: 'DeepSeek',
    anahtarSayfasi: 'https://platform.deepseek.com/api_keys',
    anahtarOneki: 'sk-',
    modeller: [
      {
        id: 'deepseek-flash',
        ad: 'DeepSeek Flash',
        aciklama: { tr: 'Çok ucuz (önerilen)', en: 'Very cheap (recommended)' },
        // Yoğun saat fiyatı (gece yarısı fiyatın yarısı); tahmin üst sınır.
        girdi: 0.3, onbellekOkuma: 0.006, cikti: 1.2,
      },
      {
        id: 'deepseek-v4-pro',
        ad: 'DeepSeek V4 Pro',
        aciklama: { tr: 'Daha güçlü, yine ucuz', en: 'Stronger, still cheap' },
        girdi: 1.32, onbellekOkuma: 0.044, cikti: 3.96,
      },
    ],
  },
].map((s) => ({ ...s, modeller: s.modeller.map((m) => ({ ...m, saglayici: s.id })) }));

export const VARSAYILAN_SAGLAYICI = 'anthropic';

/** Kimliğe göre sağlayıcı; bilinmiyorsa Claude. */
export function saglayiciBul(id) {
  return SAGLAYICILAR.find((s) => s.id === id) ?? SAGLAYICILAR[0];
}

/**
 * Kayıtlı model kimliğine göre model; boşsa varsayılan, listede yoksa
 * elle yazılmış model.
 * @returns {YzModeli}
 */
export function modelBul(saglayiciId, modelId) {
  const s = saglayiciBul(saglayiciId);
  const id = (modelId ?? '').trim();
  if (!id) return s.modeller[0];
  return (
    s.modeller.find((m) => m.id === id) ?? {
      saglayici: s.id,
      id,
      ad: id,
      aciklama: { tr: 'Elle yazılan model', en: 'Custom model' },
      elle: true,
    }
  );
}

/**
 * @typedef {Object} Kullanim
 * @property {number} girdi           Önbellekten okunmayan girdi.
 * @property {number} onbellekOkunan
 * @property {number} onbellekYazilan
 * @property {number} cikti           Düşünme dahil çıktı.
 */

/** Yaklaşık maliyet (dolar); fiyat bilinmiyorsa null. */
export function maliyet(model, k) {
  const g = model.girdi;
  const c = model.cikti;
  if (g == null || c == null) return null;
  return (
    ((k.girdi ?? 0) * g +
      (k.onbellekOkunan ?? 0) * (model.onbellekOkuma ?? g) +
      (k.onbellekYazilan ?? 0) * (model.onbellekYazma ?? g) +
      (k.cikti ?? 0) * c) /
    1e6
  );
}

/** Anahtarın beklenen ön ekle başlayıp başlamadığı (sadece uyarı için). */
export function anahtarBicimiUygun(saglayiciId, anahtar) {
  const onek = saglayiciBul(saglayiciId).anahtarOneki;
  return !onek || anahtar.trim().startsWith(onek);
}
