# Kệ Đọc Truyện (Jarvis) - Handoff Document

Tài liệu này cung cấp toàn bộ ngữ cảnh, tiến độ dự án, các thành tựu đã đạt được và định hướng tiếp theo để Agent ở phiên làm việc mới có thể tiếp quản ngay lập tức mà không cần hỏi lại User.

---

## 1. Tổng quan Dự án (Project Context)
- **Tên dự án:** Kẻ Đọc Truyện (Ke-Doc-Truyen-Cua-Jarvis)
- **Tech Stack:** Next.js 14/15 (App Router), Supabase (Auth, Postgres DB, Storage, RPCs), Tailwind CSS, TypeScript.
- **Mục tiêu:** Xây dựng một ứng dụng đọc truyện cá nhân với giao diện tuyệt đẹp, hỗ trợ import từ file text/docx, đồng bộ tiến trình đọc (Reading Progress) thông minh (dựa trên hash đoạn văn) và giao diện thư viện quản lý.
- **Tài khoản Test:** `ancutbangmui1@gmail.com` / `123456`.
- **Cấu hình:** Hai dự án Supabase đang được sử dụng, project chính hiện tại mang ID `ebygqxzazcgvvbwncsks`. MCP của Supabase đã được cấu hình và các agent skills (`supabase`, `supabase-postgres-best-practices`) đã được cài đặt.

---

## 2. Tiến trình và Thành tựu đã đạt được (Achievements)

Dự án đã hoàn thành kiến trúc cơ bản và các "Slices" cực kỳ phức tạp:
1. **Slice 0 & 1 (Core & Reader):** Đã xây dựng hoàn thiện Database Schema cho truyện (Stories), chương (Chapters), phiên bản nội dung (Revisions). Hệ thống đồng bộ tiến trình đọc sử dụng RPC `upsert_reading_progress` và RLS Policies khắt khe.
2. **Slice 2 (Import):** Đã hỗ trợ quy trình Import truyện, xử lý nội dung văn bản.
3. **Slice 6 (Media & Cập nhật UI - Gần nhất):**
   - Đã thêm cột `cover_image_url` vào bảng `stories` bằng file migration `web/supabase/migrations/0011_slice6_media_storage.sql`.
   - Đã tạo bucket `media` để lưu ảnh bìa và ảnh đại diện.
   - Xây dựng component `StoryCoverUpload` với tính năng **Optimistic UI** (hiển thị tạm ảnh ngay khi chọn), tự động revert nếu upload lỗi và đồng bộ với router cache của Next.js (thông qua `useEffect` lắng nghe `initialCoverUrl`).
   - Tích hợp ảnh bìa làm hình nền làm mờ (blurred background) trong trang Reader (`ReaderView`).
   - Đã xử lý bọc lỗi bằng `try-catch` kỹ lưỡng cho Server Actions (`uploadStoryCover`).

---

## 3. Các vấn đề đang tồn đọng (Current Blockers)

Mặc dù tính năng upload ảnh bìa đã hoàn thành về mặt code, chúng ta đang gặp 2 vấn đề lớn:

### 3.1. Ảnh bìa bị bốc hơi (Lỗi HTTP 400 - Tenant not found từ Supabase Storage)
- **Hiện tượng:** Người dùng có thể chọn ảnh, ảnh hiện ra vài giây (nhờ Optimistic UI), nhưng sau đó Server Action kết thúc và trả về lỗi, ảnh biến mất. Database thực chất đã lưu link `https://ebygqxzazcgvvbwncsks.supabase.co/storage/v1/object/public/media/...` nhưng khi gọi HTTP (cả trên web lẫn bằng lệnh `curl`), Supabase Storage trả về HTTP 400 kèm thông báo `{"statusCode":"400","error":"Error","message":"Tenant not found"}`.
- **Nguyên nhân:** Dù chúng ta đã chạy file SQL migration `0011_slice6_media_storage.sql` để chèn dòng vào `storage.buckets`, trên Supabase Cloud điều này đôi khi không đủ để kích hoạt (initialize) microservice Storage cho dự án mới, gây ra lỗi "Tenant not found".
- **Hành động cần làm:** Yêu cầu/hướng dẫn User vào Supabase Dashboard, tìm đến mục Storage. Xóa bucket `media` (nếu nó đang hiển thị ảo) và tự tay tạo lại bucket `media` bằng nút "Create a new bucket" trên giao diện (nhớ tích chọn Public). Thao tác tay này sẽ khắc phục triệt để lỗi Tenant not found.

### 3.2. Yêu cầu cải tiến UI Thẻ truyện "Tràn viền" (Full Bleed Cover)
- **Hiện tượng:** Thẻ truyện (`StoryCard` trong `web/app/(kd)/library/page.tsx`) hiện đang có một hình chữ nhật nhỏ nằm bên trái tiêu đề truyện để chứa ảnh bìa, trông khá đơn điệu.
- **Yêu cầu của User:** "Tôi nghĩ chúng ta nên cho ảnh bìa của truyện tràn viền luôn thay vì chỉ có một khung ảnh bé như vậy."
- **Hành động cần làm:** Thiết kế lại Component `StoryCard`. Hãy dùng `coverImageUrl` để làm hình nền (background-image) bao phủ toàn bộ thẻ (tràn viền), hoặc làm một khối Header Cover lớn (tỷ lệ 16:9 hoặc 3:2) phía trên cùng của thẻ. Nhớ thêm một lớp phủ Gradient màu tối (linear-gradient overlay) từ dưới lên hoặc từ trái sang để đảm bảo chữ (Tên truyện, số chương, tiến trình) có độ tương phản cao và dễ đọc.

---

## 4. Hướng dẫn dành cho Agent (Guidelines & Context for the Next Agent)

Chào người đồng nghiệp AI. Dưới đây là những chỉ dẫn quan trọng bạn cần nắm:

1. **Khắc phục lỗi Storage trước:** Hãy hướng dẫn user sửa lỗi "Tenant not found" trên Supabase Cloud theo mục 3.1 trước tiên. Nếu ảnh không hiển thị thì làm UI cũng rất khó để kiểm chứng.
2. **Thiết kế UI Cao cấp (Premium Design):** Dự án này yêu cầu một giao diện thực sự sang trọng, hiện đại và đẹp mắt. Đừng làm UI một cách qua loa. Khi đổi thẻ truyện sang dạng "Tràn viền", hãy sử dụng các thủ thuật CSS hiện đại:
   - Dùng `background-size: cover` và `background-position: center`.
   - Sử dụng CSS grid hoặc absolute positioning để đặt nội dung đè lên ảnh.
   - Bắt buộc phải có `linear-gradient` tối màu hoặc `backdrop-filter: blur` nhẹ nhàng dưới phần chữ để chống mờ nếu ảnh bìa quá sáng.
   - Thêm hiệu ứng `hover:scale` nhẹ cho ảnh khi người dùng đưa chuột vào để tăng cảm giác tương tác (micro-interactions).
3. **Cấu trúc Component:** Xem file `web/app/(kd)/library/page.tsx` và `web/components/library/story-cover-upload.tsx`. Việc biến đổi UI từ một nút con thành "tràn viền" có thể đòi hỏi bạn phải di chuyển logic của `<StoryCoverUpload />` (vốn là một thẻ `<label>` bọc ngoài input file) ra bao trùm lấy cả `StoryCard` hoặc đặt nó ở một khu vực nổi bật trên thẻ.
4. **Môi trường Server & Cache:** Nhớ rằng `getLibraryStories` được gọi ở Server Component và trả về `LibraryStory`. Dữ liệu sẽ được update khi `revalidatePath('/library')` chạy thành công trong Server Action.
5. **Cấm đổi màu lung tung:** Cố gắng sử dụng các biến CSS nội bộ như `var(--kd-bg)`, `var(--kd-surface)`, `var(--kd-text)`, `var(--kd-gilt)` để đảm bảo nhất quán với Theme hiện tại (Sáng/Tối/Vàng Sepia).

Hãy bắt đầu bằng việc xác nhận lại với User về việc tạo bucket `media` trên Supabase Dashboard, sau đó tiến hành chỉnh sửa mã nguồn cho tính năng Thẻ Truyện Tràn Viền!
