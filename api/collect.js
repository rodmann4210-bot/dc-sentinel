const redis = require("./lib/redis");
const { fetchAircraft, fetchFederalRegister, fetchTFRs, fetchHotelRate, fetchCarRental, scoreSignals } = require("./lib/signals");

module.exports = async function handler(req, res) {
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const hasSecret = req.query.token === process.env.CRON_SECRET;
  if (!isVercelCron && !hasSecret) return res.status(401).json({ error: "Unauthorized" });

  const timestamp = new Date().toISOString();
  const readings = {}, errors = {}, fetched = [];

  const [aircraft, fedReg, tfrs, hotel, car] = await Promise.allSettled([
    fetchAircraft(process.env.OPENSKY_USER, process.env.OPENSKY_PASS),
    fetchFederalRegister(),
    fetchTFRs(process.env.ANTHROPIC_API_KEY),
    fetchHotelRate(process.env.ANTHROPIC_API_KEY),
    fetchCarRental(process.env.ANTHROPIC_API_KEY),
  ]);

  if (aircraft.status === "fulfilled" && aircraft.value.success) { readings.air_total = aircraft.value.total; readings.air_mil = aircraft.value.military; fetched.push("opensky"); }
  else errors.opensky = aircraft.value?.error || "failed";

  if (fedReg.status === "fulfilled" && fedReg.value.success) { readings.fed_reg = fedReg.value.count; fetched.push("fed_reg"); }
  else errors.fed_reg = fedReg.value?.error || "failed";

  if (tfrs.status === "fulfilled" && tfrs.value.success) { readings.tfr_count = tfrs.value.count; fetched.push("tfrs"); }
  else errors.tfrs = tfrs.value?.error || "failed";

  if (hotel.status === "fulfilled" && hotel.value.success && hotel.value.rate != null) { readings.hotel_rate = hotel.value.rate; fetched.push("hotel"); }
  else errors.hotel = hotel.value?.error || "not found";

  if (car.status === "fulfilled" && car.value.success && car.value.rate != null) { readings.car_rental = car.value.rate; fetched.push("car"); }
  else errors.car = car.value?.error || "not found";

  const { scores, alerts, peakZ, coveragePct, levelLabel } = scoreSignals(readings);
  const result = { timestamp, readings, scores, alerts, peakZ, coveragePct, levelLabel, fetched, errors };

  try {
    await redis.set("latest", JSON.stringify(result));
    await redis.set(`history:${timestamp}`, JSON.stringify(result), { ex: 172800 });
  } catch (e) { errors.redis = e.message; }

  if (alerts.length > 0 && peakZ >= 2 && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
    try {
      const levelColor = peakZ >= 3 ? "#f87171" : "#fb923c";
      const rows = alerts.map(a => `<tr><td style="padding:6px 12px;color:#94a3b8;font-family:monospace">${a.signal.replace(/_/g," ").toUpperCase()}</td><td style="padding:6px 12px;color:${levelColor};font-family:monospace">${a.label} (${a.z>=0?"+":""}${a.z}σ)</td></tr>`).join("");
      const html = `<div style="background:#060610;padding:20px;font-family:monospace"><div style="max-width:600px;margin:0 auto;background:#0a0a14;border:1px solid ${levelColor}44;border-radius:8px;padding:24px"><h2 style="color:${levelColor};margin:0 0 8px">🔭 DC SENTINEL — ${levelLabel}</h2><p style="color:#64748b;margin:0 0 16px">Peak ${peakZ.toFixed(1)}σ · Coverage ${coveragePct}%</p><table style="width:100%">${rows}</table><br><a href="${process.env.APP_URL||"https://dc-sentinel.vercel.app"}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-family:monospace">OPEN DC SENTINEL →</a></div></div>`;
      await fetch("https://api.resend.com/emails", { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.RESEND_API_KEY}`}, body:JSON.stringify({ from:"DC Sentinel <onboarding@resend.dev>", to:[process.env.ALERT_EMAIL], subject:`🔭 DC Sentinel ${levelLabel} — ${peakZ.toFixed(1)}σ`, html }) });
    } catch (e) { errors.email = e.message; }
  }

  return res.status(200).json({ ok: true, ...result });
};
