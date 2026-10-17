import { GecmisliIstemci, YanitSonu, YzHatasi, argumanlariCoz, sayi } from './ortak.js';

/**
 * OpenAI Responses API (POST /v1/responses). Güncel GPT modelleri araç
 * kullanmak için Chat Completions değil bu API'yi istiyor.
 *
 * Sunucuda saklama kapalı (`store: false`); geçmiş her istekte yeniden
 * gönderilir. Modelin çıktı öğeleri (şifreli düşünme öğeleri dahil)
 * değiştirilmeden geçmişe eklenir.
 */
export class OpenAiIstemcisi extends GecmisliIstemci {
  static adres = 'https://api.openai.com/v1/responses';

  kullaniciMesaji(baglam, metin) {
    return {
      role: 'user',
      content: [
        { type: 'input_text', text: baglam },
        { type: 'input_text', text: metin },
      ],
    };
  }

  govde(sistem, araclar) {
    return {
      model: this.model.id,
      instructions: sistem,
      input: this.gecmis,
      tools: araclar.map((a) => ({
        type: 'function',
        name: a.ad,
        description: a.aciklama,
        parameters: a.sema,
      })),
      reasoning: { effort: 'medium' },
      max_output_tokens: 16000,
      store: false,
      // Saklama kapalıyken düşünme öğeleri şifreli olarak geri gelsin ki
      // sonraki istekte aynen gönderilebilsin.
      include: ['reasoning.encrypted_content'],
    };
  }

  async yanitAl({ sistem, araclar, sinyal }) {
    const j = await this.istek.gonder(OpenAiIstemcisi.adres, {
      saglayiciAdi: 'ChatGPT',
      sinyal,
      basliklar: { authorization: `Bearer ${this.apiAnahtari}` },
      govde: this.govde(sistem, araclar),
      hataCevir: (durum, mesaj) =>
        durum === 429 && mesaj.toLowerCase().includes('quota')
          ? new YzHatasi('hata.bakiye.openai')
          : null,
    });

    const cikti = Array.isArray(j.output) ? j.output : [];
    this.gecmis.push(...cikti);

    const metinler = [];
    const cagrilar = [];
    let ret = false;
    for (const o of cikti) {
      if (o.type === 'message') {
        for (const p of o.content ?? []) {
          if (p.type === 'output_text') metinler.push(p.text);
          if (p.type === 'refusal') ret = true;
        }
      } else if (o.type === 'function_call') {
        cagrilar.push({ id: o.call_id, ad: o.name, girdi: argumanlariCoz(o.arguments) });
      }
    }

    const neden = j.incomplete_details?.reason;
    const u = j.usage ?? {};
    const onbellek = sayi(u.input_tokens_details, 'cached_tokens');

    return {
      metinler,
      cagrilar,
      son:
        ret || neden === 'content_filter'
          ? YanitSonu.RET
          : neden === 'max_output_tokens'
            ? YanitSonu.UZUNLUK
            : cagrilar.length
              ? YanitSonu.ARAC
              : YanitSonu.BITTI,
      kullanim: {
        girdi: sayi(u, 'input_tokens') - onbellek,
        onbellekOkunan: onbellek,
        onbellekYazilan: 0,
        cikti: sayi(u, 'output_tokens'),
      },
    };
  }

  sonuclariEkle(sonuclar) {
    for (const s of sonuclar) {
      this.gecmis.push({
        type: 'function_call_output',
        call_id: s.cagri.id,
        // Responses API'de ayrı bir hata işareti yok; metinle belirtilir.
        output: s.hata ? `HATA: ${s.metin}` : s.metin,
      });
    }
  }
}
