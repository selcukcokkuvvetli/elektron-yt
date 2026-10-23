# Elektron YT

Windows 10/11 x64 için Electron tabanlı YouTube video ve MP3 toplu indirme uygulaması. Tek video, çoklu link ve playlist girişleri desteklenir. Portable ve NSIS installer paketleri oluşturulur.

## İlerleme ve sürüm takibi

Bulgular, fazlar, kabul ölçütleri, test kanıtları ve kalan işler [İyileştirme Planı](IYILESTIRME_PLANI.md) üzerinden takip edilir. Kullanıcıya dönük değişiklikler [CHANGELOG](CHANGELOG.md) dosyasındadır.

Koyu, sade ve modern masaüstü arayüzü için [Arayüz Yenileme Planı](ARAYUZ_YENILEME_PLANI.md) ve [etkileşimli ekran taslağı](docs/arayuz-onizleme.html) hazırdır. Taslak temsili veriler kullanır; gerçek indirme başlatmaz. Ürün arayüzüne uygulama henüz yapılmadı.

GitHub kod ve sürüm geçmişi için kullanılır. Push ve pull request işlemleri GitHub Actions testi, paketleme veya yayın başlatmaz; workflow dosyaları kaldırılmıştır. Test ve paket hazırlama komutları geliştirici bilgisayarında elle çalıştırılır.

## Geliştirme ortamı

- Node.js **24.22.1**, npm **11.19.1**. Sürümler `.nvmrc` ve `.node-version` içinde kayıtlıdır.
- Electron **45.0.0**, electron-builder **26.15.3**, electron-updater **6.8.9**.
- Windows x64 paketleme ve gerçek binary testleri Windows üzerinde çalıştırılır.
- Son kullanıcı için ayrıca Node.js, Python veya ffmpeg kurulumu gerekmez. Windows süreç yardımcısı, işletim sistemindeki .NET Framework ile çalışır; geliştirmede C# kaynağından otomatik derlenir.

```powershell
node --version
npm --version
npm ci
npm run bootstrap:binaries
npm start
```

Node 14 gibi eski bir sürüm kullanılıyorsa önce belirtilen geliştirme sürümüne geçilmelidir. Sistem genelindeki Node kurulumu bu proje tarafından otomatik değiştirilmez.

## İndirme ve veri davranışı

- Video çıktıları seçilen klasörün `video`, MP3 çıktıları `audio` alt dizinine yazılır.
- Varsayılan olarak aynı anda 3 indirme ve ayrı olarak 1 metadata analizi çalışır.
- Bir girdinin analizi bitince çözülen parçalar kuyruğa girer; diğer girdilerin tamamı beklenmez.
- Her playlist parçası bağımsız iş, retry ve arşiv kaydıdır. Tekrar kontrolü canonical URL + format üzerinden yapılır.
- Retry sınırı ilk indirme dahil **3 toplam denemedir**; otomatik sınırsız yeniden deneme yapılmaz.
- İndirme hareketsizlik sınırı 180 saniye; başlangıç/analiz 60 saniye; dönüştürme aşaması varsayılan sınırı 10 dakikadır.
- Durdur ve liste temizleme, aktif analizleri ve indirmeleri iptal eder. Windows Job Object süreç ağacını birlikte kapatır; eski görev sonuçları yeni iş başlatamaz.
- Uygulama yeniden açıldığında yarım işler iptal edilmiş görünür; kullanıcı yeniden deneyebilir.
- Liste 100 satırlık sayfalarda gösterilir; renderer log tamponu 200 satırla sınırlıdır.

Geliştirmede veri `data/` altında tutulur. Portable paket veri ve indirmeleri exe'nin yanındaki `data/` / `downloads/` klasörlerinde tutar. Installer kullanıcı veri alanını kullanır. Bozuk JSON dosyaları `.corrupt-*` olarak korunur; son sağlam kayıt `.bak` dosyasından kurtarılabilir. Kurtarma uyarıları arayüzde gösterilir. Aynı veri kökü için ikinci uygulama örneği açılmaz.

## Binary sürümleri

`app/binaries.json`, yt-dlp **2026.10.21** ve ffmpeg **9.0.2** kaynak URL'lerini, SHA256 özetlerini ve lisans dosyalarını sabitler.

```powershell
npm run bootstrap:binaries
npm run check:binaries
```

Doğrulanmayan binary çalışan dosyanın üzerine yazılmaz. Güncellemek için manifest yeni yayıncı hash'leriyle düzenlenir ve gerçek runner testleri tekrarlanır. YouTube EJS çözümlemesi, Electron'un gömülü Node çalışma zamanını kullanır; ayrı Deno/Node kurulumu gerektirmez. Lisans ve kaynak bilgileri paket içindeki `resources/licenses` dizinindedir.

## Testler

```powershell
npm test
npm run test:runner
npm run test:all
npm run test:performance
npm run test:packages
# İsteğe bağlı gerçek servis kontrolü (CI dışında):
npm run test:youtube
npm audit --omit=dev
npm audit --audit-level=moderate
```

`npm test` store/mantık/motor/güvenlik/yayın testlerini, gizli Electron smoke kontrolünü, ikinci örnek kilidini ve 300/1.000/5.000 iş ölçümlerini çalıştırır. `test:runner` gerçek yt-dlp/ffmpeg ile yerel HTTP üzerinden indirme, dönüştürme, ilerleme, timeout ve analiz iptalini doğrular. `test:all` her iki grubu birleştirir. Gerçek YouTube erişimi bu deterministik testlerin parçası değildir.

Native süreç testi, iptal ve normal bitişte ayrı başlatılmış alt süreçlerin de kapandığını ve Unicode/tırnaklı argümanların korunduğunu doğrular. Testler geçici veri/profil klasörleri kullanır. Smoke testi gerçek repo verilerinin hash'lerini karşılaştırır. Performans raporu `verification/performance.json` dosyasına yazılır. `test:packages`, unpacked ve portable paketlerde eski job/ayar/arşiv biçimleriyle ilk açılışı ve yeniden açılışı da sınar; sonucu `verification/package-migration.json` dosyasına yazar. Bu fixture testi, gerçek kurulu 1.1.0 üzerinden installer yükseltmesi yerine geçmez.

`test:installer`, önceki geçici GitHub-hosted Windows denemelerinin test aracıdır; workflow kaldırıldığı için artık otomatik çalışmaz. Güvenlik koruması kullanıcı bilgisayarında gerçek kurulum/kaldırmayı reddetmeye devam eder. Gerçek installer/güncelleme testlerinin kalan kısmı ayrı, geçici bir Windows test ortamı hazırlanmasını bekler; kapsam ve önceki kanıtlar iyileştirme planındadır.

## Yerel paket hazırlama

```powershell
npm run build:portable
npm run build:installer
npm run build:release
```

Çıktı: `release/<version>/`. Yayına hazırlanacak portable ve installer **aynı build:release çalışmasında** üretilmelidir. Script binary hash/sürüm doğrulaması yapar, ikonu üretir ve GitHub'a yükleme yapmadan paketler.

`build-info.json` test edilen kaynak fingerprint'ini, başlangıç commit'ini, çalışma alanının değişiklik durumunu, araç/binary sürümlerini ve paket hash'lerini kaydeder. Kaynak değişirse yayın önkontrolü yeniden build ister.

## Sürüm hazırlama ve açık yayınlama

```powershell
# Sürüm artırma + testler + yerel build + dry-run; public yayın yapmaz:
npm run release:prepare -- --version 1.2.0

# Mevcut yerel paketlerin doğrulanması; token gerekmez, GitHub değiştirilmez:
npm run release:check

# Kaynak commit edilmiş, uzak repoya gönderilmiş ve yeniden build edilmişse, açıkça yayınlamak için:
# GH_TOKEN veya GITHUB_TOKEN bu işlemden önce ortamda tanımlanır.
npm run release:prod
```

Yayın scripti önce bütün yerel dosyaları ve `latest.yml` hash/sürüm tutarlılığını doğrular. Değişiklik içeren çalışma alanından public yayınlamayı reddeder. Release, test edilen commit'i hedefleyen taslak olarak açılır; yüklemeler doğrulandıktan sonra public yapılır. Public aynı sürümün dosyaları silinmez; çakışmada yeni sürüm gerekir. Kesilen yükleme taslak olarak kalır ve aynı dosyalarla devam ettirilebilir.

Installer public GitHub Releases üzerinden güncelleme kontrol eder; portable manuel güncellenir. Canlı yayın, temiz Windows kurulumu ve installer güncelleme testlerinin güncel durumu iyileştirme planında kayıtlıdır. İmzalama sertifikası yoksa oluşturulan paketler imzasızdır; bu durum doğrulama kaydında belirtilir.
