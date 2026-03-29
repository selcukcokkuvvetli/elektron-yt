# Elektron YT

Windows odakli, portable ve installer hedefli bir Electron YouTube / MP3 toplu indirme uygulamasi.
Tek video URL, birden fazla URL ve playlist URL destekler.

## Ozellikler

- Video ve MP3 format secimi
- Tek video, coklu link ve playlist URL destegi
- Playlist URL'leri analiz edip item bazli job uretme
- `url + format` bazli archive ve skip mantigi
- Item bazli retry, timeout ve canli ilerleme takibi
- Portable `.exe` ve NSIS installer build
- Installer build icin GitHub Releases tabanli auto update

## Gelistirme

```powershell
npm install
npm run bootstrap:binaries
npm run build:assets
npm start
```

## Test

```powershell
npm run test:stores
npm run test:logic
npm run test:smoke
```

## Build

```powershell
npm run build:portable
npm run build:installer
npm run build:release
npm run release:prod
```

Notlar:
- Gercek indirme icin `app/bin/yt-dlp.exe` ve `app/bin/ffmpeg.exe` gerekir.
- `npm run bootstrap:binaries` bu dosyalari indirip yerlestirir.
- `npm run build:assets` uygulama ikonunu `build/icon.ico` ve `build/icon.png` olarak uretir.
- Video indirmeler `downloads/video`, MP3 indirmeler `downloads/audio` altina yazilir.
- Playlist URL girildiginde uygulama once playlist'i analiz eder, sonra item'lari ayri job olarak kuyruğa ekler.
- Portable build manuel update kullanir. Installer build GitHub Releases uzerinden auto update kontrolu yapar.

## Release Flow

```text
1. GH_TOKEN/GITHUB_TOKEN tanimla veya git remote credential'inin hazir oldugundan emin ol
2. npm run release:prod -- --version x.y.z
3. script version gunceller, icon uretir, build alir ve GitHub Releases'a publish eder
4. installer build sonraki acilista update kontrol eder
```
