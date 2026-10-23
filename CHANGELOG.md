# Değişiklik günlüğü

## 1.2.0 — Yerel doğrulama ve paket hazırlığı

- Koyu ve kompakt masaüstü arayüzü: sade indirme listesi, filtre/arama, Türkçe durumlar, parça ayrıntıları ve temizleme onayı eklendi.
- İlk kullanım biçimi MP3 olarak ayarlandı; son MP3/video tercihi doğrulanarak saklanıyor ve mevcut işlerin biçimi korunuyor.
- Playlist beklenirken tek video sonucuna sessiz geçiş engellendi; kullanıcı bağlantıdaki yalnız videoyu açıkça seçebiliyor.
- Aktif indirmelerin yanlış zaman aşımıyla kesilmesi düzeltildi; gerçek yüzde, hız ve ETA çıktısı etkinleştirildi.
- Playlist/video analizi asenkron hale getirildi; analiz süresi sınırı ve süreç ağacı iptali eklendi.
- Durdur, temizle ve kapanış sonrasında eski görevlerin yeni iş oluşturması veya durumu değiştirmesi engellendi. Windows Job Object ile başlatma/iptal sırasında alt süreç yarışı giderildi.
- Ortak playlist öğeleri ve tek video/playlist birleşimleri için `url + format` tekrar kontrolü düzeltildi.
- Analiz ve indirme hatalarının yeniden denenmesi ayrıldı; eski kayıtlar için uyumlu okuma korundu.
- JSON verilerine atomik yazma, son sağlam yedek, bozuk kaydı koruma ve kısmi kurtarma eklendi.
- Aynı veri alanını kullanan ikinci uygulama örneğinin eşzamanlı yazması engellendi.
- Electron 45.0.0, electron-builder 26.15.3 ve electron-updater 6.8.9'a geçildi.
- Geliştirme ortamı Node.js 24.22.1 / npm 11.19.1 olarak tanımlandı; son kullanıcıda ek Node kurulumu gerekmiyor.
- YouTube JavaScript çözümlemesi için uygulamanın gömülü Node çalışma zamanı kullanılıyor.
- yt-dlp 2026.10.21 ve ffmpeg 9.0.2 sürümleri hash doğrulamalı manifeste sabitlendi; üçüncü taraf lisansları pakete eklendi.
- CSP, IPC kaynak/yük kontrolleri, gezinme sınırları ve medya dosyası yolu doğrulaması eklendi; portable TEMP kısa yol adları gerçek dosya kimliğiyle doğrulanıyor.
- Portable başlatıcı her çalışmada ayrı geçici program klasörü kullanıyor; ikinci kopya çalışan programın dosyalarını silemiyor.
- İş listesine 100 satırlık sayfalar, değişen işlere ait IPC mesajları ve sınırlı log tamponu eklendi.
- Testler kullanıcı verilerinden ayrıldı; gerçek binary, Electron, veri kurtarma ve yayınlama regresyon kontrolleri eklendi.
- Build ve public yayınlama ayrıldı; paketler sürüme özel dizine yazılıyor, hash ve kaynak bilgileri kaydediliyor.
- GitHub yayınları önce taslakta hazırlanıyor; eksik yükleme mevcut public sürümün dosyalarını silmiyor.

Paketlerin test kapsamı, kalan manuel kontroller ve yayın durumu [iyileştirme planında](IYILESTIRME_PLANI.md) tutulur. Bu kayıt public yayın yapıldığını göstermez.

## 1.1.0

- Playlist URL'lerini öğe bazında kuyruğa ekleme desteği.
- Video/MP3 seçimi, portable ve NSIS paketleri, GitHub Releases güncelleme akışı.
