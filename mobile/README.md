# Todo Mobile App

Native iOS/Android wrapper for [todo.o9p.net](https://todo.o9p.net) built with Expo + React Native.

## Prerequisites

- Node.js 18+
- npm
- For iOS: macOS with Xcode 15+, CocoaPods
- For Android: Android Studio, JDK 17+
- EAS CLI: `npm install -g eas-cli`

## Quick Start (Development)

```bash
cd mobile
npm install
npm start
```

Scan the QR code with Expo Go (iOS/Android) to test.

## Local Native Builds

### iOS
```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm run ios
```

### Android
```bash
npm run android
```

## EAS Build (Production)

### First-time setup
```bash
eas login
eas build:configure
```

This will create your EAS project and give you a project ID. Update `app.json` with the project ID:
```json
"extra": {
  "eas": {
    "projectId": "YOUR_EAS_PROJECT_ID"
  }
}
```

### Build for stores

**iOS (App Store)**
```bash
eas build --platform ios --profile production
```

**Android (Play Store)**
```bash
eas build --platform android --profile production
```

### Submit to stores
```bash
eas submit --platform ios
eas submit --platform android
```

## Deep Linking Setup

For Universal Links (iOS) and App Links (Android) to work:

### 1. Update Apple Team ID

Edit `www/.well-known/apple-app-site-association`:
- Replace `TEAMID` with your actual Apple Developer Team ID

### 2. Update Android SHA256 Fingerprint

After your first EAS build, get your signing certificate fingerprint:
```bash
eas credentials --platform android
```

Edit `www/.well-known/assetlinks.json`:
- Replace `RELEASE_SHA256_FINGERPRINT` with your actual SHA256 fingerprint

### 3. Deploy the .well-known files

Make sure these files are accessible at:
- `https://todo.o9p.net/.well-known/apple-app-site-association`
- `https://todo.o9p.net/.well-known/assetlinks.json`

## App Store Checklist

- [ ] Replace placeholder icons in `assets/` with real app icons
- [ ] Update `app.json` version and buildNumber/versionCode for each release
- [ ] Set your EAS project ID in `app.json`
- [ ] Set your Apple Team ID in `apple-app-site-association`
- [ ] Set your Android SHA256 fingerprint in `assetlinks.json`
- [ ] Prepare App Store screenshots (iPhone + iPad)
- [ ] Prepare Play Store screenshots
- [ ] Write app description for both stores
- [ ] Add privacy policy URL
