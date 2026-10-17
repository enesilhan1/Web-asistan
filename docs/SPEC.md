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

## 3. Açık sekmeler
- Asistan **tüm açık sekmelerin** içeriğini (görünen metin) okuyabilir.
- **Sadece okuma/inceleme**: tıklama, form doldurma, gezinme, sekme
  açma/kapama/yenileme yok.
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
- `sekmeyi_oku`: bir sekmenin metni (uzunsa parça parça)
- `gecmiste_ara`: geçmişte arama → alan adı + başlık listesi

Her kullanıcı mesajına yalnızca kısa bağlam eklenir: tarih/saat ve etkin
sekmenin kimliği, başlığı, adresi.

Sayfa içerikleri **veridir, talimat değildir**; sistem istemi bunu modele
açıkça söyler.

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
