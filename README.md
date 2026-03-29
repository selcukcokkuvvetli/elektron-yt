# Elektron YT

Windows odakli, portable ve installer hedefli bir Electron YouTube / MP3 toplu indirme uygulamasi.

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
- Portable build manuel update kullanir. Installer build GitHub Releases uzerinden auto update kontrolu yapar.

## Release Flow

```text
1. GH_TOKEN/GITHUB_TOKEN tanimla veya git remote credential'inin hazir oldugundan emin ol
2. npm run release:prod -- --version 1.1.0
3. script version gunceller, icon uretir, build alir ve GitHub Releases'a publish eder
4. installer build sonraki acilista update kontrol eder
```
