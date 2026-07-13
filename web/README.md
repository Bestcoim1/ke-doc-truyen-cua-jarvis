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

## E2E test (Playwright)

`e2e/` lái app Next.js thật (SSR shell, middleware, routing) — lớp mà vitest
không chạm tới. Hai tầng, chia theo thứ cần:

- `e2e/*.smoke.spec.ts` — chỉ luồng **chưa đăng nhập** (login render, route
  được bảo vệ thì redirect). Không ghi DB, chạy được với Supabase thật trong
  `.env.local`:

  ```powershell
  npm run test:e2e:smoke
  ```

- `e2e/*.journey.spec.ts` — luồng **đã đăng nhập** (mở truyện → đọc →
  chuyển chương → reload resume). Cần một account đã seed sẵn truyện
  (`npm run seed:fixtures`) và tự `skip` nếu chưa đặt `KEDOC_E2E_AUTH=1`:

  ```powershell
  $env:KEDOC_E2E_AUTH = "1"
  $env:KEDOC_E2E_EMAIL = "..."
  $env:KEDOC_E2E_PASSWORD = "..."
  npm run test:e2e
  ```

Lần đầu cần cài browser: `npm run test:e2e:install`. Playwright tự khởi động
`next dev`; đặt `PLAYWRIGHT_BASE_URL` nếu muốn trỏ vào server đang chạy sẵn.

## CI

`.github/workflows/ci.yml` là **gate nhanh** — `lint` + `typecheck` +
`test:unit` + `build` trên mỗi push/PR, Node 22 (sàn tối thiểu trong
`package.json` vẫn `>=20.9.0`). Không đụng service ngoài nên không flake.

`.github/workflows/e2e.yml` là **tầng Supabase**: khởi động Postgres thật
bằng Supabase CLI, seed 3 account test + fixture, rồi chạy `test:integration`
(RLS/RPC) và `test:e2e` (smoke + journey). Tách riêng để một flake ở đây
không chặn gate nhanh. DB cục bộ dùng xong huỷ nên credential test trong
workflow không phải secret.
