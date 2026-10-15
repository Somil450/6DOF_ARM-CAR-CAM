# WAREBOT — PWA Installation & Mobile Deployment Guide

## 1. Overview
WAREBOT is engineered as an installable Progressive Web App (PWA). It provides a native-like full-screen experience on Android, iOS, Windows, and macOS, with an offline shell, cached UI assets, and automatic reconnection logic.

---

## 2. Android Installation (Chrome / Edge / Firefox)

### Requirement: Network & Origin
- By web standards, Service Workers and PWA installation require a **Secure Origin**:
  - `http://localhost:<port>` (local on PC)
  - `https://<LAN_IP>:<port>` (via self-signed or local TLS cert)
  - OR enabling the Chrome flag for testing:
    `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with your gateway address (e.g., `http://192.168.1.100:8000`).

### Installation Steps on Android:
1. Connect your Android device to the same Wi-Fi network as your PC and ESP32s.
2. Open Google Chrome on Android.
3. Navigate to `http://<YOUR_PC_IP>:8000` (or `https://...` if TLS configured).
4. Chrome will detect the manifest and display the **"Install WAREBOT"** prompt or tap the Chrome three-dot menu `⋮` and select **"Add to Home screen"** / **"Install app"**.
5. The WAREBOT icon appears on your home screen and launcher.
6. When launched, WAREBOT runs in standalone mode (no URL bar, pure black status bar).

---

## 3. Desktop Installation (Windows / macOS / Linux)
1. Open Google Chrome, Microsoft Edge, or Brave.
2. Navigate to `http://localhost:8000` (or the dev URL `http://localhost:5173`).
3. Click the **Install** icon in the browser address bar (top right) or open the settings menu and click **Install WAREBOT**.
4. WAREBOT launches in its own dedicated, chromeless window.

---

## 4. Offline Shell & Cache Strategy
- **Service Worker**: Caches all critical HTML, JS, CSS, and SVG assets.
- If network connection drops:
  - The UI shell remains accessible and responsive.
  - A high-visibility top banner warns: **"OFFLINE — CONTROLS DISABLED"**.
  - All hardware dispatch buttons are safety-latched to prevent stale command queuing.
  - Once connection is restored, the WebSocket and health checks automatically reconnect.
