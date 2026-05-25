// api/data.js — Returns latest collected data to the frontend app

export default async function handler(req, res) {
  // Allow CORS so the frontend can fetch this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { kv } = await import("@vercel/kv");
    const latest = await kv.get("latest");

    if (!latest) {
      return res.status(200).json({
        ok: true,
        data: null,
        message: "No data collected yet. First collection runs within 30 minutes.",
      });
    }

    const data = typeof latest === "string" ? JSON.parse(latest) : latest;
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
