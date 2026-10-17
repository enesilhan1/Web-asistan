import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { aracCalistir, okunabilirMi } from '../src/araclar/araclar.js';
import { SITE_IZNI, siteIzniVarMi } from '../src/tarayici.js';

describe('Chrome + Firefox uyumu', () => {
  it('manifest iki tarayıcının arka plan biçimini de aynı dosyaya bağlar', () => {
    const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    assert.equal(m.manifest_version, 3);
    assert.equal(m.background.service_worker, 'src/arka_plan.js'); // Chrome
    assert.deepEqual(m.background.scripts, ['src/arka_plan.js']); // Firefox
    assert.equal(m.background.type, 'module');
    const g = m.browser_specific_settings.gecko;
    assert.match(g.id, /^[\w.-]+@[\w.-]+$/);
    assert.equal(g.strict_min_version, '140.0');
    assert.deepEqual(g.data_collection_permissions.required.sort(), ['browsingActivity', 'websiteContent']);
    assert.deepEqual(m.host_permissions, SITE_IZNI.origins);
  });

  it('siteIzniVarMi izin API sonucunu döndürür, API yoksa engel saymaz', async () => {
    const sorgular = [];
    const api = (sonuc) => ({ permissions: { contains: async (q) => (sorgular.push(q), sonuc) } });
    assert.equal(await siteIzniVarMi(api(false)), false);
    assert.equal(await siteIzniVarMi(api(true)), true);
    assert.deepEqual(sorgular[0], { origins: ['<all_urls>'] });
    assert.equal(await siteIzniVarMi({}), true);
  });

  it('Firefox ve Chrome kısıtlı sayfaları okunamaz', () => {
    for (const url of [
      'about:reader?url=https://a.com',
      'about:addons',
      'moz-extension://abc/popup.html',
      'view-source:https://a.com',
      'https://addons.mozilla.org/tr/firefox/',
      'https://support.mozilla.org/',
      'chrome-extension://abc/x.html',
      'https://chromewebstore.google.com/',
    ]) {
      assert.equal(okunabilirMi(url), false, url);
    }
    assert.equal(okunabilirMi('https://www.mozilla.org/'), true);
  });

  it('izin yokken okuma hatası izin vermesi gerektiğini söyler', async () => {
    const tarayici = {
      tabs: { get: async (id) => ({ id, url: 'https://a.com/' }) },
      scripting: { executeScript: async () => { throw new Error('Missing host permission'); } },
      permissions: { contains: async () => false },
    };
    const s = await aracCalistir({ id: '1', ad: 'sekmeyi_oku', girdi: { sekme_id: 3 } }, tarayici);
    assert.equal(s.hata, true);
    assert.match(s.metin, /erişim izni yok.*İzin ver/);
  });
});
