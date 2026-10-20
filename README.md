# Sendroom — Email Campaign Starter

Starter Next.js cho workflow **Google Login admin → upload CSV → soạn email → lưu Turso → gửi email test qua Resend**.

## 1. Cài đặt

```bash
pnpm install
cp .env.example .env.local
```

Điền `.env.local`. Tạo `AUTH_SECRET` bằng:

```bash
openssl rand -base64 32
```

`AUTH_SECRET` là bắt buộc khi chạy production; không commit giá trị này vào GitHub. Trên Vercel, thêm các biến `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` và `AUTH_TRUST_HOST=true` trong **Settings → Environment Variables**, sau đó tạo deployment mới. Nếu thiếu `AUTH_SECRET`, Auth.js sẽ báo lỗi `MissingSecret` và trang có thể hiển thị lỗi server-side.

## 2. Google OAuth

Trong Google Cloud Console, tạo OAuth Client loại Web application:

- Local origin: `http://localhost:3000`
- Local callback: `http://localhost:3000/api/auth/callback/google`
- Production callback: `https://YOUR_DOMAIN/api/auth/callback/google`

Các tài khoản admin được phép đăng nhập gồm `balv.airdrop@gmail.com` và `richworld369.com@gmail.com`. Có thể cấu hình thêm tài khoản trong `ADMIN_EMAILS`, phân tách bằng dấu phẩy hoặc khoảng trắng. Biến `ADMIN_EMAIL` cũ vẫn được hỗ trợ để không làm gián đoạn deployment hiện tại.

## 3. Turso

Tạo database và chạy migration:

```bash
turso db shell YOUR_DB < drizzle/0000_init.sql
```

Hoặc paste SQL trong `drizzle/0000_init.sql` vào Turso SQL Console.

## 4. Resend

Tạo API key, đặt `RESEND_API_KEY`. Với production, xác minh `sender.kryex.xyz` trong tài khoản provider và đặt `EMAIL_FROM` thành một địa chỉ trên domain đó, ví dụ `Sendroom <campaigns@sender.kryex.xyz>`. Không dùng địa chỉ thuộc `kryex.xyz` nếu chỉ xác minh `sender.kryex.xyz`; provider yêu cầu sender thuộc domain đã xác minh.

Với AgentMail, xác minh domain, tạo inbox có địa chỉ trên `sender.kryex.xyz`, rồi đặt `AGENTMAIL_INBOX_ID` bằng inbox ID đó. Ứng dụng sẽ kiểm tra domain inbox khớp với `EMAIL_FROM` trước khi gửi; nếu không đặt ID, ứng dụng chỉ tự chọn một inbox trên đúng domain, không còn lấy inbox đầu tiên bất kỳ. AgentMail yêu cầu gói Developer trở lên để dùng custom domain.

Để gửi danh sách email CSV từ `/admin/email`, đặt `EMAIL_LIST_EXPORT_TO` thành email nhận trong Vercel **Settings → Environment Variables**. Tính năng gửi bằng `RESEND_API_KEY` và địa chỉ `EMAIL_LIST_EXPORT_FROM` (nếu bỏ trống sẽ dùng `EMAIL_FROM`), kèm file CSV đính kèm. Domain của địa chỉ From phải được xác minh trong chính tài khoản Resend; sau khi thêm/sửa biến, tạo deployment mới.

## 5. Chạy

```bash
pnpm dev
```

Mở `http://localhost:3000`.

## 6. Deploy Vercel

Import GitHub repo vào Vercel và thêm toàn bộ biến trong `.env.example` vào **Settings → Environment Variables** cho Production/Preview. Sau khi đổi biến, tạo deployment mới.

## Lưu ý an toàn

MVP này **chỉ gửi email test**, chưa có queue/rate-limit/unsubscribe/suppression list. Không bật gửi hàng loạt trước khi bổ sung các lớp này. CSV giới hạn 5MB và 10.000 recipient.
