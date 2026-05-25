// lib/notify.js — Email, SMS, and Web Push notifications

// ── EMAIL via Gmail SMTP ──────────────────────────────────────
async function sendEmail({ to, subject, body, gmailUser, gmailAppPassword }) {
  try {
    // Using Gmail SMTP directly via fetch to avoid nodemailer bundle size
    // For Vercel, we use the fetch-based approach with Gmail API
    const message = [
      `From: DC Sentinel <${gmailUser}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      body,
    ].join("\r\n");

    const encoded = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gmailAppPassword}`,
      },
      body: JSON.stringify({ raw: encoded }),
    });

    return { success: res.ok };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── EMAIL via Resend (simpler, free tier 3000/month) ──────────
async function sendEmailResend({ to, subject, html, apiKey }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "DC Sentinel <alerts@dcsentinel.app>",
        to: [to],
        subject,
        html,
      }),
    });
    const data = await res.json();
    return { success: res.ok, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── SMS via Twilio ────────────────────────────────────────────
async function sendSMS({ to, body, accountSid, authToken, fromNumber }) {
  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: body }).toString(),
      }
    );
    const data = await res.json();
    return { success: res.ok, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── WEB PUSH ──────────────────────────────────────────────────
async function sendWebPush({ subscription, payload, vapidPublicKey, vapidPrivateKey }) {
  try {
    // Web push requires VAPID signing — simplified implementation
    const webpush = await import("web-push");
    webpush.default.setVapidDetails(
      "mailto:alerts@dcsentinel.app",
      vapidPublicKey,
      vapidPrivateKey
    );
    await webpush.default.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── BUILD ALERT EMAIL HTML ────────────────────────────────────
function buildAlertEmail({ alerts, peakZ, coveragePct, timestamp }) {
  const levelColor = peakZ >= 3 ? "#f87171" : peakZ >= 2 ? "#fb923c" : "#facc15";
  const levelLabel = peakZ >= 3 ? "CRITICAL" : peakZ >= 2 ? "ELEVATED" : "WATCH";

  const alertRows = alerts.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-family:monospace;font-size:12px;">${a.signal.replace(/_/g," ").toUpperCase()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-family:monospace;font-size:12px;">${a.value}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;font-size:12px;">
        <span style="color:${levelColor};font-weight:bold;">${a.label} (${a.z >= 0 ? "+" : ""}${a.z}σ)</span>
      </td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="background:#060610;margin:0;padding:20px;font-family:'Courier New',monospace;">
  <div style="max-width:600px;margin:0 auto;background:#0a0a14;border:1px solid ${levelColor}44;border-radius:8px;overflow:hidden;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0d0d22,#060610);padding:20px 24px;border-bottom:1px solid #1e293b;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">🔭</span>
        <div>
          <div style="font-size:18px;font-weight:900;letter-spacing:0.2em;color:#f1f5f9;">DC SENTINEL</div>
          <div style="font-size:9px;color:#334155;letter-spacing:0.3em;">AUTONOMOUS OSINT ALERT</div>
        </div>
      </div>
    </div>

    <!-- Alert Level -->
    <div style="padding:20px 24px;background:${levelColor}11;border-bottom:1px solid ${levelColor}33;">
      <div style="font-size:9px;color:#475569;letter-spacing:0.2em;margin-bottom:4px;">ALERT LEVEL</div>
      <div style="font-size:28px;font-weight:900;color:${levelColor};letter-spacing:0.15em;">${levelLabel}</div>
      <div style="font-size:12px;color:${levelColor};opacity:0.7;margin-top:4px;">Peak signal: ${peakZ.toFixed(1)}σ above baseline · Coverage: ${coveragePct}%</div>
      <div style="font-size:10px;color:#334155;margin-top:4px;">${timestamp}</div>
    </div>

    <!-- Signals -->
    <div style="padding:20px 24px;">
      <div style="font-size:9px;color:#334155;letter-spacing:0.2em;margin-bottom:12px;">ELEVATED SIGNALS</div>
      <table style="width:100%;border-collapse:collapse;background:#0f0f1a;border-radius:6px;overflow:hidden;">
        <thead>
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:9px;color:#475569;letter-spacing:0.15em;border-bottom:1px solid #1e293b;">SIGNAL</th>
            <th style="padding:8px 12px;text-align:left;font-size:9px;color:#475569;letter-spacing:0.15em;border-bottom:1px solid #1e293b;">VALUE</th>
            <th style="padding:8px 12px;text-align:left;font-size:9px;color:#475569;letter-spacing:0.15em;border-bottom:1px solid #1e293b;">STATUS</th>
          </tr>
        </thead>
        <tbody>${alertRows}</tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="padding:16px 24px;border-top:1px solid #1e293b;text-align:center;">
      <a href="${process.env.APP_URL || "https://dc-sentinel.vercel.app"}" 
         style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-family:monospace;font-size:11px;font-weight:700;letter-spacing:0.12em;">
        OPEN DC SENTINEL →
      </a>
    </div>

    <div style="padding:12px 24px;font-size:9px;color:#1e293b;text-align:center;letter-spacing:0.1em;">
      DC SENTINEL · ALL SOURCES PUBLICLY AVAILABLE · OSINT RESEARCH TOOL
    </div>
  </div>
</body>
</html>`;
}

// ── BUILD ALERT SMS TEXT ──────────────────────────────────────
function buildAlertSMS({ alerts, peakZ, levelLabel }) {
  const signalList = alerts.map(a => `${a.signal.replace(/_/g," ")}: ${a.z >= 0 ? "+" : ""}${a.z}σ`).join(", ");
  return `🔭 DC SENTINEL ALERT\nLevel: ${levelLabel} (${peakZ.toFixed(1)}σ)\nSignals: ${signalList}\nOpen app to run analysis.`;
}

module.exports = {
  sendEmailResend,
  sendSMS,
  sendWebPush,
  buildAlertEmail,
  buildAlertSMS,
};
