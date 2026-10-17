import { AnthropicIstemcisi } from './anthropic.js';
import { DeepSeekIstemcisi } from './deepseek.js';
import { GeminiIstemcisi } from './gemini.js';
import { JsonIstegi } from './http_istegi.js';
import { OpenAiIstemcisi } from './openai.js';

const SINIFLAR = {
  anthropic: AnthropicIstemcisi,
  openai: OpenAiIstemcisi,
  gemini: GeminiIstemcisi,
  deepseek: DeepSeekIstemcisi,
};

/**
 * Modelin sağlayıcısına göre istemci oluşturur. [gecmis] kayıtlı bir sohbete
 * devam ederken verilir (aynı dizi yerinde güncellenir).
 * @param {{model: import('./katalog.js').YzModeli, apiAnahtari: string,
 *   gecmis?: object[], fetch?: typeof fetch, tekrarBeklemesiMs?: number}} p
 */
export function istemciOlustur({ model, apiAnahtari, gecmis, fetch, tekrarBeklemesiMs }) {
  const Sinif = SINIFLAR[model.saglayici];
  if (!Sinif) throw new Error(`Bilinmeyen sağlayıcı: ${model.saglayici}`);
  return new Sinif({
    model,
    apiAnahtari,
    gecmis,
    istek: new JsonIstegi({ fetch, tekrarBeklemesiMs }),
  });
}
