# Elektron YT — Arayüz yenileme planı

Tarih: **23 Ekim 2026** · Mevcut sürüm: **1.2.0** · Durum: **UI-1, UI-2 ve UI-3 uygulandı. UI-4 yerel otomatik ve paket kontrolleri geçti; fiziksel Windows DPI/ekran okuyucu kabulü açık.**

Kullanıcının tercihi: **koyu tema, sade ve modern görünüm**. Bu belge yeni arayüzün kapsamını, ekran davranışlarını, uygulama sırasını ve kabul ölçütlerini tanımlar. Genel teknik çalışma kaydı [İyileştirme Planı](IYILESTIRME_PLANI.md) içinde korunur.

## 1. Hedef

Uygulamayı açan kişi üç şeyi hemen anlayabilmeli: bağlantıyı nereye ekleyeceği, MP3/video seçimini nereden yapacağı ve indirmenin hangi durumda olduğu. Ana ekran, link girişi ve indirme listesine ayrılacak. Teknik bilgiler ihtiyaç halinde açılacak.

Referans kullanım: kullanıcı bir playlist bağlantısı ekler, MP3 seçer, 44 öğeyi kuyruğa alır. Sonuç **43 indirildi, 1 indirilemedi** ise arayüz bunu açıkça gösterir; kullanıcı hatanın nedenini ve indirilen klasörünü aynı ekrandan bulur. Bu sayılar gerçek testten alınan kabul senaryosudur; taslak ekranın satırları temsili veridir.

**Tasarım önizlemesi:** [docs/arayuz-onizleme.html](docs/arayuz-onizleme.html). Ağ erişimi ve gerçek indirme bağlantısı içermez. Üstteki önizleme kontrolleriyle indirme sırası/sonuç durumu, filtreler ve parça ayrıntıları incelenebilir.

## 2. Mevcut arayüzde görülen sorunlar

| Bulgu | Kullanıcıya etkisi | Planlanan değişiklik |
| --- | --- | --- |
| Büyük tanıtım başlığı ve üst kartlar | Liste ilk ekranda az yer buluyor | Küçük uygulama başlığı, kompakt durum bilgisi |
| Bağlantı alanının ve tüm panellerin alt alta olması | Kullanıcı giriş ile sonuç arasında kaydırıyor | Geniş pencerede solda giriş, sağda liste |
| 12 sütun, `min-width: 1200px` tablo | Başlık, hata ve eylemler yatay kaydırmada kayboluyor | Birleşik içerik satırları; URL ve teknik ayrıntılar açılır panelde |
| Sekiz büyük sayaç kartı | Asıl işten fazla görsel ağırlık alıyor | Tek satırda anlamlı kuyruk özeti ve filtre sayıları |
| `Job`, `Title`, `Status`, `Retry Failed` ve Türkçe karakter eksikleri | Dil tutarsız, teknik hissediliyor | Tam ve doğal Türkçe metinler |
| Durumlar ham enum olarak gösteriliyor | `postprocess`, `skipped` gibi kavramlar açıklanmıyor | Kullanıcıya dönük durum ve neden açıklamaları |
| Liste temizleme, durdurma ve başlatmanın aynı ağırlıkta olması | Yanlış tıklama riski | Tek ana düğme; toplu işlemler listenin kendi alanında |
| Ham logların sürekli açık olması | Normal kullanımda gereksiz kalabalık | Kapalı başlayan teknik ayrıntılar |
| Playlist erişilemeyince video+liste URL'sinin tek video çözülmesi | Kullanıcı bütün listenin alındığını sanabilir | Playlist beklentisini doğrulayan ayrı davranış düzeltmesi |

İncelenen dosyalar: `app/renderer/index.html`, `styles.css`, `renderer.js`; pencere/ayarlar için `app/main/main.js`, `settings-store.js`; mevcut IPC için `preload.js`, `ipc.js`.

## 3. Ekran düzeni

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Elektron YT                                  Hazır · Ayarlar        │
├──────────────────────┬──────────────────────────────────────────────┤
│ Yeni indirme         │ İndirmeler                     Tümünü durdur │
│                      │ Liste adı · 44 parça · MP3                   │
│ [ MP3 ] [ Video ]    │                                              │
│                      │ 24 indirildi · 3 indiriliyor · 16 sırada     │
│ Bağlantı / bağlantılar│ 1 indirilemedi                               │
│ ┌──────────────────┐ │                                              │
│ │ Her satıra bir   │ │ [Tümü] [Etkin] [Tamamlanan] [İndirilemeyen]  │
│ │ bağlantı         │ │ [Parça ara…]                                 │
│ └──────────────────┘ │                                              │
│                      │ Parça             Durum / ilerleme  İşlem    │
│ Hedef klasör         │ Şarkı başlığı     İndiriliyor ▰▰▰▱    ⋯      │
│ …/İndirilenler       │ Şarkı başlığı     MP3'e çevriliyor     ⋯      │
│ Değiştir · Aç        │ Şarkı başlığı     Tamamlandı          Aç     │
│                      │                                              │
│ [İndirmeye başla]    │                                              │
├──────────────────────┴──────────────────────────────────────────────┤
│ Son işlem bilgisi                             Teknik ayrıntılar ▸  │
└─────────────────────────────────────────────────────────────────────┘
```

- Varsayılan pencere hedefi yaklaşık **1280 × 820**; mevcut minimum 1180 × 720, yeni düzen 960 × 640'ta doğrulandıktan sonra küçültülebilir.
- Sol panel yaklaşık 300–320 px; sağ alan kalan genişliği kullanır. Asıl kaydırma indirme listesinde olur.
- Dar pencerede giriş alanı listenin üstüne taşınır ve kompakt hale gelir. Yatay sayfa kaydırması oluşmaz.
- Ana gezinme ve ayrı bir dashboard eklenmez. Tek ana ekranda giriş, kuyruk ve geçmişe erişilir.
- İş listesi mevcut veriyi kullanır. Bu aşamada bağımsız bir kütüphane/veritabanı veya yeni geçmiş modeli kurulmaz.

## 4. Görsel dil

| Öğe | Karar |
| --- | --- |
| Tema | Sabit koyu tema; açık/sistem teması sonraki isteğe bağlı kapsam |
| Zemin | Koyu nötr `#0d1118`; panel `#151b25`; yükseltilmiş alan `#1b2431` |
| Metin | Ana `#eef2f7`; ikincil `#a5b0bf`; gerçek zemin üzerinde kontrast ölçülecek |
| Ana vurgu | Nane yeşili `#71e0b8`; öncelikle ana düğme, seçili biçim ve ilerleme için |
| Durum rengi | Başarılı yeşil, uyarı amber, başarısız kırmızı; her zaman metin/simgeyle birlikte |
| Yazı | Yerel Segoe UI Variable / Segoe UI; ana metin 14–15 px, bölüm başlığı 18–20 px |
| Boşluk | 4/8 px ritmi; paneller arası 20–24 px; satırlarda rahat tıklama alanı |
| Köşe ve gölge | Kontrollerde 8–10 px, panellerde 12–16 px; hafif gölge ve ince ayrım çizgileri |
| İkonlar | Aynı çizgi kalınlığında küçük yerel SVG ikonları; emoji ve dış ikon servisi kullanılmaz |
| Hareket | Kısa, ölçülü geçişler; azaltılmış hareket tercihine uyum; sürekli dekoratif animasyon yok |

Renkler renderer CSS değişkenlerinde toplanacak. Yazı tipi, ikon veya kapak için uzak servis gerekmeyecek; mevcut CSP korunacak. Video kapakları ilk sürümün kapsamına alınmayacak.

## 5. Yeni indirme alanı

1. **Biçim:** `MP3` ve `Video` seçenekleri belirgin, klavyeyle erişilebilir iki seçim olacak. Seçim, kuyruğa eklenen her işte açıkça görünecek.
2. **Girdi:** birkaç satırlık bağlantı alanı; bir bağlantı veya her satırda bir bağlantı kabul eder. Otomatik pano okuma yapılmaz.
3. **Hedef:** klasör adı kısa gösterilir; tam yol erişilebilir ayrıntıda bulunur. `Değiştir` ve `Klasörü aç` yakınında yer alır.
4. **Ana eylem:** `İndirmeye başla`. Boş girdide devre dışı; analiz boyunca çift gönderimi engeller.
5. **Analiz:** `Liste inceleniyor…` gösterilir. Toplam bilinmeden yüzde üretilmez. Analiz sırasında durdurma erişilebilir kalır.
6. **Sonuç:** `44 parça MP3 olarak kuyruğa eklendi` gibi bir mesaj gösterilir. Atlanan tekrarlar ve analiz hataları ayrıca belirtilir.
7. Girdi yalnızca başarılı kuyruğa ekleme sonrası ve kullanıcının metni bu sırada değiştirmemesi koşuluyla temizlenir. Başarısız analizde bağlantı korunur.

**İlk kullanım önerisi:** MP3 öne çıkarılsın; son seçilen biçim sonraki açılışta hatırlansın. Bu, mevcut `video` varsayılanından farklı bir öneridir ve UI-3'te doğrulanan `preferredFormat` ayarıyla uygulanır. Biçim değişimi mevcut kuyruktaki işlerin formatını değiştiremez.

## 6. İndirme listesi ve sonuçlar

- Satırın ana içeriği başlık; altında playlist adı/sırası ve MP3/video etiketi olacak. Ham URL sürekli ayrı sütunda gösterilmeyecek.
- Durum, ilerleme çubuğu ve gerektiğinde hız/kalan süre aynı satırda okunacak. Dar pencerede ikincil bilgiler alta geçecek.
- `Tümü`, `Etkin`, `Tamamlanan`, `İndirilemeyen` filtreleri; başlık/bağlantı üzerinden yerel arama olacak. Etkin filtresi analiz, sırada ve çalışan işleri kapsar.
- Filtre sayıları **bütün mevcut liste** üzerinden hesaplanır; sayfalama filtrelenmiş sonuçtan sonra uygulanır. Filtre değişiminde geçersiz sayfa sıfırlanır.
- Satır sırası ilerleme değiştikçe kendiliğinden değişmez; seçim ve odak kaybolmaz. Satırlar kalıcı `job.id` ile güncellenir.
- İlk uygulamada sayfa başına en çok **100 iş** sınırı korunur. Büyük listelerin bütün satırları DOM'a basılmaz.
- Tamamlanan işte `Dosyayı aç` ve `Klasörde göster`; başarısız/iptal işte uygun olduğunda `Yeniden dene`; diğer bilgi `Ayrıntılar` içinde bulunur.
- URL, hedef dosya, hata metni ve deneme sayısı ayrıntı panelinde görünür. Teknik bilgi düz metin olarak güvenli render edilir.

### Durum sözlüğü

| Motor durumu | Ekran metni | Davranış |
| --- | --- | --- |
| Analiz active/waiting | Liste inceleniyor / Analiz sırası bekleniyor | Belirsiz ilerleme; ayrı analiz sayısı |
| `queued` / `waiting` | Sırada | Sahte hız veya kalan süre gösterilmez |
| `downloading` + starting | Hazırlanıyor | Metadata/bağlantı kurulumu |
| `downloading` + download | İndiriliyor | Gerçek indirme yüzdesi, hız ve süre |
| `downloading` + postprocess | MP3'e dönüştürülüyor | Ayrı aşama; indirmenin %100 olması tamamlandı sayılmaz |
| `completed` | Tamamlandı | Doğrulanmış dosya eylemleri açılır |
| `failed` | İndirilemedi | Kısa açıklama + teknik ayrıntı; deneme sınırı görünür |
| `cancelled` | Durduruldu | Sınır uygunsa yeniden deneme |
| `skipped` | Atlandı | Daha önce indirildi / zaten kuyrukta gibi neden gösterilir |

Toplam sonuç `43/44 indirildi · 1 indirilemedi` biçiminde gösterilecek. İşlem bittiğinde tüm dosyalar başarılıymış gibi `%100 başarılı` yazılmayacak. Genel indirme hızı/süre tahmini ilk kapsamda eklenmeyecek; motorun sağlamadığı bilgiler uydurulmayacak.

## 7. Hata ve riskli işlem davranışları

### Playlist açılamıyor

Video+playlist URL'si verildiğinde liste beklenmesine rağmen yalnızca tek video metadata'sı dönüyorsa **sessizce tek dosyayı indirmeye geçilmeyecek**. `Listeye erişilemedi. Paylaşım bağlantısını ve görünürlüğünü kontrol edin.` gösterilecek. Kullanıcı isterse açık bir eylemle `Yalnızca bu videoyu indir` diyebilecek.

Bu davranış yalnızca CSS/renderer işi değildir. `ytdlp-runner.js` ve analiz sonucu/IPC sözleşmesi birlikte ele alınmalı; geçerli playlist, yalnız video, erişilemeyen playlist ve watch+list geri dönüşleri ayrı test edilmelidir. URL'lerin `list` bilgisinin hangi aşamada korunduğu açıkça doğrulanır.

### İndirilemeyen tek parça

YouTube'dan kaldırılmış videonun hatası diğer indirmeleri durdurmamalı. Özet, ilgili filtre ve parça ayrıntısı hatayı görünür kılmalı. Mevcut serbest metin hatalarından her zaman kesin sınıf çıkarılamaz; bilinen nedenler merkezi bir eşlemede gösterilir, bilinmeyen durumda `İndirme tamamlanamadı` + ham ayrıntı kullanılır. Kalıcı kaldırılma hatasında yeniden denemenin sonucu açıklanır; ağ hatasıyla karıştırılmaz.

### Durdurma ve liste temizleme

- `Tümünü durdur` çalışan indirmeleri **ve analizleri** durdurur. `Duraklat` denmez; devam edilebilir indirme sözü verilmez.
- `Listeyi temizle` ikincil menüde bulunur. Etkin işler varsa uygulama içi onay açıkça onların duracağını belirtir.
- Onay metni, indirilen dosyaların ve tekrar indirmeyi önleyen arşivin korunduğunu belirtir. Mevcut motor davranışı değiştirilmez.
- Yeni bir kalıcı dosya silme eylemi eklenmez. Tek parçayı iptal etme, duraklat/devam et ve sürükle-bırak önceliklendirme sonraki kapsamdır.

## 8. Erişilebilirlik ve kullanılabilirlik kabulü

- Başlıklar, alan etiketleri, radio grubu ve ikon düğmelerinin erişilebilir isimleri olacak.
- Tüm ana işlemler Tab/Shift+Tab ve Enter/Space ile yapılabilecek; görünür odak göstergesi korunacak.
- Açılan ayrıntı/onay paneli odağı yönetecek; Escape ile kapanınca odak ilgili düğmeye dönecek.
- Durum yalnızca renkle anlatılmayacak. Dönüştürme ve indirme farklı yazıyla gösterilecek.
- Kontrast gerçek yüzeyler üzerinde ölçülecek; küçük metinde 4,5:1 hedeflenecek.
- Canlı bölge her hız/yüzde değişimini okumayacak; analiz sonucu, bitiş ve hata gibi anlamlı olaylar duyurulacak.
- 1280 × 720, 1366 × 768 ve 1480 × 940 düzenleri; %125/%150 Windows ölçeklemesi; %200 yazı büyütme kontrol edilecek.
- İndirme sırasında uzun başlık, uzun klasör yolu, Türkçe karakter, boş liste ve 5.000 kayıt ayrı örneklerle doğrulanacak.

## 9. Uygulama sırası

| Faz | İş | Etkilenen yerler | Kabul / çıkış koşulu | Durum |
| --- | --- | --- | --- | --- |
| UI-0 | Tasarım yönü, yerleşim, örnek ekran, kapsam | Bu belge, `docs/arayuz-onizleme.html` | Koyu/sade yön ve davranışlar yazılı; taslak incelenebilir | Tamamlandı: plan ve taslak |
| UI-1 | Kompakt ana ekran, koyu tasarım token'ları, Türkçe metinler | `index.html`, `styles.css`, `renderer.js` | Giriş/biçim/klasör ve liste görünür; mevcut temel IPC akışı çalışır | Tamamlandı |
| UI-2 | Yeni satırlar, filtre/arama, sonuç özeti, ayrıntı ve temizleme onayı | Renderer + smoke/performance kontrolleri | 44 öğe / 43 başarılı / 1 hata senaryosu anlaşılır; 100 satır sınırı ve odak korunur | Tamamlandı |
| UI-3 | Playlist tek-video geri dönüş koruması ve son biçim tercihi | Runner/manager, ayar doğrulaması, gerekirse dar kapsamlı IPC | Gerçek playlist beklenirken yanlış tek dosya başlanmaz; biçim tercihi güvenli saklanır | Tamamlandı |
| UI-4 | Erişilebilirlik, farklı pencere/ölçek, paket kabulü ve kayıt | Smoke/performance, `test:packages`, yerel build, MD | Yerel kontroller ve gerçek paket davranışı geçer; çalıştırılmayanlar açık kalır | Yerel otomatik ve paket kontrolleri geçti; fiziksel DPI/ekran okuyucu kontrolü açık |

**Uygulama durumu:** Playlist/ayar korumaları `7f2fe2f`, ürün arayüzü ve yeni UI kontrolleri `329e711` commit'inde tamamlandı. Ürün mevcut güvenli preload/IPC yapısına uyarlandı; temsili veriler ürüne taşınmadı. Paket kaynağı `329e7113d8253184914544a7bcf3140014d76987`; sonraki sonuç dokümantasyonu kaynak kodunu değiştirmez. Sıradaki kabul fiziksel Windows DPI/ekran okuyucu incelemesidir.

**Taslak kontrolü (23 Ekim):** Örnek ekran Electron'da görüntülendi. 44 satır, etkin filtrede 19 öğe, hata filtresinde 1 öğe, ayrıntı penceresi ve biçim seçimi kontrol edildi. Yeni biçim seçimi mevcut satırların MP3 etiketini değiştirmiyor. 1366/1000/760 px genişliklerde yatay sayfa taşması ve konsol hatası görülmedi. Aktif/sonuç ekran görüntüleri `verification/ui-plan-*.png` içinde yerel kanıttır. Bunlar ürünün UI-1–4 kabul testleri değildir.

## 10. Korunacak teknik sınırlar ve doğrulama

- Electron/Node/builder sürümleri ve mevcut bağımlılıklar bu tasarım çalışması için yükseltilmez. React, Tailwind veya yeni UI framework'ü gerekmiyor.
- `contextIsolation`, sandbox, `nodeIntegration: false`, CSP, güvenli sender doğrulaması ve dosya açma denetimleri korunur.
- Mevcut kullanıcı işleri, arşiv ve indirme yolları taşınmaz. UI tercihi eklenirse mevcut ayarlar geriye uyumlu kalır.
- Global `start/stop/retry/clear`, dosya/klasör açma ve klasör seçme mevcut IPC ile karşılanır. İlk aşamada yeni yetkili IPC kanalı gerekmez.
- `smoke-check.js` mevcut DOM/selector ve renderer fonksiyonlarına bağlıdır; tasarımla birlikte anlamlı davranış kontrollerine güncellenir. Testler eski metni bekleyip sahte hata üretmemeli.
- Değişen UI için açılış/IPC, analiz sırasında durdurma, metin güvenliği, filtre/sayfalama, biçim seçimi ve dialog odakları doğrulanır.
- 300/1.000/5.000 iş senaryosu ve mevcut 250 ms renderer bütçesi korunur; DOM 100 iş ve log 200 sınırı sürer. Yeni ölçümler aynı ortamda kaydedilir.
- Yerelde `npm test`, değişen motor davranışı varsa ilgili runner/logic testleri, sonunda `build:release`, `test:packages`, `release:check` uygulanır. Gerçek YouTube kontrolü deterministik testlerden ayrı tutulur.
- GitHub **yalnızca kod ve sürüm geçmişi** için kullanılmaya devam eder; Actions/otomatik yayın yeniden eklenmez.
- Gerçek installer/güncelleme kabulünün ayrı Windows ortamını beklemesi bu planla çözülmüş sayılmaz. Plan aşamasında uygulama sürümü değiştirilmez; yayın kararı ayrıca ele alınır.

## 11. Tamamlanma kontrolü

- [x] Mevcut ekran, renderer ve IPC sınırları incelendi.
- [x] Kullanıcının koyu/sade/modern tercihi kaydedildi.
- [x] Ekran düzeni, metinler, durumlar ve uygulama fazları planlandı.
- [x] Temsili verilerle bağımsız ekran taslağı hazırlandı.
- [x] UI-1 ürün ekranına uygulandı.
- [x] UI-2 liste ve etkileşimleri tamamlandı.
- [x] UI-3 playlist koruması ve biçim tercihi tamamlandı.
- [x] UI-4 yerel otomatik kontroller ve gerçek paket regresyonu geçti.
- [ ] UI-4 fiziksel Windows DPI ayarları ve ekran okuyucuyla manuel kabul tamamlandı.

## 12. Uygulama ve doğrulama sonucu — 23 Ekim 2026

| Kontrol | Sonuç / kanıt |
| --- | --- |
| Gerçek ürün ekranı | Kompakt koyu ekran, dört sütun, filtre/arama, ayrıntı, temizleme onayı, kapalı teknik panel ve Türkçe metinler uygulandı. |
| Biçim tercihi | İlk kullanım MP3. Son seçim dar kapsamlı `settings:preferences` IPC'siyle saklanır; geçersiz değerler ve ek ayar alanları reddedilir. Mevcut işler değişmez; legacy ayarlar uyumlu okunur. |
| Playlist koruması | Analizde `--yes-playlist` kullanılır. Playlist beklenirken tek video sonucu gelirse indirme başlamaz. Video+liste URL'si için kullanıcı açıkça yalnız videoyu seçebilir. Başarısız giriş metni korunur. |
| `release:prepare -- --version 1.2.0` | Geçti: kaynak testleri, gerçek runner, iki paket, paket smoke/ikinci örnek/migration ve dry-run. Günlük: `verification/ui-release-validation.log`. |
| UI senaryoları | 44 öğe / 43 başarılı / 1 hata özeti, filtre/arama, ayrıntı, temizlemeden vazgeçme/onaylama, analiz sırasında durdurma ve biçim tercihi smoke içinde doğrulandı. |
| Performans | 5.000 iş: ilk çizim yaklaşık 2,7 ms, sıcak çizim 0,8 ms; 100 DOM işi ve 200 log sınırı korundu. `verification/performance.json`. |
| Yerleşim | 1280×720, 1366×768, 1480×940, 960×640 ve %125/%150/%200 uygulama büyütmesi: yatay taşma yok. Normal büyütmede başlat düğmesi ilk görünümde. Bu kontrol fiziksel Windows DPI ayarı yerine geçmez. |
| Klavye / kontrast örnekleri | Gerçek Electron girdisiyle Escape ayrıntıyı kapattı, odak ilgili düğmeye döndü. Altı metin/zemin örneğinde hesaplanan en düşük oran 9,33:1. `verification/ui-layout.json`. |
| Gerçek YouTube analizi | Geçersiz örnek playlist reddedildi. İkinci bağlantı 44, önceki ilk bağlantı bu kontrolde 97 öğe olarak çözüldü. Medya indirilmedi; 97 MP3 indirme doğrulanmış sayılmaz. `verification/ui-playlist-guard.json`. |
| Paketler | `release/1.2.0/` içinde portable/NSIS, metadata ve hash'ler doğrulandı. Test edilen commit'te `dirty: false`, dry-run `publishable: true`. Public yayın yapılmadı. İki paket de `NotSigned`. |
| Veri ve güvenlik | Üç mevcut kullanıcı veri dosyası kaynak commit içeriğiyle aynı; audit 0 açık. CSP/sandbox/IPC kaynak ve medya yolu kontrolleri korunur. |

Toplu rapor `verification/ui-delivery.json` ve güncel `verification/final.json` içindedir. Gerçek ekran örnekleri `verification/ui-current-*.png` dosyalarına kaydedildi. Bunlar yerel çıktıdır; GitHub yalnızca kod ve sürüm geçmişi için kullanılır.

Fiziksel DPI/ekran okuyucu kontrolü ile önceki ayrı Windows installer/veri geçişi/güncelleme kabulü açık kalır. Yeni arayüzün kaynak ve yerel paket uygulaması tamamlandı.

### 25 Ekim 2026 — Gerçek kullanım sonrası indirme düzeltmesi

Türkçe hedef klasör adının yt-dlp çıktısında bozulması nedeniyle mevcut MP3 dosyası başarısız sayılıyordu. UTF-8 düzeltmesiyle yeni paket hazırlandı. Kullanıcının 103 öğeli listesinde 101 MP3 indirildi ve tamamı ffmpeg ile doğrulandı; 2 öğe YouTube erişim hatası verdi ve ayrıca kontrol edildi. Kaynak/paket testleri geçti; mevcut kullanıcı verileri korundu. Paket kaynağı `7efef74`. Ayrıntılar, dosya yolları ve paket hash'leri [ana takip planındaki 25 Ekim kaydında](IYILESTIRME_PLANI.md) tutulur.
