import { describe, expect, it } from "vitest";

import { buildFlatChapterList, buildTocTree } from "../lib/reader/tree";

describe("buildFlatChapterList", () => {
  it("orders nested sections and interleaved chapters by sort_order", () => {
    const sections = [
      { id: "vol1", parent_section_id: null, title: "Quyển 1", sort_order: 0 },
      { id: "arc1", parent_section_id: "vol1", title: "Hồi 1", sort_order: 0 },
      { id: "arc2", parent_section_id: "vol1", title: "Hồi 2", sort_order: 1 },
    ];
    const chapters = [
      { id: "c2", section_id: "arc1", title: "Chương 2", sort_order: 1 },
      { id: "c1", section_id: "arc1", title: "Chương 1", sort_order: 0 },
      { id: "c3", section_id: "arc2", title: "Chương 3", sort_order: 0 },
      { id: "c0", section_id: null, title: "Chương lẻ trước Quyển 1", sort_order: -1 },
    ];

    const flat = buildFlatChapterList(sections, chapters);
    expect(flat.map((c) => c.chapterId)).toEqual(["c0", "c1", "c2", "c3"]);
    expect(flat.find((c) => c.chapterId === "c1")?.sectionTitle).toBe("Hồi 1");
  });
});

describe("buildTocTree", () => {
  it("nests sub-sections under their parent", () => {
    const sections = [
      { id: "vol1", parent_section_id: null, title: "Quyển 1", sort_order: 0 },
      { id: "arc1", parent_section_id: "vol1", title: "Hồi 1", sort_order: 0 },
    ];
    const chapters = [{ id: "c1", section_id: "arc1", title: "Chương 1", sort_order: 0 }];

    const tree = buildTocTree(sections, chapters);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "section", title: "Quyển 1" });
    if (tree[0].kind === "section") {
      expect(tree[0].children[0]).toMatchObject({ kind: "section", title: "Hồi 1" });
    }
  });
});
