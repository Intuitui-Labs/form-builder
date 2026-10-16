# Cross-Platform Optical QR & Peer-to-Peer Offline Transfer

This document specifies the technical architecture for distributing and importing survey instruments across Android and iOS devices using optical 2D matrix barcodes (QR codes) without reliance on vendor-proprietary protocols (such as Apple AirDrop).

---

## 1. Motivation & Universal Hardware Affordances

### Why Not Apple AirDrop or Google Quick Share?
- **Apple AirDrop**: Requires Apple hardware, Bluetooth LE + Apple Wireless Direct Link (AWDL). Fails completely when sharing between Android $\leftrightarrow$ iPhone, or PC $\leftrightarrow$ Android.
- **Google Quick Share**: Requires Google Play Services and complex Bluetooth pairing handshakes.

### The Solution: Optical 2D Barcode Data Transfer
Optical scanning utilizes **light photons** emitted by a display screen and received by a phone camera lens. It is:
1. **100% Platform-Agnostic**: Works across Android, iOS, Windows, macOS, Linux, and physical printed paper.
2. **Zero-Permission**: Requires no Bluetooth, no local network Wi-Fi pairing, and no device discovery handshakes.
3. **100% Offline-Capable**: The full questionnaire schema can travel through the air into local device SQLite with zero internet.

---

## 2. The Optical Protocol Envelope

### CRC32 Checked Schema Manifest (`FDR1`)
Small to medium survey instruments ($< 1.8\text{KB}$ compressed) are serialized into a single-frame QR manifest:
```
FDR1:<crc32_hex>:<base64_compressed_json>
```
1. `FDR1`: Protocol version identifier.
2. `<crc32_hex>`: 8-character CRC32 checksum verifying data integrity against optical noise, reflection, or bit-flip corruption.
3. `<base64_compressed_json>`: Deflated JSON payload containing fields, validation rules, constructs, and page layouts.

### Multi-Frame Animated QR Chunking (`FDR_CHUNK`)
For instruments exceeding $1.8\text{KB}$ (large questionnaires with multimedia):
```
FDR_CHUNK:<frame_index>/<total_frames>:<chunk_hash>:<payload_slice>
```
The mobile camera continuously scans the cycling QR animation, reassembles the chunks in order, and verifies total integrity before unpacking.

---

## 3. Client-Side On-Device Generation

QR code generation occurs **100% client-side** inside the Creator Studio (`studio.tsx`):
- Uses `QRCode.toDataURL(payload, options)` in pure TypeScript/JavaScript.
- Generates a Base64 PNG data URL in $< 5\text{ms}$.
- Renders via standard React Native `<Image source={{ uri }} />` (0 kB native SVG/C++ bloat).
- Emits zero outbound network requests, ensuring total research privacy.

---

## 4. Multi-Modal Consumer Pathways

| Channel | Trigger Mechanism | Network Requirement | Target Device Experience |
| :--- | :--- | :--- | :--- |
| **📱 Camera Scan Link** | Standard Android Camera / Google Lens / iOS Camera | Cellular or Local Wi-Fi | Camera pops up link chip $\rightarrow$ opens Chrome/Safari in $<1\text{s}$. No app installation required. |
| **📦 Full Offline Schema** | In-App Optical Scanner (`Feedora Mobile`) | **Zero Internet** (100% Offline) | Scans `FDR1:...` manifest $\rightarrow$ verifies CRC32 $\rightarrow$ unpacks schema into local SQLite. |
| **⌨️ 6-Char Access Code** | Manual Input Box | Internet or Local LAN | Types code (e.g. `HMSAM1`) $\rightarrow$ calls `/api/v1/surveys/code/<code/meta/` $\rightarrow$ launches survey. |

---

## 5. Automated Test Verification

Verified by hostile test suite [`test/qr/hostile-qr-airdrop.test.ts`](file:///c:/projects/packages/form-builder-engine/test/qr/hostile-qr-airdrop.test.ts):
- Evaluates CRC32 checksum envelopes and rejects bit-flipped payloads.
- Validates chunk reassembly order and drops duplicate frames.
- Asserts round-trip decompression fidelity.
