/** Russian count-dependent word endings: 1 / 2–4 / 5+, including 11–14. */
export function pluralRu(n: number, [one, few, many]: readonly [string, string, string]): string {
  const count = Math.abs(Math.trunc(n));
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
