// api/analyze.js — Runs AI composite analysis on current signals

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { scores, coveragePct, qualActive } = req.body;
    if (!scores) return res.status(400).json({ error: "No scores provided" });

    const lines = Object.entries(scores)
      .map(([k, s]) => `  • ${k.replace(/_/g," ")}: ${s.value}${s.weight?"":""} → ${s.z >= 0 ? "+" : ""}${s.z}σ [${s.label}]`)
      .join("\n");

    const qualLines = qualActive
      ? Object.entries(qualActive)
          .filter(([, v]) => v)
          .map(([k]) => `  • ${k.replace(/_/g," ")}: ACTIVE (+2.5σ)`)
          .join("\n")
      : "";

    const prompt = `You are a senior OSINT analyst monitoring Washington DC for major government events.
DATA COVERAGE: ${coveragePct}% — factor this into your confidence assessment.

Active signals with z-scores (standard deviations from historical baseline):
${lines}
${qualLines ? `\nQualitative signals active:\n${qualLines}` : ""}

Provide:
**COMPOSITE ASSESSMENT** (2–3 sentences; weight ≥2σ signals significantly)
**CONFIDENCE LEVEL** — Low/Medium/High + one sentence referencing the ${coveragePct}% coverage
**MOST LIKELY SCENARIOS** (top 3 with probability %)
**SIGNAL COHERENCE** (do signals reinforce or conflict?)
**WATCH NEXT** (2 specific signals with numeric thresholds)

Stay grounded. Be explicit about how missing signals affect your assessment.`;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(500).json({ error: "Anthropic API key not configured" });

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json();
      throw new Error(err.error?.message || `Anthropic HTTP ${apiRes.status}`);
    }

    const data = await apiRes.json();
    const text = data.content?.find(b => b.type === "text")?.text || "No response.";
    return res.status(200).json({ ok: true, analysis: text });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
