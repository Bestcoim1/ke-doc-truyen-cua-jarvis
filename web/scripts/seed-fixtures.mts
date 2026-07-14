/**
 * Dev-only Slice 1 fixture seeder — stands in for the real DOCX import
 * pipeline (Slice 2) so the Reader can be exercised against a large,
 * realistic hierarchy before the parser exists. Not shipped/bundled.
 *
 * Usage: npm run seed:fixtures
 * Requires in web/.env.local: NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY (dashboard > Project Settings > API — never
 * commit this), KEDOC_SEED_OWNER_EMAIL (the account that should own the
 * seeded story).
 */
import { createClient } from "@supabase/supabase-js";

import { assignAnchorIds, hashContentBlocks } from "../lib/reader/anchors.ts";
import type { Block } from "../lib/reader/types.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_EMAIL = process.env.KEDOC_SEED_OWNER_EMAIL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !OWNER_EMAIL) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KEDOC_SEED_OWNER_EMAIL",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Original, procedurally generated placeholder prose (no third-party
// copyrighted content) — enough variety to make paragraph fingerprints
// realistically non-repeating across chapters.
const FILLER_SENTENCES = [
  "Gió thổi nhẹ qua con phố nhỏ, mang theo mùi cà phê buổi sáng.",
  "Cô đứng bên cửa sổ, nhìn những giọt mưa rơi xuống mái hiên cũ.",
  "Cuốn sổ tay nằm im trên bàn, chờ một dòng chữ mới được viết thêm.",
  "Tiếng chuông xe đạp vang lên cuối con hẻm vắng người qua lại.",
  "Anh xoay chiếc bút trong tay, cố nghĩ ra câu mở đầu cho phù hợp.",
  "Buổi chiều muộn, ánh nắng nhuộm vàng cả con đường quen thuộc.",
  "Bà cụ bán hàng rong dừng lại nghỉ chân dưới tán cây cổ thụ.",
  "Cậu bé chạy băng qua sân trường, tay ôm chặt quả bóng đã cũ.",
  "Con phố nhỏ dần vắng người khi đèn đường bắt đầu bật sáng.",
  "Cô gái gấp lại lá thư, đặt nó vào ngăn kéo bàn học.",
  "Tiếng còi tàu vọng lại từ xa, báo hiệu một chuyến đi sắp bắt đầu.",
  "Chiếc lá vàng cuối cùng rơi xuống, khép lại một mùa thu ngắn ngủi.",
  "Người đàn ông đã quen thuộc với con đường này bước đi chậm rãi.",
  "Quán cà phê góc phố vẫn mở cửa dù trời đã khuya.",
  "Cơn gió cuối ngày lùa qua khung cửa sổ để hé mở nửa chừng.",
  "Cô nhìn đồng hồ, biết mình sắp trễ giờ hẹn buổi tối.",
  "Đứa trẻ ngồi vẽ nguệch ngoạc trên trang giấy đã ngả màu.",
  "Ánh đèn đường hắt bóng dài trên con phố vắng.",
  "Chiếc taxi dừng lại trước cổng, đèn hậu vẫn còn sáng đỏ.",
  "Tiếng nhạc nhẹ vang lên từ chiếc radio cũ trong góc phòng.",
];

function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateParagraphs(seed: number, count: number): string[] {
  const random = mulberry32(seed);
  const paragraphs: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const sentenceCount = 2 + Math.floor(random() * 3);
    const sentences: string[] = [];
    for (let s = 0; s < sentenceCount; s += 1) {
      sentences.push(
        FILLER_SENTENCES[Math.floor(random() * FILLER_SENTENCES.length)],
      );
    }
    paragraphs.push(sentences.join(" "));
  }
  return paragraphs;
}

function buildContentBlocks(paragraphs: string[]): {
  content_blocks: { schema_version: 1; blocks: Block[] };
  content_hash: string;
  word_count: number;
} {
  const withAnchors = assignAnchorIds(paragraphs.map((text) => ({ text })));
  const blocks: Block[] = withAnchors.map((p) => ({
    anchor_id: p.anchorId,
    type: "paragraph",
    text: p.text,
    marks: [],
  }));
  const wordCount = paragraphs.reduce(
    (sum, p) => sum + p.split(/\s+/).length,
    0,
  );
  return {
    content_blocks: { schema_version: 1, blocks },
    content_hash: hashContentBlocks(blocks),
    word_count: wordCount,
  };
}

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function chunked<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function main() {
  const user = await findUserByEmail(OWNER_EMAIL!);
  if (!user) throw new Error(`No Supabase user found for email ${OWNER_EMAIL}`);
  console.log("Seeding fixture story for", user.email, user.id);

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .insert({ owner_id: user.id, title: "Fixture — 500 chương + edge cases" })
    .select("id")
    .single();
  if (storyError) throw storyError;
  const storyId = story.id as string;

  const sectionTitles = ["Hồi 1", "Hồi 2", "Hồi 3", "Hồi 4", "Hồi 5"];
  const { data: sections, error: sectionsError } = await supabase
    .from("sections")
    .insert(
      sectionTitles.map((title, i) => ({
        story_id: storyId,
        type: "arc",
        title,
        sort_order: i,
      })),
    )
    .select("id, sort_order");
  if (sectionsError) throw sectionsError;
  const orderedSections = [...sections].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  const { data: extraSection, error: extraSectionError } = await supabase
    .from("sections")
    .insert({
      story_id: storyId,
      type: "arc",
      title: "Ngoại truyện",
      sort_order: 5,
    })
    .select("id")
    .single();
  if (extraSectionError) throw extraSectionError;

  type PendingChapter = {
    section_id: string;
    title: string;
    sort_order: number;
    kind: "regular" | "extra";
    paragraphs: string[];
  };
  const pending: PendingChapter[] = [];

  orderedSections.forEach((section, sectionIndex) => {
    for (let c = 0; c < 100; c += 1) {
      const globalNumber = sectionIndex * 100 + c + 1;
      pending.push({
        section_id: section.id,
        title: `Chương ${globalNumber}`,
        sort_order: c,
        kind: "regular",
        paragraphs: generateParagraphs(globalNumber, 5 + (globalNumber % 4)),
      });
    }
  });

  // Edge case: a chapter that fits a single viewport (AC-PROG-04).
  pending.push({
    section_id: extraSection.id,
    title: "Chương ngắn",
    sort_order: 0,
    kind: "extra",
    paragraphs: [
      "Đây là một chương rất ngắn, vừa đúng một màn hình, dùng để kiểm tra completion không cần cuộn.",
    ],
  });

  // Edge case: a ~100,000-character chapter.
  const longParagraphs: string[] = [];
  let longLength = 0;
  let seed = 999;
  while (longLength < 100_000) {
    const [paragraph] = generateParagraphs(seed, 1);
    longParagraphs.push(paragraph);
    longLength += paragraph.length + 1;
    seed += 1;
  }
  pending.push({
    section_id: extraSection.id,
    title: "Chương dài",
    sort_order: 1,
    kind: "extra",
    paragraphs: longParagraphs,
  });

  console.log(`Inserting ${pending.length} chapters...`);
  const { data: insertedChapters, error: chaptersError } = await supabase
    .from("chapters")
    .insert(
      pending.map((p) => ({
        story_id: storyId,
        section_id: p.section_id,
        title: p.title,
        sort_order: p.sort_order,
        kind: p.kind,
      })),
    )
    .select("id, section_id, sort_order");
  if (chaptersError) throw chaptersError;

  // Match inserted rows back to pending content by (section_id, sort_order),
  // since a bulk INSERT doesn't guarantee returning order for large batches.
  const byKey = new Map(
    pending.map((p) => [`${p.section_id}:${p.sort_order}`, p]),
  );
  const withContent = insertedChapters.map((row) => {
    const key = `${row.section_id}:${row.sort_order}`;
    const source = byKey.get(key)!;
    return {
      chapterId: row.id as string,
      ...buildContentBlocks(source.paragraphs),
    };
  });

  console.log("Inserting chapter revisions...");
  const { data: revisions, error: revisionsError } = await supabase
    .from("chapter_revisions")
    .insert(
      withContent.map((c) => ({
        chapter_id: c.chapterId,
        content_blocks: c.content_blocks,
        content_hash: c.content_hash,
        word_count: c.word_count,
      })),
    )
    .select("id, chapter_id");
  if (revisionsError) throw revisionsError;

  const revisionByChapter = new Map(
    revisions.map((r) => [r.chapter_id as string, r.id as string]),
  );

  console.log("Pointing chapters at their current revision...");
  await chunked(withContent, 25, async (c) => {
    const revisionId = revisionByChapter.get(c.chapterId);
    const { error } = await supabase
      .from("chapters")
      .update({ current_revision_id: revisionId })
      .eq("id", c.chapterId);
    if (error) throw error;
  });

  console.log(
    `Done. Story ${storyId} seeded with ${withContent.length} chapters.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
