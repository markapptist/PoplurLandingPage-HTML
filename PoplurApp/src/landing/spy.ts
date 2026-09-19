// Which chapter is under the reader. The page's focus line sits 40% down the
// viewport — where a heading is when you are reading it — and the current
// chapter is the last one whose top has crossed that line, so the gap between
// two chapters still belongs to the one above. Pure: the nav's highlight and
// the scroll pop share this one answer.
export type ChapterBox = { id: string; top: number }

export function pickCurrent(boxes: readonly ChapterBox[], viewportH: number, focus = 0.4): string | null {
  const line = viewportH * focus
  let current: string | null = null
  for (const box of [...boxes].sort((a, b) => a.top - b.top)) {
    if (box.top <= line) current = box.id
    else break
  }
  return current
}
