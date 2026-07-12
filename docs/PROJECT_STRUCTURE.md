# Cấu trúc project Kệ Đọc

## /src

Thư mục /src là bản prototype React cũ của Kệ Đọc. Nó hữu ích để tham khảo UX, luồng nhập truyện và logic cũ trước khi triển khai trên app chính. Tuy nhiên, /src không phải là source of truth cho production.

## /web

Thư mục /web là app chính hiện tại. Đây là nơi phát triển chính với Next.js, TypeScript và Supabase. Mọi thay đổi sản phẩm, routing, data layer và UI chính nên diễn ra ở đây.

## Hướng phát triển chính

- Ưu tiên phát triển và deploy từ /web.
- Giữ /src như reference prototype, không dùng làm nền tảng cho production.
- Khi cần tham khảo logic cũ, nên đọc /src nhưng không sao chép ngẫu nhiên vào /web mà không có kiểm tra.
- Bảo vệ các file môi trường và artifact cục bộ khỏi repo/export.
