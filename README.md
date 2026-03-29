# Elektron YT

Windows odakli, portable ve installer hedefli bir Electron YouTube / MP3 toplu indirme uygulamasi.

## Gelistirme

```powershell
npm install
npm run bootstrap:binaries
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
```

Notlar:
- Gercek indirme icin `app/bin/yt-dlp.exe` ve `app/bin/ffmpeg.exe` gerekir.
- `npm run bootstrap:binaries` bu dosyalari indirip yerlestirir.
- Video indirmeler `downloads/video`, MP3 indirmeler `downloads/audio` altina yazilir.
- Portable build manuel update kullanir. Installer build GitHub Releases uzerinden auto update kontrolu yapar.

## Release Flow

```text
1. package.json version artir
2. npm run build:release
3. GitHub Releases sayfasina artifact yukle
4. installer build sonraki acilista update kontrol eder
```
