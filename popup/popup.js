// Popup arayüzü: sohbet, sohbet listesi ve ayarlar. Yanıtlar arka planda
// hazırlanır (src/arka_plan.js); popup sonucu storage değişikliklerinden
// izler, bu yüzden kapatılıp açılsa da sohbet kaldığı yerden görünür.

import { Depo, sohbetAnahtari } from '../src/depo.js';
import { cevir } from '../src/dil.js';
import { markdowndanHtml } from '../src/markdown.js';
import { SITE_IZNI, siteIzniVarMi, tarayici } from '../src/tarayici.js';
import { SAGLAYICILAR, anahtarBicimiUygun, modelBul, saglayiciBul } from '../src/yz/katalog.js';

const ELLE = '__elle__';
const depo = new Depo(tarayici.storage.local);
const $ = (id) => document.getElementById(id);

const durum = {
  dil: 'tr',
  ayarlar: null,
  acikSohbetId: null,
  /** @type {any} */
  sohbet: null,
  gorunum: 'sohbet',
  /** Ayarlar ekranında kaydedilmemiş değişiklikler. */
  taslak: null,
  /** Ayarlar ekranında şu an gösterilen sağlayıcı. */
  ayarSaglayici: null,
  gonderiliyor: false,
};

const t = (anahtar, p) => cevir(durum.dil, anahtar, p);

// ---------------------------------------------------------------- başlangıç

async function baslat() {
  durum.ayarlar = await depo.ayarlar();
  durum.dil = durum.ayarlar.dil;
  durum.acikSohbetId = await depo.acikSohbet();
  durum.sohbet = await depo.sohbet(durum.acikSohbetId);
  if (!durum.sohbet) durum.acikSohbetId = null;

  metinleriUygula();
  olaylariBagla();
  sohbetiCiz();
  izinSeridiniGuncelle();
  tarayici.permissions?.onAdded?.addListener(izinSeridiniGuncelle);
  tarayici.permissions?.onRemoved?.addListener(izinSeridiniGuncelle);
  $('mesaj-kutusu').focus();

  tarayici.storage.onChanged.addListener((degisiklikler, alan) => {
    if (alan !== 'local') return;
    if (degisiklikler.ayarlar) {
      durum.ayarlar = { ...durum.ayarlar, ...degisiklikler.ayarlar.newValue };
      if (durum.ayarlar.dil !== durum.dil) {
        durum.dil = durum.ayarlar.dil;
        metinleriUygula();
      }
      if (durum.gorunum === 'sohbet') sohbetiCiz();
    }
    const k = durum.acikSohbetId && sohbetAnahtari(durum.acikSohbetId);
    if (k && degisiklikler[k]) {
      durum.sohbet = degisiklikler[k].newValue ?? null;
      if (!durum.sohbet) durum.acikSohbetId = null;
      sohbetiCiz();
    }
    if (degisiklikler.sohbetler && durum.gorunum === 'liste') listeyiCiz();
  });
}

/** data-metin / data-yer / data-baslik işaretli öğelerin metinlerini seçili dile çevirir. */
function metinleriUygula() {
  document.documentElement.lang = durum.dil;
  for (const o of document.querySelectorAll('[data-metin]')) o.textContent = t(o.dataset.metin);
  for (const o of document.querySelectorAll('[data-yer]')) o.placeholder = t(o.dataset.yer);
  for (const o of document.querySelectorAll('[data-baslik]')) {
    o.title = t(o.dataset.baslik);
    o.setAttribute('aria-label', o.title);
  }
  if (durum.gorunum === 'sohbet') sohbetiCiz();
  if (durum.gorunum === 'liste') listeyiCiz();
}

function gorunumeGec(ad) {
  durum.gorunum = ad;
  $('sohbet-gorunumu').hidden = ad !== 'sohbet';
  $('liste-gorunumu').hidden = ad !== 'liste';
  $('ayarlar-gorunumu').hidden = ad !== 'ayarlar';
  if (ad === 'sohbet') {
    sohbetiCiz();
    $('mesaj-kutusu').focus();
  }
  if (ad === 'liste') listeyiCiz();
  if (ad === 'ayarlar') ayarlariAc();
}

function olaylariBagla() {
  $('sohbetler-dugmesi').addEventListener('click', () => gorunumeGec('liste'));
  $('izin-ver-dugmesi').addEventListener('click', () => {
    // Firefox izni yalnızca doğrudan tıklamanın içinde (await'ten önce)
    // isteyince gösteriyor. Firefox izin penceresini açarken popup'ı
    // kapatabilir; izin yine de kaydedilir.
    tarayici.permissions.request(SITE_IZNI).then(izinSeridiniGuncelle, izinSeridiniGuncelle);
  });
  $('ayarlar-dugmesi').addEventListener('click', () => gorunumeGec('ayarlar'));
  $('yeni-sohbet-dugmesi').addEventListener('click', yeniSohbet);
  $('listeden-yeni-dugmesi').addEventListener('click', yeniSohbet);
  for (const d of document.querySelectorAll('.geri-dugmesi')) {
    d.addEventListener('click', () => gorunumeGec('sohbet'));
  }

  const kutu = $('mesaj-kutusu');
  kutu.addEventListener('input', kutuyuBoyutlandir);
  kutu.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      gonder(kutu.value);
    }
  });
  $('yazma-alani').addEventListener('submit', (e) => {
    e.preventDefault();
    gonder(kutu.value);
  });
  $('durdur-dugmesi').addEventListener('click', () => {
    if (durum.acikSohbetId) tarayici.runtime.sendMessage({ tur: 'durdur', sohbetId: durum.acikSohbetId });
  });

  $('saglayici-secimi').addEventListener('change', (e) => {
    taslagaAl();
    ayarSaglayicisiniGoster(e.target.value);
  });
  $('model-secimi').addEventListener('change', modelAlaniniGuncelle);
  $('elle-model').addEventListener('input', modelAlaniniGuncelle);
  $('anahtar-kutusu').addEventListener('input', anahtarUyarisiniGuncelle);
  $('anahtar-goster').addEventListener('click', () => {
    const k = $('anahtar-kutusu');
    k.type = k.type === 'password' ? 'text' : 'password';
    anahtarGosterMetni();
  });
  $('github-goster').addEventListener('click', () => {
    const k = $('github-kutusu');
    k.type = k.type === 'password' ? 'text' : 'password';
    anahtarGosterMetni();
  });
  $('ayarlar-formu').addEventListener('submit', (e) => {
    e.preventDefault();
    ayarlariKaydet();
  });
}

async function izinSeridiniGuncelle() {
  $('izin-seridi').hidden = await siteIzniVarMi();
}

function kutuyuBoyutlandir() {
  const k = $('mesaj-kutusu');
  k.style.height = 'auto';
  k.style.height = `${Math.min(k.scrollHeight + 2, 140)}px`;
}

// -------------------------------------------------------------------- sohbet

async function gonder(metin) {
  const temiz = metin.trim();
  if (!temiz || durum.gonderiliyor || durum.sohbet?.calisiyor) return;
  durum.gonderiliyor = true;
  sohbetiCiz();
  try {
    const yanit = await tarayici.runtime.sendMessage({ tur: 'gonder', sohbetId: durum.acikSohbetId, metin: temiz });
    if (yanit?.hata) throw new Error(yanit.hata);
    $('mesaj-kutusu').value = '';
    kutuyuBoyutlandir();
    durum.acikSohbetId = yanit.sohbetId;
    durum.sohbet = await depo.sohbet(yanit.sohbetId);
  } catch (e) {
    console.error(e);
    geciciHata(t('bilgi.beklenmeyen', { mesaj: e.message }));
  } finally {
    durum.gonderiliyor = false;
    sohbetiCiz();
  }
}

async function yeniSohbet() {
  durum.acikSohbetId = null;
  durum.sohbet = null;
  await depo.acikSohbetiAyarla(null);
  gorunumeGec('sohbet');
}

function geciciHata(metin) {
  const o = document.createElement('div');
  o.className = 'bilgi hata';
  o.textContent = metin;
  $('mesajlar').append(o);
  o.scrollIntoView({ block: 'end' });
}

/** Ayarlardaki (yeni sohbetlerin kullanacağı) model. */
function ayarModeli() {
  const a = durum.ayarlar;
  return modelBul(a.saglayici, a.modeller[a.saglayici]);
}

function sohbetiCiz() {
  const s = durum.sohbet;
  const kutu = $('mesajlar');
  const enAltta = kutu.scrollHeight - kutu.scrollTop - kutu.clientHeight < 40;

  // Üst bilgi
  const model = s ? modelBul(s.saglayici, s.modelId) : ayarModeli();
  $('sohbet-basligi').textContent = s?.baslik || t('ui.yeniSohbet');
  const alt = [model.ad];
  if (s && (s.maliyet > 0 || s.maliyetBilinmiyor)) {
    alt.push(s.maliyetBilinmiyor ? t('ui.maliyetBilinmiyor') : t('ui.maliyet', { tutar: tutarYaz(s.maliyet) }));
  }
  $('sohbet-alt-bilgi').textContent = alt.join(' · ');
  const am = ayarModeli();
  $('sohbet-alt-bilgi').title =
    s && (am.saglayici !== model.saglayici || am.id !== model.id) ? t('ui.sohbetModeli', { model: model.ad }) : '';

  // Mesajlar
  kutu.replaceChildren();
  if (!s?.ogeler.length) {
    kutu.append(karsilama());
  } else {
    for (const o of s.ogeler) kutu.append(ogeCiz(o));
  }
  const calisiyor = Boolean(s?.calisiyor) || durum.gonderiliyor;
  if (calisiyor) {
    const y = document.createElement('div');
    y.className = 'yaziyor';
    y.innerHTML = '<span class="noktalar"><i></i><i></i><i></i></span>';
    y.append(t('ui.dusunuyor'));
    kutu.append(y);
  }
  if (enAltta || calisiyor) kutu.scrollTop = kutu.scrollHeight;

  $('gonder-dugmesi').hidden = Boolean(s?.calisiyor);
  $('gonder-dugmesi').disabled = calisiyor;
  $('durdur-dugmesi').hidden = !s?.calisiyor;
}

function karsilama() {
  const k = document.createElement('div');
  k.className = 'karsilama';
  const resim = document.createElement('img');
  resim.src = '../icons/ikon128.png';
  resim.alt = '';
  const p = document.createElement('p');
  k.append(resim, p);

  const model = ayarModeli();
  const anahtarVar = Boolean((durum.ayarlar.anahtarlar[model.saglayici] ?? '').trim());
  if (!anahtarVar) {
    p.textContent = t('ui.anahtarGerekli', { ad: saglayiciBul(model.saglayici).kisaAd });
    const d = document.createElement('button');
    d.className = 'birincil';
    d.textContent = t('ui.ayarlaraGit');
    d.addEventListener('click', () => gorunumeGec('ayarlar'));
    k.append(d);
    return k;
  }

  p.textContent = t('ui.hosgeldin');
  const ornekler = document.createElement('div');
  ornekler.className = 'ornekler';
  for (const a of ['ui.ornek1', 'ui.ornek2', 'ui.ornek3']) {
    const d = document.createElement('button');
    d.className = 'ornek';
    d.textContent = t(a);
    d.addEventListener('click', () => gonder(t(a)));
    ornekler.append(d);
  }
  k.append(ornekler);
  return k;
}

const ARAC_SIMGELERI = {
  sekmeleri_listele: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg>',
  sekmeyi_oku: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  gecmiste_ara: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

function ogeCiz(o) {
  const d = document.createElement('div');
  switch (o.tur) {
    case 'kullanici':
      d.className = 'balon kullanici';
      d.textContent = o.metin;
      break;
    case 'asistan':
      d.className = 'balon asistan';
      // markdowndanHtml önce bütün metni kaçışlar; yalnızca bilinen etiketler üretir.
      d.innerHTML = markdowndanHtml(o.metin);
      break;
    case 'arac': {
      d.className = 'arac';
      d.innerHTML = ARAC_SIMGELERI[o.ad] ?? '';
      const span = document.createElement('span');
      span.textContent = aracMetni(o);
      d.append(span);
      break;
    }
    case 'bilgi':
      d.className = o.hata ? 'bilgi hata' : 'bilgi';
      d.textContent = t(o.anahtar, o.parametreler);
      break;
  }
  return d;
}

function aracMetni({ ad, girdi = {} }) {
  if (ad === 'sekmeyi_oku') {
    return t(girdi.baslangic > 0 ? 'ui.arac.sekmeyi_oku.devam' : 'ui.arac.sekmeyi_oku', { id: girdi.sekme_id });
  }
  if (ad === 'gecmiste_ara') {
    const sorgu = String(girdi.sorgu ?? '').trim();
    return sorgu ? t('ui.arac.gecmiste_ara', { sorgu }) : t('ui.arac.gecmiste_ara.bos');
  }
  return t(`ui.arac.${ad}`);
}

function tutarYaz(dolar) {
  if (dolar < 0.01) return dolar.toFixed(4);
  return dolar.toFixed(2);
}

// --------------------------------------------------------------------- liste

async function listeyiCiz() {
  const liste = await depo.sohbetler();
  const kutu = $('sohbet-listesi');
  kutu.replaceChildren();
  if (!liste.length) {
    const b = document.createElement('p');
    b.className = 'bos';
    b.textContent = t('ui.sohbetYok');
    kutu.append(b);
    return;
  }
  const yerel = durum.dil === 'en' ? 'en-GB' : 'tr-TR';
  for (const s of liste) {
    const satir = document.createElement('div');
    satir.className = 'liste-ogesi' + (s.id === durum.acikSohbetId ? ' acik' : '');

    const ac = document.createElement('button');
    ac.className = 'liste-ac';
    const baslik = document.createElement('div');
    baslik.className = 'liste-baslik';
    baslik.textContent = s.baslik;
    const alt = document.createElement('div');
    alt.className = 'liste-alt';
    alt.textContent = [
      new Date(s.guncelleme).toLocaleString(yerel, { dateStyle: 'medium', timeStyle: 'short' }),
      modelBul(s.saglayici, s.modelId).ad,
    ].join(' · ');
    ac.append(baslik, alt);
    ac.addEventListener('click', async () => {
      durum.acikSohbetId = s.id;
      durum.sohbet = await depo.sohbet(s.id);
      await depo.acikSohbetiAyarla(s.id);
      gorunumeGec('sohbet');
    });

    const sil = document.createElement('button');
    sil.className = 'simge';
    sil.title = t('ui.sil');
    sil.setAttribute('aria-label', sil.title);
    sil.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
    sil.addEventListener('click', async () => {
      if (!confirm(t('ui.silOnay', { baslik: s.baslik }))) return;
      const tam = await depo.sohbet(s.id);
      if (tam?.calisiyor) tarayici.runtime.sendMessage({ tur: 'durdur', sohbetId: s.id });
      await depo.sohbetSil(s.id);
      if (durum.acikSohbetId === s.id) {
        durum.acikSohbetId = null;
        durum.sohbet = null;
      }
      listeyiCiz();
    });

    satir.append(ac, sil);
    kutu.append(satir);
  }
}

// ------------------------------------------------------------------- ayarlar

function ayarlariAc() {
  durum.taslak = structuredClone(durum.ayarlar);
  $('dil-secimi').value = durum.taslak.dil;
  const secim = $('saglayici-secimi');
  secim.replaceChildren(
    ...SAGLAYICILAR.map((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.ad;
      return o;
    }),
  );
  $('kayit-durumu').textContent = '';
  $('github-kutusu').value = durum.taslak.githubAnahtari ?? '';
  $('github-kutusu').type = 'password';
  ayarSaglayicisiniGoster(durum.taslak.saglayici);
}

/** Ekrandaki model ve anahtar alanlarını taslağa yazar. */
function taslagaAl() {
  const s = durum.ayarSaglayici;
  if (!s) return;
  durum.taslak.modeller[s] = seciliModelId();
  durum.taslak.anahtarlar[s] = $('anahtar-kutusu').value.trim();
}

function seciliModelId() {
  const v = $('model-secimi').value;
  return v === ELLE ? $('elle-model').value.trim() : v;
}

function ayarSaglayicisiniGoster(saglayiciId) {
  const s = saglayiciBul(saglayiciId);
  durum.ayarSaglayici = s.id;
  $('saglayici-secimi').value = s.id;

  const kayitli = durum.taslak.modeller[s.id];
  const model = modelBul(s.id, kayitli);
  const secim = $('model-secimi');
  secim.replaceChildren(
    ...s.modeller.map((m) => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = `${m.ad} — ${m.aciklama[durum.dil] ?? m.aciklama.tr}`;
      return o;
    }),
  );
  const elle = document.createElement('option');
  elle.value = ELLE;
  elle.textContent = t('ui.elleModel');
  secim.append(elle);
  secim.value = model.elle ? ELLE : model.id;
  $('elle-model').value = model.elle ? model.id : '';
  $('elle-model').placeholder = t('ui.elleModelYer', { ornek: s.modeller[0].id });
  modelAlaniniGuncelle();

  const k = $('anahtar-kutusu');
  k.value = durum.taslak.anahtarlar[s.id] ?? '';
  k.type = 'password';
  k.placeholder = s.anahtarOneki ? `${s.anahtarOneki}…` : '';
  anahtarGosterMetni();
  anahtarUyarisiniGuncelle();

  const link = $('anahtar-sayfasi');
  link.href = s.anahtarSayfasi;
  link.textContent = `${t('ui.anahtarNereden')}: ${new URL(s.anahtarSayfasi).hostname}`;
}

function modelAlaniniGuncelle() {
  const elle = $('model-secimi').value === ELLE;
  $('elle-model').hidden = !elle;
  const model = modelBul(durum.ayarSaglayici, seciliModelId());
  $('model-aciklamasi').textContent =
    !elle && model.girdi != null ? t('ui.fiyat', { girdi: model.girdi, cikti: model.cikti }) : '';
}

function anahtarGosterMetni() {
  for (const [kutu, dugme] of [['anahtar-kutusu', 'anahtar-goster'], ['github-kutusu', 'github-goster']]) {
    $(dugme).textContent = t($(kutu).type === 'password' ? 'ui.anahtarGoster' : 'ui.anahtarGizle');
  }
}

function anahtarUyarisiniGuncelle() {
  const s = saglayiciBul(durum.ayarSaglayici);
  const deger = $('anahtar-kutusu').value.trim();
  const uygun = !deger || anahtarBicimiUygun(s.id, deger);
  $('anahtar-uyarisi').hidden = uygun;
  $('anahtar-uyarisi').textContent = uygun ? '' : t('ui.anahtarBicim', { onek: s.anahtarOneki });
}

async function ayarlariKaydet() {
  taslagaAl();
  durum.taslak.saglayici = durum.ayarSaglayici;
  durum.taslak.dil = $('dil-secimi').value;
  durum.taslak.githubAnahtari = $('github-kutusu').value.trim();
  const yeni = structuredClone(durum.taslak);
  await depo.ayarlariGuncelle(() => yeni);
  durum.ayarlar = yeni;
  if (durum.dil !== yeni.dil) {
    durum.dil = yeni.dil;
    metinleriUygula();
    ayarSaglayicisiniGoster(durum.ayarSaglayici);
  }
  $('kayit-durumu').textContent = t('ui.kaydedildi');
}

baslat();
