// Web Asistanı arka plan (Chrome'da service worker, Firefox'ta arka plan
// betiği). Sohbet döngüsü burada çalışır ki popup kapansa da yanıt
// hazırlanmaya devam etsin.
//
// Popup'tan gelen mesajlar:
//   {tur: 'gonder', sohbetId, metin}  → {sohbetId} | {hata}
//   {tur: 'durdur', sohbetId}          → {}
//   {tur: 'onay', onayId, kabul}       → {}   site onayı kararı
// Popup sonucu storage değişikliklerinden izler.

import { Asistan } from './asistan.js';
import { Depo } from './depo.js';
import { tarayici } from './tarayici.js';

const depo = new Depo(tarayici.storage.local);

/**
 * Tarayıcı boşta kalan arka plan betiğini ~30 sn sonra kapatır; uzun bir API
 * isteği sırasında kapanmasın diye çalışma süresince düzenli olarak bir
 * eklenti API'si çağrılır (zamanlayıcıyı sıfırlar).
 */
function canliTut() {
  const t = setInterval(() => tarayici.runtime.getPlatformInfo(), 20_000);
  return () => clearInterval(t);
}

const asistan = new Asistan({ depo, tarayici, canliTut });

// Önceki arka plan betiği çalışırken sonlandırıldıysa yarıda kalanlar kapanır.
const hazir = asistan.yaridaKalanlariKapat().catch((e) => console.error(e));

tarayici.runtime.onMessage.addListener((mesaj, gonderen, yanitla) => {
  if (gonderen.id !== tarayici.runtime.id) return false;
  (async () => {
    await hazir;
    switch (mesaj?.tur) {
      case 'gonder': {
        const { sohbetId, bitti } = await asistan.gonder(mesaj.sohbetId ?? null, mesaj.metin);
        bitti.catch((e) => console.error(e));
        return { sohbetId };
      }
      case 'durdur':
        asistan.durdur(mesaj.sohbetId);
        return {};
      case 'onay':
        asistan.karar(mesaj.onayId, mesaj.kabul === true);
        return {};
      default:
        return { hata: 'bilinmeyen mesaj' };
    }
  })().then(yanitla, (e) => yanitla({ hata: String(e?.message ?? e) }));
  return true; // yanıt eşzamansız
});
