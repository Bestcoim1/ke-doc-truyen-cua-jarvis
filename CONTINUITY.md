# Continuity audit cho LinhTInh

Hệ thống này index corpus DOCX theo pipeline nhiều tầng, có truy nguồn và xử lý incremental. Nó **chỉ đọc** source Word; mọi Markdown, JSON, SQLite và report được sinh ở vùng riêng.

## Kiến trúc

```text
LinhTInh/**/*.docx (read-only)
  -> deterministic OOXML extraction
  -> stable source / section / chapter IDs
  -> extracted Markdown + line references
  -> candidate chapter-state JSON
  -> SQLite + FTS5 entity/fact/event/dependency index
  -> adjacent / arc / global rules
  -> Markdown report
  -> human review -> reviewed canon Markdown
```

Không có bước nào đưa toàn bộ corpus vào một model context. `context CHAPTER_ID` chỉ gom chapter đang xét, state trước đó, facts/canon liên quan và issue đang mở.

## Khảo sát source hiện tại

Snapshot được xác minh ngày 30/07/2026 có 59 DOCX trong cấu trúc đã sắp xếp của `LinhTInh/`: 14 nguồn truyện chính, 18 nguồn Hậu/Ngoại truyện, 6 nguồn đa vũ trụ, 13 bản thảo cũ cần retcon và 8 hồ sơ/phụ lục. Initial scan hiện tạo 425 đơn vị có stable ID, 425 Markdown, 425 chapter-state JSON và giữ nguyên thứ tự của 176.372 paragraph (2.023.618 từ trên mọi miền).

Source được tách thành các miền:

- `main`, `side-story`, `supplement`: cùng miền audit `canon-main`;
- `multiverse`: audit riêng theo Tuyển tập, không tự nhập vào canon chính;
- `alternate`, `reference`, `planning`, `compilation`: vẫn extract/index để tra cứu nhưng không tạo continuity issue mặc định. Policy compilation vẫn tránh báo trùng nếu sau này thêm lại một bản gộp toàn bộ ngoại truyện.

Heading trong corpus không đồng nhất. Bộ tách dùng thứ tự:

1. Heading có mẫu `Chương`, `Chapter`, `Ngoại truyện`;
2. Word Heading section có mẫu `Arc`, `Hồi`, `Phần`, `Route`, `Tuyển tập`, hoặc section không có style nhưng dùng số/La Mã cùng dấu phân cách rõ như `Hồi III:` hay `ARC 3.2:`;
3. nếu Hậu/Ngoại truyện hoặc Tuyển tập không đánh số, Heading không rỗng ở cấp cao nhất là ranh giới chapter;
4. nếu source narrative vẫn không có heading chapter, page break nằm trên **paragraph rỗng** là fallback;
5. page break gắn cuối prose chỉ là dàn trang và không tạo chapter.

Các câu văn thường như “Hồi trẻ…”, “Phần lớn…”, “Tuyển tập I kết thúc…” hoặc “Arc VI–VII đẩy…” không phải section và không được tách. Điều này giữ đúng hierarchy Heading trong Word và tránh biến prose hay mỗi trang thành một chương. Source ID được suy ra từ tên file thay vì đường dẫn thư mục, nên việc chuyển file sang thư mục khác không đổi chapter ID; pipeline chỉ refresh provenance. Hai file có cùng identity sẽ bị từ chối rõ ràng thay vì bị gộp ngầm. Với source không có title chapter, title deterministic dạng `SECTION — chương N` được dùng; có thể bổ sung manifest ID thủ công trong phiên bản sau nếu tác giả cần giữ một hệ ID ngoài Word.

## Cấu trúc thư mục

```text
continuity_tool/                 Python package, chỉ dùng standard library
scripts/continuity.py            CLI entrypoint
continuity/
  config.json                    source roots và policy cục bộ
  schemas/chapter-state.schema.json
  canon/                         chỉ facts đã human-review, có thể commit
  reports/                       Markdown audit, có thể commit
  generated/                     cache/extracted/state/SQLite, gitignored
    extracted/<branch>/<source>/<chapter>.md
    chapter-states/<branch>/<source>/<chapter>.json
    index/continuity.db
    last-run.json
tests/continuity/                fixtures và integration tests an toàn
```

## Cài đặt

Không cần dependency ngoài Python 3.11+; parser đọc OOXML bằng standard library. Trên Codex workspace hiện tại có thể dùng runtime đã bundle:

```powershell
$python = 'C:\Users\phitr\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $python .\scripts\continuity.py --help
```

Nếu `python` đã có trên PATH:

```powershell
python .\scripts\continuity.py --help
```

## Initial scan và workflow hằng ngày

Initial scan:

```powershell
python .\scripts\continuity.py update
```

Lệnh chính dùng hằng ngày cũng là:

```powershell
python .\scripts\continuity.py update
```

Recommended author workflow:

```text
write/edit chapter
  -> continuity update
  -> review continuity/reports/CONTINUITY-AUDIT.md
  -> mark intentional retcon / approve candidate facts
  -> regenerate canon if needed
  -> commit source + reviewed artifacts
```

Các lệnh khác:

```powershell
python .\scripts\continuity.py extract
python .\scripts\continuity.py index
python .\scripts\continuity.py scan --arc arc-04
python .\scripts\continuity.py scan --chapter STABLE_CHAPTER_ID
python .\scripts\continuity.py report
python .\scripts\continuity.py search 'Erik AND Eve'
python .\scripts\continuity.py character Erik
python .\scripts\continuity.py item 'Silver Key'
python .\scripts\continuity.py timeline --chapter STABLE_CHAPTER_ID
python .\scripts\continuity.py status
```

`extract`/`index` cập nhật extraction, SQLite và candidate state nhưng không chạy rules/report. `scan` và `update` chạy đủ pipeline; scope ở `scan` lọc report cuối, trong khi rules chạy trên structured index nhẹ để vẫn bắt được conflict xuyên Arc.

## Extraction và stable evidence

Parser giữ:

- thứ tự paragraph và table trong document body;
- Heading level theo style/outline;
- bold/italic có ý nghĩa;
- manual line break, scene separator và list marker;
- footnote/endnote marker cùng nội dung note;
- Unicode tiếng Việt và ký tự ngoài Latin;
- final visible text trong tracked changes: insert được đọc, delete bị bỏ.

Hai hash được lưu:

- `package_hash`: SHA-256 byte của DOCX, dùng để skip parse nhanh;
- `content_hash`: SHA-256 của cấu trúc nội dung normalized, dùng làm `source_hash` và quyết định semantic change.

Nếu package đổi do metadata nhưng content không đổi, source được parse một lần rồi semantic processing bị skip. Timestamp không tham gia change detection và không được nhúng vào extracted Markdown/state JSON, nên output deterministic.

Mỗi Markdown chứa front matter, chapter ID, source hash, chapter hash và mỗi paragraph nằm trên một dòng ổn định. Evidence dùng dạng:

```text
arc-03-...:L221-L229
```

Database chỉ lưu quote ngắn tối đa 240 ký tự, không nhân bản đoạn dài không cần thiết.

## Chapter state và epistemic model

Mọi chapter có state theo schema `continuity/schemas/chapter-state.schema.json`, gồm timeline, characters, locations, items, relationships, knowledge, injuries, abilities, world rules, plot threads, obligations, deaths, reveals và uncertain facts.

Các loại bằng chứng:

```text
FACT CLAIM BELIEF RUMOR LIE SPECULATION DREAM FLASHBACK
UNRELIABLE_NARRATION UNKNOWN
```

Rule engine chỉ dùng candidate có type `FACT`; claim, lie, dream, flashback và speculation không được coi là canon. Deterministic extractor hiện nhận diện một tập mẫu explicit bảo thủ và các annotation như `[FACT]`, `[LIE]`, `[FLASHBACK]`. Để semantic extraction đầy đủ hơn, dùng context/import workflow ở phần dưới.

## SQLite và search

`continuity.db` có schema version và các bảng:

```text
sources chapters paragraphs paragraph_fts
entities aliases mentions facts events
character_states relationships knowledge item_states plot_threads
dependencies issues canon_decisions processing_runs
```

FTS5 giữ nguyên dấu Unicode (`remove_diacritics 0`). Dependency keys cho phép tìm tất cả chapter nhắc entity/knowledge key mà không đọc lại prose.

## Continuity rules

Baseline đã triển khai:

- item lost/destroyed rồi được dùng lại khi chưa recovered/transferred;
- death rồi present/reappearance, trừ khi văn bản xác nhận hồi sinh hoặc dòng thời gian bị đảo ngược; khi đó death vẫn được giữ làm evidence với `status: reverted` và một event `death_reverted`;
- knowledge used trước lần learned đầu tiên;
- hai location khác nhau ở cùng hoặc ngược story time;
- age mismatch ở mức cảnh báo thận trọng;
- plot thread explicit đã mở quá ngưỡng nhưng chưa resolve.

Mỗi issue có severity, confidence, adjacent/arc/global level, hai evidence reference, giải thích và alternative explanations. `main` và `side-story` được so xuyên corpus; Tuyển tập bị cô lập để tránh false positive đa vũ trụ.

Rules chỉ so `FACT`. Các pattern thực nghiệm không đủ để hiểu mọi ẩn dụ, time skip, alias, teleport, power rule hoặc quan hệ phức tạp; vì thế report luôn gọi issue là possible contradiction và bắt buộc human review.

## AI integration có giới hạn context

Sinh retrieval bundle cho một chapter:

```powershell
python .\scripts\continuity.py context CHAPTER_ID --output .\continuity\generated\context\chapter.json
```

Bundle gồm chapter text, state liền trước, facts liên quan đến entities được nhắc, reviewed canon nếu có, issues và provenance contract. Một model ngoài pipeline có thể trả:

```json
{
  "chapter_id": "...",
  "candidate_facts": [
    {
      "subject": {"type": "character", "name": "Rei"},
      "predicate": "knows",
      "object": "identity of the masked man",
      "epistemic_type": "CLAIM",
      "confidence": 0.74,
      "evidence": {"line_start": 221, "line_end": 229, "source_quote": "..."}
    }
  ]
}
```

Import chỉ sau validation:

```powershell
python .\scripts\continuity.py import-state .\candidate.json
```

Importer từ chối chapter/line/type không hợp lệ và luôn lưu `candidate`; nó không xác nhận canon.

## Human review và canon

Tìm fact ID qua `character`, `item`, search DB hoặc context bundle, sau đó:

```powershell
python .\scripts\continuity.py review FACT_ID confirmed --note "Đối chiếu trực tiếp chapter nguồn"
python .\scripts\continuity.py canon
```

Canon page ghi fact, status, first established, last reviewed, evidence, confidence và note. Khi retcon, dùng `retconned`/`obsolete`; hệ thống không xóa fact cũ.

## Incremental processing

`update` thực hiện:

1. stream SHA-256 từng DOCX;
2. package hash không đổi -> không parse DOCX;
3. package đổi -> parse và so normalized content hash;
4. content đổi -> split và so chapter hash;
5. chỉ chapter đổi/mới mới chạy state extraction và cập nhật dependency;
6. chapter không đổi chỉ refresh provenance khi cần;
7. rules chạy lại trên structured facts/events trong SQLite, không load lại toàn bộ corpus;
8. report được render lại deterministic.

Source biến mất được đánh dấu `missing`, không bị xóa khỏi lịch sử; source DOCX không bao giờ bị pipeline xóa. Markdown/JSON không còn thuộc chapter active được dọn tự động nhưng chỉ bên trong `continuity/generated`; cache có thể tái tạo bằng `--force`.

## Tests và verification

```powershell
python -m unittest discover -s .\tests\continuity -v
python -m compileall -q .\continuity_tool .\scripts\continuity.py
```

10 fixtures/integration tests kiểm tra Unicode/format/Heading/footnote, deterministic hash, source byte safety, Heading ngoại truyện không đánh số, prose bắt đầu bằng từ section không bị tách, fallback page break, folder move giữ ID, orphan artifact cleanup, item loss/use, explicit transfer, death/reappearance, death bị đảo ngược bởi rewind/hồi sinh, knowledge leak, impossible travel, injury recovery, flashback, lie/speculation, false positive “chết lặng” và incremental skip/chapter invalidation.

## Limitations

- Deterministic baseline không thay thế semantic model cho toàn bộ sắc thái của corpus hơn hai triệu từ trên mọi miền. Candidate state đầy đủ cần chạy model theo từng context bundle và review.
- Comment, equation, drawing/text box và layout hình ảnh trong DOCX chưa được chuyển thành semantic text; ordinary paragraphs, tables và notes được giữ.
- Travel rule hiện chỉ kết luận mạnh khi source có story time rõ; `travel_rules` trong config là chỗ mở rộng cho ma trận thời gian địa danh.
- Chapter không có Heading/title chỉ có ID theo section + segment ordinal. Chèn/xóa boundary trước segment có thể cần một manifest ID thủ công trong tương lai.
- Alias/entity discovery deterministic ưu tiên dàn nhân vật đã biết và explicit events; tên mới vẫn cần AI candidate hoặc human canon seed để phủ chính xác.
- Plot thread chỉ được kiểm tra khi có annotation `[THREAD OPEN: ...]` / `[THREAD RESOLVED: ...]` hoặc candidate tương đương.

## Troubleshooting

- `Invalid or unsupported DOCX`: mở file trong Word và Save As DOCX chuẩn; source lỗi được báo nhưng không bị sửa.
- Search không ra kết quả có dấu: giữ nguyên dấu và dùng cú pháp FTS5; thử một token ngắn trước.
- Muốn rebuild toàn bộ cache: `python scripts/continuity.py update --force`. Lệnh vẫn chỉ ghi `continuity/generated`, canon reviewed và report.
- Report nhiều false positive: kiểm tra epistemic type, branch và story time trước; đánh dấu disputed/intentional retcon thay vì sửa prose tự động.
- Source mới ngoài `LinhTInh`: thêm root tương đối/absolute vào `continuity/config.json`; absolute local paths không nên commit nếu chứa thông tin máy cá nhân.
