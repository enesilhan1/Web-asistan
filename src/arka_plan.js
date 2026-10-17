// Web Asistanı arka plan (service worker). Sohbet döngüsü burada çalışır ki
// popup kapansa da yanıt hazırlanmaya devam etsin.
//
// Popup'tan gelen mesajlar:
//   {tur: 'gonder', sohbetId, metin}  → {sohbetId} | {hata}
//   {tur: 'durdur', sohbetId}          → {}
// Popup sonucu chrome.storage değişikliklerinden izler.

import { Asistan } from './asistan.js';
import { Depo } from './depo.js';

const depo = new Depo(chrome.storage.local);

/**
 * Chrome boşta kalan service worker'ı ~30 sn sonra kapatır; uzun bir API
 * isteği sırasında kapanmasın diye çalışma süresince düzenli olarak bir
 * eklenti API'si çağrılır (zamanlayıcıyı sıfırlar).
 */
function canliTut() {
  const t = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
  return () => clearInterval(t);
}

const asistan = new Asistan({ depo, tarayici: chrome, canliTut });

// Önceki service worker çalışırken sonlandırıldıysa yarıda kalanlar kapanır.
const hazir = asistan.yaridaKalanlariKapat().catch((e) => console.error(e));

chrome.runtime.onMessage.addListener((mesaj, gonderen, yanitla) => {
  if (gonderen.id !== chrome.runtime.id) return false;
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
      default:
        return { hata: 'bilinmeyen mesaj' };
    }
  })().then(yanitla, (e) => yanitla({ hata: String(e?.message ?? e) }));
  return true; // yanıt eşzamansız
});
