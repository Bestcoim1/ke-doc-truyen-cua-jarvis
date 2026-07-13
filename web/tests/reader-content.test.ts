import { describe, expect, it } from "vitest";

import { parseChapterContent } from "../lib/reader/content";

const validBlock = {
  anchor_id: "p_abc123",
  type: "paragraph",
  text: "Một đoạn văn hợp lệ.",
  marks: [],
};

function content(blocks: unknown[]) {
  return { schema_version: 1, blocks };
}

describe("parseChapterContent", () => {
  it("accepts a well-formed schema_version 1 blob", () => {
    const result = parseChapterContent(content([validBlock]));
    expect(result).not.toBeNull();
    expect(result!.blocks).toHaveLength(1);
    expect(result!.blocks[0].anchor_id).toBe("p_abc123");
  });

  it("keeps valid marks and drops malformed ones without failing the block", () => {
    const result = parseChapterContent(
      content([
        {
          ...validBlock,
          marks: [
            { type: "bold", start: 0, end: 3 },
            { type: "underline", start: 0, end: 1 }, // unsupported → dropped
            { type: "italic", start: "x", end: 2 }, // bad start → dropped
          ],
        },
      ]),
    );
    expect(result).not.toBeNull();
    expect(result!.blocks[0].marks).toEqual([{ type: "bold", start: 0, end: 3 }]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a non-object", "nope"],
    ["a missing schema_version", { blocks: [validBlock] }],
    ["a wrong schema_version", { schema_version: 2, blocks: [validBlock] }],
    ["a string schema_version", { schema_version: "1", blocks: [validBlock] }],
    ["blocks not an array", { schema_version: 1, blocks: {} }],
    ["an empty blocks array", content([])],
  ])("returns null for %s", (_label, input) => {
    expect(parseChapterContent(input)).toBeNull();
  });

  it.each([
    ["a missing anchor_id", { type: "paragraph", text: "x", marks: [] }],
    ["an empty anchor_id", { ...validBlock, anchor_id: "" }],
    ["an unsupported type", { ...validBlock, type: "heading" }],
    ["a non-string text", { ...validBlock, text: 42 }],
  ])("rejects the whole chapter when a block has %s", (_label, badBlock) => {
    expect(parseChapterContent(content([validBlock, badBlock]))).toBeNull();
  });
});
