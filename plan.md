# Email Campaign Starter — implementation plan

## Mục tiêu
MVP nội bộ cho một admin: đăng nhập Google, tạo campaign, upload CSV người nhận, soạn HTML/text, lưu dữ liệu trong Turso và gửi email test qua Resend.

## Thiết kế
- **Design movement:** editorial operations console — nền sáng, navy/teal, tập trung vào trạng thái và thao tác.
- **Core principles:** rõ ràng, ít bước, feedback tức thời, an toàn mặc định.
- **Color philosophy:** navy tạo tin cậy; teal là màu hành động; amber chỉ dùng cho cảnh báo.
- **Layout paradigm:** sidebar điều hướng + canvas nội dung rộng, không dùng card grid dày đặc.
- **Signature elements:** nhãn trạng thái dạng pill, thanh tiêu đề có eyebrow, vùng editor monospace nhẹ.
- **Interaction:** mọi thao tác nguy hiểm có xác nhận; upload hiển thị số dòng hợp lệ/lỗi; gửi test có feedback.
- **Animation:** transition ngắn 150ms, không dùng animation trang trí.
- **Typography:** system sans cho UI, monospace cho CSV/HTML preview.
- **Brand essence:** công cụ gửi email gọn cho hobbyist/developer; chính xác, thực dụng, riêng tư.

## Kiến trúc
Next.js App Router + Auth.js Google + Drizzle/libSQL + Resend. Server actions/API routes luôn kiểm tra email admin. CSV được parse ở server và lưu recipient rows vào Turso; bản MVP chưa có queue hàng loạt.

## Cấu trúc
- `app/`: routes, UI, API endpoints.
- `lib/`: auth, database, email provider, admin guard.
- `db/schema.ts`: schema Drizzle.
- `drizzle/`: SQL migration mẫu.

## Giới hạn MVP
- Chỉ một admin exact email `balv.airdrop@gmail.com`.
- Nút gửi campaign hàng loạt chưa bật; chỉ có gửi email test để tránh gửi nhầm và cần bổ sung queue/rate-limit trước production.
