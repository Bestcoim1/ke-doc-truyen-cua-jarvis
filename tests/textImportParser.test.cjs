/* eslint-disable @typescript-eslint/no-require-imports -- Node test uses a CommonJS Babel loader. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const babel = require('../web/node_modules/next/dist/compiled/babel/core');
const transformModules = require(
  '../web/node_modules/next/dist/compiled/babel/plugin-transform-modules-commonjs',
);

const originalJavaScriptLoader = Module._extensions['.js'];
Module._extensions['.js'] = (module, filename) => {
  if (filename.includes('node_modules')) {
    return originalJavaScriptLoader(module, filename);
  }

  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    plugins: [transformModules],
    babelrc: false,
    configFile: false,
  });
  module._compile(transformed.code, filename);
};

const parserPath = path.resolve(__dirname, '../src/utils/textImportParser.js');
const {
  buildImportedStory,
  classifyImportedHeading,
  NO_CHAPTERS_MESSAGE,
  parseStoryText,
} = require(parserPath);

Module._extensions['.js'] = originalJavaScriptLoader;

function allEntityIds(result) {
  return result.sections.flatMap((section) => [
    section.id,
    ...section.chapters.map((chapter) => chapter.id),
  ]);
}

test('tách văn bản có Hồi + Chương và giữ nguyên xuống dòng nội bộ', () => {
  const result = parseStoryText(`
Hồi I: Khởi đầu

Chương 1: Gặp gỡ

Dòng thứ nhất.


Dòng thứ hai.

`);

  assert.equal(result.error, null);
  assert.equal(result.stats.sectionCount, 1);
  assert.equal(result.stats.chapterCount, 1);
  assert.equal(result.sections[0].title, 'Hồi I: Khởi đầu');
  assert.equal(
    result.sections[0].chapters[0].content,
    'Dòng thứ nhất.\n\n\nDòng thứ hai.',
  );
});

test('nhiều Chương không có section được đưa vào Chưa phân hồi', () => {
  const result = parseStoryText(`Chương 1: Mở đầu
Nội dung một.
Chương II: Tiếp theo
Nội dung hai.`);

  assert.equal(result.error, null);
  assert.equal(result.stats.sectionCount, 1);
  assert.equal(result.stats.chapterCount, 2);
  assert.equal(result.sections[0].title, 'Chưa phân hồi');
  assert.equal(result.stats.warningCount, result.warnings.length);
  assert.match(result.warnings[0], /Chưa phân hồi/);
});

test('nhận diện Ngoại truyện có và không có số', () => {
  const result = parseStoryText(`Phần 1: Tuyển tập
Ngoại truyện: Ngày nghỉ
Nội dung A.
Ngoại truyện 2: Chuyến đi
Nội dung B.`);

  assert.equal(result.stats.chapterCount, 2);
  assert.deepEqual(
    result.sections[0].chapters.map((chapter) => chapter.title),
    ['Ngoại truyện: Ngày nghỉ', 'Ngoại truyện 2: Chuyến đi'],
  );
});

test('nhận diện Chapter tiếng Anh và các alias tiếng Anh', () => {
  const result = parseStoryText(`Volume I: Opening
Chapter 1: First
First content.
Chap II: Second
Second content.
Extra 3: Bonus
Bonus content.
Side Story 4: Holiday
Holiday content.`);

  assert.equal(result.error, null);
  assert.equal(result.stats.sectionCount, 1);
  assert.equal(result.stats.chapterCount, 4);
});

test('trả lỗi rõ ràng khi không có tiêu đề chapter', () => {
  const result = parseStoryText(`Arc 1: Không có chương
Đây chỉ là một đoạn văn xuôi.`);

  assert.equal(result.error, NO_CHAPTERS_MESSAGE);
  assert.deepEqual(result.sections, []);
  assert.equal(result.stats.sectionCount, 0);
  assert.equal(result.stats.chapterCount, 0);
  assert.equal(result.stats.warningCount, result.warnings.length);
});

test('nhận diện đầy đủ heading, tạo ID duy nhất và giữ ID khi build story', () => {
  for (const heading of [
    'Hồi 1: A',
    'Hồi I: A',
    'Phần 1: A',
    'Phần I: A',
    'Quyển 1: A',
    'Quyển I: A',
    'Arc 1: A',
    'Part 1: A',
    'Volume 1: A',
  ]) {
    assert.equal(classifyImportedHeading(heading), 'section', heading);
  }

  for (const heading of [
    'Chương 1: A',
    'Chương I: A',
    'Chapter 1: A',
    'Chap 1: A',
    'Ngoại truyện 1: A',
    'Ngoại truyện: A',
    'Extra 1: A',
    'Side Story 1: A',
  ]) {
    assert.equal(classifyImportedHeading(heading), 'chapter', heading);
  }

  assert.equal(classifyImportedHeading('Chapter Introduction'), null);
  assert.equal(classifyImportedHeading('Chapter CIVIL War'), null);
  assert.equal(classifyImportedHeading('Volume CIVIL War'), null);
  assert.equal(
    classifyImportedHeading(`Chương 1: ${'Tiêu đề rất dài '.repeat(20)}`),
    'chapter',
  );

  const parsed = parseStoryText(`Hồi 1
Chương 1
A
Chương 2
B`);
  const ids = allEntityIds(parsed);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(Boolean));

  const story = buildImportedStory(
    { title: 'Truyện test', author: '', sections: parsed.sections },
    { timestamp: 123456789, randomPart: 7 },
  );
  assert.equal(story.sections[0].id, parsed.sections[0].id);
  assert.equal(story.sections[0].chapters[0].id, parsed.sections[0].chapters[0].id);
  assert.deepEqual(story.source, {
    type: 'pasted_text',
    importedAt: new Date(123456789).toISOString(),
  });
});
