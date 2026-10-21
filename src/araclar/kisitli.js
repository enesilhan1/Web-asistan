// Tarayıcıların eklentilere içeriğini okutmadığı adresler.

/**
 * Firefox'un eklentilere okutmadığı Mozilla alan adları
 * (extensions.webextensions.restrictedDomains varsayılanı).
 */
const FIREFOX_YASAK_ALANLAR = new Set([
  'accounts-static.cdn.mozilla.net',
  'accounts.firefox.com',
  'addons.cdn.mozilla.net',
  'addons.mozilla.org',
  'api.accounts.firefox.com',
  'content.cdn.mozilla.net',
  'discovery.addons.mozilla.org',
  'install.mozilla.org',
  'oauth.accounts.firefox.com',
  'profile.accounts.firefox.com',
  'support.mozilla.org',
  'sync.services.mozilla.com',
]);

/**
 * Tarayıcıların eklentilere içeriğini okutmadığı adresler (chrome://, about:,
 * eklenti mağazaları...). Bunların dışında da okuma başarısız olabilir (ör.
 * PDF görüntüleyici); o zaman tarayıcının hatası yakalanır.
 */
export function okunabilirMi(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:', 'file:'].includes(u.protocol)) return false;
  if (u.hostname === 'chromewebstore.google.com') return false;
  if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return false;
  if (FIREFOX_YASAK_ALANLAR.has(u.hostname)) return false;
  return true;
}
