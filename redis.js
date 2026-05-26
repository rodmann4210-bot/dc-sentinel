// api/data.js — Returns latest data to the frontend
const redis = require("../lib/redis");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const raw = await redis.get("latest");
    if (!raw) return res.status(200).json({ ok: true, data: null, message: "No data yet. First collection runs within 30 minutes." });
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
