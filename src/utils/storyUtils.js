export function getFlatChapters(story) {
  if (!story) return [];
  const flat = [];
  story.sections.forEach((sec) => {
    sec.chapters.forEach((ch) => {
      flat.push({
        sectionId: sec.id,
        sectionTitle: sec.title,
        chapterId: ch.id,
        chapterTitle: ch.title,
        content: ch.content,
      });
    });
  });
  return flat;
}

export function shortLabel(title) {
  return (title || '').split(':')[0].trim();
}

export function totalChapters(story) {
  return story.sections.reduce((sum, section) => sum + section.chapters.length, 0);
}

export function metaLabel(story) {
  const total = totalChapters(story);
  if (story.sections.length > 1) return `${story.sections.length} hồi · ${total} chương`;
  return `${total} chương`;
}

