/* ==================================================================
 * sentinelScoring.js  —  DC Sentinel scoring (no-modules version)
 * Loads with a plain <script src="/sentinelScoring.js"></script>.
 * Everything hangs off a global called SENTINEL, e.g.:
 *     SENTINEL.toLogRow(pull)
 *     SENTINEL.plugInBlock(pull)
 *     SENTINEL.scorePull(pull)
 * ================================================================== */
(function (root) {

  // Baseline mean +/- sd per continuous metric
  var BASE = {
    aircraft: { mean: 62,  sd: 18,  label: "Aircraft" },
    mil:      { mean: 2.1, sd: 1.4, label: "Military/VIP" },
    hotel:    { mean: 425, sd: 105, label: "Hotel" },
    car:      { mean: 68,  sd: 22,  label: "Car" },
    tfrCount: { mean: 4.2, sd: 2.0, label: "TFR count (legacy)" }
  };

  // TFR scored by STRUCTURE, not ring count. Tune here anytime.
  var TFR_TYPES = {
    none:        { label: "None / cleared",                    intensity: 8,   flag: "NORMAL"   },
    golf:        { label: "Golf (routine POTUS)",              intensity: 30,  flag: "NORMAL"   },
    event:       { label: "Event ring (South Lawn / stadium)", intensity: 55,  flag: "ELEVATED" },
    vip3:        { label: "VIP 3 NM",                          intensity: 62,  flag: "ELEVATED" },
    pres:        { label: "Presidential 30/10 NM",             intensity: 85,  flag: "ELEVATED" },
    preslayered: { label: "Presidential + layered (arrival)",  intensity: 100, flag: "CRITICAL" }
  };
  var TFR_ORDER = ["none", "golf", "event", "vip3", "pres", "preslayered"];

  function zscore(x, key)   { return (x - BASE[key].mean) / BASE[key].sd; }
  function intensity(z)     { return Math.max(0, Math.min(100, 50 + z * 16.667)); }
  function flagFromZ(z)     { var a = Math.abs(z); return a >= 2 ? "CRITICAL" : a >= 1 ? "ELEVATED" : "NORMAL"; }
  function tfrIntensity(t)  { return (TFR_TYPES[t] || TFR_TYPES.none).intensity; }
  function tfrFlag(t)       { return (TFR_TYPES[t] || TFR_TYPES.none).flag; }

  var RANK = { NORMAL: 0, ELEVATED: 1, CRITICAL: 2 };

  function scorePull(p) {
    function cont(x, k) { var z = zscore(x, k); return { value: x, z: z, intensity: intensity(z), flag: flagFromZ(z) }; }
    var parts = {
      aircraft: cont(p.aircraft, "aircraft"),
      mil:      cont(p.mil, "mil"),
      tfr:      { value: p.tfrType, intensity: tfrIntensity(p.tfrType), flag: tfrFlag(p.tfrType) },
      hotel:    cont(p.hotel, "hotel"),
      car:      cont(p.car, "car")
    };
    var overall = "NORMAL";
    Object.keys(parts).forEach(function (k) { if (RANK[parts[k].flag] > RANK[overall]) overall = parts[k].flag; });
    return { parts: parts, overall: overall };
  }

  function sig(z) { return (z >= 0 ? "+" : "") + z.toFixed(1) + "\u03c3"; }

  function plugInBlock(p) {
    var s = scorePull(p), x = s.parts;
    return [
      "\u2708\ufe0f Aircraft: " + p.aircraft + " \u2014 " + x.aircraft.flag + " (" + sig(x.aircraft.z) + ")",
      "\ud83c\udf96\ufe0f Military/VIP: " + p.mil + " \u2014 " + x.mil.flag + " (" + sig(x.mil.z) + ")",
      "\ud83d\ude81 TFRs: " + (p.tfrCount != null ? p.tfrCount : "?") + " \u2014 " + x.tfr.flag + " (" + ((TFR_TYPES[p.tfrType] || {}).label || "?") + ")",
      "\ud83c\udfe8 Hotel: $" + p.hotel + "/night \u2014 " + x.hotel.flag + " (" + sig(x.hotel.z) + ")",
      "\ud83d\ude97 Car rental: $" + p.car + "/day \u2014 " + x.car.flag + " (" + sig(x.car.z) + ")"
    ].join("\n");
  }

  // One CSV line matching sentinel_daily_log.csv column order; note is quoted.
  function toLogRow(p) {
    var s = scorePull(p), x = s.parts;
    function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    return [
      p.date, p.time, p.aircraft, p.mil, (p.tfrCount != null ? p.tfrCount : ""), p.tfrType,
      p.hotel, p.car,
      sig(x.aircraft.z), sig(x.mil.z), Math.round(x.tfr.intensity), sig(x.hotel.z), sig(x.car.z),
      s.overall, q(p.note || "")
    ].join(",");
  }

  root.SENTINEL = {
    BASE: BASE, TFR_TYPES: TFR_TYPES, TFR_ORDER: TFR_ORDER,
    zscore: zscore, intensity: intensity, flagFromZ: flagFromZ,
    tfrIntensity: tfrIntensity, tfrFlag: tfrFlag,
    scorePull: scorePull, plugInBlock: plugInBlock, toLogRow: toLogRow
  };

})(window);
