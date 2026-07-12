# Kệ Đọc — web

Walking skeleton của Kệ Đọc, xây bằng Next.js App Router, TypeScript và
Supabase SSR.

## Chạy giao diện local

```powershell
npm ci
npm run dev
```

`.env.local` đang bật `NEXT_PUBLIC_KEDOC_DEMO_MODE=true`, chỉ để kiểm thử UI
không cần tài khoản Supabase. Demo mode không được bật khi deploy.

## Kết nối Supabase

1. Tạo Supabase project.
2. Chạy migration trong `./supabase/migrations`.
3. App dùng email/password (không dùng Google/OAuth provider nào). Trong
   Supabase Auth > URL Configuration, thêm redirect URL:
   `http://localhost:3000/auth/confirm` (route xác nhận email và callback
   PKCE thật sự dùng trong code, không phải `/auth/callback`).
4. Copy `.env.example` thành `.env.local`, điền URL/publishable key.

Ứng dụng dùng cookie-based SSR qua `@supabase/ssr`. Bản thảo nằm trong private
Storage bucket và mọi bảng Slice 0 được bảo vệ bằng owner-scoped RLS.

## Quality gates

Yêu cầu Node.js `>=20.9.0`. Khi `node_modules` đã cũ hoặc thiếu optional native
dependency, hãy cài lại sạch từ lockfile (không dùng `--omit=optional`):

```bash
rm -rf node_modules .next
npm ci
```

PowerShell tương đương:

```powershell
Remove-Item node_modules, .next -Recurse -Force -ErrorAction SilentlyContinue
npm ci
```

Sau đó chạy đủ các gate:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` chỉ chạy unit test (`tests/**`, trừ `tests/integration/`) — không
cần Supabase. Không đưa file trong `../fixtures/private` vào public assets,
test snapshot, analytics hoặc log.

## Integration test (RLS/RPC)

`tests/integration/` xác minh RLS và các RPC (`upsert_reading_progress`,
`upsert_chapter_progress`, `commit_import_job`) bằng một Supabase project
thật — cục bộ hoặc remote. Suite này **fail cứng** (không skip) khi thiếu
biến môi trường, để một CI job cấu hình sai không thể tự pass.

```powershell
supabase start   # dùng supabase/config.toml, cần Supabase CLI cài sẵn
supabase db reset
```

Rồi đặt các biến sau (từ output của `supabase start`, hoặc project thật) và
chạy:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "..."
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "..."
$env:KEDOC_TEST_USER_A_EMAIL = "..."
$env:KEDOC_TEST_USER_A_PASSWORD = "..."
$env:KEDOC_TEST_USER_B_EMAIL = "..."
$env:KEDOC_TEST_USER_B_PASSWORD = "..."
npm run test:integration
```

Sau khi đổi migration, chạy `npm run types:generate` (cần `supabase start`
đang chạy) để cập nhật `database.types.ts` — file này gắn generic cho
Supabase client/server nên thay đổi schema/RPC không khớp code sẽ bị
`typecheck` bắt được, thay vì chỉ lộ ra lúc chạy thật.

## CI

`.github/workflows/ci.yml` chạy `lint` + `typecheck` + `test:unit` + `build`
trên mỗi push/PR vào `main`, dùng Node 22 (khớp toolchain dev thực tế; sàn
tối thiểu trong `package.json` vẫn là `>=20.9.0` vì Next.js không đòi hỏi
cao hơn). `test:integration` **chưa** nằm trong CI — cần một Supabase
instance thật trong pipeline, để lại như một việc riêng.
