// Asistanın araçları (docs/SPEC.md §3–5, §9–10). Sayfalarda form doldurma,
// gönderme, satın alma yok; kullanıcının sekmelerine dokunulmaz. Gezinme ve
// bölüm açma arka planda (indirme ya da arka plan sekmesi) yapılır.
//
// Tarayıcı API'leri (Chrome/Firefox) parametre olarak verilir ([tarayici]);
// testlerde sahtesi kullanılır.

import { siteIzniVarMi } from '../tarayici.js';
import { genisleterekOku, sayfayiAc } from './gezinme.js';
import { githubDosyaOku, githubRepoAgaci } from './github.js';
import { okunabilirMi } from './kisitli.js';
import { AracHatasi, PARCA_UZUNLUGU, baslangicAl, sayfaCiktisi, sayfaMetni } from './sayfa.js';

export { AracHatasi, PARCA_UZUNLUGU, okunabilirMi, sayfaMetni };

export const GECMIS_VARSAYILAN = 50;
export const GECMIS_EN_FAZLA = 200;
/** Sorgulu aramada tarayıcıdan istenen ham kayıt sayısı (süzmeden önce). */
const GECMIS_HAM_SINIR = 5000;

const BASLANGIC_SEMASI = {
  type: 'integer',
  description: 'Metnin kaçıncı karakterinden başlanacağı (varsayılan 0; uzun sayfanın devamı için)',
};

/** @type {import('../yz/ortak.js').AracTanimi[]} */
export const ARACLAR = [
  {
    ad: 'sekmeleri_listele',
    aciklama:
      'Tarayıcıda açık olan bütün sekmeleri listeler: sekme kimliği, pencere, başlık, adres ve ' +
      'hangisinin etkin (kullanıcının şu an baktığı) olduğu. Sayfa içeriği vermez; içerik için ' +
      'sekmeyi_oku kullan.',
    sema: { type: 'object', properties: {} },
  },
  {
    ad: 'sekmeyi_oku',
    aciklama:
      'Açık bir sekmedeki sayfanın görünen metnini ve bağlantılarını okur (başlık, adres, ' +
      `kullanıcının seçtiği metin, sayfa metni). Uzun sayfalar ${PARCA_UZUNLUGU} karakterlik parçalar ` +
      'halinde döner; devamı için yanıtta belirtilen baslangic değeriyle tekrar çağır. Sayfayı ' +
      'değiştirmez. Onay gerektirmez.',
    sema: {
      type: 'object',
      properties: {
        sekme_id: { type: 'integer', description: 'sekmeleri_listele ya da bağlamdaki sekme kimliği' },
        baslangic: BASLANGIC_SEMASI,
      },
      required: ['sekme_id'],
    },
  },
  {
    ad: 'sayfayi_ac',
    aciklama:
      'Bir adresi (bağlantıyı) açıp sayfanın metnini ve bağlantılarını okur; sitenin içinde ya da ' +
      'başka sitelerde gezinmek için kullan. Sayfa önce arka planda indirilir; içerik JavaScript ile ' +
      'yükleniyorsa kendiliğinden arka plan sekmesinde açılır. Kullanıcının sekmelerine dokunmaz. ' +
      'Kullanıcının o sohbette izin vermediği bir siteye gidilecekse önce kullanıcıya onay sorulur. ' +
      'Düz metin, JSON, Markdown ve kaynak kod dosyalarını da okur; PDF ve görselleri okuyamaz.',
    sema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Tam adres (https://...)' },
        yontem: {
          type: 'string',
          enum: ['otomatik', 'sekme'],
          description:
            'otomatik (varsayılan): önce indir, gerekirse sekmede aç. sekme: doğrudan arka plan ' +
            'sekmesinde aç (indirilen içerik eksik/yanlış göründüyse).',
        },
        baslangic: BASLANGIC_SEMASI,
      },
      required: ['url'],
    },
  },
  {
    ad: 'sayfayi_genisleterek_oku',
    aciklama:
      'Sayfanın arka planda açılan bir kopyasında kapalı bölümleri açıp (akordeonlar, "daha fazla ' +
      'göster", <details>, açılır bölümler) tüm metni okur; "tiklanacak" verilirse yalnızca metninde ' +
      'o yazan sekme/düğmelere tıklar (ör. "Teknik Özellikler"). Form doldurmaz, bir şey göndermez, ' +
      'başka sayfaya giden bağlantılara tıklamaz; kullanıcının sekmesine dokunmaz. Normal okumada ' +
      'eksik kalan içerik için kullan.',
    sema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Sayfanın adresi (ya da sekme_id)' },
        sekme_id: { type: 'integer', description: 'Açık bir sekmenin kopyası açılsın (url yerine)' },
        tiklanacak: {
          type: 'string',
          description: 'Yalnızca metninde bu geçen sekme/düğmelere tıkla (boşsa kapalı bölümlerin hepsi)',
        },
        baslangic: BASLANGIC_SEMASI,
      },
    },
  },
  {
    ad: 'github_repo_agaci',
    aciklama:
      'Bir GitHub reposunun bilgilerini (açıklama, dil, yıldız, varsayılan dal, konu etiketleri) ve ' +
      "dosya ağacını GitHub API'sinden getirir. Bir repoyu incelerken sayfa gezmek yerine bunu ve " +
      'github_dosya_oku aracını kullan. Büyük repolarda "yol" ile bir klasöre daralt.',
    sema: {
      type: 'object',
      properties: {
        depo: { type: 'string', description: '"sahip/repo" ya da repo adresi (https://github.com/sahip/repo)' },
        dal: { type: 'string', description: 'Dal, etiket ya da commit (varsayılan: reponun varsayılan dalı)' },
        yol: { type: 'string', description: 'Yalnızca bu klasörün altını listele (ör. "src/")' },
      },
      required: ['depo'],
    },
  },
  {
    ad: 'github_dosya_oku',
    aciklama:
      'Bir GitHub reposundaki dosyanın içeriğini okur (kaynak kod, README, yapılandırma...). Uzun ' +
      `dosyalar ${PARCA_UZUNLUGU} karakterlik parçalar halinde döner.`,
    sema: {
      type: 'object',
      properties: {
        depo: { type: 'string', description: '"sahip/repo" ya da repo adresi' },
        yol: { type: 'string', description: 'Dosyanın repo içindeki yolu (ör. "src/index.js")' },
        dal: { type: 'string', description: 'Dal, etiket ya da commit (varsayılan: varsayılan dal)' },
        baslangic: BASLANGIC_SEMASI,
      },
      required: ['depo', 'yol'],
    },
  },
  {
    ad: 'gecmiste_ara',
    aciklama:
      'Kullanıcının tarayıcı geçmişinde (tüm zamanlar) arar. Gizlilik gereği yalnızca alan adı ve ' +
      'sayfa başlığı döner; tam adres, tarih ve ziyaret sayısı verilmez. Sorgudaki bütün kelimeler ' +
      'alan adında ya da başlıkta geçmelidir. Sorgu boşsa en son ziyaret edilenler döner (yeniden ' +
      'eskiye).',
    sema: {
      type: 'object',
      properties: {
        sorgu: { type: 'string', description: 'Aranacak kelimeler (boş bırakılabilir)' },
        en_fazla: {
          type: 'integer',
          description: `Döndürülecek en fazla sonuç (varsayılan ${GECMIS_VARSAYILAN}, en çok ${GECMIS_EN_FAZLA})`,
        },
      },
    },
  },
];

/**
 * Araç çağrısını çalıştırır.
 * @param {import('../yz/ortak.js').AracCagrisi} cagri
 * @param {any} tarayici  chrome/browser nesnesi ya da sahtesi
 * @param {{fetch?: typeof fetch, siteIzni?: (url: string) => Promise<boolean>,
 *   sinyal?: AbortSignal, githubAnahtari?: string, beklemeCarpani?: number}} [ek]
 * @returns {Promise<import('../yz/ortak.js').AracSonucu>}
 */
export async function aracCalistir(cagri, tarayici, ek = {}) {
  const ortam = { ...ek, tarayici };
  try {
    switch (cagri.ad) {
      case 'sekmeleri_listele':
        return { cagri, metin: await sekmeleriListele(tarayici, ortam.baglantiKaydet) };
      case 'sekmeyi_oku':
        return { cagri, metin: await sekmeyiOku(tarayici, cagri.girdi, ortam.baglantiKaydet) };
      case 'sayfayi_ac':
        return { cagri, metin: await sayfayiAc(cagri.girdi, ortam) };
      case 'sayfayi_genisleterek_oku':
        return { cagri, metin: await genisleterekOku(cagri.girdi, ortam) };
      case 'github_repo_agaci':
        return { cagri, metin: await githubRepoAgaci(cagri.girdi, ortam) };
      case 'github_dosya_oku':
        return { cagri, metin: await githubDosyaOku(cagri.girdi, ortam) };
      case 'gecmiste_ara':
        return { cagri, metin: await gecmisteAra(tarayici, cagri.girdi) };
      default:
        return { cagri, metin: `Bilinmeyen araç: ${cagri.ad}`, hata: true };
    }
  } catch (e) {
    return { cagri, metin: e instanceof AracHatasi ? e.message : `Beklenmeyen hata: ${e?.message ?? e}`, hata: true };
  }
}

async function sekmeleriListele(tarayici, baglantiKaydet) {
  const sekmeler = await tarayici.tabs.query({});
  if (!sekmeler.length) return 'Açık sekme yok.';
  const odakPencere = await odaktakiPencere(tarayici);
  const pencereNo = new Map();
  for (const s of sekmeler) if (!pencereNo.has(s.windowId)) pencereNo.set(s.windowId, pencereNo.size + 1);
  // Açık sekmelerin adresleri de onay kartında geçerli kaynak sayılır.
  baglantiKaydet?.(
    sekmeler.filter((s) => /^https?:/.test(s.url ?? '')).map((s) => ({ metin: s.title ?? '', url: s.url })),
    { baslik: 'Açık sekmeler', url: '' },
  );

  return sekmeler
    .map((s) => {
      const notlar = [];
      if (s.active && s.windowId === odakPencere) notlar.push('ETKİN');
      else if (s.active) notlar.push(`pencere ${pencereNo.get(s.windowId)}'in önündeki sekme`);
      if (s.discarded) notlar.push('uykuda, okunamaz');
      else if (!okunabilirMi(s.url ?? '')) notlar.push('okunamaz');
      if (s.incognito) notlar.push('gizli pencere');
      return (
        `sekme_id=${s.id} | pencere ${pencereNo.get(s.windowId)} | ${s.title || '(başlıksız)'} | ` +
        `${s.url || '(adres yok)'}${notlar.length ? ` | ${notlar.join(', ')}` : ''}`
      );
    })
    .join('\n');
}

async function odaktakiPencere(tarayici) {
  try {
    return (await tarayici.windows.getLastFocused()).id;
  } catch {
    return undefined;
  }
}

async function sekmeyiOku(tarayici, girdi, baglantiKaydet) {
  const id = girdi?.sekme_id;
  if (!Number.isInteger(id)) throw new AracHatasi('"sekme_id" bir tam sayı olmalı.');
  const baslangic = baslangicAl(girdi);

  let sekme;
  try {
    sekme = await tarayici.tabs.get(id);
  } catch {
    throw new AracHatasi(`${id} kimlikli sekme yok (kapatılmış olabilir). sekmeleri_listele ile bak.`);
  }
  if (!okunabilirMi(sekme.url ?? '')) {
    throw new AracHatasi(
      `Tarayıcı bu sayfanın okunmasına izin vermiyor (${sekme.url || 'adres yok'}). ` +
        'chrome:// ve about: sayfaları, eklenti mağazaları ve benzerleri okunamaz.',
    );
  }
  if (sekme.discarded) {
    throw new AracHatasi(
      'Sekme uykuda (tarayıcı bellek tasarrufu için kapatmış). sayfayi_ac ile adresini açabilir ' +
        'ya da kullanıcıdan sekmeye tıklamasını isteyebilirsin.',
    );
  }

  let sonuc;
  try {
    const [cerceve] = await tarayici.scripting.executeScript({ target: { tabId: id }, func: sayfaMetni });
    sonuc = cerceve?.result;
  } catch (e) {
    if (!(await siteIzniVarMi(tarayici))) {
      throw new AracHatasi(
        'Web Asistanı\'nın sitelere erişim izni yok. Kullanıcı eklenti penceresinin üstündeki ' +
          '"İzin ver" düğmesine basmalı.',
      );
    }
    const dosya = sekme.url.startsWith('file:');
    throw new AracHatasi(
      dosya
        ? 'Yerel dosya okunamadı. Chrome\'da kullanıcı chrome://extensions sayfasında Web Asistanı ' +
            'için "Dosya URL\'lerine erişime izin ver" seçeneğini açmalı; Firefox yerel dosyaları ' +
            'eklentilere okutmayabilir.'
        : `Sayfa okunamadı (${e?.message ?? 'bilinmeyen hata'}). PDF görüntüleyici ve bazı özel ` +
            'sayfalar okunamaz; sayfa hâlâ yükleniyorsa biraz sonra tekrar denenebilir.',
    );
  }
  if (!sonuc) throw new AracHatasi('Sayfadan metin alınamadı.');
  return sayfaCiktisi(
    { ...sonuc, baslik: sonuc.baslik || sekme.title, url: sonuc.url || sekme.url },
    baslangic,
    { baglantiKaydet },
  );
}

/** Geçmiş kaydından modele gidecek tek bilgi: alan adı (www. olmadan). */
export function alanAdi(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

const kucult = (t) => t.toLocaleLowerCase('tr').normalize('NFC');

async function gecmisteAra(tarayici, girdi) {
  const sorgu = typeof girdi?.sorgu === 'string' ? girdi.sorgu.trim() : '';
  let enFazla = girdi?.en_fazla ?? GECMIS_VARSAYILAN;
  if (!Number.isInteger(enFazla) || enFazla < 1) throw new AracHatasi('"en_fazla" pozitif bir tam sayı olmalı.');
  enFazla = Math.min(enFazla, GECMIS_EN_FAZLA);

  // startTime 0: tüm geçmiş (verilmezse tarayıcı yalnızca son 24 saate bakar).
  const kayitlar = await tarayici.history.search({
    text: sorgu,
    startTime: 0,
    maxResults: sorgu ? GECMIS_HAM_SINIR : enFazla * 10,
  });

  // Tarayıcı tam adreste de eşleştirir; model adresi görmeyeceği için yalnızca
  // alan adı ya da başlıkta geçen kelimeler sayılır (adres dolaylı yoldan da
  // sızmasın).
  const kelimeler = kucult(sorgu).split(/\s+/).filter(Boolean);
  const gorulen = new Set();
  const sonuclar = [];
  const sirali = [...kayitlar].sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0));
  for (const k of sirali) {
    const alan = alanAdi(k.url ?? '');
    if (!alan) continue;
    const baslik = (k.title ?? '').replace(/\s+/g, ' ').trim();
    const aranan = kucult(`${alan} ${baslik}`);
    if (!kelimeler.every((w) => aranan.includes(w))) continue;
    const anahtar = `${alan}\n${baslik}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuclar.push(`${alan} — ${baslik || '(başlıksız)'}`);
    if (sonuclar.length >= enFazla) break;
  }

  if (!sonuclar.length) {
    return sorgu ? `Geçmişte "${sorgu}" ile eşleşen site bulunamadı.` : 'Geçmiş boş.';
  }
  return (
    `${sonuclar.length} sonuç (alan adı — başlık, yeniden eskiye):\n` + sonuclar.join('\n')
  );
}
