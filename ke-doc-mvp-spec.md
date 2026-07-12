# Đặc tả sản phẩm (PRD) — "Kệ Đọc" *(tên tạm)*
### Nền tảng đọc bản thảo cá nhân cho tác giả/dịch giả

| | |
|---|---|
| **Phiên bản** | v0.1 — MVP |
| **Ngày** | 11/07/2026 |
| **Người phụ trách** | Jarvis (solo) |
| **Trạng thái** | Draft — chờ review |

---

## 1. Vấn đề (Problem Statement)

Jarvis có thói quen viết/dịch truyện trên máy tính, lưu file lên Google Drive, rồi đọc lại bằng điện thoại để kiểm tra nhịp truyện và trải nghiệm như một độc giả thật. Google Docs — công cụ đang dùng cho bước đọc lại này — được thiết kế để **soạn thảo**, không phải để **đọc dài**: bố cục giống văn bản hành chính, không tối ưu cho mobile, không có mục lục nhanh, dễ mất dấu vị trí đang đọc, và không có các tùy chỉnh hiển thị (cỡ chữ, theme, line-height) như một app đọc sách thật sự.

Hệ quả: bước đọc lại — vốn quan trọng để tự đánh giá chất lượng bản dịch/bản thảo — trở thành trải nghiệm khó chịu, làm giảm động lực đọc lại thường xuyên và dễ bỏ sót lỗi nhịp văn, xưng hô, hoặc mạch truyện.

## 2. Mục tiêu (Goals)

1. **Đọc thoải mái trên điện thoại**: trải nghiệm đọc ngang tầm app ebook (Kindle/Wattpad-like), không còn cảm giác "đang đọc tài liệu văn phòng".
2. **Không bao giờ lạc trong truyện dài**: người đọc luôn biết mình đang ở Quyển/Hồi/Chương nào, và có thể nhảy đến bất kỳ chương nào trong vài giây.
3. **Loại bỏ ma sát giữa viết và đọc**: từ lúc có file bản thảo đến lúc đọc được trên điện thoại tốn dưới 2 phút (upload → tự tách chương → đọc ngay).
4. **Giữ đúng workflow hiện tại**: vẫn viết trên máy tính như cũ (Docs/Word), chỉ thay thế bước "đọc lại trên điện thoại" — không bắt phải đổi công cụ soạn thảo.
5. **Tự thay thế hoàn toàn Google Docs cho việc đọc lại** trong vòng 1 tháng sau khi MVP hoạt động.

## 3. Ngoài phạm vi cho MVP (Non-Goals)

| Không làm | Lý do |
|---|---|
| Chỉnh sửa/soạn thảo nội dung trong app | Vẫn viết ở Docs/Word — app chỉ để đọc, tránh trùng lặp với công cụ đã tốt sẵn |
| Cộng tác thời gian thực, bình luận giữa nhiều người | Chưa có nhu cầu multi-user, thêm phức tạp không cần thiết ở v1 |
| Nền tảng công khai kiểu Wattpad/AO3 (feed, khám phá, follow tác giả) | Định vị private-first; mở công khai sau khi trải nghiệm đọc đã ổn |
| Kiếm tiền / monetization | Không phải mục tiêu ở giai đoạn này |
| App mobile native (iOS/Android) | Web responsive/PWA đủ đáp ứng nhu cầu, chi phí phát triển thấp hơn nhiều |
| Đồng bộ hai chiều tự động với Google Drive | Phức tạp về API + quota; import thủ công là đủ cho MVP |
| Chế độ đọc kiểm lỗi (câu dài, lặp từ, thống kê xưng hô) | Tính năng giá trị nhưng thuộc v2, không phải pain point cấp thiết nhất |

## 4. Đối tượng người dùng & User Stories

**Persona chính (P0):** Tác giả/dịch giả tự đọc lại bản thảo của mình — chính là Jarvis. Một người, không cần phân quyền phức tạp ở MVP.

**Persona tương lai (P2):** Người đọc được chia sẻ riêng tư (bạn bè, nhóm dịch cùng đọc để góp ý) — chưa cần ở MVP.

User stories, sắp theo độ ưu tiên:

- Là tác giả, tôi muốn **upload file .docx/.txt hoặc paste nội dung**, để không phải gõ lại truyện đã viết.
- Là tác giả, tôi muốn **hệ thống tự tách chương/hồi theo heading**, để không phải chia thủ công từng chương.
- Là tác giả, tôi muốn **xem trước và sửa lại ranh giới chương nếu tách sai**, để đảm bảo mục lục đúng trước khi đọc.
- Là độc giả (chính mình), tôi muốn **tùy chỉnh cỡ chữ khi đọc**, để đọc thoải mái theo mắt mình trên điện thoại.
- Là độc giả, tôi muốn **luôn thấy mình đang ở Quyển/Hồi/Chương nào**, để không bị lạc trong truyện dài nhiều arc.
- Là độc giả, tôi muốn **mở mục lục nổi và nhảy đến chương bất kỳ trong vài giây**, dù đang ở giữa chương khác.
- Là độc giả, tôi muốn **app tự nhớ vị trí đang đọc**, để lần sau mở lên là đọc tiếp ngay, không phải cuộn tìm lại.
- Là độc giả, tôi muốn **biết chương hiện tại đã đọc bao nhiêu % và chương tiếp theo là gì**, để có cảm giác được dẫn đường.

## 5. Yêu cầu chức năng (Requirements)

### P0 — Bắt buộc cho MVP

**5.1 Đăng nhập đơn giản**
- [ ] Người dùng đăng nhập bằng email hoặc Google OAuth
- [ ] Một tài khoản có thể quản lý nhiều tác phẩm

**5.2 Tạo tác phẩm & Import nội dung**
- [ ] Tạo tác phẩm mới với tên, mô tả
- [ ] Upload file `.docx` hoặc `.txt`, hoặc paste nội dung trực tiếp
- [ ] Given người dùng upload file `.docx` có heading style (Heading 1/2), When hệ thống xử lý, Then nội dung được tách chương dựa trên style
- [ ] Given file không dùng heading style (chỉ bôi đậm/tăng cỡ chữ thủ công), When hệ thống không tìm thấy heading style, Then hệ thống fallback sang nhận diện theo pattern văn bản (`Chương \d+`, `Chapter \d+`, `Hồi [IVX]+`, `Phần \d+`, `Ngoại truyện \d+`, v.v.)

**5.3 Xem trước & sửa ranh giới chương (bắt buộc, không phải nice-to-have)**
- [ ] Sau khi tự tách chương, hiển thị danh sách chương được nhận diện để người dùng xác nhận
- [ ] Cho phép gộp 2 chương bị tách sai, tách 1 chương bị gộp sai, hoặc đổi tên chương
- [ ] Cho phép sắp xếp lại thứ tự chương/nhóm chương vào Quyển/Hồi/Ngoại truyện thủ công
- *Lý do bắt buộc:* parser theo heading/pattern không thể đúng 100% với văn bản dịch/viết tay thực tế — nếu thiếu bước này, một lần tách sai sẽ khiến người dùng bỏ app ngay từ lần import đầu tiên.

**5.4 Giao diện đọc chuyên dụng**
- [ ] Hiển thị nội dung chương dạng đọc sách (không phải dạng tài liệu), lề thoáng, không có UI thừa
- [ ] Tùy chỉnh cỡ chữ (tối thiểu 3–5 mức)
- [ ] Ẩn thanh công cụ khi cuộn, hiện lại khi chạm màn hình

**5.5 Định vị vị trí đang đọc**
- [ ] Thanh trạng thái luôn hiển thị: `Quyển X · Hồi Y · Chương Z` (hoặc cấu trúc tương ứng tác phẩm đó)
- [ ] Hiển thị % tiến độ trong chương hiện tại
- [ ] Ở cuối chương, hiển thị tên chương tiếp theo và nút chuyển nhanh

**5.6 Mục lục nổi & điều hướng nhanh**
- [ ] Mở được từ bất kỳ đâu trong lúc đọc (icon cố định hoặc vuốt)
- [ ] Hiển thị cấu trúc phân cấp: Quyển → Hồi/Arc → Chương → Ngoại truyện
- [ ] Đánh dấu chương đã đọc, đang đọc, chưa đọc
- [ ] Given người dùng chạm vào một chương trong mục lục, When chương đó khác chương hiện tại, Then app chuyển đến chương đó và đóng mục lục

**5.7 Lưu tiến độ đọc**
- [ ] Tự động lưu vị trí đọc theo **đoạn văn (paragraph anchor)**, không lưu theo pixel scroll thô — để không bị lệch vị trí khi người dùng đổi cỡ chữ/line-height
- [ ] Khi mở lại tác phẩm, tự động cuộn đến đúng vị trí đã lưu

### P1 — Nên có (fast-follow sau MVP)

- [ ] Tùy chỉnh line-height, font family, theme sáng/tối/sepia
- [ ] Chế độ riêng tư theo tác phẩm: Private / Unlisted (ai có link mới đọc được)
- [ ] Ghi chú khi đọc: highlight đoạn + note ngắn, xem lại theo chương
- [ ] Ước tính thời gian đọc còn lại trong chương (`Còn khoảng 3 phút`)
- [ ] Tìm kiếm nội dung trong toàn bộ tác phẩm

### P2 — Cân nhắc tương lai (không thiết kế chi tiết ở v1, nhưng không chặn đường mở rộng)

- [ ] Import trực tiếp từ Google Drive + nút "Sync lại bản mới nhất"
- [ ] Offline reading (tải truyện về đọc không cần mạng)
- [ ] Chế độ đọc kiểm lỗi cho tác giả (câu dài, lặp từ, thống kê xưng hô)
- [ ] Chia sẻ cho một nhóm nhỏ (Shared) hoặc công khai (Public)
- [ ] Thư viện công khai / khám phá truyện của người khác

## 6. Chỉ số thành công (Success Metrics)

Vì đây là sản phẩm cá nhân (một người dùng ở giai đoạn đầu), chỉ số nên đo hành vi sử dụng thật thay vì các chỉ số tăng trưởng kiểu SaaS.

**Chỉ số sớm (đo được trong 1–2 tuần đầu):**
- Thời gian từ lúc có file bản thảo đến lúc đọc được trên điện thoại: **dưới 2 phút**
- Tỷ lệ chương được tự động tách đúng, không cần sửa tay: **trên 90%** (với file có heading style rõ ràng)
- Số lần mở mục lục để nhảy chương thành công không cần cuộn thủ công

**Chỉ số dài hạn (đo sau 1 tháng):**
- Ngừng hẳn việc mở Google Docs để đọc lại bản thảo trên điện thoại
- Số tác phẩm đã import và có ít nhất một lần đọc lại hoàn chỉnh trên app

## 7. Câu hỏi mở (Open Questions)

| Câu hỏi | Ai cần trả lời | Chặn hay không |
|---|---|---|
| Ưu tiên hỗ trợ `.docx` trước hay `.txt/.md` trước? (ảnh hưởng độ phức tạp parser ban đầu) | Jarvis (product) | Chặn — cần quyết trước khi code parser |
| Có cần hỗ trợ ảnh minh họa chèn trong chương không, hay chỉ text thuần ở v1? | Jarvis (product) | Không chặn MVP, ảnh hưởng data model chương |
| Ngưỡng nào để cảnh báo "tách chương có thể sai" và gợi ý người dùng kiểm tra? (ví dụ: chương quá ngắn/quá dài bất thường) | Jarvis + kỹ thuật | Không chặn, có thể làm heuristic đơn giản trước |
| Domain/hosting: dùng subdomain miễn phí (Vercel) trước hay mua domain riêng ngay? | Jarvis | Không chặn |
| Có cần đăng nhập bằng Google OAuth ngay ở MVP, hay email/password là đủ để tự dùng trước? | Jarvis | Không chặn, ảnh hưởng thời gian setup auth |

## 8. Lộ trình & Phân kỳ (Phasing)

Không có deadline cứng — đây là dự án cá nhân, nên phân kỳ theo mức độ hoàn chỉnh thay vì mốc thời gian cụ thể.

**Giai đoạn 0 — Hạ tầng**
Setup Next.js + Supabase (Auth, DB, Storage), deploy khung sườn lên Vercel, schema DB ban đầu.

**Giai đoạn 1 — MVP (toàn bộ mục P0 ở trên)**
Import → tự tách chương → xem trước & sửa tay → đọc trên mobile → tùy chỉnh cỡ chữ → định vị vị trí → mục lục nổi → lưu tiến độ.
*Tiêu chí hoàn thành:* Jarvis có thể import một tác phẩm thật đang viết dở, đọc hết một chương trên điện thoại, đóng app, mở lại và tiếp tục đúng vị trí.

**Giai đoạn 2 — Fast-follow (mục P1)**
Tùy chỉnh hiển thị nâng cao, chế độ riêng tư, ghi chú khi đọc.

**Giai đoạn 3 — Mở rộng (mục P2, đánh giá lại sau khi dùng thật)**
Sync Google Drive, offline reading, chia sẻ nhóm, chế độ kiểm lỗi.

---

## Phụ lục A — Đề xuất kiến trúc kỹ thuật

```
Frontend + Backend : Next.js (React)
Database / Auth / Storage : Supabase (Postgres + Supabase Auth + Supabase Storage)
Deploy : Vercel
Import DOCX : mammoth.js (ưu tiên đọc heading style thật;
              fallback sang regex pattern nếu không có style)
```

Lý do chọn: khớp với stack Jarvis đã quen (React/TypeScript, từng deploy Vercel ở dự án chia sẻ tài liệu), thời gian setup nhanh, chi phí gần như miễn phí ở quy mô cá nhân.

## Phụ lục B — Mô hình dữ liệu (đề xuất)

```
User
- id, email, created_at

Story
- id, owner_id, title, description, visibility, created_at

Section        (Quyển / Hồi / Phần / Ngoại truyện — cấu trúc phân cấp tùy biến)
- id, story_id, parent_section_id, title, order

Chapter
- id, story_id, section_id, title, order, content_html

ReadingProgress
- user_id, story_id, chapter_id, paragraph_anchor_id, updated_at

ReadingSettings
- user_id, font_size, line_height, theme, font_family

Note                        (P1)
- id, user_id, chapter_id, paragraph_anchor_id, content, created_at
```

*Lưu ý kỹ thuật quan trọng:* `ReadingProgress` nên neo theo `paragraph_anchor_id` (id gắn vào từng đoạn văn khi render), không lưu theo `scroll_position` tính bằng pixel — vì pixel sẽ sai lệch ngay khi người dùng đổi cỡ chữ hoặc line-height.

## Phụ lục C — Sơ phác giao diện đọc

```
[Quyển 1 · Hồi 3 · Chương 12]              [☰]

  Nội dung truyện hiển thị ở đây,
  lề thoáng, không có UI thừa...




[73% chương này]            [Chương tiếp theo →]
```

Chạm vào màn hình để hiện thanh công cụ:

```
Aa   Mục lục   Tìm kiếm   Ghi chú   Theme
```

---

*Tài liệu này là bản draft v0.1 — có thể điều chỉnh sau khi bắt tay vào code và phát hiện các ràng buộc kỹ thuật thực tế, đặc biệt ở phần parser tách chương.*
