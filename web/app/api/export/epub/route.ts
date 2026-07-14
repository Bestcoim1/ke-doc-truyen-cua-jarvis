import epub from "epub-gen-memory";
import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getStoryForReader, getSectionsAndChapters, buildFlatChapterList } from "@/lib/reader/queries";
import { parseChapterContent } from "@/lib/reader/content";
import { logEvent } from "@/lib/telemetry";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const storyId = searchParams.get("storyId");

  if (!storyId) {
    return new Response("Missing storyId", { status: 400 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const user = authData?.claims;

  if (!user || !user.sub) {
    return new Response("Unauthorized", { status: 401 });
  }

  const story = await getStoryForReader(supabase, user.sub, storyId);
  if (!story) {
    return new Response("Story not found", { status: 404 });
  }

  const { sections, chapters } = await getSectionsAndChapters(supabase, storyId);
  const flatList = buildFlatChapterList(sections, chapters);

  if (flatList.length === 0) {
    return new Response("Story has no chapters", { status: 400 });
  }

  // Get all active revision IDs
  const revisionIds = chapters
    .map((c) => c.current_revision_id)
    .filter((id): id is string => Boolean(id));

  // Fetch all revisions at once
  const { data: revisions, error: revisionsError } = await supabase
    .from("chapter_revisions")
    .select("id, content_blocks")
    .in("id", revisionIds);

  if (revisionsError) {
    logEvent("export.revisions_query_error", { code: revisionsError.code });
    return new Response("Internal Server Error", { status: 500 });
  }

  const revisionsMap = new Map<string, any[]>();
  for (const rev of revisions || []) {
    revisionsMap.set(rev.id, rev.content_blocks as any[]);
  }

  const epubChapters = flatList.map((entry) => {
    const chapter = chapters.find((c) => c.id === entry.chapterId);
    let htmlContent = "";

    if (chapter && chapter.current_revision_id) {
      const blocksRaw = revisionsMap.get(chapter.current_revision_id);
      if (blocksRaw) {
        const parsed = parseChapterContent(blocksRaw as unknown[]);
        if (parsed && Array.isArray(parsed.blocks)) {
          htmlContent = parsed.blocks
            .map((b: {text?: string}) => `<p>${(b.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
            .join("\n");
        } else if (Array.isArray(parsed)) {
            htmlContent = parsed
            .map((b: {text?: string}) => `<p>${(b.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
            .join("\n");
        }
      }
    }

    if (!htmlContent) {
      htmlContent = "<p><i>(Nội dung trống)</i></p>";
    }

    // @ts-expect-error fallback
    const entryTitle = "title" in entry ? entry.title : "Chương";

    return {
      title: entryTitle,
      content: htmlContent,
    };
  });

  try {
    const authorName = user.user_metadata?.display_name || user.email || "Unknown Author";

    const epubBuffer = await epub(
      {
        title: story.title,
        author: authorName,
        publisher: "Kệ Đọc Truyện",
        version: 3,
        tocTitle: "Mục lục",
      },
      epubChapters
    );

    const safeTitle = story.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    return new Response(epubBuffer as Blob, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${safeTitle}.epub"`,
      },
    });
  } catch (error) {
    console.error("EPUB generation failed", error);
    return new Response("Failed to generate EPUB", { status: 500 });
  }
}
