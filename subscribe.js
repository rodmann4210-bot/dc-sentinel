// api/collect.js — Runs every 30 minutes via Vercel cron
// Fetches all signals, scores them, stores results, sends alerts if needed

import {
  fetchAircraft,
  fetchFederalRegister,
  fetchTFRs,
  fetchHotelRate,
  fetchCarRental,
  scoreSignals,
} from "../lib/signals.js";

import {
  sendEmailResend,
  sendSMS,
  sendWebPush,
  buildAlertEmail,
  buildAlertSMS,
} from "../lib/notify.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // Security: only allow Vercel cron calls or requests with secret
  const authHeader = req.headers.authorization;
  if (
    req.method !== "GET" ||
    (authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      req.headers["x-vercel-cron"] !== "1")
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const timestamp = new Date().toISOString();
  console.log(`[DC Sentinel] Collection run started: ${timestamp}`);

  const results = {
    timestamp,
    readings: {},
    errors: {},
    fetched: [],
  };

  // ── FETCH ALL SIGNALS IN PARALLEL ──────────────────────────
  const [aircraft, fedReg, tfrs, hotel, car] = await Promise.allSettled([
    fetchAircraft(process.env.OPENSKY_USER, process.env.OPENSKY_PASS),
    fetchFederalRegister(),
    fetchTFRs(process.env.ANTHROPIC_API_KEY),
    fetchHotelRate(process.env.ANTHROPIC_API_KEY),
    fetchCarRental(process.env.ANTHROPIC_API_KEY),
  ]);

  // Process aircraft
  if (aircraft.status === "fulfilled" && aircraft.value.success) {
    results.readings.air_total  = aircraft.value.total;
    results.readings.air_mil    = aircraft.value.military;
    results.milCallsigns        = aircraft.value.milCallsigns;
    results.fetched.push("opensky");
  } else {
    results.errors.opensky = aircraft.value?.error || aircraft.reason?.message;
  }

  // Process Federal Register
  if (fedReg.status === "fulfilled" && fedReg.value.success) {
    results.readings.fed_reg  = fedReg.value.count;
    results.fedRegItems       = fedReg.value.items;
    results.fetched.push("fed_reg");
  } else {
    results.errors.fed_reg = fedReg.value?.error || fedReg.reason?.message;
  }

  // Process TFRs
  if (tfrs.status === "fulfilled" && tfrs.value.success) {
    results.readings.tfr_count = tfrs.value.count;
    results.tfrDetails         = tfrs.value.details;
    results.fetched.push("tfrs");
  } else {
    results.errors.tfrs = tfrs.value?.error || tfrs.reason?.message;
  }

  // Process hotel
  if (hotel.status === "fulfilled" && hotel.value.success && hotel.value.rate) {
    results.readings.hotel_rate = hotel.value.rate;
    results.hotelNote           = hotel.value.note;
    results.fetched.push("hotel");
  } else {
    results.errors.hotel = hotel.value?.error || hotel.reason?.message;
  }

  // Process car rental
  if (car.status === "fulfilled" && car.value.success && car.value.rate) {
    results.readings.car_rental = car.value.rate;
    results.carNote             = car.value.note;
    results.fetched.push("car");
  } else {
    results.errors.car = car.value?.error || car.reason?.message;
  }

  // ── SCORE SIGNALS ───────────────────────────────────────────
  const { scores, alerts, peakZ, coveragePct } = scoreSignals(results.readings);
  results.scores      = scores;
  results.alerts      = alerts;
  results.peakZ       = peakZ;
  results.coveragePct = coveragePct;

  const levelLabel = peakZ >= 3 ? "CRITICAL" : peakZ >= 2 ? "ELEVATED" : peakZ >= 1 ? "WATCH" : "NORMAL";
  results.levelLabel = levelLabel;

  // ── STORE IN KV DATABASE ────────────────────────────────────
  try {
    const { kv } = await import("@vercel/kv");

    // Store latest reading
    await kv.set("latest", JSON.stringify(results));

    // Store in history (keep last 48 readings = 24 hours at 30min intervals)
    const historyKey = `history:${timestamp}`;
    await kv.set(historyKey, JSON.stringify(results), { ex: 60 * 60 * 48 });

    // Update rolling history list
    const historyList = JSON.parse(await kv.get("history_keys") || "[]");
    historyList.unshift(historyKey);
    if (historyList.length > 48) historyList.pop();
    await kv.set("history_keys", JSON.stringify(historyList));

    console.log(`[DC Sentinel] Stored results. Peak: ${peakZ}σ, Coverage: ${coveragePct}%`);
  } catch (e) {
    console.error(`[DC Sentinel] KV storage error: ${e.message}`);
    results.errors.storage = e.message;
  }

  // ── SEND ALERTS IF THRESHOLD CROSSED ───────────────────────
  if (alerts.length > 0 && peakZ >= 2) {
    const alertPayload = { alerts, peakZ, levelLabel, coveragePct, timestamp };

    const notifyPromises = [];
    const formattedTime = new Date(timestamp).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });

    // Email alert
    if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
      notifyPromises.push(
        sendEmailResend({
          to: process.env.ALERT_EMAIL,
          subject: `🔭 DC Sentinel ${levelLabel} — ${peakZ.toFixed(1)}σ peak detected`,
          html: buildAlertEmail({
            ...alertPayload,
            timestamp: formattedTime,
          }),
          apiKey: process.env.RESEND_API_KEY,
        })
      );
    }

    // SMS alert
    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER &&
      process.env.ALERT_PHONE
    ) {
      notifyPromises.push(
        sendSMS({
          to: process.env.ALERT_PHONE,
          body: buildAlertSMS({ alerts, peakZ, levelLabel }),
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          fromNumber: process.env.TWILIO_FROM_NUMBER,
        })
      );
    }

    // Web push (if subscription stored)
    try {
      const { kv } = await import("@vercel/kv");
      const pushSub = await kv.get("push_subscription");
      if (
        pushSub &&
        process.env.VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY
      ) {
        notifyPromises.push(
          sendWebPush({
            subscription: JSON.parse(pushSub),
            payload: {
              title: `DC Sentinel ${levelLabel}`,
              body: `Peak ${peakZ.toFixed(1)}σ — ${alerts.length} signal${alerts.length > 1 ? "s" : ""} elevated`,
              icon: "/icon.png",
              badge: "/badge.png",
              url: process.env.APP_URL || "/",
            },
            vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
            vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
          })
        );
      }
    } catch (e) {
      console.error(`[DC Sentinel] Push subscription error: ${e.message}`);
    }

    const notifyResults = await Promise.allSettled(notifyPromises);
    results.notifications = notifyResults.map(r =>
      r.status === "fulfilled" ? r.value : { success: false, error: r.reason?.message }
    );
    console.log(`[DC Sentinel] Sent ${notifyPromises.length} alert notification(s)`);
  }

  console.log(`[DC Sentinel] Collection complete. ${results.fetched.length} sources fetched, ${alerts.length} alerts.`);
  return res.status(200).json({ ok: true, ...results });
}
