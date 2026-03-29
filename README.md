# Elektron YT

Windows odakli, portable hedefli bir Electron YouTube toplu indirme uygulamasi.

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

## Portable Build

```powershell
npm run build:portable
```

Notlar:
- Gercek indirme icin `app/bin/yt-dlp.exe` ve `app/bin/ffmpeg.exe` gerekir.
- `npm run bootstrap:binaries` bu dosyalari indirip yerlestirir.
