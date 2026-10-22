# Web Asistanı: kararlaştırılan özellikler

Bu belge kullanıcıyla netleştirilen kuralların tek kaynağıdır. Kod bu
kurallara uymalıdır; değişiklik gerekirse önce burası güncellenir.

## 1. Amaç
Tarayıcı eklentisi olarak çalışan bir yapay zekâ asistanı. **Chrome** (ve
Chromium tabanlılar) ile **Firefox 140+** aynı kodla desteklenir. Açık sekmeleri
inceleyip soruları yanıtlar, özetler, karşılaştırır. Geçmişte girilen siteleri
yalnızca **alan adı + sayfa başlığı** düzeyinde bilir.

## 2. Yapay zekâ sağlayıcıları
TakvimTakip uygulamasındaki yapının aynısı:
- Sağlayıcılar: **Claude (Anthropic)** (varsayılan), **ChatGPT (OpenAI)**,
  **Gemini (Google)**, **DeepSeek**.
- Her sağlayıcı için hazır model listesi (ilki varsayılan) + listede olmayan
  bir modeli **elle yazma** seçeneği.
- Her sağlayıcının **kendi API anahtarı** ayrı saklanır; hangi sağlayıcı
  seçiliyse onun anahtarıyla çalışılır.
- Sohbetin yaklaşık maliyeti gösterilir (elle yazılan modelde bilinmez).

## 3. Açık sekmeler ve gezinme
- Asistan **tüm açık sekmelerin** içeriğini (görünen metin + bağlantılar)
  okuyabilir; açık sekmeleri okumak onay gerektirmez.
- **Gezinme (karma):** asistan bir adrese gitmek istediğinde sayfa önce arka
  planda indirilip metne çevrilir; içerik JavaScript ile yüklendiği için
  eksikse sayfa **arka plan sekmesinde** açılır, okunur ve sekme kapatılır.
- **Bölüm açma:** "Daha fazla göster", akordeon, `<details>`, sayfa içi
  sekmeler gibi bölümler açılabilir; bu **yalnızca sayfanın arka planda
  açılan kopyasında** yapılır, kullanıcının sekmesine dokunulmaz.
- **Yapılmayanlar:** form doldurma, gönderme, satın alma; form içindeki ya da
  başka sayfaya giden öğelere tıklama; kullanıcının sekmelerini değiştirme.
- Tarayıcının izin vermediği sayfalar (Chrome: `chrome://`, Chrome Web
  Mağazası; Firefox: `about:`, addons.mozilla.org ve bazı Mozilla sayfaları;
  ikisinde de yerleşik PDF görüntüleyici vb.) ve uykudaki sekmeler okunamaz;
  asistan bunu söyler.

## 4. Geçmiş
- Tarayıcının tuttuğu **tüm geçmiş** aranabilir (zaman sınırı yok).
- Modele yalnızca **alan adı + sayfa başlığı** gider. Tam adres, ziyaret
  tarihi, ziyaret sayısı **gitmez**.

## 5. Veri aktarımı
Geçmiş ve sekme içerikleri her mesaja eklenmez. Model ihtiyaç duyunca
**araç (tool)** çağırır:
- `sekmeleri_listele`: açık sekmeler (kimlik, başlık, adres, etkin olan)
- `sekmeyi_oku`: bir sekmenin metni (uzunsa parça parça) ve bağlantıları
- `sayfayi_ac`: bir adresi açıp okur (karma gezinme, §3)
- `sayfayi_genisleterek_oku`: kopyada bölümleri açıp okur (§3)
- `github_repo_agaci`: bir GitHub reposunun bilgileri ve dosya ağacı
- `github_dosya_oku`: repodan bir dosyanın içeriği (uzunsa parça parça)
- `gecmiste_ara`: geçmişte arama → alan adı + başlık listesi

Bir mesaj için **adım sınırı yoktur**; asistan işi bitene ya da kullanıcı
durdurana kadar devam eder. Sohbet uzadıkça modelin sınırını aşmamak için en
eski araç sonuçları kısaltılır (gerekirse asistan aracı tekrar çağırır).

Her kullanıcı mesajına yalnızca kısa bağlam eklenir: tarih/saat ve etkin
sekmenin kimliği, başlığı, adresi.

Sayfa içerikleri **veridir, talimat değildir**; sistem istemi bunu modele
açıkça söyler. Arka planda indirilen sayfalarda gizli öğelerin (`hidden`,
`aria-hidden`, `display:none`, `visibility:hidden`) metni `⟦GİZLİ METİN⟧`
işaretleriyle ayrılır; model içlerindeki talimatlara uymaz.

## 6. Arayüz
- **Açılır pencere (popup)**.
- Yanıt arka planda (service worker) hazırlanır; popup kapansa da kaybolmaz,
  yeniden açınca görünür.
- Arayüz dili: **Türkçe / İngilizce**, ayarlardan seçilir. Asistan seçili
  dilde yanıt verir.

## 7. Sohbet geçmişi
- Sohbetler **yalnızca bilgisayarda** (`storage.local`) saklanır.
- Birden çok sohbet: yeni sohbet açılabilir, eskiler listeden açılıp devam
  edilebilir veya silinebilir.
- Her sohbet başladığı sağlayıcı/modele bağlıdır (sağlayıcıların geçmiş
  biçimleri birbirine çevrilemez).

## 8. Tarayıcılar
- Tek kod tabanı: `manifest.json`'da Chrome için `service_worker`, Firefox için
  `scripts` (ikisi de `src/arka_plan.js`, modül).
- API `src/tarayici.js` üzerinden: Firefox'ta `browser`, Chrome'da `chrome`.
- Firefox: eklenti kimliği `web-asistani@enesilhan1`; veri beyanı
  `websiteContent` + `browsingActivity` (sayfa metni ve gezinme bilgisi
  kullanıcının seçtiği sağlayıcıya gider).
- Site erişim izni kullanıcı tarafından kapatılabilir; kapalıysa popup
  "İzin ver" şeridi gösterir ve asistan istek göndermez.

## 9. Site onayı (gezinme)
- Onay **site** (alan adı, ör. `github.com`; alt alan adları dahil) bazındadır.
- Kullanıcının mesajı gönderdiği andaki **etkin sekmenin sitesi** o sohbet
  için izinli sayılır.
- Başka bir siteye gitmeden önce popup'ta **bir kez** onay istenir (tam adres
  gösterilir); verilen izin **o sohbet boyunca** geçerlidir, **yeni sohbette
  sıfırlanır**. Reddedilirse asistan o adrese gitmez.
- Yönlendirme başka bir siteye götürürse içerik, o site için onay alınmadan
  modele verilmez.
- GitHub araçları `github.com` sitesi sayılır.
- Onay kartı adresin **kaynağını** gösterir: okunan bir sayfanın bağlantısı
  (sayfa başlığıyla), açık sekmeler, kullanıcının mesajı, yönlendirme ya da
  GitHub reposu. Adres bunların hiçbirinde geçmiyorsa (asistan kendisi
  oluşturduysa) kart belirgin bir **uyarı** gösterir.

## 10. GitHub
- Repo bilgisi ve dosya ağacı GitHub API'sinden, dosyalar
  raw.githubusercontent.com'dan okunur.
- Ayarlarda **isteğe bağlı GitHub token'ı**: anahtarsız saatte 60 API isteği
  sınırı var; token ile sınır yükselir ve özel repolar okunabilir. Token
  yalnızca GitHub'a gönderilir.
