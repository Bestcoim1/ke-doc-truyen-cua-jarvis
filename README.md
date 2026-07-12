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

Script sẽ tự loại bỏ:

- web/node_modules
- web/.next
- web/out
- web/coverage
- web/.env.local
- web/.env.*.local
- fixtures/private
- các file log/temp và thư mục .git

Không đưa nội dung trong fixtures/private vào public assets, log, snapshot hoặc test output.

## Checklist secret và key

Nếu phát hiện secret/key trong working tree hoặc archive:

1. Rotate key/secret ngay lập tức.
2. Xoá bản sao cũ khỏi working tree, backup và archive.
3. Cập nhật .env.local hoặc secret store mới.
4. Không in giá trị secret ra console, log hoặc output.

## Tài liệu tham khảo

- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)
