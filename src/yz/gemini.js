import { GecmisliIstemci, YanitSonu, YzHatasi, argumanlariCoz, metinAlani, sayi } from './ortak.js';

/**
 * Google Gemini API (POST /v1beta/models/{model}:generateContent).
 *
 * Gemini 3 ve sonrası düşünme imzalarını (thoughtSignature) modelin ürettiği
 * parçalarda taşır; bu parçalar sonraki istekte aynen geri gönderilmelidir.
 * Bu yüzden modelin içeriği geçmişe hiç değiştirilmeden eklenir.
 */
export class GeminiIstemcisi extends GecmisliIstemci {
  get adres() {
    return (
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      `${encodeURIComponent(this.model.id)}:generateContent`
    );
  }

  kullaniciMesaji(baglam, metin) {
    return { role: 'user', parts: [{ text: baglam }, { text: metin }] };
  }

  govde(sistem, araclar) {
    return {
      systemInstruction: { parts: [{ text: sistem }] },
      contents: this.gecmis,
      tools: [
        {
          functionDeclarations: araclar.map((a) => ({
            name: a.ad,
            description: a.aciklama,
            // Gemini, özelliksiz OBJECT şemasını reddediyor; parametresiz
            // araçta şema hiç gönderilmez.
            ...(Object.keys(a.sema.properties ?? {}).length
              ? { parameters: geminiSemasi(a.sema) }
              : {}),
          })),
        },
      ],
      generationConfig: { maxOutputTokens: 16000 },
    };
  }

  async yanitAl({ sistem, araclar, sinyal }) {
    const j = await this.istek.gonder(this.adres, {
      saglayiciAdi: 'Gemini',
      sinyal,
      basliklar: { 'x-goog-api-key': this.apiAnahtari },
      govde: this.govde(sistem, araclar),
      hataCevir: (durum, mesaj) => {
        const k = mesaj.toLowerCase();
        if (durum === 400 && k.includes('api key')) return new YzHatasi('hata.anahtar', { ad: 'Gemini' });
        if (durum === 429 && (k.includes('quota') || k.includes('exhausted'))) {
          return new YzHatasi('hata.kota.gemini');
        }
        return null;
      },
    });

    const u = j.usageMetadata ?? {};
    const onbellek = sayi(u, 'cachedContentTokenCount');
    const kullanim = {
      girdi: sayi(u, 'promptTokenCount') - onbellek,
      onbellekOkunan: onbellek,
      onbellekYazilan: 0,
      cikti: sayi(u, 'candidatesTokenCount') + sayi(u, 'thoughtsTokenCount'),
    };

    const aday = Array.isArray(j.candidates) ? j.candidates[0] : null;
    if (!aday) {
      // İstek güvenlik filtresine takıldı (promptFeedback.blockReason).
      return { metinler: [], cagrilar: [], son: YanitSonu.RET, kullanim };
    }
    const icerik = { role: 'model', parts: [], ...(aday.content ?? {}) };
    icerik.role ??= 'model';
    icerik.parts ??= [];
    this.gecmis.push(icerik);

    const parcalar = icerik.parts;
    const metinler = parcalar
      .filter((p) => typeof p.text === 'string' && p.thought !== true)
      .map((p) => p.text);
    const cagrilar = [];
    parcalar.forEach((p, i) => {
      const c = p.functionCall;
      if (!c || typeof c !== 'object') return;
      cagrilar.push({
        // Eski modeller kimlik vermiyor; ad ve sırayla eşleştirilir.
        id: c.id ?? `${c.name}#${i}`,
        ad: c.name,
        girdi: argumanlariCoz(c.args ?? {}),
      });
    });

    const neden = aday.finishReason;
    const retNedenleri = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'];
    return {
      metinler,
      cagrilar,
      son:
        neden === 'MAX_TOKENS'
          ? YanitSonu.UZUNLUK
          : retNedenleri.includes(neden)
            ? YanitSonu.RET
            : cagrilar.length
              ? YanitSonu.ARAC
              : YanitSonu.BITTI,
      kullanim,
    };
  }

  aracSonuclari() {
    return this.gecmis.flatMap((c) =>
      c.role === 'user'
        ? (c.parts ?? [])
            .map((p) => p.functionResponse?.response)
            .filter(Boolean)
            .map((r) => metinAlani(r, 'sonuc' in r ? 'sonuc' : 'hata'))
        : [],
    );
  }

  sonuclariEkle(sonuclar) {
    // Bütün sonuçlar tek bir kullanıcı içeriğinde, çağrı sırasıyla.
    this.gecmis.push({
      role: 'user',
      parts: sonuclar.map((s) => ({
        functionResponse: {
          name: s.cagri.ad,
          ...(s.cagri.id.includes('#') ? {} : { id: s.cagri.id }),
          response: s.hata ? { hata: s.metin } : { sonuc: s.metin },
        },
      })),
    });
  }
}

/**
 * JSON Schema'yı Gemini'nin şema biçimine çevirir: tür adları büyük harf
 * (OBJECT, STRING...). Diğer alanlar (properties, items, enum, required,
 * description) aynen kalır.
 */
export function geminiSemasi(sema) {
  const donustur = (d) => {
    if (Array.isArray(d)) return d.map(donustur);
    if (d && typeof d === 'object') {
      return Object.fromEntries(
        Object.entries(d).map(([k, v]) => {
          if (k === 'type' && typeof v === 'string') return [k, v.toUpperCase()];
          if (k === 'properties' && v && typeof v === 'object') {
            return [k, Object.fromEntries(Object.entries(v).map(([p, s]) => [p, donustur(s)]))];
          }
          return [k, donustur(v)];
        }),
      );
    }
    return d;
  };
  return donustur(sema);
}
