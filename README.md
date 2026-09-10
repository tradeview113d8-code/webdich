# WebDich 0.1

Prototype web tối giản: **Voice → Realtime Text**

Mục tiêu duy nhất: Kiểm tra khả năng nhận giọng nói realtime trên trình duyệt bằng Web Speech API.

## Tính năng

- 🎤 Nhận diện giọng nói realtime
- 📝 Hiển thị **LIVE** (interim) và **FINAL** (confirmed) riêng biệt
- 🌐 Hỗ trợ ngôn ngữ: `en-US`, `en-GB`, `vi-VN`
- 📊 Bộ đo realtime: Status, Final words, Live words, Session timer
- ⏯️ Điều khiển: START / STOP / CLEAR
- 📱 Responsive, PWA-ready

## Không có trong phiên bản 0.1

- ❌ Translation
- ❌ TTS
- ❌ Backend / WebSocket server
- ❌ Login / Database
- ❌ LLM / API key
- ❌ Framework / npm / build system

## Cấu trúc file

```
webdich-0.1/
├── index.html      # Giao diện chính
├── style.css       # Stylesheet
├── app.js          # Logic nhận diện giọng nói
├── manifest.json   # PWA manifest
└── README.md       # Tài liệu này
```

## Cách chạy

Mở trực tiếp `index.html` bằng trình duyệt hoặc deploy lên bất kỳ static hosting nào.

**Yêu cầu trình duyệt:** Hỗ trợ Web Speech API (SpeechRecognition).
Khuyến nghị: Chrome, Edge, Safari.

**Lưu ý:** Một số trình duyệt yêu cầu `https://` hoặc `localhost` để truy cập microphone.

## Quy tắc SPEC 0.1

| Quy tắc | Nội dung |
|---------|----------|
| RULE-01 | Không backend |
| RULE-02 | Không API key |
| RULE-03 | Không LLM |
| RULE-04 | Không translation |
| RULE-05 | Không TTS |
| RULE-06 | Không database |
| RULE-07 | Không framework |
| RULE-08 | Chỉ kiểm tra Voice → Realtime Text |
| RULE-09 | LIVE có thể thay đổi |
| RULE-10 | FINAL không được sửa lại |
| RULE-11 | Không tự động hoàn thành câu |
| RULE-12 | Không đoán phần người dùng chưa nói |
| RULE-13 | Không gửi dữ liệu tới server riêng của project |
| RULE-14 | Mục tiêu là benchmark, không phải sản phẩm hoàn chỉnh |

## Tiêu chí PASS

- [x] Xin được microphone
- [x] Nhận speech
- [x] Có partial/interim text
- [x] Có final text
- [x] Có thể nói liên tục
- [x] Không cần backend của project
- [x] Có thể CLEAR
- [x] Có thể STOP

## Hướng phát triển 0.2

WebDich 0.2 sẽ thay lớp SpeechRecognition bằng local streaming ASR chạy trong browser (WASM / WebGPU) để đạt được offline ASR thực sự.
