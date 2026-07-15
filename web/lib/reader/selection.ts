export function getSelectionOffsets(
  container: HTMLElement,
  range: Range
): { start: number; end: number } | null {
  const treeWalker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  let startOffset = 0;
  let endOffset = 0;
  let currentOffset = 0;
  let foundStart = false;
  let foundEnd = false;

  let node = treeWalker.nextNode();
  while (node) {
    if (node === range.startContainer) {
      startOffset = currentOffset + range.startOffset;
      foundStart = true;
    }
    if (node === range.endContainer) {
      endOffset = currentOffset + range.endOffset;
      foundEnd = true;
    }

    currentOffset += node.nodeValue?.length || 0;

    if (foundStart && foundEnd) {
      break;
    }
    node = treeWalker.nextNode();
  }

  if (foundStart && foundEnd) {
    return { start: startOffset, end: endOffset };
  }
  return null;
}
