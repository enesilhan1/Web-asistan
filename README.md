# Web Asistanı

Açık sekmelerini inceleyen ve geçmişte girdiğin siteleri **yalnızca alan adı ve
sayfa başlığıyla** bilen bir yapay zekâ asistanı. **Chrome** (ve Edge, Brave,
Opera, Vivaldi gibi Chromium tabanlı tarayıcılar) ile **Firefox**'ta aynı kodla
çalışan bir tarayıcı eklentisi.

- **Açık sekmeler:** bütün açık sekmelerin metnini okuyabilir; özetler,
  karşılaştırır, sorularını yanıtlar. **Sadece okur**: tıklamaz, form
  doldurmaz, sayfa açıp kapatmaz.
- **Geçmiş:** tüm tarayıcı geçmişinde arama yapabilir, ama yapay zekâya
  yalnızca alan adı ve başlık gider. Tam adres, tarih ve ziyaret sayısı
  gitmez.
- **Sağlayıcı seçimi:** Claude (varsayılan), ChatGPT, Gemini ya da DeepSeek.
  Hazır modellerden birini seçebilir ya da model adını elle yazabilirsin.
  Her sağlayıcının API anahtarı ayrı saklanır.
- **Sohbetler** yalnızca bu bilgisayarda saklanır; eski sohbetlere dönüp devam
  edebilirsin.
- Arayüz **Türkçe / İngilizce**.

Kararlaştırılan özelliklerin tamamı: [docs/SPEC.md](docs/SPEC.md).

## Kurulum

Önce eklenti klasörünü edin: GitHub'da **Code → Download ZIP** ile indirip bir
klasöre çıkar ya da `git clone https://github.com/enesilhan1/Web-asistan.git`.
(İçinde `manifest.json` olan klasör, eklentinin kendisidir.)

### Chrome (ve Edge, Brave, Opera, Vivaldi)

1. Adres çubuğuna `chrome://extensions` yaz (Edge'de `edge://extensions`,
   Brave'de `brave://extensions`).
2. **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle**'ye tıkla ve eklenti klasörünü seç.
4. Araç çubuğundaki yapboz simgesinden **Web Asistanı**'nı sabitle.

Klasörde değişiklik olursa aynı sayfada eklentinin ↻ (yenile) düğmesine bas.

### Firefox (140 ve üstü)

**Hızlı deneme (geçici):**

1. Adres çubuğuna `about:debugging#/runtime/this-firefox` yaz.
2. **Geçici Eklenti Yükle…**'ye tıkla ve klasördeki `manifest.json` dosyasını
   seç.

Geçici eklenti Firefox kapanınca kaldırılır; her açılışta yeniden yüklemen
gerekir.

**Kalıcı kurulum:** Firefox, kalıcı eklentilerin Mozilla tarafından
imzalanmasını ister. Mağazada yayımlamadan, ücretsiz imzalatabilirsin:

1. Proje klasöründe `npm run paketle` çalıştır, `dist/web-asistani-<sürüm>.zip`
   oluşur.
2. [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
   adresinde Firefox hesabınla giriş yap → **Submit a New Add-on** →
   **On your own** (kendi başına dağıtım) seç → ZIP'i yükle.
3. İmzalanan `.xpi` dosyasını indir ve Firefox'a sürükle-bırak yap.

Firefox kurulumda eklentinin **sayfa içeriği ve gezinme bilgisi** gönderdiğini
gösterir: asistan, sorduğunda sayfa metnini ve geçmişteki alan adı + başlıkları
senin seçtiğin yapay zekâya gönderir.

### Site erişim izni

Eklenti sekmeleri okuyabilmek için tüm sitelere erişim izni ister. Firefox bu
izni kapatmana izin verir; Chrome'da da eklenti ayrıntılarından
kısıtlanabilir. İzin kapalıysa popup'ın üstünde **İzin ver** düğmesi çıkar.
(Firefox izin penceresini açarken popup'ı kapatabilir; izin yine de verilir,
popup'ı yeniden aç.)

Yükleme sırasında istenen izinler:

| İzin | Neden |
| --- | --- |
| Tüm sitelerdeki verileri okuma | Açık sekmelerin metnini okumak ve yapay zekâ sağlayıcısına bağlanmak için (sadece sen sorduğunda, sadece okuma) |
| Tarama geçmişini okuma | Geçmişte arama için (modele yalnızca alan adı + başlık gider) |
| Sekmeler | Açık sekmeleri listelemek için |
| Depolama | Ayarları ve sohbetleri bu bilgisayarda saklamak için |

## API anahtarı

Asistan, seçtiğin sağlayıcının API'sini **kendi anahtarınla** kullanır. Kullanım
ücreti sağlayıcının hesabından düşer; bu, claude.ai ya da ChatGPT aboneliğinden
ayrıdır.

| Sağlayıcı | Anahtarı nereden alırsın |
| --- | --- |
| Claude | [console.anthropic.com → API Keys](https://console.anthropic.com/settings/keys) (önce Billing'den kredi yüklemelisin) |
| ChatGPT | [platform.openai.com → API keys](https://platform.openai.com/api-keys) |
| Gemini | [aistudio.google.com → Get API key](https://aistudio.google.com/apikey) (ücretsiz kotası var) |
| DeepSeek | [platform.deepseek.com → API keys](https://platform.deepseek.com/api_keys) |

Eklenti simgesine tıkla → ⚙ **Ayarlar** → sağlayıcıyı seç → anahtarı yapıştır →
**Kaydet**.

## Kullanım

- Simgeye tıkla, sorunu yaz: "Bu sayfayı özetle", "Açık sekmelerimdeki
  ürünleri karşılaştır", "Geçmişimde hangi tarif sitelerine girmişim?".
- Popup'ı kapatsan da yanıt arka planda hazırlanmaya devam eder; tekrar
  açınca görürsün. ■ düğmesi yanıtı durdurur.
- ☰ eski sohbetler, ＋ yeni sohbet. Bir sohbet başladığı modelle devam eder;
  model değiştirince yeni sohbet aç.
- Başlıkta sohbetin yaklaşık maliyeti görünür (elle yazılan modellerde
  fiyat bilinmediği için gösterilmez).

### Okunamayan sayfalar

Tarayıcılar eklentilerin bazı sayfaları okumasına izin vermez:

- **Chrome:** `chrome://` sayfaları, Chrome Web Mağazası, yerleşik PDF
  görüntüleyici.
- **Firefox:** `about:` sayfaları, addons.mozilla.org ve bazı Mozilla
  sayfaları, okuyucu görünümü, PDF görüntüleyici.

Tarayıcının bellek tasarrufu için uyuttuğu sekmeler de okunamaz; sekmeye bir
kez tıklaman yeter. Chrome'da yerel dosyaları (`file://`) okutmak istersen
`chrome://extensions` → Web Asistanı → **Ayrıntılar** → **Dosya URL'lerine
erişime izin ver**'i aç.

## Gizlilik

- API anahtarların ve sohbetlerin yalnızca bu bilgisayarda
  (`storage.local`) durur; şifrelenmeden saklanır, bilgisayarı
  paylaşıyorsan dikkat et.
- Asistan bir sayfayı okuduğunda ya da geçmişte aradığında, sonuç **yalnızca
  seçtiğin sağlayıcıya** gönderilir. Başka hiçbir sunucuya veri gitmez.
- Asistana sayfa metinlerinin **veri** olduğu, içlerindeki talimatlara
  uymaması söylenir (bir sayfa "önceki talimatları unut" gibi bir şey yazsa
  bile). Asistan zaten yalnızca okuyabildiği için sayfalarda bir şey
  yapamaz.

## Geliştirme

Derleme adımı yok; düz JavaScript (ES modülleri, Manifest V3). Aynı klasör
Chrome'da service worker, Firefox'ta arka plan betiği olarak yüklenir
(`manifest.json` → `background`); tarayıcı API'si `src/tarayici.js`'ten gelir.

```
src/
  arka_plan.js       arka plan: popup'tan gelen gönder/durdur
  tarayici.js        Chrome/Firefox ortak API, site erişim izni
  asistan.js         sohbet döngüsü (model ↔ araçlar), kayıt
  araclar/araclar.js sekmeleri_listele, sekmeyi_oku, gecmiste_ara
  yz/                sağlayıcı istemcileri (anthropic, openai, gemini, deepseek)
  depo.js, dil.js, sistem.js, markdown.js
popup/               açılır pencere arayüzü
test/                node --test birim testleri, onizleme.html
```

Testler (Node 22+):

```bash
npm test
```

Popup'ı eklenti yüklemeden denemek için (sahte sekmeler ve sahte Claude
yanıtıyla):

```bash
python -m http.server 8123
```

Sonra `http://localhost:8123/test/onizleme.html` adresini aç
(`?anahtar=0` anahtarsız hal, `?hata=1` API hatası, `?izin=0` site izni
verilmemiş hal).

Mağaza / Firefox imzalama paketi:

```bash
npm run paketle
```

## Lisans

[MIT](LICENSE)
