# SoundKloud

SoundKloud là một ứng dụng macOS native (Apple Silicon) bọc **trình phát web chính thức của SoundCloud** trong một cửa sổ Tauri. Không tải nhạc, không can thiệp DRM — mọi thứ chạy qua đúng trang SoundCloud như trên Safari, nhưng có thêm mini player, phím media, menu bar và hệ thống plugin nhỏ.

- **Nền tảng:** Tauri 2 + React 18 + TypeScript + Vite + TailwindCSS (Rust ở backend).
- **Không dùng Electron**, không thư viện tải nhạc, không lưu mật khẩu.
- **Đăng nhập** diễn ra trong WebView của SoundCloud; cookie do WebKit tự quản lý.
- **Cấu hình** lưu tại `~/Library/Application Support/com.gamvoc.soundkloud/config.json`.

---

## 1. Yêu cầu môi trường

| Thành phần | Phiên bản gợi ý | Kiểm tra |
| --- | --- | --- |
| macOS | 11 trở lên (đã test 15.x) | `sw_vers` |
| Xcode Command Line Tools | mới nhất | `xcode-select -p` |
| Node.js | 20 hoặc 22 | `node -v` |
| pnpm | 9/10 (bật qua corepack) | `pnpm -v` |
| Rust | stable ≥ 1.77 | `rustc -V` |
| Target Rust | `aarch64-apple-darwin` | `rustup target list --installed` |

Cài nhanh nếu còn thiếu:

```bash
xcode-select --install
corepack enable
corepack prepare pnpm@latest --activate
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-darwin
```

## 2. Cài đặt và chạy thử

```bash
cd soundkloud
pnpm install
pnpm icons        # chỉ cần lần đầu (hoặc khi đổi icon)
pnpm tauri dev
```

`pnpm tauri dev` tự chạy Vite ở `http://localhost:1420` rồi mở app. Lần đầu biên dịch Rust có thể mất vài phút; các lần sau nhanh hơn.

Build bản phát hành:

```bash
pnpm tauri build --target aarch64-apple-darwin
```

Kết quả:

```
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/SoundKloud.app
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/SoundKloud_0.1.0_aarch64.dmg
```

Nếu chỉ muốn kiểm tra code:

```bash
pnpm build                      # tsc + vite build
cd src-tauri && cargo check     # Rust
```

## 3. Quyền macOS cần cấp

SoundKloud cố tình xin **rất ít quyền**:

| Quyền | Khi nào | Ghi chú |
| --- | --- | --- |
| **Network (outgoing)** | Luôn cần | macOS không hỏi; chỉ cần internet để tải SoundCloud. Nếu bật firewall chặn app, thêm SoundKloud vào danh sách cho phép. |
| **Keychain / cookie WebKit** | Lần đầu đăng nhập | WebView lưu cookie trong container của app; không có mật khẩu nào do SoundKloud đọc. |
| **Apple Events / Accessibility / Screen Recording / Microphone** | Không cần | App không dùng. Nếu macOS từng hỏi, có thể từ chối an toàn. |
| **Thông báo** | Không cần | Không có notification. |

Phím media và “Now Playing” hoạt động sẵn qua `MPNowPlayingInfoCenter`; không cần bật Accessibility. Nếu phím media đang điều khiển app khác, bấm play trong SoundKloud một lần để macOS chuyển “now playing” sang SoundKloud.

## 4. Gatekeeper với app chưa ký

Bản build cá nhân không có Developer ID nên macOS có thể báo *“SoundKloud is damaged”* hoặc chặn mở. Cách xử lý:

**Cách 1 — mở bằng chuột phải**

1. Kéo `SoundKloud.app` vào `/Applications`.
2. Chuột phải → **Open** → **Open** trong hộp thoại.
3. Hoặc vào **System Settings → Privacy & Security**, bấm **Open Anyway**.

**Cách 2 — bỏ cờ quarantine (nhanh, dùng terminal)**

```bash
xattr -dr com.apple.quarantine /Applications/SoundKloud.app
open /Applications/SoundKloud.app
```

**Cách 3 — ký ad-hoc để macOS ổn định hơn**

```bash
codesign --force --deep --sign - /Applications/SoundKloud.app
```

Muốn chia sẻ cho máy khác không bị cảnh báo, cần Apple Developer ID và notarize:

```bash
codesign --force --deep --options runtime --sign "Developer ID Application: ..." /Applications/SoundKloud.app
xcrun notarytool submit ... --wait
xcrun stapler staple /Applications/SoundKloud.app
```

## 5. Cấu hình và dữ liệu

```
~/Library/Application Support/com.gamvoc.soundkloud/
├── config.json                  # accent, mini player, volume, plugin bật/tắt
└── plugins/
    ├── README.md                # hướng dẫn viết plugin (tự cài lần đầu)
    └── discord-rich-presence/
        ├── manifest.json
        └── index.js
```

- `config.json` được ghi nguyên tử (file tạm rồi rename), nên không sợ hỏng khi tắt đột ngột.
- Xoá cả thư mục trên = reset toàn bộ cài đặt và plugin đã cài. Cookie SoundCloud nằm trong container WebKit riêng, không bị ảnh hưởng bởi thao tác này (đăng xuất trong trang SoundCloud nếu cần).
- Không có token, client secret hay mật khẩu nào trong repo hoặc trong config.

## 6. Sử dụng

- **Cửa sổ chính** là trang SoundCloud thật; thanh trên cùng có back / forward / reload / home và transport nhanh.
- **Mini player** ở đáy: artwork, tên track, play/pause, prev/next, seek, volume. Tắt trong Settings nếu không cần.
- **Phím media** (Play/Pause, Next, Previous) và **Now Playing** của macOS điều khiển trực tiếp trình phát SoundCloud.
- **Đóng cửa sổ** → ẩn xuống menu bar (tuỳ chọn “Keep running in the menu bar”). Thoát hẳn bằng menu tray **Quit SoundKloud** hoặc ⌘Q.
- **Menu bar**: hiện/ẩn cửa sổ, play/pause, prev/next, Settings, Quit. Nhấp trái icon để ẩn/hiện nhanh.
- **Settings**: accent color, mini player, chế độ chạy nền, bật/tắt plugin, nhập cấu hình plugin, xem log gần đây, mở thư mục plugin.

### Phím tắt

| Phím | Tác dụng |
| --- | --- |
| ⌘Q | Thoát app |
| ⌘R | Reload trang (khi cửa sổ web đang focus) |
| ⌘C / ⌘V / ⌘A | Hoạt động trong ô nhập liệu (menu mặc định của macOS) |
| Media Play/Pause, Next, Previous | Điều khiển SoundCloud |

## 7. Thêm plugin mới

1. Mở **Settings → Plugins → Open folder**.
2. Tạo thư mục mới, ví dụ `plugins/hello/`.
3. Thêm `manifest.json`:

```json
{
  "id": "hello",
  "name": "Hello Track",
  "version": "1.0.0",
  "description": "Logs the current track.",
  "author": "Ban",
  "main": "index.js",
  "hooks": ["onTrackChange", "onPlay", "onPause"],
  "settings": [],
  "enabledByDefault": true
}
```

4. Thêm `index.js`:

```js
registerHooks({
  onTrackChange({ track }) {
    api.log("info", `Now playing: ${track.title} — ${track.artist}`);
  },
  onPlay({ track }) {
    api.log("info", `Play: ${track.title}`);
  },
  onPause() {
    api.log("info", "Paused");
  }
});
```

5. Trong Settings bấm **Reload** (hoặc đóng/mở Settings). Bật công tắc plugin.

Plugin chạy trong **Web Worker sandbox**: không DOM, không `fetch`, không đọc cookie/phiên đăng nhập, không điều khiển nhạc. Plugin lỗi chỉ làm chết worker của nó; app vẫn phát nhạc bình thường và lỗi hiện trong mục *Recent plugin activity*.

### API host

| API | Mô tả |
| --- | --- |
| `registerHooks({ onTrackChange, onPlay, onPause })` | Đăng ký hook. |
| `api.log(level, ...args)` | Ghi log (`info`, `warn`, `error`). |
| `api.config` | Object cấu hình plugin đã lưu (theo `settings` trong manifest). |
| `api.discord.setActivity(activity)` | Cập nhật “Listening” trên Discord (chỉ hiển thị). |
| `api.discord.clear()` | Xoá activity. |

Chi tiết đầy đủ (payload, giới hạn, ví dụ Discord) nằm trong [`plugins/README.md`](../plugins/README.md). Bản sao cũng được cài vào thư mục plugin khi chạy lần đầu.

### Plugin Discord mẫu

`discord-rich-presence` được cài sẵn nhưng **tắt mặc định**:

1. Tạo application tại <https://discord.com/developers/applications>, copy **Application ID** (dãy số).
2. Settings → Plugins → bật **Discord Rich Presence**, dán ID vào ô cấu hình.
3. Mở Discord desktop. Activity hiển thị tên track + artist, kèm nút *Listen on SoundCloud*.
4. Tắt plugin hoặc đóng Discord → activity tự xoá/không gửi lỗi.

Không cần bot token, không cần đăng nhập Discord trong app.

## 8. Kiến trúc ngắn gọn

```
soundkloud/
├── src/                      # React UI (top bar, mini player, settings, plugin host)
│   ├── components/
│   └── lib/ipc.ts            # cầu nối typed tới Rust
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs            # setup app, tray, window events
│   │   ├── layout.rs         # child WebView SoundCloud nằm giữa top bar & mini player
│   │   ├── player.rs         # poll bridge 750ms → PlayerState → event cho UI
│   │   ├── media.rs          # souvlaki: media keys + Now Playing
│   │   ├── discord.rs        # Discord IPC (Unix socket)
│   │   ├── plugins.rs        # đọc/ cài plugin từ đĩa
│   │   ├── config.rs         # config.json
│   │   ├── commands.rs       # IPC commands
│   │   └── injected/bridge.js# chạy trong trang SoundCloud: chỉ đọc Media Session + gọi handler
│   └── tauri.conf.json
├── plugins/                  # plugin mẫu (được nhúng vào binary)
├── scripts/generate-icons.mjs
└── docs/README.md
```

- UI React và trang SoundCloud là **hai webview tách biệt**. Trang SoundCloud **không có quyền IPC**; Rust chủ động `eval` script bridge và nhận snapshot qua callback. Vì vậy không cần cấp capability cho `soundcloud.com`.
- Bridge bắt `navigator.mediaSession.setActionHandler` mà SoundCloud tự đăng ký, nên play/pause/next/prev/seek dùng đúng logic của trang. Khi handler không có, bridge thử `<audio>` rồi mới mô phỏng click DOM.
- Rust poll snapshot mỗi 750 ms; UI nội suy vị trí giữa các lần cập nhật.

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
| --- | --- |
| Màn hình “SoundCloud didn’t load” | Kiểm tra mạng, bấm **Reload SoundCloud**. Nếu vẫn lỗi, mở soundcloud.com bằng Safari để xác nhận mạng. |
| Đăng nhập Google/Apple không mở | Popup OAuth mở thành cửa sổ WebKit thật, có thể nằm phía sau cửa sổ chính. Sau khi đăng nhập xong popup tự đóng. |
| Google đòi passkey / Touch ID | WKWebView của app bên thứ ba không có entitlement passkey của Apple. Chọn **Try another way** → nhập mật khẩu hoặc xác nhận trên điện thoại; hoặc đăng nhập SoundCloud bằng email + mật khẩu. |
| Không có phím media | Bấm play trong SoundKloud một lần. Đảm bảo không có app khác đang chiếm Now Playing; kiểm tra Control Center. |
| Discord không hiện activity | Discord desktop phải đang chạy; Application ID đúng 15+ chữ số; xem log trong Settings. |
| App bị chặn khi mở | Xem mục **Gatekeeper** ở trên. |
| Cấu hình hỏng | Xoá `config.json`, mở lại app (plugin đã cài vẫn giữ nguyên). |
| Build lỗi `esbuild` | `pnpm rebuild esbuild` (pnpm 10 chặn postinstall mặc định; repo đã khai báo `onlyBuiltDependencies`). |

## 10. Giới hạn có chủ đích

- Không tải nhạc, không tách luồng audio, không vượt DRM/ToS của SoundCloud.
- Không vượt chặn vùng: track báo “Not available in Vietnam” là giới hạn cấp phép phía server.
- Passkey/Touch ID không dùng được trong WebView (thiếu entitlement `com.apple.developer.web-browser.public-key-credential` của Apple).
- Không lưu mật khẩu; đăng nhập chỉ trong WebView.
- Không gửi dữ liệu người dùng ra ngoài, trừ khi người dùng bật plugin Discord (và Discord đang chạy cục bộ).
- Plugin không được truy cập mạng; mọi tích hợp mạng phải do host Rust cung cấp.
