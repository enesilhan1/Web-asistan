// Chrome ve Firefox için ortak eklenti API'si. Firefox `browser` adıyla
// promise döndüren API'yi verir; Chrome (ve Edge, Brave gibi Chromium
// tabanlılar) `chrome` adıyla aynısını verir.

export const tarayici = globalThis.browser ?? globalThis.chrome;

/** Sayfaları okumak ve sağlayıcılara bağlanmak için gereken site erişimi. */
export const SITE_IZNI = { origins: ['<all_urls>'] };

/**
 * Site erişimi verilmiş mi? Firefox bu izni kullanıcıya bırakır (kapatılabilir),
 * Chrome'da da kullanıcı "tıklayınca" ya da belirli sitelerle sınırlayabilir.
 */
export async function siteIzniVarMi(api = tarayici) {
  try {
    return await api.permissions.contains(SITE_IZNI);
  } catch {
    return true; // izin API'si yoksa (ör. testler) engel sayma
  }
}
