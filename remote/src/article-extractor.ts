// Extract a numbered article from Markdown legislative texts.
// The upstream corpus often marks headings as **Art. 1º**.
export function extractArticle(markdown: string, article: string, max = 12000) {
  if (!/^\d+[A-Za-z]?$/.test(article)) throw new Error('Artigo inválido');
  const heading = /^\s*(?:\*\*|__)?Art\.?\s*(\d+[A-Za-z]?)(?:º|°|\.)?(?:\*\*|__)?(?=\s|$|[-–.:])/gim;
  const hits: Array<{ number: string; index: number }> = [];
  for (const match of markdown.matchAll(heading)) hits.push({ number: match[1], index: match.index });
  const position = hits.findIndex(hit => hit.number.toLowerCase() === article.toLowerCase());
  if (position === -1) return null;
  const start = hits[position].index;
  const end = hits[position + 1]?.index ?? markdown.length;
  const complete = markdown.slice(start, end).trimEnd();
  return { excerpt: complete.slice(0, max), truncated: complete.length > max };
}
