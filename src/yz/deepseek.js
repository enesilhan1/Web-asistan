import { GecmisliIstemci, YanitSonu, YzHatasi, argumanlariCoz, metinAlani, sayi } from './ortak.js';

/**
 * DeepSeek API (OpenAI biçimli POST /chat/completions).
 *
 * Düşünme modu varsayılan olarak açık. Araç kullanılan konuşmalarda DeepSeek,
 * asistan mesajlarındaki `reasoning_content`'in sonraki her istekte aynen
 * geri gönderilmesini şart koşuyor (yoksa 400); bu yüzden yanıt mesajı
 * geçmişe hiç değiştirilmeden eklenir.
 */
export class DeepSeekIstemcisi extends GecmisliIstemci {
  static adres = 'https://api.deepseek.com/chat/completions';

  kullaniciMesaji(baglam, metin) {
    return { role: 'user', content: `${baglam}\n\n${metin}` };
  }

  govde(sistem, araclar) {
    return {
      model: this.model.id,
      messages: [{ role: 'system', content: sistem }, ...this.gecmis],
      tools: araclar.map((a) => ({
        type: 'function',
        function: { name: a.ad, description: a.aciklama, parameters: a.sema },
      })),
      max_tokens: 16000,
      stream: false,
    };
  }

  async yanitAl({ sistem, araclar, sinyal }) {
    const j = await this.istek.gonder(DeepSeekIstemcisi.adres, {
      saglayiciAdi: 'DeepSeek',
      sinyal,
      basliklar: { authorization: `Bearer ${this.apiAnahtari}` },
      govde: this.govde(sistem, araclar),
      hataCevir: (durum) => (durum === 402 ? new YzHatasi('hata.bakiye.deepseek') : null),
    });

    const u = j.usage ?? {};
    const kullanim = {
      girdi: sayi(u, 'prompt_cache_miss_tokens'),
      onbellekOkunan: sayi(u, 'prompt_cache_hit_tokens'),
      onbellekYazilan: 0,
      cikti: sayi(u, 'completion_tokens'),
    };

    const secim = Array.isArray(j.choices) ? j.choices[0] : null;
    if (!secim) return { metinler: [], cagrilar: [], son: YanitSonu.RET, kullanim };
    const mesaj = { ...secim.message };
    this.gecmis.push(mesaj);

    const cagrilar = (mesaj.tool_calls ?? []).map((c) => ({
      id: c.id,
      ad: c.function.name,
      girdi: argumanlariCoz(c.function.arguments),
    }));
    const metin = typeof mesaj.content === 'string' ? mesaj.content : '';

    const neden = secim.finish_reason;
    return {
      metinler: metin ? [metin] : [],
      cagrilar,
      son:
        neden === 'tool_calls'
          ? YanitSonu.ARAC
          : neden === 'length'
            ? YanitSonu.UZUNLUK
            : neden === 'content_filter'
              ? YanitSonu.RET
              : cagrilar.length
                ? YanitSonu.ARAC
                : YanitSonu.BITTI,
      kullanim,
    };
  }

  aracSonuclari() {
    return this.gecmis.filter((m) => m.role === 'tool').map((m) => metinAlani(m, 'content'));
  }

  sonuclariEkle(sonuclar) {
    for (const s of sonuclar) {
      this.gecmis.push({
        role: 'tool',
        tool_call_id: s.cagri.id,
        content: s.hata ? `HATA: ${s.metin}` : s.metin,
      });
    }
  }
}
