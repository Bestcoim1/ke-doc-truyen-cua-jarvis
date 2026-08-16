# Kệ Đọc

Repo này chứa hai phần riêng biệt:

- /src: bản prototype React cũ, dùng để tham khảo và so sánh ý tưởng.
- /web: app chính hiện tại, xây bằng Next.js, TypeScript và Supabase.

## Hướng phát triển chính

Hãy ưu tiên làm việc trong /web. /src nên được xem như tài liệu tham khảo prototype, không phải nguồn phát triển production.

## Export project an toàn

Sử dụng script sau để tạo bản export sạch, không chứa secret hoặc artifact cục bộ:

```powershell
pwsh -File .\scripts\export-safe.ps1 -DestinationPath .\dist\kedoctruyen-export.zip
```

Script chỉ đóng gói các file đã được Git theo dõi, bao gồm sửa đổi hiện tại của
các tracked file. File untracked không được đưa vào archive. Script cũng từ chối
export nếu Git đang theo dõi đường dẫn nhạy cảm và xác minh lại nội dung ZIP
trước khi ghi đè file đích.

Các đường dẫn nhạy cảm bị chặn gồm:

- `.env`, `.env.*` (ngoại trừ `.env.example`)
- `.vercel` ở mọi cấp
- `mcp.json`, `.mcp.json`
- private key/certificate container như `.key`, `.pem`, `.p12`, `.pfx`, `.jks`
- nội dung trong `fixtures/private` ngoài file metadata `README.md`

Chạy regression test cho exporter:

```powershell
pwsh -NoProfile -File .\scripts\test-export-safe.ps1
```

Không đưa nội dung trong fixtures/private vào public assets, log, snapshot hoặc test output.

## Đồng bộ Supabase

Local Supabase dùng PostgreSQL 17 và Supabase CLI `2.113.0`, khớp với môi
trường hosted hiện tại. Trước khi đẩy migration, chạy dry-run từ thư mục
`web/`:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = "true"
npx --yes supabase@2.113.0 db push --linked --dry-run
```

Workflow `Database migration drift` sẽ so sánh migration local/remote khi
repository có các cấu hình sau:

- secret `SUPABASE_ACCESS_TOKEN`
- secret `SUPABASE_DB_PASSWORD`
- variable `SUPABASE_PROJECT_REF`
- variable `SUPABASE_DRIFT_CHECK_ENABLED=true`

Không bật biến cuối cùng trước khi ba giá trị còn lại đã được cấu hình. Có thể
chạy cùng kiểm tra từ máy đã link project bằng `npm run db:check-drift` trong
`web/`.

Mật khẩu mới phải có ít nhất 12 ký tự ở cả UI, server action và local Auth.
Tính năng chặn mật khẩu đã rò rỉ của Supabase chỉ có trên gói Pro trở lên nên
không thể bật cho project Free hiện tại.

## Phòng Sáng Tác (Continuity P0 + P1)

`/studio` là giao diện sáng tác riêng, không chen vào luồng đọc chính. Mỗi tác
phẩm có Story Bible, danh sách tuyến truyện và bản “Nhắc trước khi viết” được
tạo theo POV, địa điểm, nhân vật và mốc thời gian của cảnh sắp viết.

- Fact và tuyến truyện phải có bằng chứng là chương nguồn hoặc nhãn tài liệu
  ngoài; dữ liệu suy luận/đề xuất không tự động trở thành canon.
- Bản nhắc chỉ đưa vào các fact có trạng thái `canon`, `inference` hoặc
  `disputed`; các candidate, retcon và bản ghi ngừng hiệu lực được giữ lại để
  bảo toàn provenance nhưng không dùng làm sự thật hiện hành.
- Sau mỗi import/reimport, P1 quét các revision vừa được tạo bằng bộ quy tắc
  tiếng Việt xác định để đề xuất thay đổi trạng thái, vị trí, sở hữu, timeline
  và character knowledge. Đây luôn là **ứng viên**, không phải canon.
- Continuity Inbox phát hiện năm nhóm rủi ro cần tác giả duyệt: trạng thái xung
  đột, di chuyển cần kiểm tra, biết thông tin quá sớm, vật phẩm xuất hiện trùng
  và plot thread có nguy cơ bị quên. Mỗi mục giữ chapter ID, revision ID,
  anchor, line và excerpt của nguồn.
- Quyết định chấp nhận được ghi atomically vào fact/timeline/knowledge; retcon
  giữ fact cũ với trạng thái `retconned`. Ứng dụng không tự sửa văn xuôi hoặc
  âm thầm giải quyết mâu thuẫn cho tác giả.

Schema nằm tại hai migration theo thứ tự:

1. `web/supabase/migrations/20260814042632_continuity_studio_p0.sql`
2. `web/supabase/migrations/20260814045217_continuity_studio_p1_automation.sql`

Sau khi xem dry-run và triển khai cả hai migration, mở `/library` rồi chọn
**Phòng Sáng Tác** hoặc **Sáng tác** trên từng tác phẩm. Nếu database mới chỉ có
P0, giao diện P0 vẫn dùng được và sẽ hiện lời nhắc áp dụng migration P1.

## Checklist secret và key

Nếu phát hiện secret/key trong working tree hoặc archive:

1. Rotate key/secret ngay lập tức.
2. Xoá bản sao cũ khỏi working tree, backup và archive.
3. Cập nhật .env.local hoặc secret store mới.
4. Không in giá trị secret ra console, log hoặc output.

## Tài liệu tham khảo

- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)
