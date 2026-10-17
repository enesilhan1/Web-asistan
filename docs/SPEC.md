# Web Asistanı: kararlaştırılan özellikler

Bu belge kullanıcıyla netleştirilen kuralların tek kaynağıdır. Kod bu
kurallara uymalıdır; değişiklik gerekirse önce burası güncellenir.

## 1. Amaç
Chrome eklentisi olarak çalışan bir yapay zekâ asistanı. Açık sekmeleri
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
- Chrome'un izin vermediği sayfalar (`chrome://`, Chrome Web Mağazası,
  yerleşik PDF görüntüleyici vb.) ve uykudaki sekmeler okunamaz; asistan bunu
  söyler.

## 4. Geçmiş
- Chrome'un tuttuğu **tüm geçmiş** aranabilir (zaman sınırı yok).
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
- Sohbetler **yalnızca bilgisayarda** (`chrome.storage.local`) saklanır.
- Birden çok sohbet: yeni sohbet açılabilir, eskiler listeden açılıp devam
  edilebilir veya silinebilir.
- Her sohbet başladığı sağlayıcı/modele bağlıdır (sağlayıcıların geçmiş
  biçimleri birbirine çevrilemez).
