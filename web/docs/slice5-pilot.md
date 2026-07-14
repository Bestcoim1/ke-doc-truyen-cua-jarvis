# Slice 5 — Pilot cá nhân & MVP release

Spec §15 Slice 5 + §18 (Definition of Done). Khác các slice trước: không có
workstream code để "làm xong" — đây là giai đoạn **dùng thật** rồi sửa theo
hành vi thật. Tài liệu này là công cụ theo dõi, không phải checklist code.

## Trước khi bắt đầu

- [ ] Đã deploy production (xem `README.md` § "Deploy production (Vercel)").
- [ ] Đã xác nhận redirect URL production trong Supabase Auth.
- [ ] Có một bản thảo thật đang viết dở (không phải fixture) sẵn sàng import.

## Nhật ký pilot

Ghi mỗi lần dùng thật — không cần đầy đủ mọi cột, chỉ ghi cái quan sát được.
Mục đích là bắt lỗi hành vi thật, không phải đo hiệu năng phòng lab.

| Ngày | Thiết bị | Việc làm | Quan sát | Mức độ (OK / lệch nhẹ / lỗi) |
|---|---|---|---|---|
| | desktop / điện thoại | import / đọc / re-import / đổi setting | | |

## Các mốc cụ thể cần đo (DoD §18)

- **Time-to-read**: từ lúc bấm "Tự tách chương" (hoặc upload DOCX) đến lúc
  Reader mở chương đầu — mục tiêu **< 2 phút** cho một bản thảo thật.
- **Resume accuracy**: đóng app hoặc đổi thiết bị, mở lại — vị trí phải lệch
  **tối đa 1 paragraph** so với chỗ đang đọc. Ghi rõ nếu lệch nhiều hơn, kèm
  thao tác trước đó (đổi font? re-import? tab bị đóng đột ngột?).
- **Navigation time**: mở TOC → nhảy đến chương xa (ví dụ chương 300+ nếu
  bản thảo đủ dài) → có nhanh và đúng không.
- **Re-import fallback**: sau khi sửa/thêm/xoá chương thật trong bản thảo
  gốc rồi re-import — chapter ID có giữ đúng không, progress đang đọc có còn
  đúng không. **Cần ít nhất một vòng re-import thật thành công** (exit gate).

## Khi gặp lỗi

- Ghi lại: route, thao tác, kỳ vọng vs thực tế, có tái hiện được không.
- Phân loại severity theo DoD: **sev 1–2 phải sửa trước khi coi MVP xong**;
  sev 3+ hoặc P1 mới thì *không* thêm vào scope ngay — ghi lại, xử lý sau khi
  P0 đã ổn (spec §15: "không thêm P1 nếu P0 chưa ổn").
- Log lỗi qua `logEvent` đã có sẵn trong code (không chứa nội dung bản thảo)
  — kiểm tra dashboard Supabase / log Vercel nếu cần đối chiếu với báo cáo
  thủ công.

## Checklist Definition of Done (§18) — điền dần trong pilot

- [ ] DOCX thật import → review → mở Reader trong < 2 phút.
- [ ] Đọc trên điện thoại: luôn thấy hierarchy, mở TOC và đến chapter đích nhanh.
- [ ] Đóng/mở lại hoặc đổi thiết bị → về đúng đoạn, sai số ≤ 1 paragraph.
- [ ] Đổi font size/line-height/theme không làm mất anchor.
- [ ] Chapter ngắn và chapter dài đều cập nhật trạng thái đúng.
- [ ] Re-import một bản cập nhật thật giữ chapter IDs đã map và progress đọc.
- [ ] Commit/retry không tạo version hoặc chapter trùng (đã có test, xác nhận
      lại trong điều kiện dùng thật nếu nghi ngờ).
- [ ] RLS cross-user pass (đã có CI); không có URL nội dung công khai.
- [ ] Accessibility/responsive ở critical flows đạt (đã audit Slice 4 WS3,
      xác nhận lại trên thiết bị thật của bạn).
- [ ] Không còn lỗi severity 1–2; NFR chưa đạt (nếu có) có quyết định chấp
      nhận rủi ro bằng văn bản ở đây.
- [ ] **Bạn chọn Kệ Đọc thay Google Docs cho bước đọc lại** — đây là tín hiệu
      "xong" thật sự, không phải một dòng test pass.

## Follow-up đã biết trước (không chặn pilot, nhưng nên nhớ)

- Corpus fixture riêng tư `v1`/`v2` bản thảo thật (spec §16.4) — pilot này
  chính là nguồn tạo ra cặp đó nếu muốn khoá lại làm regression test sau.
- `@axe-core/playwright` chưa cắm vào E2E (theo dõi ở `docs/slice4-a11y.md`).
- Affordance "đang offline" khi đọc (không phải lúc review) — P1, chưa làm.
- Virtualization TOC/reader — chỉ làm nếu pilot thật cho thấy chậm (xem
  `docs/slice4-longstory.md` để biết ngưỡng và cách đo).
- **Redesign màn review khi import** thành layout 2 cột kiểu outline
  editor: cây cấu trúc (Arc/Section > Chương, thu gọn/mở rộng được) bên
  trái, xem trước nội dung chương đang chọn bên phải — thay cho list
  phẳng cuộn dài hiện tại (`components/import/import-review-editor.tsx`,
  `import-reimport-editor.tsx`). Người dùng gửi ảnh tham khảo bố cục 2 cột
  (dark UI) — **không áp dụng bảng màu trong ảnh**, dùng theo hướng nhận
  diện thị giác đang chốt (xem mockup đã publish, hoặc `lib/branding.ts`
  nếu đã có). Cần đối chiếu lại 3 hành động hiện có ("Hủy bản nháp"/"Lưu
  bản nháp"/"Commit vào kệ đọc") với 2 nút trong ảnh mẫu ("Quay lại"/"Xác
  nhận lưu") trước khi thiết kế — không phải chỉ đổi tên nút. Áp dụng cho
  cả luồng import mới lẫn re-import. Chưa được yêu cầu triển khai — chỉ
  ghi lại theo yêu cầu người dùng.
