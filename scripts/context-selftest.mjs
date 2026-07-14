/**
 * Quick priority-packing check (run: node scripts/context-selftest.mjs)
 * Mirrors src/lib/context.ts packing behavior.
 */
const CHARS_PER_TOKEN = 4;
function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function packContext(chunks, budgetTokens) {
  const sorted = [...chunks].sort((a, b) => b.priority - a.priority);
  const packed = [];
  let used = 0;
  for (const chunk of sorted) {
    const cost = estimateTokens(chunk.content) + estimateTokens(chunk.label) + 8;
    if (used + cost <= budgetTokens) {
      packed.push(chunk);
      used += cost;
    }
  }
  return { packed, used };
}
const chunks = [
  { id: "a", label: "A", content: "x".repeat(400), priority: 50 },
  { id: "b", label: "B", content: "y".repeat(400), priority: 90 },
  { id: "c", label: "C", content: "z".repeat(4000), priority: 10 },
];
const { packed, used } = packContext(chunks, 200);
if (packed[0]?.id !== "b") throw new Error("priority fail");
if (used > 200) throw new Error("budget fail");
console.log("context.selftest: ok");
