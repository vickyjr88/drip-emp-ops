/**
 * Turns a pasted stock list into quantities for the sizes being created.
 *
 * Staff have the count on a note or in a message: "40:3, 41:5, 42 2" or one per line. Each piece is a size and a number; the size may be the
 * full option ("EUR 42") or just the part people say ("42"). Pieces that match none of the sizes being created are returned, so they can be
 * shown rather than silently dropped.
 */

export function parseStockList(text: string, options: string[]): { quantities: Record<string, number>; unknown: string[] } {
  const quantities: Record<string, number> = {};
  const unknown: string[] = [];
  const lastWord = (value: string) => value.trim().toLowerCase().split(/\s+/).pop() ?? '';
  const same = (option: string, label: string) => option.trim().toLowerCase() === label.trim().toLowerCase() || lastWord(option) === label.trim().toLowerCase();

  for (const raw of text.split(/[,;\n]+/)) {
    const piece = raw.trim();
    if (!piece) continue;
    const match = piece.match(/^(.+?)\s*[:=×x*]\s*(\d+)$/i) ?? piece.match(/^(.+?)\s+(\d+)$/);
    if (!match) { unknown.push(piece); continue; }
    const option = options.find((o) => same(o, match[1]));
    if (!option) { unknown.push(piece); continue; }
    quantities[option] = (quantities[option] ?? 0) + Number(match[2]);
  }
  return { quantities, unknown };
}
