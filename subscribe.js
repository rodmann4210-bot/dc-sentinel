// api/collect.js — Runs every 30 min via Vercel cron
const redis = require("../lib/redis");
const { fetchAircraft, fetchFederalRegister, fetchTFRs, fetchHotelRate, fetchCarRental, scoreSignals } = require("../lib/signals");

module.exports = async function handler(req, res) {
  // Security check
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const hasSecret = req.query.token === process.env.CRON_SECRET;
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const timestamp = new Date().toISOString();
  console.log(`[DC Sentinel] Collection started: ${timestamp}`);

  const readings = {};
  const errors   = {};
  const fetched  = [];

  // ── FETCH ALL IN PARALLEL ───────────────────────────────────
  const [aircraft, fedReg, tfrs, hotel, car] = await Promise.allSettled([
    fetchAircraft(process.env.OPENSKY_USER, process.env.OPENSKY_PASS),
    fetchFederalRegister(),
    fetchTFRs(process.env.ANTHROPIC_API_KEY),
    fetchHotelRate(process.env.ANTHROPIC_API_KEY),
    fetchCarRental(process.env.ANTHROPIC_API_KEY),
  ]);

  if (aircraft.status === "fulfilled" && aircraft.value.success) {
    readings.air_total = aircraft.value.total;
    readings.air_mil   = aircraft.value.military;
    fetched.push("opensky");
  } else {
    errors.opensky = aircraft.value?.error || "fetch failed";
  }

  if (fedReg.status === "fulfilled" && fedReg.value.success) {
    readings.fed_reg = fedReg.value.count;
    fetched.push("fed_reg");
  } else {
    errors.fed_reg = fedReg.value?.error || "fetch failed";
  }

  if (tfrs.status === "fulfilled" && tfrs.value.success) {
    readings.tfr_count = tfrs.value.count;
    fetched.push("tfrs");
  } else {
    errors.tfrs = tfrs.value?.error || "fetch failed";
  }

  if (hotel.status === "fulfilled" && hotel.value.success && hotel.value.rate != null) {
    readings.hotel_rate = hotel.value.rate;
    fetched.push("hotel");
  } else {
    errors.hotel = hotel.value?.error || "not found";
  }

  if (car.status === "fulfilled" && car.value.success && car.value.rate != null) {
    readings.car_rental = car.value.rate;
    fetched.push("car");
  } else {
    errors.car = car.value?.error || "not found";
  }

  // ── SCORE ───────────────────────────────────────────────────
  const { scores, alerts, peakZ, coveragePct, levelLabel } = scoreSignals(readings);

  const result = { timestamp, readings, scores, alerts, peakZ, coveragePct, levelLabel, fetched, errors };

  // ── STORE IN REDIS ──────────────────────────────────────────
  try {
    await redis.set("latest", JSON.stringify(result));
    await redis.set(`history:${timestamp}`, JSON.stringify(result), { ex: 60 * 60 * 48 });
    console.log(`[DC Sentinel] Stored. Peak: ${peakZ}σ Level: ${levelLabel} Coverage: ${coveragePct}%`);
  } catch (e) {
    console.error(`[DC Sentinel] Redis error: ${e.message}`);
    errors.redis = e.message;
  }

  // ── SEND EMAIL ALERT IF ELEVATED ────────────────────────────
  if (alerts.length > 0 && peakZ >= 2 && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
    try {
      const alertLines = alerts.map(a => `<tr><td style="padding:6px 12px;color:#94a3b8;font-family:monospace;font-size:12px;">${a.signal.replace(/_/g," ").toUpperCase()}</td><td style="padding:6px 12px;color:#f1f5f9;font-family:monospace;font-size:12px;">${a.value}</td><td style="padding:6px 12px;font-family:monospace;font-size:12px;color:${peakZ>=3?"#f87171":peakZ>=2?"#fb923c":"#facc15"};">${a.label} (${a.z>=0?"+":""}${a.z}σ)</td></tr>`).join("");
      const levelColor = peakZ >= 3 ? "#f87171" : peakZ >= 2 ? "#fb923c" : "#facc15";
      const formattedTime = new Date(timestamp).toLocaleString("en-US", { timeZone:"America/New_York", weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", timeZoneName:"short" });

      const html = `<!DOCTYPE html><html><body style="background:#060610;padding:20px;font-family:'Courier New',monospace;"><div style="max-width:600px;margin:0 auto;background:#0a0a14;border:1px solid ${levelColor}44;border-radius:8px;overflow:hidden;"><div style="background:#0d0d22;padding:20px 24px;border-bottom:1px solid #1e293b;"><span style="font-size:22px;">🔭</span> <span style="font-size:18px;font-weight:900;letter-spacing:0.2em;color:#f1f5f9;">DC SENTINEL</span></div><div style="padding:20px 24px;background:${levelColor}11;border-bottom:1px solid ${levelColor}33;"><div style="font-size:28px;font-weight:900;color:${levelColor};">${levelLabel}</div><div style="font-size:12px;color:${levelColor};opacity:0.7;">Peak ${peakZ.toFixed(1)}σ · Coverage ${coveragePct}% · ${formattedTime}</div></div><div style="padding:20px 24px;"><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="padding:6px 12px;text-align:left;font-size:9px;color:#475569;">SIGNAL</th><th style="padding:6px 12px;text-align:left;font-size:9px;color:#475569;">VALUE</th><th style="padding:6px 12px;text-align:left;font-size:9px;color:#475569;">STATUS</th></tr></thead><tbody>${alertLines}</tbody></table></div><div style="padding:16px 24px;text-align:center;border-top:1px solid #1e293b;"><a href="${process.env.APP_URL||"https://dc-sentinel.vercel.app"}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-family:monospace;font-size:11px;font-weight:700;">OPEN DC SENTINEL →</a></div></div></body></html>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: "DC Sentinel <onboarding@resend.dev>", to: [process.env.ALERT_EMAIL], subject: `🔭 DC Sentinel ${levelLabel} — ${peakZ.toFixed(1)}σ detected`, html }),
      });
      console.log(`[DC Sentinel] Alert email sent to ${process.env.ALERT_EMAIL}`);
    } catch (e) {
      console.error(`[DC Sentinel] Email error: ${e.message}`);
    }
  }

  console.log(`[DC Sentinel] Done. ${fetched.length} sources, ${alerts.length} alerts.`);
  return res.status(200).json({ ok: true, ...result });
};
