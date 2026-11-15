/**
 * Flesch-Kincaid grade level: roughly the US school grade a reader needs.
 * Deterministic, so the evaluation can track whether briefs stay in plain
 * words. Syllables are counted with a common vowel-group heuristic, which is
 * close enough to compare runs, not to grade a single sentence precisely.
 */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

export function readingGrade(text: string): number | null {
  const words: string[] = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? [];
  if (words.length === 0) return null;
  const sentences = Math.max(1, (text.match(/[.!?]+(?=\s|$)/g) ?? []).length);
  const syl = words.reduce((n: number, w: string) => n + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}
