export const config = {
  maxDuration: 60,
};
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { scores, coveragePct, qualActive } = req.body;
    if (!scores || Object.keys(scores).length === 0) return res.status(400).json({ error: "No signal data" });
    const lines = Object.entries(scores).map(([k, s]) => `  • ${k.replace(/_/g," ")}: ${s.value} → ${s.z>=0?"+":""}${s.z}σ [${s.label}]`).join("\n");
    const qualLines = qualActive ? Object.entries(qualActive).filter(([,v])=>v).map(([k])=>`  • ${k.replace(/_/g," ")}: ACTIVE (+2.5σ)`).join("\n") : "";
    const prompt = `You are a senior OSINT analyst monitoring Washington DC for major government events.\nDATA COVERAGE: ${coveragePct}%\n\nActive signals:\n${lines}${qualLines?"\n\nQualitative:\n"+qualLines:""}\n\nProvide:\n**COMPOSITE ASSESSMENT** (2-3 sentences)\n**CONFIDENCE** Low/Medium/High + one sentence referencing ${coveragePct}% coverage\n**MOST LIKELY SCENARIOS** (top 3 with probability %)\n**SIGNAL COHERENCE** (reinforce or conflict?)\n**WATCH NEXT** (2 specific signals with numeric thresholds)`;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API key not configured" });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || `HTTP ${r.status}`); }
    const data = await r.json();
    const text = data.content?.find(b => b.type === "text")?.text || "No response.";
    return res.status(200).json({ ok: true, analysis: text });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
