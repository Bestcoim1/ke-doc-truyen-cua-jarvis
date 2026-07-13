# Kệ Đọc — web

Walking skeleton của Kệ Đọc, xây bằng Next.js App Router, TypeScript và
Supabase SSR.

## Chạy giao diện local

```powershell
npm ci
npm run dev
```

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

## Deploy production (Vercel)

Chuẩn bị cho Slice 5 (pilot thật) — cần một domain thật để dùng trên điện
thoại, không chỉ `npm run dev` trên máy.

1. **Supabase project**: dùng project đã cấu hình trong `.env.local` (hoặc
   tạo project riêng cho production nếu muốn tách biệt dev/prod dữ liệu).
   Đảm bảo đã chạy hết migration (`supabase db push` hoặc SQL Editor).
2. **Import project vào Vercel** từ repo GitHub này. Vì app nằm trong
   `/web`, đặt **Root Directory = `web`** trong Vercel project settings —
   bước hay bị bỏ sót vì repo có `/src` (prototype cũ) ở gốc.
3. **Environment Variables** trên Vercel (Project Settings > Environment
   Variables), áp cho Production (và Preview nếu muốn):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   **Không** đặt `SUPABASE_SERVICE_ROLE_KEY` trên Vercel — key này chỉ dùng
   cho `scripts/seed-fixtures.mts` chạy cục bộ, ứng dụng deploy không cần và
   không nên có quyền service-role.
4. **Supabase Auth > URL Configuration**: thêm redirect URL production —
   `https://<domain-that-vercel-gives-you>/auth/confirm` (route xác nhận
   email/PKCE thật sự dùng, không phải `/auth/callback`). Thiếu bước này thì
   link xác nhận email sẽ đưa người dùng về `localhost`.
5. **Deploy.** Next.js build tự chạy `next build`; các security header
   (CSP/HSTS, `next.config.ts` + `proxy.ts`) và `viewport-fit=cover`
   (`app/layout.tsx`) đã có sẵn trong code, không cần cấu hình thêm trên
   Vercel.
6. **Xác minh sau deploy** — đối chiếu với DoD ở §18 spec:
   - Đăng nhập được, Library trống/riêng tư đúng tài khoản.
   - Import một bản thảo thật (paste hoặc DOCX) → review → mở Reader trong
     dưới 2 phút.
   - Mở trên điện thoại thật: thấy hierarchy, mở TOC, an toàn vùng viền nếu
     máy có notch.
   - Đổi font/line-height/theme, đóng mở lại app → về đúng đoạn.
   - (Tuỳ chọn) Trỏ smoke E2E vào domain thật để xác nhận nhanh:
     `PLAYWRIGHT_BASE_URL=https://<domain> npm run test:e2e:smoke`.
