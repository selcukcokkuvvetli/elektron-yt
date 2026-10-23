# Elektron YT — İyileştirme ve 1.2.0 Sürüm Planı

## 1. Belgenin amacı ve güncel durum

Bu dosya, ayrıntılı proje incelemesinde bulunan sorunların giderilmesi ve yeni sürümün hazırlanması için ana takip kaynağıdır. Uygulama geliştikçe işaretler, test kanıtları, kararlar ve sıradaki adım burada güncellenir.

| Alan | Durum |
| --- | --- |
| Plan tarihi | 22 Ekim 2026, Europe/Istanbul |
| Mevcut uygulama sürümü | `1.2.0` |
| Planlanan hedef sürüm | `1.2.0` |
| Başlangıç incelemesi | Tamamlandı |
| Düzeltmelerin uygulanması | Faz 00–09 yerel olarak tamamlandı; Faz 10 yerel paketleri hazır, manuel sürüm kontrolleri açık |
| Sürüm numarasının değiştirilmesi | Tamamlandı: manifest ve lockfile `1.2.0` |
| GitHub kullanımı | Kullanıcı kararıyla yalnızca kod ve sürüm geçmişi; Windows verification ve Installer candidate verification workflow dosyaları kaldırıldı. Yeni push/PR otomatik test, build veya yayın başlatmaz |
| Yeni build / GitHub yayını | Önceki temiz commit build'i ve uzak Windows CI kanıtları tarihsel kayıt olarak korunur. Bundan sonraki test ve paketleme yerelde elle yapılır. Public sürüm yayını yapılmadı |
| Arayüz yenileme | 23 Ekim: [Arayüz Yenileme Planı](ARAYUZ_YENILEME_PLANI.md) UI-1/2/3 uygulandı. UI-4 yerel otomatik ve paket kontrolleri geçti. Test edilen paket kaynağı `329e711`; 1.2.0 sürümü korundu |
| Sıradaki adım | Fiziksel Windows DPI/ekran okuyucu incelemesi ve ayrı Windows ortamındaki tam installer/güncelleme kabulü. Actions kapalı kalır |

**Sürüm kararı:** İndirme motoru, analiz yaşam döngüsü, depolama, bağımlılıklar ve dağıtım akışındaki değişiklikleri tek bir `1.2.0` sürümünde toplamak hedefleniyor. Mevcut kullanıcı verileriyle uyumluluk korunacak. Sürüm numarası yerel düzeltme testlerinden sonra `1.2.0` olarak artırıldı; `package.json` ve `package-lock.json` birlikte güncellendi. Hedef sürüm değişirse gerekçesi karar günlüğüne yazılacak.

**Takip kuralı:** Bir iş yalnızca uygulanıp ilgili kabul ölçütleri doğrulandığında `[x]` yapılır. İnceleme bulgusu, düzeltmenin tamamlandığı anlamına gelmez. Çalıştırılmayan testler açıkça “Çalıştırılmadı” olarak kalır.

## 2. Kapsam ve korunacak davranışlar

- Tek video, çoklu video ve playlist girişi desteklenecek.
- Playlist parçaları ayrı işler olarak yönetilecek; ana playlist tek bir indirme işine dönüşmeyecek.
- Video ve MP3 seçimi, retry sırasında da korunacak.
- İndirme kuyruğu FIFO olacak; varsayılan indirme eşzamanlılığı `3` olarak kalacak.
- Metadata analiz eşzamanlılığı, indirme eşzamanlılığından ayrı sınırlandırılacak.
- Arşiv mantığı öğe bazında `url + format` üzerinden çalışacak.
- Mevcut JSON kayıtları ve eski arşiv satırları geriye uyumlu okunacak.
- Portable verileri taşınabilir klasörde; installer verileri kullanıcı veri alanında tutulacak.
- Portable manuel güncelleme, installer GitHub Releases üzerinden güncelleme davranışını koruyacak.
- Electron ana süreç / preload / IPC / renderer ayrımı korunacak.
- Gereksiz çatı değişimi, veritabanı geçişi ve hesap sistemi bu çalışmanın kapsamına alınmayacak.
- Her fazda ilgili dokümantasyon ve anlamlı regresyon testleri güncellenecek.

## 3. İnceleme başlangıç kaydı

Bu bölüm 22 Ekim 2026 tarihli incelemenin kanıtıdır; ileride çalıştırılacak kontrollerin yerine geçmez.

### Başarılı kontroller

- [x] Kaynak kodu, mimari, renderer, depolama ve yayın scriptleri incelendi.
- [x] `npm run test:stores` geçti.
- [x] `npm run test:logic` geçti.
- [x] `npm run test:smoke` geçti.
- [x] 17 JavaScript dosyası sözdizimi kontrolünden geçti.
- [x] Gerçek yt-dlp ile yerel HTTP sunucusundan MP4 indirildi.
- [x] Gerçek ffmpeg ile yerel örnek medya MP3'e dönüştürüldü.

### Doğrulanan sorunlar

| ID | Öncelik | Bulgu / kanıt | Çözüm fazı |
| --- | --- | --- | --- |
| B01 | P1 | `--progress` eksik; gerçek indirme yüzdesi gelmiyor. Kısaltılmış timeout testinde 278.528 bayt aktarılırken iş kesildi. | 01 |
| B02 | P1 | Metadata analizi ana süreçte `spawnSync` kullanıyor; uygulama seviyesinde analiz süresi sınırı yok. | 02 |
| B03 | P1 | Electron `23.3.13` destek dışı; builder `23.6.0` ve updater ağacında güvenlik bildirimleri var. | 05 |
| B04 | P1 | Yayın scripti yerel paketleri doğrulamadan mevcut uzak dosyaları siliyor; yeni sürümü yüklemelerden önce yayınlıyor. | 09 |
| B05 | P2 | Ortak videolu iki playlist aynı girişte işlendiğinde aynı formatta iki indirme başladı. | 03 |
| B06 | P2 | Analiz hatalı playlist retry edildiğinde resolver yeniden çağrılmadı; ana URL doğrudan runner'a gönderildi. | 03 |
| B07 | P2 | İptal edilmiş asıl işin yanında kalan `skipped` satırı, URL'nin yeniden eklenmesini engelledi. | 03 |
| B08 | P2 | Yarım JSON boş geçmiş olarak okunuyor; `[null]` kaydı başlangıç hatasına yol açıyor. Yazmalar atomik değil. | 04 |
| B09 | P2 | Tüm liste her snapshot'ta gönderiliyor; renderer satırları tekrar arayıp taşıyor; log dizisi sınırsız büyüyor. Performans etkisi ölçülecek. | 06 |
| B10 | P2 | Kontrollü asenkron resolver testinde `stopAll()` sonrası analiz tamamlanınca yeni iş başladı. Mevcut senkron analiz bu durumu arayüzde maskeliyor. | 02 |

P1: sürüm öncesinde öncelikle giderilecek işlev, güvenlik veya yayın bütünlüğü sorunu. P2: veri güvenilirliği, işlem doğruluğu veya ölçeklenebilirlik sorunu.

### Ortam ve güvenlik taraması başlangıcı

| Bileşen | İnceleme sırasında görülen sürüm |
| --- | --- |
| Geliştirme Node.js | `14.17.3` |
| npm | `6.14.13` |
| Lockfile biçimi | `1` |
| Electron | `23.3.13` |
| electron-builder | `23.6.0` |
| electron-updater | `6.3.9` |
| yt-dlp | `2026.03.17` |
| ffmpeg | `8.1` |

`npm audit` başlangıç çıktısı: tüm ağaçta 2 kritik, 136 yüksek, 50 orta, 9 düşük; `--production` çıktısında 4 yüksek, 1 orta kayıt. Eski npm sayımları aynı bildirimi birden fazla bağımlılık yolu üzerinden sayabilir. Bunlar benzersiz açık sayısı veya bütün kayıtların bu uygulamada sömürülebilir olduğu iddiası değildir. Electron geliştirme bağımlılığı olarak listelense de paketlenen uygulamanın çalışma zamanıdır.

Gerçek YouTube indirmesi, temiz Windows ortamı, yeni installer kurulumu ve canlı otomatik güncelleme başlangıç incelemesinde doğrulanmadı. Mevcut release klasöründeki dosyaların varlığı yeni sürümün test edildiği anlamına gelmez.

## 4. Faz takip tablosu ve bağımlılıklar

| Faz | İş | Öncelik | Önkoşul | Durum |
| --- | --- | --- | --- | --- |
| 00 | Başlangıç kayıtları ve test yalıtımı | Temel | Yok | Yerel olarak tamamlandı |
| 01 | Gerçek ilerleme ve doğru zaman aşımı | P1 | 00 | Yerel olarak tamamlandı |
| 02 | Asenkron, süre sınırlı ve iptal edilebilir analiz | P1 | 01 | Yerel olarak tamamlandı |
| 03 | Dedupe, skip ve retry doğruluğu | P2 | 02 | Yerel olarak tamamlandı |
| 04 | Dayanıklı depolama ve veri uyumluluğu | P2 | 03 | Yerel olarak tamamlandı |
| 05 | Runtime, bağımlılıklar ve Electron güvenliği | P1 | 00; önceki fazların testleri hazır | Yerel olarak tamamlandı |
| 06 | Büyük liste ve log performansı | P2 | 03, 04, 05 | Yerel olarak tamamlandı |
| 07 | Binary hazırlama ve build önkontrolleri | P2 | 05 | Yerel olarak tamamlandı |
| 08 | Bütünleşik regresyon ve CI | Doğrulama | 01–07 | Yerel olarak tamamlandı |
| 09 | Güvenli ve tekrarlanabilir yayın akışı | P1 | 07, 08 | Yerel olarak tamamlandı |
| 10 | Sürüm yükseltme, paket doğrulama ve dağıtım | Sürüm | 01–09 | Yerel paketler hazır; manuel doğrulama/yayın bekliyor |

Uygulama sırası tablodaki sıradır. Her faz kendi testleriyle tamamlanır; test yazımı Faz 08'e ertelenmez. Faz 08 bütün paketi birlikte doğrular. Bağımlılık yükseltmeleri mevcut ortamı erken bozmasın diye Faz 05 ayrı bir adımda yapılır; yeni runtime altında önceki testler tekrar çalıştırılır.

## 5. Ayrıntılı uygulama planı

### Faz 00 — Başlangıç kayıtları ve test yalıtımı

**Amaç:** Değişiklikleri karşılaştırılabilir ve kullanıcı verilerinden bağımsız bir ortamda doğrulamak.

**Dosyalar:** `scripts/test-stores.js`, `scripts/test-logic.js`, `scripts/smoke-electron.js`, `app/main/paths.js`, `README.md`, bu belge.

- [x] Başlangıç commit'i, Git durumu ve araç sürümlerini yürütme günlüğüne kaydet.
- [x] Testler gerçek veriden ayrıldı; kullanıcı verisi üzerinde işlem gerekmedi. Smoke kontrolleri üç veri dosyasının hash karşılaştırmasıyla değişmediğini doğruluyor. Gerçek veri üzerinde ileride işlem yapılırsa önce yedek alınacak.
- [x] Testlerin geçici ve kendilerine ait veri/indirme klasörleri kullanmasını sağla.
- [x] Smoke testi için yalıtılmış veri kökü seçeneği ekle; normal geliştirme verileri test açılışında değişmesin.
- [x] Ağ gerektirmeyen fixture'ları ve gerçek binary testlerini ayır.
- [x] Başarılı ve başarısız testlerde çocuk süreçlerin, timer'ların ve geçici dosyaların temizliğini tanımla.

**Kabul:** Testler repo içindeki gerçek iş geçmişini ve indirmeleri değiştirmeden çalışır. Başlangıç referansı kayıtlıdır.

### Faz 01 — Canlı ilerleme ve zaman aşımı

**Amaç:** Sağlıklı uzun indirmelerin kesilmesini önlemek ve doğru ilerleme göstermek.

**Dosyalar:** `app/main/ytdlp-runner.js`, `app/main/download-manager.js`, ilgili testler.

- [x] yt-dlp argümanlarına açıkça `--progress` ekle; `--newline` ve son dosya yolu çıktısını koru.
- [x] Download ve postprocess çıktısını ayırt et; `NA`, bilinmeyen hız ve yüzde olmayan çıktıları anlamlı biçimde işle.
- [x] Postprocess sırasında gelen bilinmeyen yüzde, indirme yüzdesini yanlışlıkla sıfırlamasın.
- [x] Zaman aşımını toplam indirme süresi yerine anlamlı aktivite/hareketsizlik üzerinden yönet.
- [x] İlerlemeyen aynı mesajın sonsuza kadar timeout'u ertelemesini önle; ağ ve dönüştürme aşamalarının aktivite ölçüsünü açıkça tanımla.
- [x] Başlangıç, indirme ve dönüştürme aşamalarının süre sınırlarını gerekirse ayır; mevcut `jobTimeoutMs` ayarı için geriye uyum tanımla.
- [x] Kullanıcı iptali, gerçek timeout ve runner hatası ayrı nedenlerle sonuçlansın.
- [x] Süreç kapanışında timeout temizlensin; işin terminal durumu yalnızca bir kez kaydedilsin.

**Kabul / test:** T01–T04 geçer. Yavaş yerel HTTP aktarımı hareketsizlik sınırından uzun sürse bile aktivite varsa tamamlanır; gerçekten duran aktarım sonlandırılır. MP4 ve MP3 çıktıları doğru klasördedir.

### Faz 02 — Asenkron analiz ve iptal yaşam döngüsü

**Amaç:** Analiz sırasında ana sürecin yanıt verebilmesi ve durdurulan analizin sonradan iş oluşturmaması.

**Dosyalar:** `app/main/ytdlp-runner.js`, `app/main/download-manager.js`, `app/main/process-utils.js`, `app/main/ProcessHost.cs`, `scripts/build-process-host.js`, `app/main/ipc.js`, `app/main/preload.js`, `app/renderer/renderer.js`, `app/renderer/index.html`.

- [x] Metadata çözümlemede `spawnSync` yerine asenkron süreç kullan.
- [x] Windows'ta C# süreç yardımcısı ile kill-on-close Job Object oluştur; başlatma/iptal yarışında, normal bitişte ve ayrı başlatılmış torun süreçlerde kapanışı doğrula.
- [x] Analiz işlemleri için açık timeout, çıktı boyutu sınırı ve süreç ağacı temizliği ekle.
- [x] Analiz görevlerini işlem kimliği ve iptal durumu ile takip et; iptali yalnızca renderer butonuna bağlama.
- [x] `stopAll()`, `clearJobs()` ve `dispose()` bekleyen/aktif analizleri de iptal etsin.
- [x] İptal edilmiş veya eski oturuma ait sonuç ve callback'ler yeni iş oluşturamasın, yeni denemeyi değiştiremesin.
- [x] Analiz eşzamanlılığını ayrı sınırla; başlangıçta düşük bir sınır kullan ve ölçümle doğrula.
- [x] Tamamlanan girdinin öğelerini, bütün diğer girdilerin analizi bitmeden kontrollü biçimde kuyruğa al.
- [x] Birden fazla Başlat çağrısının nasıl birleştirileceğini tanımla; program seviyesinde yarışlara karşı koruma ekle.
- [x] Arayüzde analiz başladı/tamamlandı/iptal edildi/hata verdi durumlarını göster; IPC hatalarını kullanıcı mesajına dönüştür.
- [x] Geçersiz URL/protokol ve seçenek gibi başlayan girdileri reddet; doğrulanmış URL'leri CLI seçeneklerinden `--` ile ayır.
- [x] Playlistte erişilemeyen öğeler bulunduğunda çözülebilen öğeleri koruyan hata politikasını tanımla ve test et.

**Kabul / test:** T05–T08 geçer. Analiz sürerken IPC yanıt verir; Durdur/Listeyi Temizle sonrasında geç gelen sonuç indirme başlatmaz. Uygulama kapanınca analiz süreci kalmaz.

### Faz 03 — Tekrarlar, skip ve retry

**Amaç:** Bir içeriğin aynı formatta gereksiz tekrar indirilmesini ve hatalı retry yönlendirmesini önlemek.

**Dosyalar:** `app/main/download-manager.js`, `app/main/ytdlp-runner.js`, `app/renderer/renderer.js`, `scripts/test-logic.js`.

- [x] Tek bir `url + format` anahtarlama yöntemi kullan; varsa güvenilir video kimliği/canonical URL üzerinden tutarlılığı koru.
- [x] Aynı girişteki tek video, playlist öğesi ve çakışan playlistleri ortak bir anahtar kümesinden geçir.
- [x] Eşzamanlı analiz sonuçları kuyruğa eklenirken kontrol ve eklemeyi tek işlem halinde yap; bekleyen öğeler de tekrar kontrolüne dahil olsun.
- [x] Engelleyici durumları açık listele: aktif/bekleyen işler ve başarılı arşiv kayıtları. `failed`, `cancelled` ve bağımsız `skipped` satırları tek başına engel olmasın.
- [x] Analiz hatası ile indirme hatasını `failureStage` gibi geriye uyumlu bir alanla ayır.
- [x] Analiz hatasında retry resolver'ı yeniden çalıştırsın; başarılı analizden çıkan parçalar normal kuyruğa girsin.
- [x] Öğe indirme hatasında retry yalnızca o öğeyi çalıştırsın; playlist bilgisi ve format korunsun.
- [x] Eski kayıtlarda hata aşaması bilinmiyorsa güvenli fallback uygula; ana playlisti sessizce tek işe dönüştürme.
- [x] Retry sınırının toplam deneme mi ek deneme mi olduğunu belgele; mevcut üç toplam deneme davranışını gerekçe olmadan değiştirme.
- [x] Retry sınırı dolduğunda arayüz açıklaması ve buton davranışı tutarlı olsun.
- [x] Arşive yalnızca doğrulanmış başarılı çıktı yazılsın; iptal/timeout ve eski callback'ler tamamlandı kaydı oluşturmasın.

**Kabul / test:** T09–T13 geçer. Aynı videoyu içeren iki playlist aynı formatta yalnızca bir gerçek indirme üretir. Farklı format ayrı iş olabilir. Analiz retry'ı ve öğe retry'ı doğru aşamadan başlar.

### Faz 04 — Dayanıklı depolama ve uyumluluk

**Amaç:** İş geçmişini bozuk kayıt, kesilen yazma ve birden fazla uygulama örneğine karşı korumak.

**Dosyalar:** `app/main/job-store.js`, `app/main/settings-store.js`, `app/main/download-manager.js`, `app/main/main.js`, `app/main/paths.js`, `scripts/test-stores.js`.

- [x] Aynı dizinde geçici dosyaya yazma, güvenli değiştirme ve son sağlam yedek mekanizması oluştur; Windows hata durumlarını ele al.
- [x] Job ve ayar şemasını doğrula: null/yanlış tür, kimlik, URL, durum, format, sayaç ve sayısal sınırlar.
- [x] Bozuk dosyayı sessizce boş geçmişle ezme; orijinali koru, yedeği dene ve kullanıcıya/loga kurtarma durumu bildir.
- [x] Kısmen geçersiz iş listesinde sağlam kayıtları kurtar; atlanan kayıtları ayrıca raporla.
- [x] `concurrency`, retry ve timeout değerleri için geçerli aralık/fallback uygula.
- [x] Eski `1.1.0` işleri ve eski düz URL arşiv satırları için migration fixture'ları hazırla.
- [x] Arşiv yazma başarısızlığında bellek ve disk durumunun ayrışmasını önle; hatayı görünür kıl.
- [x] Kuyruktaki yazmaları sıralandır; kapanışta son durumu güvenli biçimde tamamla.
- [x] Aynı veri kökünü kullanan ikinci uygulama örneğinin eşzamanlı yazmasını engelle; portable ve installer örneklerinin kilit kapsamını belgele.
- [x] Yazma izni olmayan klasör/disk dolu hatasını uygulamayı kontrolsüz kapatmadan yönet.

**Kabul / test:** T14–T17 geçer. Yarım JSON ve `[null]` açılışı çökertmez; bozuk kaynak korunur. Mevcut geçerli kullanıcı verileri yeni sürümde okunur ve yeniden açılışta korunur.

### Faz 05 — Runtime, bağımlılıklar ve Electron güvenliği

**Amaç:** Desteklenen, birlikte çalışan ve izlenebilir bir araç zincirine geçmek.

**Dosyalar:** `package.json`, `package-lock.json`, `app/main/main.js`, `app/main/ipc.js`, `app/main/preload.js`, `app/main/auto-updater.js`, `app/renderer/index.html`, `README.md`.

- [x] Uygulama tarihindeki resmî destek takvimlerinden Node.js LTS ve Electron sürümünü seç; tam sürümleri karar günlüğüne kaydet.
- [x] Electron'un gömülü Node sürümü ile geliştirme makinesinin Node sürümünü ayrı kaydet.
- [x] Desteklenen Windows tabanını açıkça belirt; paketleri bu hedefle doğrula.
- [x] Electron, builder ve updater'ı uyumlu sürümlere yükselt; NSIS güvenlik düzeltmesini içeren builder kullan.
- [x] Geçişli bağımlılıkları da incele; ana sürüm uyumluluğu değerlendirmeden körlemesine `audit fix --force` uygulama.
- [x] Seçilen npm ile lockfile'ı kontrollü güncelle; temiz `npm ci` kurulumunu doğrula.
- [x] `engines` ve uygun sürüm dosyasıyla geliştirme ortamını belgele.
- [x] `contextIsolation`, Node entegrasyonu ve sandbox davranışını açık ayarlarla doğrula.
- [x] Yerel arayüz için uygun CSP ekle; izinsiz gezinme ve pencere açılmasını sınırla.
- [x] IPC çağrılarının göndericisini ve payload türlerini doğrula; bridge yalnızca gereken işlemleri sunsun.
- [x] Dosya açma işlemlerinin uygulamanın doğrulanmış iş çıktılarıyla sınırlı olmasını sağla.
- [x] Updater olaylarının yeni sürümlerde çalıştığını ve portable/installer ayrımını doğrula.
- [x] Tam ağaç ve production güvenlik taramalarını yeniden kaydet; bulguları etki/erişilebilirlik açısından değerlendir.

**Kabul / test:** T18 ve önceki regresyonlar geçer. Destek dışı Electron kaldırılmıştır. Çalışma zamanı ve dağıtımı etkileyen çözülmemiş kritik/yüksek bulgular sürüm engelidir; kalan geliştirme zinciri bulguları gerekçe ve takip işiyle belgelenir.

### Faz 06 — Büyük liste ve log performansı

**Amaç:** Büyük playlistlerde yanıt verebilen arayüz ve sınırlı bellek kullanımı.

**Dosyalar:** `app/renderer/renderer.js`, `app/renderer/styles.css`, `app/main/download-manager.js`, `app/main/ipc.js`, `app/main/preload.js`.

- [x] 300, 1.000 ve 5.000 işlik deterministik fixture'larla başlangıç ölçümü yap; makine/ölçüm yöntemini kaydet.
- [x] DOM satırlarını kimliğe göre bir `Map` ile takip et; her işte tabloyu yeniden aramayı kaldır.
- [x] Yalnızca değişen satır/hücreleri güncelle; değişmeyen satırları her snapshot'ta DOM'dan çıkarıp ekleme.
- [x] Ölçümde gerekirse sayfalama veya sanallaştırma ekle; arama/filtre gibi bağımsız özelliklerle kapsamı büyütme.
- [x] Tam bootstrap snapshot'ını koru; ilerleme için değişen işleri toplu gönderme yaklaşımını değerlendir.
- [x] Güncelleme sırasını/kimliğini koru; geç gelen güncelleme temizlenmiş işi geri getirmesin.
- [x] Renderer loglarını sabit boyutlu halka tamponla sınırla; dosya logları için saklama/rotasyon sınırı belirle.
- [x] Senkron disk yazmalarını ve tüm geçmişi tekrar serialize etme sıklığını ölç; veri dayanıklılığını koruyarak azalt.

**Kabul / test:** T19–T20 geçer. 1.000 işte etkileşim gecikmesi için başlangıç hedefi 250 ms altıdır; 5.000 işte uzun süreli donma ve sınırsız DOM/log büyümesi olmamalıdır. Ölçümler mevcut makinede kaydedilir; hedef değişirse gerekçesi yazılır.

### Faz 07 — Binary hazırlama ve build önkontrolleri

**Amaç:** Test edilen yt-dlp/ffmpeg sürümlerinin aynı şekilde paketlenmesi.

**Dosyalar:** `scripts/bootstrap-binaries.js`, `app/bin/README.txt`, `package.json`, gerekirse yeni binary manifesti, `README.md`.

- [x] Test edilmiş binary sürümlerini ve kaynak URL'lerini manifestte açıkça sabitle; sessiz `latest` değişimine dayanma.
- [x] İndirilen dosyaları yayıncı özeti veya güvenilen manifest hash'iyle doğrula.
- [x] İndirme/çıkartma süre sınırları ve hata temizliği ekle; doğrulanmayan dosyayı çalışan binary'nin üzerine kopyalama.
- [x] Mevcut binary'nin sadece varlığını değil sürümünü ve çalışabildiğini denetle.
- [x] Temiz build'de eksik binary varsa anlaşılır hata ver; bozuk paket üretme.
- [x] Paket içinde binary, güncelleme yapılandırması ve uygulama kaynaklarının doğru konumda bulunduğunu denetle.
- [x] Birinci taraf `process-host.exe` yardımcısını Windows .NET Framework derleyicisiyle kaynak koddan üret; paket hash'ini build-info kaydına ekle. Yalnızca tanımlı exe dosyalarını paketle.
- [x] ffmpeg dağıtımının lisans metinleri ve üçüncü taraf bildirimlerini pakete dahil et.
- [x] Yeni binary seçimi sonrası gerçek runner MP4/MP3 testlerini tekrar çalıştır.

**Kabul / test:** T21 geçer. Eksik/bozuk binary ile build önkontrolü başarısız olur; sağlam kurulumda manifestte kayıtlı sürümler paketlenir.

### Faz 08 — Bütünleşik regresyon ve CI

**Amaç:** Sahte runner testlerinin yanında gerçek süreç davranışını da doğrulamak.

**Dosyalar:** `scripts/test-logic.js`, `scripts/test-stores.js`, `scripts/smoke-electron.js`, yeni runner/renderer/release testleri, `package.json`, uygun CI yapılandırması.

- [x] T01–T21 testlerini uygun katmanlara dağıt; yalnızca uygulama satırlarını taklit eden testler ekleme.
- [x] Ağdan bağımsız yerel HTTP ve örnek medya fixture'larıyla gerçek yt-dlp/ffmpeg entegrasyonunu otomatikleştir.
- [x] Sabit kısa `delay` sürelerine bağımlılığı azalt; olay/koşul bekleme ve üst süre sınırı kullan.
- [x] Smoke testini yüklenme olayından öteye taşı: bootstrap, kritik butonlar, IPC ve renderer hata kontrolü.
- [x] Süreç başlatılamaması, renderer hatası ve beklenmeyen süreç kapanışı başarısız çıkış kodu üretsin.
- [x] Tek bir yerel test giriş komutu tanımla; binary/ağ gerektiren test gruplarını açıkça ayır.
- [x] Windows CI için temiz kurulum, mantık/store, gerçek runner, smoke ve build adımları tanımlandı. Aynı komutlar yerel Windows üzerinde geçti; uzak GitHub Actions koşusu henüz yapılmadı.
- [x] CI yalnızca test/build doğrulasın; normal push otomatik public yayın oluşturmasın.
- [x] CI ve test loglarında credential/token bulunmadığını doğrula.

**Kabul:** Otomatik testler temiz ortamda tekrarlanabilir şekilde geçer. Hangi kontrollerin manuel veya dış ağ gerektirdiği bellidir. Yayımlama scriptlerinin birim testleri gerçek GitHub mutasyonu yapmaz.

### Faz 09 — Güvenli yayın akışı

**Amaç:** Eksik build veya ağ hatasının mevcut yayını bozmaması.

**Dosyalar:** `scripts/release.js`, `scripts/publish-github-release.js`, `package.json`, yeni release testleri, `README.md`.

- [x] Test, binary doğrulama, build ve publish adımlarını ayrı komutlara ayır; yerel hazırlama varsayılan olarak yayın yapmasın.
- [x] Herhangi bir uzak mutasyondan önce tüm paketlerin varlığını, boyutunu, sürümünü ve `latest.yml` hash/URL tutarlılığını doğrula.
- [x] Version argümanını SemVer olarak doğrula; Windows shell üzerinden doğrulanmamış metin yürütme.
- [x] Build edilen commit'i açıkça kaydet; `target_commitish: main` varsayımı yerine test edilen commit ile ilişkilendir.
- [x] Yeni sürümü önce taslak oluştur; tüm dosyalar yüklenip doğrulanınca public hale getir.
- [x] Yayınlanmış aynı sürümün dosyalarını otomatik silip değiştirme; aynı sürüm yeniden çalıştırıldığında doğrulanmış eş dosyaları atla, çakışmada dur.
- [x] Yarım kalmış taslak yüklemeyi güvenli biçimde devam ettir; yalnızca ilgili taslak sürümde kontrollü değişiklik yap.
- [x] `latest.yml` güncelleme işaretçisi eksik paketlere yönelmesin; son doğrulamadan sonra yayınla.
- [x] HTTP timeout, yanıt parse hatası, retry/backoff ve anlaşılır hata çıktısı ekle; token'ları maskele.
- [x] Önkontrol/dry-run modu gerçek GitHub değişikliği yapmadan yayın planını göstersin.
- [x] Eksik paket, hash uyuşmazlığı, upload kesintisi, aynı sürümle yeniden çalışma ve yanlış commit senaryolarını test et.

**Kabul / test:** T22–T23 geçer. Eksik yerel dosya durumunda uzak API mutasyonu sıfırdır. Yükleme kesilirse mevcut public sürüm çalışır; yeni eksik sürüm taslak kalır.

### Faz 10 — Sürüm yükseltme, paket doğrulama ve dağıtım

**Amaç:** Test edilmiş değişiklikleri veri uyumluluğu doğrulanmış `1.2.0` paketleri halinde hazırlamak.

**Dosyalar:** `package.json`, `package-lock.json`, `README.md`, yeni `CHANGELOG.md`, bu belge ve build çıktıları.

- [x] Önceki fazların kabul ölçütlerini ve açık riskleri gözden geçir; sürüm engellerini kapat.
- [x] `1.2.0` değişiklik notlarını kullanıcı davranışı üzerinden yaz; veri kurtarma ve desteklenen Windows/araç zincirini belirt.
- [x] `npm version 1.2.0 --no-git-tag-version` veya eşdeğer kontrollü işlemle manifest ve lockfile sürümlerini birlikte yükselt.
- [x] `package.json`, lockfile, uygulama sürümü ve paket adlarının aynı sürümü taşıdığını doğrula.
- [x] Temiz ortamda portable ve NSIS paketlerini yeniden üret; eski `release/` dosyalarını yeni build kanıtı olarak kullanma.
- [x] `Elektron-YT-Portable-1.2.0.exe`, `Elektron-YT-Setup-1.2.0.exe`, blockmap ve `latest.yml` bütünlüğünü doğrula.
- [x] Bu Windows makinesinde unpacked ve gerçek portable exe için bootstrap, IPC, butonlar, iptal, gömülü Node ve ikinci örnek testlerini doğrula; ikinci portable kopyası birincinin program dosyalarını etkilemesin.
- [ ] Temiz Windows ortamında portable açılış ve MP4/MP3 işlemlerini doğrula; ayrıca yazma izni olmayan taşınabilir konumu test et.
- [x] Geçici GitHub-hosted Windows ortamında kullanıcı bazlı installer kurulumunu, Unicode/boşluk içeren özel yolu (`/D`), kısayol hedeflerini ve kaldırmada kullanıcı verisinin korunmasını doğrula.
- [ ] Windows 10/11 masaüstünde interaktif wizard klasör seçimi, UAC ve tüm kullanıcılar kurulumunu ayrıca gözden geçir.
- [x] `1.1.0` job/ayar ve iki arşiv biçimiyle migration fixture testlerini çalıştır; yeniden okuma ve retry davranışı doğrulandı.
- [x] Legacy fixture'ları gerçek unpacked ve portable 1.2.0 paketlerinde açıp kapat; her hedefte ilk açılış ve yeniden açılışta üç iş, ayarlar ve iki arşiv biçimi korunsun. `scripts/test-package-migration.js`, `test:packages` ve CI kapsamındadır.
- [ ] Gerçek kurulu 1.1.0 verileriyle paket/installer geçişini temiz Windows ortamında doğrula.
- [ ] Installer güncellemesini izole test kanalı/feed veya test deposunda uçtan uca doğrula; portable otomatik güncelleme almasın.
- [x] Kod imzalama mevcutsa sertifika ve yayıncı doğrulamasını yap; mevcut değilse paket durumunu ve etkisini sürüm kaydında açıkça belirt.
- [x] Test edilen commit, araç/binary sürümleri ve paket hash'lerini sürüm kaydına yaz.
- [x] Değişiklikleri inceleyip commit/push yap; test edilen commit üzerinden yeniden paketle. İlk temiz kaynak commit'i `7ec997d0b95741bece894922229bb4bfa4f709c9`; build ve dry-run `dirty: false`, `publishable: true` geçti. Bu teknik önkontrol manuel sürüm kabulü yerine geçmez.
- [ ] İsteğe bağlı, mevcut GitHub kapsamının dışında: ayrıca yayın kararı verilirse manuel kontrollerden sonra public yayın adımını yürüt.
- [ ] Yayın kararı verilirse public asset indirme, güncelleme metadata'sı ve sürüm bağlantısını doğrula; bu belgeye kaydet.

**Kabul / test:** T24–T26 geçer. Paketler aynı test edilmiş kaynak durumundan üretilmiştir. Gerçekten yapılmayan temiz makine veya canlı güncelleme kontrolleri tamamlandı işaretlenmez.

## 6. Test matrisi

| ID | Senaryo | Beklenen sonuç | Yöntem | Durum |
| --- | --- | --- | --- | --- |
| T01 | Yerel MP4 indirme | Gerçek ara yüzdeler, hız/ETA ve mevcut çıktı dosyası | Gerçek runner + HTTP fixture | Geçti (yerel) |
| T02 | Yerel medya → MP3 | Geçerli MP3, doğru klasör ve son dosya yolu | Gerçek yt-dlp + ffmpeg | Geçti (yerel) |
| T03 | Timeout sınırından uzun, aktif yavaş aktarım | Aktivite sürdükçe kesilmez | Gerçek runner + kısıtlı HTTP | Geçti (yerel) |
| T04 | Gerçek hareketsizlik / kullanıcı iptali | Doğru hata nedeni, süreç ve timer temizliği | Kontrollü sunucu/runner | Geçti (yerel) |
| T05 | Yavaş metadata analizi sırasında IPC | Ana süreç yanıt verir | Analiz fixture + IPC smoke | Geçti (yerel) |
| T06 | Analiz sırasında Durdur / Listeyi Temizle | Sonradan iş veya indirme oluşmaz | Kontrollü resolver | Geçti (yerel) |
| T07 | Analiz timeout / uygulama kapanışı | Analiz süreçleri kapanır, kuyruk temizlenir | Süreç entegrasyonu | Geçti (yerel) |
| T08 | Hatalı URL ve kısmen erişilemeyen playlist | CLI seçeneği çalışmaz; geçerli öğeler korunur | Resolver fixture | Geçti (yerel) |
| T09 | Tek video + aynı videoyu içeren playlist | Aynı formatta bir gerçek iş | Mantık | Geçti (yerel) |
| T10 | İki çakışan playlist / eşzamanlı Başlat | Tekrarlı gerçek iş oluşmaz | Asenkron mantık | Geçti (yerel) |
| T11 | Aynı video, video ve audio formatları | İki bağımsız iş ve arşiv anahtarı | Mantık | Geçti (yerel) |
| T12 | Analiz hatası ve öğe hatası retry | Doğru aşama; format/playlist bilgisi korunur | Mantık | Geçti (yerel) |
| T13 | Skipped satırı + iptal, retry sınırı | Yeniden ekleme mümkün; sınır tutarlı | Mantık | Geçti (yerel) |
| T14 | Yarım JSON, `[null]`, yanlış türler | Açılış çökmez; kaynak/yedek korunur | Store fixture | Geçti (yerel) |
| T15 | Yazma kesintisi / izin hatası | Son sağlam veri okunur; hata görünür | Dosya sistemi hata enjeksiyonu | Geçti (yerel) |
| T16 | Eski job/ayar/arşiv verisi | Veri korunur ve geriye uyumlu okunur | Migration fixture | Geçti (yerel) |
| T17 | İkinci örnek ve kapanışta yazma | Aynı veri köküne yarışan yazma yok | Electron entegrasyonu | Geçti (yerel) |
| T18 | Yeni araç zinciri, CSP ve IPC | Temiz kurulum; güvenlik kontrolleri geçer | Kurulum + smoke + audit | Geçti (yerel) |
| T19 | 300 / 1.000 / 5.000 iş | Ölçülmüş render/etkileşim; kontrolsüz büyüme yok | Renderer ölçümü | Geçti (yerel) |
| T20 | Uzun oturum, yoğun log | Log tamponu sınırda; terminal işler değişmez | Yük testi | Geçti (yerel) |
| T21 | Eksik/bozuk binary ve temiz paket | Önkontrol hatası veya doğrulanmış binary | Bootstrap/build entegrasyonu | Geçti (yerel) |
| T22 | Eksik asset / hatalı hash | GitHub mutasyonu yapılmaz | Sahte API | Geçti (yerel) |
| T23 | Upload kesintisi / aynı sürümü yeniden yayınlama | Public sürüm korunur, taslak sürdürülebilir | Sahte API | Geçti (yerel) |
| T24 | Temiz Windows portable ve installer | Açılış, indirme, yollar, kaldırma doğru | Paket üzerinde manuel/otomatik | GitHub-hosted Windows'ta kullanıcı bazlı kurulum/özel yol/kısayol, kurulu MP4/MP3 ve veri koruyan kaldırma geçti; Windows 10/11 wizard ve salt okunur portable konumu bekliyor |
| T25 | `1.1.0` verisi → `1.2.0` | Geçmiş, ayar ve arşiv korunur | Paket + migration fixture | Motor fixture ve gerçek unpacked/portable paketlerinde iki açılış geçti; gerçek kurulu 1.1.0 installer geçişi bekliyor |
| T26 | Installer update / portable ayrımı | Test feed'inde güncelleme tamamlanır; portable ayrımı korunur | İzole güncelleme ortamı | Yönlendirme/olay birim testleri geçti; gerçek update feed bekliyor |

Başlangıç incelemesindeki testler yeni sürüm matrisini otomatik tamamlamaz. Yeni sürümle gerçek YouTube videosu ve resmî tek öğeli test playlisti üzerinden MP4/MP3 indirme doğrulandı; gömülü Electron Node runtime'ıyla video/MP3 testi ayrıca geçti. Dış servis sonuçları deterministik yerel testlerden ayrı kaydedilir.

## 7. Sürüm çıkış ölçütleri ve geri dönüş

- [x] P1 bulgular kapalı; P2 işleri tamamlanmış veya gerekçeli olarak ayrı takibe alınmış.
- [x] Durdur, temizle ve kapanış sonrasında eski görevler iş durumunu değiştiremiyor.
- [x] Aktif uzun indirme başarılı; gerçek hareketsizlik kontrollü başarısız oluyor.
- [x] Playlist/dedupe/retry kuralları ve veri migration testleri geçiyor.
- [x] Yeni runtime altında temiz `npm ci` ve ilgili yerel otomatik testler geçiyor.
- [ ] Temiz Windows kurulum/kaldırma, gerçek veri geçişi ve uçtan uca installer güncellemesi tamam.
- [x] Uzak GitHub Actions koşusu ve public yayın için commit/push üzerinden yeniden build tamam. İlk koşu `39766663816`: bütün adımlar başarılı, paket artifact'i yüklendi. Public yayın ayrıca bekliyor.
- [x] Güvenlik taraması sonuçları ve kalan bulguların değerlendirmesi kayıtlı.
- [x] Portable/installer paketleri ve güncelleme metadata'sı aynı sürüm/commit ile tutarlı.
- [x] Paket hash'leri, kaynak fingerprint'i, test kanıtları ve kullanıcı veri dosyalarının değişmediği hash karşılaştırması kayıtlı. Kullanıcı verisine müdahale gerekmedi.
- [x] Çalıştırılmayan manuel/dış servis kontrolleri ve bunların sürüme etkisi açıkça belirtilmiş.

**Geri dönüş yaklaşımı:** Yayınlanmış aynı sürümün binary'lerini yerinde değiştirme. Hatalı taslağı public hale getirme. Yayın sonrası sorun varsa `1.2.1` gibi daha yüksek bir düzeltme sürümü hazırlanır; updater'ın daha düşük sürüme otomatik döneceği varsayılmaz. Veri şeması değişiyorsa öncesi yedek tutulur; eski uygulamaya dönüşte veri kopyası üzerinde uyumluluk doğrulanır. Kullanıcı indirmeleri ve sağlam geçmiş geri dönüş sırasında silinmez.

## 8. Çalışma ve güncelleme düzeni

1. Başlanacak fazı takip tablosunda “Devam ediyor” yap.
2. Hangi bulgunun düzeltildiğini ve değişen dosyaları yürütme günlüğüne ekle.
3. İlgili senaryoları çalıştır; komut, sonuç ve kanıtı kaydet.
4. Kabul ölçütleri sağlanınca alt işleri ve fazı tamamlandı işaretle.
5. Test başarısızsa nedeni ve sonraki somut adımı yaz; bekleyen işi tamamlandı sayma.
6. Yeni bulgu kapsamı değiştiriyorsa karar günlüğüne gerekçesiyle ekle.
7. Bir sonraki adımı belgenin başındaki güncel durum alanında değiştir.

Uygulama sırasında faz bazında küçük ve geri alınabilir değişiklikler tercih edilir. Uygulanan işler güncel durum, işaretlenmiş görevler ve yürütme günlüğü üzerinden takip edilir; açık kalan manuel testler ve public yayın tamamlanmış sayılmaz.

### Yürütme günlüğü

| Tarih | Faz | Yapılan iş | Kontrol / kanıt | Sonraki adım |
| --- | --- | --- | --- | --- |
| 2026-10-23 | Arayüz / UI-1–4 | Yeni koyu ana ekran, liste, filtre/arama, ayrıntı/onay, Türkçe durumlar, biçim tercihi ve playlist koruması uygulandı. | `329e711` temiz kaynağında `release:prepare` geçti; iki gerçek paket ve legacy açılış kontrolleri başarılı. 5.000 iş ~2,7 ms; audit 0; üç veri dosyası değişmedi. Ayrıntı: `ARAYUZ_YENILEME_PLANI.md`, `verification/ui-delivery.json`. | Fiziksel DPI/ekran okuyucu ve ayrı Windows installer kabulü |
| 2026-10-23 | Arayüz / UI-0 | Mevcut ekran ve IPC sınırları incelendi; kullanıcı tercihiyle koyu/sade/modern tasarım planlandı. Fazlar, metinler, hata davranışları ve erişilebilirlik ölçütleri ayrı belgeye yazıldı; temsili verili HTML taslak hazırlandı. | `ARAYUZ_YENILEME_PLANI.md`, `docs/arayuz-onizleme.html`; Electron'da filtre/ayrıntı/biçim davranışları ve 1366/1000/760 px taşma kontrolü geçti. Ürün kaynakları ve sürümü değiştirilmedi. | UI-1 ana ekran uygulaması |
| 2026-10-22 | Gerçek playlist | Kullanıcının ikinci bağlantısındaki 44 öğe, 1.2.0 paketinin gerçek DownloadManager ve gömülü Node/binary'leriyle toplu MP3 akışında denendi. | 43 MP3 indirildi; tamamı ffmpeg ile baştan sona çözümlendi. 1 video YouTube telif kaldırma talebiyle silinmişti; kuyruk sonraki parçalarla devam etti. Toplam 336.421.005 bayt; üç kullanıcı veri dosyası değişmedi. Rapor: `verification/playlist-bulk-mp3.json`. | Ayrı Windows ortamındaki installer/güncelleme kabulü açık |
| 2026-10-22 | 10 / Yerel tekrar | GitHub otomasyonu kaldırıldıktan sonra temiz `eeb603d` kaynağında tam test, iki paket, gerçek paket regresyonu ve dry-run yeniden geçti. Paketin gömülü Node ve binary'leriyle runner ayrıca geçti. | `verification/local-validation.log`, `verification/embedded-node-runner.log`, `verification/final.json`; audit 0 açık, üç kullanıcı veri dosyasının hash'i değişmedi. Doküman commit'i sonrası paketler son commit kimliğiyle yeniden oluşturulur; kesin kimlik `release/1.2.0/build-info.json` içindedir. | Ayrı geçici Windows ortamında kalan installer/güncelleme kabulü |
| 2026-10-22 | Çalışma düzeni | Kullanıcının GitHub'ı yalnızca kod/sürüm takibi için kullanma kararı uygulandı; iki workflow kaldırıldı, README ve güncel durum yenilendi. | Workflow silmeleri ve doküman değişiklikleri `git diff --check` ile kontrol edildi. Son iki installer koşusu başarısız bitmişti; yeni CI denemesi başlatılmıyor. | Yerel kontroller; eksik installer kabulü için ayrı geçici Windows ortamı |
| 2026-10-22 | Plan | İnceleme bulguları, fazlar, test matrisi ve hedef belgelendi. | Başlangıç commit'i: `269052febfa4729b958ddd12c9c17d7782137e2c`. İlk durumda README değişikliği ve bu yeni plan dosyası vardı. | Faz 00 |
| 2026-10-22 | 00–04 | Yalıtım, gerçek ilerleme/timeout, asenkron analiz, iptal/dedupe/retry ve atomik depolama uygulandı. | Store, engine, legacy/archive fixture ve gerçek süreç regresyon testleri geçti. Kullanıcı veri dosyaları değişmedi. | Runtime/güvenlik |
| 2026-10-22 | 05–06 | Node 24.22.1 / npm 11.19.1, Electron 45.0.0, builder 26.15.3 ve updater 6.8.9; IPC/CSP ve artımlı UI uygulandı. | Temiz `npm ci` geçti; tam ve production audit 0 açık. 5.000 iş: soğuk render ~4,9 ms, sıcak render ~0,8 ms; DOM 100, log 200 sınırında. | Binary/yayın |
| 2026-10-22 | 07–09 | Sabitlenmiş binary/hash/lisanslar, gerçek runner/GUI testleri, Windows CI ve taslak yayın akışı hazırlandı. | Zorunlu binary indirme/çıkartma/hash testi geçti. Eksik paket, kesilen upload ve public sürüm koruması sahte API ile doğrulandı. Uzak CI çalıştırılmadı. | Paketleme |
| 2026-10-22 | 10 | Manifest ve lockfile 1.2.0'a yükseltildi; yerel paketler oluşturuldu. | Gerçek YouTube: MP4 629.172 bayt, MP3 331.052 bayt; gömülü Electron Node ile de geçti. Tek öğeli resmî playlist: video 28.523.658, audio 19.229.135 bayt. Geçici medya temizlendi. | Portable son kontrolü |
| 2026-10-22 | 10 | Portable başlatıcıda IPC yol eşdeğerliği sorunu yakalanıp düzeltildi; paket testleri hazırlama akışına ve CI'a eklendi. | Windows TEMP kısa yol/URL gösterimi ham string yerine gerçek dosya yolu ve ana frame kimliğiyle doğrulanıyor. Güvenlik ve dev smoke geçti. Portable smoke önceki adayda geçti; ikinci örnek/Job Object kontrollerini de içeren son hazırlama akışı sürüyor. | Son paket testi |
| 2026-10-22 | 02/10 | Hızlı iptalde Windows süreç ağacı yarışı giderildi. | C# süreç yardımcısı kendi kill-on-close Job Object'ine çocukları başlatmadan katılıyor. Ayrı başlatılmış torun süreçlerin iptalde ve normal bitişte kapandığı, Unicode/tırnaklı argümanlar ve 5 ardışık smoke geçişi doğrulandı. | Temiz kurulum + paket testleri |
| 2026-10-22 | 10 | Son `npm ci` + `release:prepare -- --version 1.2.0` akışı tamamlandı. | Tüm yerel testler, native Job Object, iki paket için smoke/ikinci örnek, binary ve release hash kontrolleri geçti. Tam/production audit 0 bulgu; üç kullanıcı veri dosyası HEAD ile aynı. Paketler NotSigned. | Temiz Windows / kurulu veri geçişi / update feed / commit ve yayın |
| 2026-10-22 | 10 | Kullanıcı commit/push ve devam talimatı verdi. | `main` ve `origin/main` başlangıç commit'inde eşit; kullanıcı veri dosyalarında değişiklik yok. Kaynak, test, lisans ve plan dosyaları commit kapsamına alınıyor; üretilen binary/paketler Git dışında. | Push, uzak CI ve temiz commit build'i |
| 2026-10-22 | 10 | `7ec997d` commit'i `origin/main` üzerine pushlandı; yerel paketler temiz commit'ten yeniden üretildi. | `test:packages` ve `release:check` geçti: `dirty: false`, `publishable: true`. GitHub Actions `39766663816` kurulum, tüm testler, audit, build, gerçek paket testleri, dry-run ve artifact yüklemeyi başarıyla tamamladı. | Paket migration regresyonu |
| 2026-10-22 | 10 | Eski kayıtların gerçek paketlerde migration/yeniden açılış kontrolü kalıcı regresyon testine eklendi. | Her hedef için ayrı legacy başlangıç verisi ve iki açılış: tamamlanmış iş/başlık/format korunur, yarım indirme iptale dönüşür, eski analiz hatası tanınır, ayarlar ve iki arşiv biçimi değişmez. Testler yalnızca geçici profili kullanır. | Güncel test commit'ini pushla; aynı CI/build/test akışını uygula; ardından manuel installer/update kontrolleri |
| 2026-10-22 | 09–10 | İlk başarılı CI'ın dry-run günlüğünde `dirty: true` / `publishable: false` yakalandı. | `core.autocrlf=true` ile temiz geçici checkout'ta yayıncıdan gelen LF lisanslarını kopyalayınca beş lisans Git durumunda değişmiş göründü. Lisanslara `.gitattributes` ile `-text` eklendi; CI artık bootstrap ve paketleme sonrası temiz Git durumu ile `build-info.dirty: false` şartını ayrıca denetliyor. | Düzeltme commit'ini pushla; temiz checkout ve CI'da doğrula |
| 2026-10-22 | 10 | Kullanıcı kalan installer/güncelleme testlerini ve MD sonucunu istedi. | Yerel Windows 11 Pro makinesinde Sandbox/VM aracı bulunamadı. Gerçek kurulumlar yalnızca açıkça etkinleştirilmiş geçici GitHub-hosted Windows runner'da çalışır; mevcut kurulum/kısayol/veri varsa test durur. Yerelde koruma kontrolü doğrulandı, installer çalıştırılmadı. | Yeni installer entegrasyonunu CI'da çalıştır ve kanıtı kaydet |
| 2026-10-22 | 10 | Kurulum ve kaldırma entegrasyonu gerçek aday üzerinde geçti; eski sürümün CLI yol davranışı yakalandı. | Aday `39773599226`: özel Unicode/boşluklu yol, kayıt/kısayol, kurulu renderer/MP4/MP3, normal açılış ve veri koruyan kaldırma geçti. `39774565119` eski 1.1.0 installer'ın `/D` değerini ilk boşlukta kestiğini gösterdi. Yayımlanmış dosya değiştirilmiyor; legacy fixture boşluksuz ayrı dizin kullanıyor. Güncel installer'ın boşluklu yol testi korunuyor. | Gerçek 1.1.0 → 1.2.0 ve yeni updater döngüsünü tamamla |

### Karar günlüğü

| Tarih | Karar | Gerekçe |
| --- | --- | --- |
| 2026-10-22 | GitHub yalnızca kod ve sürüm geçmişi için kullanılacak; iki Actions workflow dosyası kaldırıldı. | Kullanıcı, bildirim ayarını değiştirmek yerine GitHub üzerinde otomatik test/paketleme çalıştırılmamasını istedi. Yerel test komutları korunur; gerçek kurulum testinin kullanıcı bilgisayarını koruyan sınırı gevşetilmez. Önceki CI sonuçları tarihsel kanıttır. |
| 2026-10-22 | Hedef sürüm `1.2.0`; gerçek bump Faz 10'da. | Birbiriyle ilişkili motor, güvenilirlik ve dağıtım değişiklikleri tek sürümde doğrulanacak. |
| 2026-10-22 | Mimari ve JSON depolama korunacak. | Mevcut MVP'yi gereksiz teknoloji geçişi olmadan sağlamlaştırmak. |
| 2026-10-22 | Yeni bağımlılık sürümleri Faz 05'te resmî kaynaklardan seçilecek. | Destek ve uyumluluk durumu uygulama tarihinde doğrulanmalı. |
| 2026-10-22 | Hazırlama/build ve public yayın ayrıldı. | Public sürüm dosyaları silinmez; test edilen commit ve kaynak hash'i doğrulanır. |
| 2026-10-22 | Node geçişi Faz 02'nin önkoşulu olarak öne alındı. | Sistem Node 14'te AbortController yok. Node 24.22.1 ayrı geliştirici araç dizinine kuruldu; sistem genelindeki Node/PATH değiştirilmedi. |
| 2026-10-22 | `global-agent` için hedefli 4.1.3 override kullanıldı. | Builder'ın eski proxy bağımlılığındaki sprintf/roarr zinciri kaldırıldı; bootstrap API'si korundu, audit 0 açık. Temiz kurulum, gerçek build ve paket testleriyle doğrulandı. |
| 2026-10-22 | yt-dlp 2026.10.21, ffmpeg 9.0.2 ve gömülü Electron Node runtime'ı seçildi. | Yayıncı SHA256'ları doğrulandı; YouTube JS çözümlemesi ek Node/Deno kurulumu gerektirmiyor. Gömülü Node: 24.22.0. |

## 9. Son yerel doğrulama — 22 Ekim 2026

Yerel aday **1.2.0** yeniden doğrulandı. GitHub otomasyonu kapatıldıktan sonra tam yerel testler, paketleme ve paket regresyonu geçti. Public yayın yapılmadı; tam manuel installer kabulü ve gerçek uçtan uca güncelleme tamamlandı olarak işaretlenmedi.

### Güncel yerel tekrar — GitHub otomasyonu sonrası

Test edilen temiz kaynak: `eeb603d9e5254e13943a3b269ce22cf7079ad61b`. Ortam: Windows 11 `10.0.26200`, Node `24.22.1`, npm `11.19.1`, Electron `45.0.0` ve gömülü Node `24.22.0`. Doküman güncellemesinden sonra paketler son commit'ten yeniden oluşturulur; güncel paket kimliği/hash'leri için `release/1.2.0/build-info.json`, toplu sonuç için `verification/final.json` esas alınır.

| Kontrol | Sonuç / kanıt |
| --- | --- |
| `npm run release:prepare -- --version 1.2.0` | Geçti: tam testler, portable ve NSIS aynı build'de, gerçek paket testleri ve yerel dry-run. Günlük: `verification/local-validation.log`. |
| Gerçek runner T01–T08 | MP4, MP3, metadata, aktif aktarım/idle timeout ayrımı, takılan aktarımın sonlandırılması, analiz iptali ve kısmi playlist kontrolleri geçti. |
| Paket içindeki runtime/binary ile runner | `win-unpacked/ElektronYT.exe` gömülü Node modunda ve kendi `resources/bin` dosyalarıyla aynı runner testlerini geçti. Günlük: `verification/embedded-node-runner.log`. Bu kontrol gerçek NSIS kurulumunu kapsamaz. |
| Gerçek unpacked ve portable | Renderer/IPC smoke ve ikinci örnek kilidi geçti. Her hedefte eski veri fixture'ı iki kez açıldı; iş, ayar ve iki arşiv biçimi korundu. Rapor: `verification/package-migration.json`. |
| Bağımlılık taraması | `npm audit --json`: toplam 0 açık. Rapor: `verification/audit-local-current.json`. |
| Performans | 5.000 iş: ilk çizim yaklaşık 2,3 ms, sıcak çizim 0,5 ms, olay döngüsü yaklaşık 5,1 ms; DOM 100 ve log 200 sınırı korundu. Rapor: `verification/performance.json`. |
| Paket tutarlılığı | İlk tekrar adayında dry-run `dirty: false`, `publishable: true`; beş dosyanın hash/metadata ve sürüm/commit tutarlılığı doğrulandı. Bu sonuç public yayın yapıldığı anlamına gelmez. |
| Kullanıcı verileri | `data/jobs.json`, `data/settings.json`, `data/archive.txt` başlangıç hash'leriyle aynı. `verification/final.json` içinde kayıtlı. |
| İmzalama | Portable ve installer `NotSigned`; imzalama yapılmadı. |
| GitHub | Yeni Actions çalıştırılmadı, paket veya release yüklenmedi. GitHub kod/sürüm geçmişi için kullanılıyor. |

Kalan kabul: ayrı geçici Windows ortamında interaktif wizard/UAC/tüm kullanıcılar kurulumu, gerçek kurulu 1.1.0 → 1.2.0 verisi, pozitif/negatif gerçek updater akışı ve salt okunur portable konumu. Önceki CI'daki timeout hatası yerelde bu tekrarda oluşmadı; bu, ayrı Windows ortamındaki tam installer zincirinin düzeldiğine dair kanıt sayılmaz.

### Kullanıcının 97 parçalık playlist denemesi — erişim engeli

22 Ekim 2026 tarihinde kullanıcının verdiği video + playlist bağlantısı, gerçek 1.2.0 paketinin DownloadManager, yt-dlp/ffmpeg ve gömülü Node runtime'ıyla ayrı test verisi/indirme klasöründe denendi. Uygulama bağlantıdan yalnızca bir video çözdü; o video MP3 olarak indirildi (10.077.572 bayt) ve ffmpeg ile baştan sona çözümlenerek doğrulandı. Kullanıcının üç mevcut veri dosyasının hash'i değişmedi.

Aynı playlist kimliğinin doğrudan `/playlist?list=...` adresine YouTube **“The playlist does not exist”** yanıtını verdi. Bu yanıtın gizlilik, kaldırılma veya yanlış bağlantıdan hangisine bağlı olduğu doğrulanamadı. **İlk bağlantıdaki 97 parçalık toplu MP3 indirme doğrulanmadı.** İlk denemenin bağlantı ve parça bilgileri Git'e eklenmeyen `verification/playlist-97-first-link.json` raporunda tutuluyor. Test MP3'ü ayrı `downloads/playlist-97-mp3-*` klasöründe korundu. Kullanıcının daha sonra gönderdiği ikinci bağlantının sonucu aşağıdadır.

### İkinci bağlantı — gerçek toplu MP3 denemesi tamamlandı

Kullanıcının yeni bağlantısı, doğrudan playlist metadata kontrolünde **44 öğe** gösterdi (`playlist_count: 44`, 44 entry, public). Bu, önceki 97 öğe beklentisinden farklı bir listedir. Test edilen gerçek 1.2.0 paketin kaynak commit'i `4e5166dea2b4c5a9095fefe44fe82d8e62d1ae2e`; uygulama kodu değiştirilmedi.

| Kontrol | Sonuç |
| --- | --- |
| Toplu analiz ve kuyruk | 44 öğenin tamamı ses formatında kuyruğa alındı; varsayılan 3 eşzamanlı indirme kullanıldı. |
| MP3 çıktısı | **43 başarılı, 1 başarısız.** MP3'ler toplam **336.421.005 bayt** (yaklaşık 320,84 MiB). |
| Başarısız öğe | 27. öğe YouTube'dan telif kaldırma talebiyle silinmişti. Bu öğenin hatası sonraki parçaları durdurmadı. |
| Dosya sağlamlığı | 43 MP3'ün tamamı ffmpeg ile baştan sona çözümlendi; her dosyanın boyutu ve SHA256'sı rapora yazıldı. |
| Kullanıcı verisi | Ayrı test profili ve indirme klasörü kullanıldı. `data/jobs.json`, `data/settings.json`, `data/archive.txt` hash'leri değişmedi. |
| Yerel çıktılar | `downloads/playlist-97-mp3-iU8Seg/audio/`. Dosyalar silinmedi; Git'e eklenmez. |
| Kanıt | `verification/playlist-bulk-mp3.json`, `verification/playlist-97-console.log`, `verification/second-playlist-metadata.json`. Bağlantı ve parça dökümleri yerelde tutulur. |

**Kabul sonucu:** Bu erişilebilir listeyle gerçek toplu MP3 akışı doğrulandı. YouTube'dan kaldırılmış tek öğe indirilemedi; 97 öğenin tamamının indirildiği iddia edilmez. Bu deneme uygulamanın paket içindeki indirme motorunu kullanır; GUI'ye tıklama veya installer güncelleme testi değildir.

### Önceki yerel ve uzak doğrulamalar — tarihsel kayıt

| Kontrol | Sonuç |
| --- | --- |
| `npm ci` | Geçti; Electron ve Windows süreç yardımcısı temiz kurulumda hazırlandı. |
| `npm run release:prepare -- --version 1.2.0` | Geçti: testler + aynı build'de portable/NSIS + gerçek paket/ikinci örnek testleri + dry-run. |
| `npm audit` / `npm audit --omit=dev` | İkisinde de 0 bulgu; tarama sonuçları `verification/audit*.json`. |
| Gerçek YouTube | Tek video ve resmî tek öğeli playlistte MP4/MP3 geçti; gömülü Node ve yeni Job Object ile ayrıca doğrulandı. |
| 5.000 iş UI ölçümü | Soğuk render ~3.7 ms; sıcak render ~1.0 ms; DOM 100, log 200 sınırında. |
| Kullanıcı verileri | `jobs.json`, `settings.json`, `archive.txt` başlangıç HEAD içerikleriyle aynı. |
| İmzalama | Her iki paket `NotSigned`; sertifika kullanılmadı. |
| Commit / push | İlk kaynak commit'i `7ec997d0b95741bece894922229bb4bfa4f709c9`, `origin/main` üzerine gönderildi. |
| Uzak Windows CI | [39766663816 — başarılı](https://github.com/selcukcokkuvvetli/elektron-yt/actions/runs/39766663816); tüm adımlar ve paket artifact yüklemesi geçti. Ancak bu ilk uzak adayın dry-run çıktısı satır sonu farkları yüzünden `dirty: true` idi; dağıtılabilir aday sayılmaz. `-text` ve zorunlu temiz kaynak kontrolleri eklendi. Sonraki düzeltme koşuları [Actions](https://github.com/selcukcokkuvvetli/elektron-yt/actions) üzerinden izlenir; yeni CI bu durumda başarısız olur. |
| Paket migration | Gerçek unpacked/portable uygulamada ayrı legacy fixture'larla ilk açılış ve yeniden açılış; rapor `verification/package-migration.json`. Kurulu 1.1.0 installer geçişi ayrıca bekliyor. |
| Public yayın | Yapılmadı. İlk temiz commit dry-run `dirty: false`, `publishable: true`; manuel kabul ve açık yayın adımı bekliyor. |

**Yerel çıktılar:** `release/1.2.0/`. Güncel paketlerin kesin commit'i, kaynak fingerprint'i, araç/binary/helper bilgileri ve SHA256'ları bu dizindeki `build-info.json` içinde tutulur. Toplu sonuçlar `verification/final.json`, performans `verification/performance.json` içindedir. Bu üretilen klasörler Git'e eklenmez. Her kaynak/test commit'i sonrası yeniden build ve paket önkontrolü çalıştırılır; güncel dosyalar için manifest esas alınır.

Aşağıdaki tablo, commit öncesi ilk yerel adayın tarihsel kaydıdır; sonraki build'lerin hash'i olarak kullanılmaz:

| Paket | Bayt | SHA256 |
| --- | --- | --- |
| `Elektron-YT-Portable-1.2.0.exe` | 145251695 | `bb11f5bd42d32082be94addcacd94c90d24ad3f0afbfc6f42e1fdb22a9c651e3` |
| `Elektron-YT-Setup-1.2.0.exe` | 145474691 | `7a50992fe247d17792e1dbf72f41345fe744e6cd081dce6a09a7528029f770b7` |

### Installer ve güncelleme entegrasyonu — CI denemeleri durduruldu

**Güncel karar (22 Ekim 2026):** Kullanıcı GitHub'ı yalnızca kod ve sürüm geçmişi için kullanmayı seçti. `.github/workflows/windows.yml` ve `.github/workflows/installer-candidate.yml` kaldırıldı. Aşağıdaki CI açıklamaları ve koşu numaraları önceki denemelerin kaydıdır; yeni koşu planlanmıyor. Son tam koşu `39776044605`, testler/audit/build/paket önkontrolünü geçti ancak kurulu runner testinde aktif aktarım timeout kontrolü başarısız oldu. Son aday koşusu `39776044740` da başarısız tamamlandı. Installer/güncelleme kabulünün tamamı doğrulanmış sayılmaz. Kalan gerçek kurulum testleri ayrı geçici Windows test ortamını bekler; mevcut koruma kaldırılarak kullanıcı makinesinde çalıştırılmaz.

Komut: `npm run test:installer`. Yalnızca GitHub-hosted Windows CI ve `ELEKTRON_YT_DISPOSABLE_INSTALLER_TEST=1` ile çalışır. Yayımlanmış 1.1.0 installer'ı sabit SHA256 ile indirilir. Güncelleme feed'i yalnızca `127.0.0.1` üzerinde sunulur; GitHub Releases üzerinde değişiklik yapılmaz. Test, gerçek uygulamanın normal açılışını ve kapanışta otomatik NSIS kurulumunu kullanır; updater olaylarını taklit etmez. Güncel updater için sonraki patch sürümünde özel bir test paketi üretilir; bu paket public sürüm değildir ve gerçek manifest/lock sürümü değişmez.

| Kontrol | Durum / kanıt |
| --- | --- |
| Kullanıcı bilgisayarında installer çalışmasını engelleyen koruma | Yerelde doğrulandı; installer başlatılmadı. |
| Temiz kullanıcı bazlı kurulum, Unicode/boşluk içeren özel klasör, kayıt defteri ve kısayol hedefleri | Geçti: aday koşusu `39773599226`, ilk aşama. Kısa/uzun Windows yolları gerçek dosya kimliğiyle karşılaştırılıyor. |
| Kurulu uygulamada renderer/IPC ve kurulu binary/gömülü Node ile MP4/MP3 runner | Geçti: aynı koşuda kurulu Electron 45 / Node 24.22.0 ile T01–T08 ve smoke. |
| Kaldırmada kayıt defteri/kısayol temizliği; işler, ayarlar, iki arşiv biçimi ve indirmelerin korunması | Geçti: aynı koşuda normal açılış/kapanış ve gerçek NSIS kaldırma sonrası kayıt/indirme kontrolleri. |
| Yayımlanmış gerçek 1.1.0 kurulumu → gerçek 1.2.0 güncellemesi ve veri uyumluluğu | Tamamlanmadı; CI denemeleri durduruldu, ayrı geçici Windows ortamı bekleniyor. |
| Yeni updater ile erişilemeyen feed ve yanlış SHA512 reddi | Tamamlanmadı; ayrı geçici Windows ortamı bekleniyor. |
| Yeni updater ile özel sonraki patch paketini indirme, kapanışta kurma, sürüm/kısayol/veri doğrulama ve yeniden açılış | Tamamlanmadı; ayrı geçici Windows ortamı bekleniyor. |
| Gerçek portable başlatıcıda ayrı veri ve otomatik güncellemenin kapalı olması | Bu entegrasyon zincirinde tamamlanmadı; önceki yerel portable testleri ayrı kanıttır. |

Makine tarafından okunabilir rapor `verification/installer.json` dosyasına yazılır ve CI'da `windows-verification-reports` artifact'i olarak başarısız koşularda da saklanır. İnteraktif wizard sayfaları/UAC, tüm kullanıcılar kurulumu, imzalı publisher doğrulaması, diferansiyel indirme ve gerçek public GitHub feed'inden sürüm yükseltmesi bu testin kapsamı dışındadır. Salt okunur portable konumu ayrıca açık kalır.

`Installer candidate verification` akışı, test düzeltmelerini mevcut paket artifact'iyle daha hızlı sınar. Rapor `commit` (test kodu) ve `packageCommit` (paketin kaynağı) alanlarını ayrı tutar; bu akış güncel kaynakla tam build koşusunun yerine geçmez. Normal uygulamalar yalnızca test başlatıcısının eklediği loopback debugger portundan `window.close()` ile kapatılır; gerçek `before-quit`/`quit` ve updater'ın kapanışta kurulum zinciri çalışır. Üretim koduna debugger ayarı eklenmez. Güncelleme kabulü indirmeyi, sürüm değişimini, yeniden açılışı ve veri/kısayol korunmasını birlikte gerektirir.

## 10. Referanslar

- [Proje README](README.md)
- [Mevcut paket ve build yapılandırması](package.json)
- [İndirme yöneticisi](app/main/download-manager.js)
- [yt-dlp çalıştırıcısı](app/main/ytdlp-runner.js)
- [Yayınlama scripti](scripts/publish-github-release.js)
- [Electron 23.3.13 destek sonu kaydı](https://releases.electronjs.org/release/v23.3.13)
- [electron-builder NSIS güvenlik bildirimi](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-r4pf-3v7r-hh55)
- [yt-dlp çıktı ve ilerleme seçenekleri](https://github.com/yt-dlp/yt-dlp#verbosity-and-simulation-options)

Güvenlik ve sürüm referansları uygulama sırasında yeniden doğrulanır; başlangıç incelemesinin tarama sayıları sabit bir gelecek garantisi değildir.
