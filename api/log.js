/* ==================================================================
 * api/log.js — DC Sentinel daily log on Vercel Blob
 *   GET  /api/log            -> returns the CSV (radar + read view)
 *   GET  /api/log?download=1 -> same CSV, as a file download (export btn)
 *   POST /api/log  {row}     -> appends one CSV line, returns {ok,row}
 *
 * One endpoint = read + download + append. Same-origin, single vendor.
 * Requires: `npm i @vercel/blob`, and a Blob store connected to the
 * project (Vercel dashboard -> Storage). The store auto-injects
 * BLOB_READ_WRITE_TOKEN, which @vercel/blob picks up automatically.
 * ================================================================== */

import { list, put } from "@vercel/blob";

const FILE = "sentinel_daily_log.csv";
const HEADER =
  "date,time_local,aircraft,mil_vip,tfr_count,tfr_type,hotel_usd,car_usd," +
  "aircraft_z,mil_z,tfr_intensity,hotel_z,car_z,overall_flag,event_note";

async function readCsv() {
  const { blobs } = await list({ prefix: FILE });
  const hit = blobs.find((b) => b.pathname === FILE);
  if (!hit) return HEADER + "\n";                 // first run: header only
  const r = await fetch(hit.url, { cache: "no-store" });
  return r.ok ? await r.text() : HEADER + "\n";
}

async function writeCsv(text) {
  await put(FILE, text, {
    access: "public",
    contentType: "text/csv",
    addRandomSuffix: false,   // stable pathname so the URL never drifts
    allowOverwrite: true,     // read-modify-write
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const csv = await readCsv();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (req.query?.download)
        res.setHeader("Content-Disposition", `attachment; filename="${FILE}"`);
      return res.status(200).send(csv);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const row = String(body.row || "").replace(/[\r\n]+/g, " ").trim();
      if (!row) return res.status(400).json({ error: "missing row" });
      let csv = await readCsv();
      if (!csv.endsWith("\n")) csv += "\n";
      csv += row + "\n";
      await writeCsv(csv);
      return res.status(200).json({ ok: true, row });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
