import { GecmisliIstemci, YanitSonu, YzHatasi, metinAlani, sayi } from './ortak.js';

/** Anthropic Messages API (POST /v1/messages). */
export class AnthropicIstemcisi extends GecmisliIstemci {
  static adres = 'https://api.anthropic.com/v1/messages';

  /**
   * Sunucu taraflı yedek model ("fallbacks": "default"): Claude güvenlik
   * sınıflandırıcısı yüzünden bir isteği reddederse API uygun bir yedek
   * modelle otomatik tekrar dener. Opus 5.5 ve Sonnet 5.5'te var, Haiku'da
   * yok; elle yazılan modellerde bilinmediği için gönderilmez.
   */
  get yedekModel() {
    return this.model.id === 'claude-opus-5-5' || this.model.id === 'claude-sonnet-5-5';
  }

  kullaniciMesaji(baglam, metin) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: baglam },
        { type: 'text', text: metin },
      ],
    };
  }

  govde(sistem, araclar) {
    return {
      model: this.model.id,
      max_tokens: 16000,
      system: sistem,
      tools: araclar.map((a) => ({ name: a.ad, description: a.aciklama, input_schema: a.sema })),
      messages: this.gecmis,
      // Düşünme uyarlamalı (varsayılan); derinliği efor belirler. Sayfa
      // inceleme için orta efor yeterli ve ekonomik.
      output_config: { effort: 'medium' },
      // Sohbet uzadıkça önceki kısım (okunan sayfalar dahil) önbellekten okunsun.
      cache_control: { type: 'ephemeral' },
      ...(this.yedekModel ? { fallbacks: 'default' } : {}),
    };
  }

  /** @returns {Promise<import('./ortak.js').YzYaniti>} */
  async yanitAl({ sistem, araclar, sinyal }) {
    const j = await this.istek.gonder(AnthropicIstemcisi.adres, {
      saglayiciAdi: 'Claude',
      sinyal,
      basliklar: {
        'x-api-key': this.apiAnahtari,
        'anthropic-version': '2023-06-01',
        // Tarayıcıdan (eklentiden) doğrudan çağrı için gerekli; anahtar
        // kullanıcının kendisine ait ve yalnızca onun bilgisayarında.
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(this.yedekModel ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
      },
      govde: this.govde(sistem, araclar),
      hataCevir: (durum, mesaj) =>
        durum === 400 && mesaj.toLowerCase().includes('credit balance')
          ? new YzHatasi('hata.bakiye.anthropic')
          : null,
    });

    const icerik = Array.isArray(j.content) ? j.content : [];
    // Yanıt olduğu gibi geçmişe eklenir (düşünme blokları dahil).
    this.gecmis.push({ role: 'assistant', content: icerik });

    const cagrilar = icerik
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, ad: b.name, girdi: { ...(b.input ?? {}) } }));
    const u = j.usage ?? {};

    return {
      metinler: icerik.filter((b) => b.type === 'text').map((b) => b.text),
      cagrilar,
      son:
        j.stop_reason === 'tool_use'
          ? YanitSonu.ARAC
          : j.stop_reason === 'max_tokens'
            ? YanitSonu.UZUNLUK
            : j.stop_reason === 'refusal'
              ? YanitSonu.RET
              : YanitSonu.BITTI,
      kullanim: {
        girdi: sayi(u, 'input_tokens'),
        onbellekOkunan: sayi(u, 'cache_read_input_tokens'),
        onbellekYazilan: sayi(u, 'cache_creation_input_tokens'),
        cikti: sayi(u, 'output_tokens'),
      },
    };
  }

  aracSonuclari() {
    return this.gecmis.flatMap((m) =>
      m.role === 'user' && Array.isArray(m.content)
        ? m.content.filter((b) => b.type === 'tool_result' && typeof b.content === 'string').map((b) => metinAlani(b, 'content'))
        : [],
    );
  }

  sonuclariEkle(sonuclar) {
    // Bütün araç sonuçları tek bir kullanıcı mesajında.
    this.gecmis.push({
      role: 'user',
      content: sonuclar.map((s) => ({
        type: 'tool_result',
        tool_use_id: s.cagri.id,
        content: s.metin,
        ...(s.hata ? { is_error: true } : {}),
      })),
    });
  }
}
