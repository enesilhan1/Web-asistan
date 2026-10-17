// Arayüz metinleri (Türkçe / İngilizce, docs/SPEC.md §6). Hem popup hem arka
// plan kullanır. Parametreler metinde {ad} biçiminde yazılır.

export const DILLER = ['tr', 'en'];
export const VARSAYILAN_DIL = 'tr';

export const METINLER = {
  tr: {
    'hata.zamanAsimi': '{ad} çok uzun süre yanıt vermedi. Tekrar dene.',
    'hata.baglanti': 'İnternet bağlantısı yok ya da sunucuya ulaşılamıyor ({ad}).',
    'hata.bozukYanit': '{ad} anlaşılamayan bir yanıt gönderdi. Tekrar dene.',
    'hata.anahtar': '{ad} API anahtarı geçersiz. Ayarlardan kontrol et.',
    'hata.izin': 'Bu API anahtarının bu modeli kullanma izni yok ({ad}).',
    'hata.model': 'Model bulunamadı. Ayarlardan model adını kontrol et. {mesaj}',
    'hata.kota': 'Çok fazla istek gönderildi ya da {ad} kullanım kotan doldu. Biraz bekleyip tekrar dene.',
    'hata.yogun': '{ad} şu an çok yoğun. Birkaç dakika sonra tekrar dene.',
    'hata.reddetti': '{ad} isteği reddetti ({durum}). {mesaj}',
    'hata.bakiye.anthropic':
      'Anthropic hesabının bakiyesi yetersiz. console.anthropic.com → Billing bölümünden kredi yükle.',
    'hata.bakiye.openai':
      'OpenAI hesabında kullanılabilir kredi yok. platform.openai.com → Billing bölümünden kredi yükle.',
    'hata.bakiye.deepseek':
      'DeepSeek hesabının bakiyesi yetersiz. platform.deepseek.com → Top up bölümünden yükle.',
    'hata.kota.gemini':
      'Gemini kullanım kotan doldu (ücretsiz kotada dakikalık ve günlük sınır var). Biraz sonra tekrar dene ya da aistudio.google.com üzerinden faturalandırmayı aç.',
    'hata.durduruldu': 'Durduruldu.',
    'bilgi.anahtarYok': '{ad} API anahtarı girilmemiş. Ayarlar bölümünden ekle.',
    'bilgi.ret': '{ad} bu isteği yanıtlayamadı. Farklı bir şekilde sormayı dene.',
    'bilgi.uzunluk': 'Yanıt çok uzun olduğu için yarıda kesildi.',
    'bilgi.turSiniri': 'Asistan çok fazla adım attığı için durduruldu. Gerekirse "devam et" yaz.',
    'bilgi.yarida': 'Yanıt yarıda kaldı (Chrome arka plan işlemini kapattı). Mesajını tekrar gönderebilirsin.',
    'bilgi.beklenmeyen': 'Beklenmeyen bir hata oluştu: {mesaj}',
  },
  en: {
    'hata.zamanAsimi': '{ad} took too long to respond. Try again.',
    'hata.baglanti': 'No internet connection or the server cannot be reached ({ad}).',
    'hata.bozukYanit': '{ad} sent a response that could not be read. Try again.',
    'hata.anahtar': 'The {ad} API key is invalid. Check it in Settings.',
    'hata.izin': 'This API key is not allowed to use this model ({ad}).',
    'hata.model': 'Model not found. Check the model name in Settings. {mesaj}',
    'hata.kota': 'Too many requests, or your {ad} usage quota is used up. Wait a bit and try again.',
    'hata.yogun': '{ad} is very busy right now. Try again in a few minutes.',
    'hata.reddetti': '{ad} rejected the request ({durum}). {mesaj}',
    'hata.bakiye.anthropic':
      'Your Anthropic credit balance is too low. Add credits at console.anthropic.com → Billing.',
    'hata.bakiye.openai':
      'Your OpenAI account has no available credits. Add credits at platform.openai.com → Billing.',
    'hata.bakiye.deepseek':
      'Your DeepSeek balance is too low. Top up at platform.deepseek.com → Top up.',
    'hata.kota.gemini':
      'Your Gemini quota is used up (the free tier has per-minute and daily limits). Try again later or enable billing at aistudio.google.com.',
    'hata.durduruldu': 'Stopped.',
    'bilgi.anahtarYok': 'No {ad} API key has been entered. Add one in Settings.',
    'bilgi.ret': '{ad} could not answer this request. Try asking differently.',
    'bilgi.uzunluk': 'The response was cut off because it was too long.',
    'bilgi.turSiniri': 'The assistant was stopped because it took too many steps. Type "continue" if needed.',
    'bilgi.yarida': 'The response was interrupted (Chrome stopped the background process). You can send your message again.',
    'bilgi.beklenmeyen': 'An unexpected error occurred: {mesaj}',
  },
};

/** Seçili dilde metin; anahtar yoksa Türkçesi, o da yoksa anahtarın kendisi. */
export function cevir(dil, anahtar, parametreler = {}) {
  const sablon = METINLER[dil]?.[anahtar] ?? METINLER.tr[anahtar] ?? anahtar;
  return sablon
    .replace(/\{(\w+)\}/g, (_, p) => (parametreler[p] ?? '') + '')
    .replace(/\s+$/, '');
}
