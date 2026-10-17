# Web Asistanı

Açık sekmelerini inceleyen ve geçmişte girdiğin siteleri **yalnızca alan adı ve
sayfa başlığıyla** bilen bir yapay zekâ asistanı (Chrome eklentisi).

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

1. Bu depoyu indir: GitHub'da **Code → Download ZIP**, sonra ZIP'i bir klasöre
   çıkar. Ya da `git clone https://github.com/enesilhan1/Web-asistan.git`.
2. Chrome'da adres çubuğuna `chrome://extensions` yaz.
3. Sağ üstteki **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle**'ye tıkla ve çıkardığın klasörü seç (içinde
   `manifest.json` olan klasör).
5. Araç çubuğundaki yapboz simgesinden **Web Asistanı**'nı sabitle.

Chrome yükleme sırasında şu izinleri ister:

| İzin | Neden |
| --- | --- |
| Tüm sitelerdeki verileri okuma | Açık sekmelerin metnini okumak için (sadece sen sorduğunda, sadece okuma) |
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

Chrome, eklentilerin şu sayfaları okumasına izin vermez: `chrome://`
sayfaları, Chrome Web Mağazası, yerleşik PDF görüntüleyici. Chrome'un bellek
tasarrufu için uyuttuğu sekmeler de okunamaz; sekmeye bir kez tıklaman yeter.
Yerel dosyaları (`file://`) okutmak istersen `chrome://extensions` →
Web Asistanı → **Ayrıntılar** → **Dosya URL'lerine erişime izin ver**'i aç.

## Gizlilik

- API anahtarların ve sohbetlerin yalnızca bu bilgisayarda
  (`chrome.storage.local`) durur; şifrelenmeden saklanır, bilgisayarı
  paylaşıyorsan dikkat et.
- Asistan bir sayfayı okuduğunda ya da geçmişte aradığında, sonuç **yalnızca
  seçtiğin sağlayıcıya** gönderilir. Başka hiçbir sunucuya veri gitmez.
- Asistana sayfa metinlerinin **veri** olduğu, içlerindeki talimatlara
  uymaması söylenir (bir sayfa "önceki talimatları unut" gibi bir şey yazsa
  bile). Asistan zaten yalnızca okuyabildiği için sayfalarda bir şey
  yapamaz.

## Geliştirme

Derleme adımı yok; düz JavaScript (ES modülleri, Manifest V3).

```
src/
  arka_plan.js       service worker: popup'tan gelen gönder/durdur
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
(`?anahtar=0` anahtarsız hal, `?hata=1` API hatası).
