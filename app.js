(() => {
  // src/engine/bs.js
  var TRADING_YEAR = 252;
  var npdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  function ncdf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * ax);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return 0.5 * (1 + sign * y);
  }
  function d1d2(p) {
    const r = p.r ?? 0.04, q = p.q ?? 0;
    const v = Math.max(p.v, 1e-6), T = Math.max(p.T, 1e-6);
    const d1 = (Math.log(p.S / p.K) + (r - q + 0.5 * v * v) * T) / (v * Math.sqrt(T));
    return { d1, d2: d1 - v * Math.sqrt(T), r, q, v, T };
  }
  function price(p) {
    if (p.T <= 0) {
      return p.type === "call" ? Math.max(0, p.S - p.K) : Math.max(0, p.K - p.S);
    }
    const { d1, d2, r, q, T } = d1d2(p);
    if (p.type === "call") {
      return p.S * Math.exp(-q * T) * ncdf(d1) - p.K * Math.exp(-r * T) * ncdf(d2);
    }
    return p.K * Math.exp(-r * T) * ncdf(-d2) - p.S * Math.exp(-q * T) * ncdf(-d1);
  }
  function greeks(p) {
    if (p.T <= 0) {
      const itm = p.type === "call" ? p.S > p.K : p.S < p.K;
      return { price: price(p), delta: itm ? p.type === "call" ? 1 : -1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
    const { d1, d2, r, q, v, T } = d1d2(p);
    const eqT = Math.exp(-q * T), erT = Math.exp(-r * T);
    const pdf1 = npdf(d1);
    const delta = p.type === "call" ? eqT * ncdf(d1) : eqT * (ncdf(d1) - 1);
    const gamma = eqT * pdf1 / (p.S * v * Math.sqrt(T));
    const vega = p.S * eqT * pdf1 * Math.sqrt(T) / 100;
    const thetaYr = p.type === "call" ? -p.S * eqT * pdf1 * v / (2 * Math.sqrt(T)) - r * p.K * erT * ncdf(d2) + q * p.S * eqT * ncdf(d1) : -p.S * eqT * pdf1 * v / (2 * Math.sqrt(T)) + r * p.K * erT * ncdf(-d2) - q * p.S * eqT * ncdf(-d1);
    const rho = p.type === "call" ? p.K * T * erT * ncdf(d2) / 100 : -p.K * T * erT * ncdf(-d2) / 100;
    return { price: price(p), delta, gamma, theta: thetaYr / TRADING_YEAR, vega, rho };
  }

  // src/engine/rng.js
  function createRng(seed) {
    let a = seed >>> 0;
    function next() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    function gauss() {
      let u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    return {
      next,
      gauss,
      int: (n) => Math.floor(next() * n),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      seed: seed >>> 0
    };
  }

  // src/engine/scenarios.js
  var SCENARIOS = [
    {
      id: "crash-week",
      name: "Crash Week",
      version: 1,
      description: "Day 2 panic regime shift with a -4% index shock and aftershocks on Days 3\u20134.",
      seed: 10101,
      days: 5,
      timeline: [
        { day: 1, action: "setRegime", args: ["calm"] },
        { day: 1, action: "headline", args: ["\u{1F324}\uFE0F", "Markets open steady on low realized volatility."] },
        { day: 2, action: "setRegime", args: ["panic"] },
        { day: 2, action: "jump", args: ["FAM500", -0.04] },
        { day: 2, action: "headline", args: ["\u{1F6A8}", "Flash selloff: FAM500 gaps down 4% as correlations spike across the board."] },
        { day: 3, action: "setRegime", args: ["panic"] },
        { day: 3, action: "jump", args: ["FAM500", -0.025] },
        { day: 3, action: "headline", args: ["\u{1F4C9}", "Aftershock Wave 1: forced margin liquidation pressures index lower."] },
        { day: 4, action: "setRegime", args: ["panic"] },
        { day: 4, action: "jump", args: ["FAM500", -0.018] },
        { day: 4, action: "headline", args: ["\u26A0\uFE0F", "Aftershock Wave 2: front-month implied volatility remains heavily inverted."] },
        { day: 5, action: "setRegime", args: ["choppy"] },
        { day: 5, action: "headline", args: ["\u{1F30A}", "Selling pressure abates into Friday, though wide spreads persist."] }
      ]
    },
    {
      id: "earnings-crush",
      name: "Earnings Vol Crush",
      version: 1,
      description: "RCKT reports earnings on Day 6 after an IV run-up; a tiny move crushes inflated front-week premium.",
      seed: 20202,
      days: 7,
      timeline: [
        { day: 1, action: "setRegime", args: ["calm"] },
        { day: 1, action: "headline", args: ["\u{1F52D}", "Traders bid up RCKT front-week options ahead of Day 6 earnings release."] },
        { day: 4, action: "headline", args: ["\u{1F525}", "RCKT front-expiry implied volatility swells above back-month as earnings near."] },
        { day: 6, action: "forceEarnings", args: ["RCKT", 1] },
        { day: 6, action: "headline", args: ["\u{1F9CA}", "The IV trap springs: RCKT barely budges on in-line numbers, crushing option buyers."] }
      ]
    },
    {
      id: "pin-risk-friday",
      name: "Pin Risk Friday",
      version: 1,
      description: "LMND gravitates toward a weekly strike multiple into Day 5 expiration, showcasing gamma & pin risk.",
      seed: 30303,
      days: 5,
      timeline: [
        { day: 1, action: "setRegime", args: ["calm"] },
        { day: 1, action: "headline", args: ["\u{1F34B}", "Heavy open interest builds at LMND weekly strikes ahead of Friday expiration."] },
        { day: 2, action: "jump", args: ["LMND", 8e-3] },
        { day: 3, action: "jump", args: ["LMND", -6e-3] },
        { day: 4, action: "jump", args: ["LMND", 4e-3, true] },
        { day: 4, action: "headline", args: ["\u{1F9F2}", "Dealer delta-hedging pulls LMND tightly toward its nearest weekly strike."] },
        { day: 5, action: "jump", args: ["LMND", 1e-3, true] },
        { day: 5, action: "headline", args: ["\u{1F4CC}", "Pin risk alert: LMND sits right on the strike heading into Friday settlement."] }
      ]
    },
    {
      id: "slow-bleed",
      name: "Slow Bleed",
      version: 1,
      description: "Ten calm sessions with a mild downward drift where nothing dramatic happens and theta steadily wins.",
      seed: 40404,
      days: 10,
      timeline: [
        { day: 1, action: "setRegime", args: ["calm"] },
        { day: 1, action: "headline", args: ["\u23F3", "Quiet tape: low volume and tight ranges set the stage for steady time decay."] },
        { day: 2, action: "setRegime", args: ["calm"] },
        { day: 2, action: "jump", args: ["FAM500", -3e-3] },
        { day: 3, action: "setRegime", args: ["calm"] },
        { day: 3, action: "jump", args: ["FAM500", -2e-3] },
        { day: 4, action: "setRegime", args: ["calm"] },
        { day: 4, action: "jump", args: ["FAM500", -3e-3] },
        { day: 5, action: "setRegime", args: ["calm"] },
        { day: 5, action: "jump", args: ["FAM500", -2e-3] },
        { day: 5, action: "headline", args: ["\u{1F4C9}", "Mid-point check: stocks drift slightly lower while long option premium erodes."] },
        { day: 6, action: "setRegime", args: ["calm"] },
        { day: 6, action: "jump", args: ["FAM500", -3e-3] },
        { day: 7, action: "setRegime", args: ["calm"] },
        { day: 7, action: "jump", args: ["FAM500", -2e-3] },
        { day: 8, action: "setRegime", args: ["calm"] },
        { day: 8, action: "jump", args: ["FAM500", -3e-3] },
        { day: 9, action: "setRegime", args: ["calm"] },
        { day: 9, action: "jump", args: ["FAM500", -2e-3] },
        { day: 10, action: "setRegime", args: ["calm"] },
        { day: 10, action: "jump", args: ["FAM500", -2e-3] },
        { day: 10, action: "headline", args: ["\u{1F570}\uFE0F", "Day 10: realized volatility stayed below implied \u2014 theta decay dominated returns."] }
      ]
    },
    {
      id: "short-vol-blowup",
      name: "Short-Vol Blowup",
      version: 1,
      description: "Four quiet days lull premium sellers before a sudden Day 5 panic shift and a -6% index shock.",
      seed: 50505,
      days: 5,
      timeline: [
        { day: 1, action: "setRegime", args: ["calm"] },
        { day: 1, action: "headline", args: ["\u{1F60C}", "Day 1: tranquil market rewards short-premium carry strategies."] },
        { day: 2, action: "setRegime", args: ["calm"] },
        { day: 3, action: "setRegime", args: ["calm"] },
        { day: 4, action: "setRegime", args: ["calm"] },
        { day: 4, action: "headline", args: ["\u{1F4A4}", "Four straight calm sessions compress implied vol to cycle lows."] },
        { day: 5, action: "setRegime", args: ["panic"] },
        { day: 5, action: "jump", args: ["FAM500", -0.06] },
        { day: 5, action: "headline", args: ["\u{1F4A5}", "Vol blowup: sudden panic regime and -6% index shock wipe out unhedged short vol."] }
      ]
    }
  ];
  function getScenario(id) {
    if (!id) return null;
    return SCENARIOS.find((s2) => s2.id === id) || null;
  }

  // src/engine/sim.js
  var DAY_MIN = 390;
  var STEP_MIN = 5;
  var TRADING_YEAR2 = 252;
  var YR_MIN = DAY_MIN * TRADING_YEAR2;
  var REGIME_MATRIX = {
    calm: { calm: 0.95, choppy: 0.045, panic: 5e-3 },
    choppy: { calm: 0.08, choppy: 0.89, panic: 0.03 },
    panic: { calm: 0, choppy: 0.15, panic: 0.85 }
  };
  var REGIME_PARAMS = {
    calm: { volTargetMult: 1, jumpMult: 1, corr: 0.3, driftAdj: 0 },
    choppy: { volTargetMult: 1.5, jumpMult: 2, corr: 0.55, driftAdj: -0.02 },
    panic: { volTargetMult: 2.5, jumpMult: 6, corr: 0.85, driftAdj: -0.25 }
  };
  var REGIME_HEADLINES = {
    calm: ["\u{1F324}\uFE0F", "Volatility regime shift: markets calm down"],
    choppy: ["\u{1F30A}", "Volatility regime shift: markets turn choppy"],
    panic: ["\u26A0\uFE0F", "Volatility regime shift: markets turn panicky"]
  };
  var DEFS = [
    { sym: "FAM500", name: "Academy 500 Index", emoji: "\u{1F3DB}\uFE0F", sector: "Index", S0: 500, drift: 0.07, baseVol: 0.15, beta: 0.5, skew: 0.45, earnings: false },
    { sym: "LMND", name: "Lumend Brands", emoji: "\u{1F6CD}\uFE0F", sector: "Consumer", S0: 42, drift: 0.1, baseVol: 0.42, beta: 1.1, skew: 0.25 },
    { sym: "RCKT", name: "Rocket Robotics", emoji: "\u{1F680}", sector: "Tech", S0: 182, drift: 0.14, baseVol: 0.62, beta: 1.8, skew: 0.2 },
    { sym: "BRGR", name: "Burgess Restaurant Group", emoji: "\u{1F37D}\uFE0F", sector: "Consumer", S0: 67, drift: 0.07, baseVol: 0.24, beta: 0.7, skew: 0.3 },
    { sym: "GLXY", name: "Galaxy Media", emoji: "\u{1F3AC}", sector: "Media", S0: 23.5, drift: 0.05, baseVol: 0.55, beta: 1.4, skew: 0.22 },
    { sym: "PWRS", name: "PowerSun Energy", emoji: "\u2600\uFE0F", sector: "Energy", S0: 95, drift: 0.09, baseVol: 0.38, beta: 1.2, skew: 0.28 }
  ];
  var NEWS = [
    ["{n} lands a surprise partnership", 0.02, 0.05],
    ['Analysts upgrade {n} to "Strong Buy"', 0.015, 0.035],
    ["{n} CEO interviewed on FinTV \u2014 shares tick up", 5e-3, 0.02],
    ["Supply hiccup reported at {n}", -0.045, -0.015],
    ["Analysts trim {n} price targets", -0.035, -0.012],
    ["Rumors swirl about {n} \u2014 traders unsure", -0.02, 0.02],
    ["Sector rotation lifts {s} names", 8e-3, 0.025],
    ["Profit-taking hits {s} stocks", -0.025, -8e-3]
  ];
  var strikeStep = (S2) => S2 < 25 ? 1 : S2 < 60 ? 2.5 : S2 < 120 ? 5 : S2 < 300 ? 10 : 25;
  function createMarket(opts = {}) {
    const initialScenario = getScenario(opts.saved?.scenarioId ?? opts.scenarioId);
    const initialSeed = opts.saved?.seed ?? opts.seed ?? initialScenario?.seed ?? 1234567;
    let rng = createRng(initialSeed);
    const st = {
      seed: initialSeed,
      day: 1,
      minute: 0,
      speed: 1,
      running: false,
      regime: (
        /** @type {Regime} */
        opts.saved?.regime || opts.regime || "calm"
      ),
      regimeLocked: Boolean(opts.lockRegime),
      scenarioId: (
        /** @type {string | null} */
        initialScenario ? initialScenario.id : opts.saved?.scenarioId ?? null
      ),
      scenarioVersion: (
        /** @type {number | null} */
        initialScenario ? initialScenario.version : opts.saved?.scenarioVersion ?? null
      ),
      forcedEarnings: (
        /** @type {Record<string, number>} */
        {}
      ),
      tickers: (
        /** @type {Record<string, any>} */
        {}
      ),
      events: (
        /** @type {any[]} */
        []
      ),
      listeners: (
        /** @type {Record<string, Function[]>} */
        {}
      ),
      timer: (
        /** @type {any} */
        null
      )
    };
    function mkTicker(d) {
      return {
        ...d,
        S: d.S0,
        prevClose: d.S0,
        dayOpen: d.S0,
        vol: d.baseVol,
        closes: [],
        intraday: [{ m: 0, p: d.S0 }],
        nextEarnings: d.earnings === false ? null : 12 + rng.int(14)
      };
    }
    function on(ev, cb) {
      (st.listeners[ev] = st.listeners[ev] || []).push(cb);
      return () => {
        const a = st.listeners[ev];
        const i = a.indexOf(cb);
        if (i >= 0) a.splice(i, 1);
      };
    }
    function emit(ev, data) {
      (st.listeners[ev] || []).forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(e);
        }
      });
    }
    function pushEvent(icon2, text) {
      st.events.unshift({ icon: icon2, text, day: st.day, minute: st.minute });
      if (st.events.length > 80) st.events.pop();
    }
    function setRegime(nextRegime, cfg = {}) {
      if (!REGIME_PARAMS[nextRegime]) return;
      if (typeof cfg.lock === "boolean") st.regimeLocked = cfg.lock;
      const prev = st.regime;
      st.regime = nextRegime;
      if (!cfg.silent && prev !== nextRegime) {
        const [icon2, text] = REGIME_HEADLINES[nextRegime];
        pushEvent(icon2, text);
        emit("regime", st.regime);
      }
    }
    function forceEarnings(sym, surpriseSign = 1) {
      const t = st.tickers[sym];
      if (!t) return;
      t.nextEarnings = st.day;
      st.forcedEarnings[sym] = surpriseSign === 0 ? 0 : surpriseSign < 0 ? -1 : 1;
    }
    function jump(sym, pct, pinToStrike = false) {
      const t = st.tickers[sym];
      if (!t) return;
      let effPct = Number(pct) || 0;
      if (pinToStrike) {
        const step1 = strikeStep(t.S);
        const targetStrike = Math.round(t.S / step1) * step1;
        effPct = (targetStrike - t.S) / t.S;
      }
      t.S = Math.max(0.5, t.S * (1 + effPct));
      t.vol = Math.min(1.6, t.vol * (1 + Math.abs(effPct) * 4));
      if (t.intraday && t.intraday.length) {
        t.intraday[t.intraday.length - 1].p = t.S;
      }
      if (sym === "FAM500") {
        for (const other of Object.values(st.tickers)) {
          if (other.sym === "FAM500") continue;
          const betaMove = effPct * 0.65 * (other.beta || 1);
          other.S = Math.max(0.5, other.S * (1 + betaMove));
          other.vol = Math.min(1.6, other.vol * (1 + Math.abs(betaMove) * 2.5));
          if (other.intraday && other.intraday.length) {
            other.intraday[other.intraday.length - 1].p = other.S;
          }
        }
      } else if (st.tickers.FAM500) {
        st.tickers.FAM500.S = Math.max(0.5, st.tickers.FAM500.S * (1 + effPct * 0.12));
        if (st.tickers.FAM500.intraday && st.tickers.FAM500.intraday.length) {
          st.tickers.FAM500.intraday[st.tickers.FAM500.intraday.length - 1].p = st.tickers.FAM500.S;
        }
      }
    }
    function headline(icon2, text) {
      pushEvent(icon2 || "\u{1F4F0}", text || "");
      emit("news", null);
    }
    function applyScenarioTimeline(day, minute, phase) {
      const sc = getScenario(st.scenarioId);
      if (!sc || !Array.isArray(sc.timeline)) return;
      for (const item of sc.timeline) {
        if (item.day !== day) continue;
        const itemMin = item.minute ?? 0;
        if (itemMin !== minute) continue;
        const a = item.action;
        const args = Array.isArray(item.args) ? item.args : [item.args];
        if (phase === "preOpen") {
          if (a === "setRegime") setRegime(args[0]);
          else if (a === "forceEarnings") forceEarnings(args[0], args[1]);
        } else if (phase === "postOpen") {
          if (a === "jump") jump(args[0], args[1], args[2]);
          else if (a === "headline") headline(args[0], args[1]);
        } else if (phase === "intraday") {
          if (a === "setRegime") setRegime(args[0]);
          else if (a === "forceEarnings") forceEarnings(args[0], args[1]);
          else if (a === "jump") jump(args[0], args[1], args[2]);
          else if (a === "headline") headline(args[0], args[1]);
        }
      }
    }
    function init2(saved2) {
      if (saved2 && saved2.tickers && saved2.day) {
        Object.assign(st, {
          seed: saved2.seed ?? st.seed,
          day: saved2.day,
          minute: saved2.minute || 0,
          speed: saved2.speed || 1,
          regime: saved2.regime || "calm",
          scenarioId: saved2.scenarioId ?? st.scenarioId ?? null,
          scenarioVersion: saved2.scenarioVersion ?? st.scenarioVersion ?? null
        });
        st.tickers = saved2.tickers;
        st.events = saved2.events || [];
        for (const d of DEFS) if (!st.tickers[d.sym]) st.tickers[d.sym] = mkTicker(d);
        for (const d of DEFS) {
          const t = st.tickers[d.sym];
          if (t) {
            t.name = d.name;
            t.emoji = d.emoji;
            t.sector = d.sector;
          }
        }
      } else {
        for (const d of DEFS) st.tickers[d.sym] = mkTicker(d);
        for (let day = -60; day < 0; day++) {
          for (const t of Object.values(st.tickers)) {
            const dt = 1 / TRADING_YEAR2;
            t.S *= Math.exp((t.drift - 0.5 * t.vol * t.vol) * dt + t.vol * Math.sqrt(dt) * rng.gauss());
            t.vol = Math.max(0.08, t.vol + 1.5 * (t.baseVol - t.vol) * dt + 0.4 * Math.sqrt(dt) * rng.gauss() * t.vol * 0.5);
            t.closes.push({ day, p: t.S });
          }
        }
        for (const t of Object.values(st.tickers)) {
          t.prevClose = t.S;
          t.dayOpen = t.S;
          t.intraday = [{ m: 0, p: t.S }];
        }
        const sc = getScenario(st.scenarioId);
        if (sc && Array.isArray(sc.timeline)) {
          for (const item of sc.timeline) {
            if (item.action === "forceEarnings") {
              const sym = item.args?.[0];
              if (sym && st.tickers[sym]) {
                st.tickers[sym].nextEarnings = item.day;
              }
            }
          }
        }
        pushEvent("\u{1F514}", "Welcome to the Academy Exchange. Markets are open \u2014 Day 1.");
        applyScenarioTimeline(1, 0, "preOpen");
        applyScenarioTimeline(1, 0, "postOpen");
      }
    }
    function reset(resetOpts = {}) {
      pause();
      const sc = getScenario(resetOpts.scenarioId);
      const nextSeed = resetOpts.seed ?? sc?.seed ?? st.seed ?? 1234567;
      rng = createRng(nextSeed);
      st.seed = nextSeed;
      st.day = 1;
      st.minute = 0;
      st.regime = resetOpts.regime || "calm";
      st.regimeLocked = Boolean(resetOpts.lockRegime);
      st.scenarioId = sc ? sc.id : resetOpts.scenarioId || null;
      st.scenarioVersion = sc ? sc.version : null;
      st.forcedEarnings = {};
      st.tickers = {};
      st.events = [];
      init2(null);
      emit("state", null);
      emit("tick", null);
    }
    function snapshot2() {
      return {
        seed: st.seed,
        day: st.day,
        minute: st.minute,
        speed: st.speed,
        regime: st.regime,
        scenarioId: st.scenarioId,
        scenarioVersion: st.scenarioVersion,
        tickers: st.tickers,
        events: st.events.slice(0, 60)
      };
    }
    function clockLabel() {
      const mins = 9 * 60 + 30 + st.minute;
      const h = Math.floor(mins / 60), m = mins % 60;
      const ampm = h >= 12 ? "PM" : "AM";
      const hh = (h + 11) % 12 + 1;
      return `Day ${st.day} \xB7 ${hh}:${String(m).padStart(2, "0")} ${ampm}`;
    }
    function drawNextRegime(current) {
      const row = REGIME_MATRIX[current] || REGIME_MATRIX.calm;
      const u = rng.next();
      if (u < row.calm) return "calm";
      if (u < row.calm + row.choppy) return "choppy";
      return "panic";
    }
    function stepTicker(t, mins, zM) {
      const dt = mins / YR_MIN;
      const rp = REGIME_PARAMS[st.regime] || REGIME_PARAMS.calm;
      const targetVol = t.baseVol * rp.volTargetMult;
      const zVol = rng.gauss();
      t.vol = Math.max(0.07, Math.min(
        1.6,
        t.vol + 2 * (targetVol - t.vol) * dt + 0.5 * t.vol * Math.sqrt(dt) * zVol
      ));
      let zEff;
      if (t.sym === "FAM500") {
        zEff = zM;
      } else {
        const zi = rng.gauss();
        const w = Math.max(-0.95, Math.min(0.95, (t.beta || 1) * rp.corr));
        const idio = Math.sqrt(1 - w * w);
        zEff = w * zM + idio * zi;
      }
      const effDrift = t.drift + rp.driftAdj;
      t.S *= Math.exp((effDrift - 0.5 * t.vol * t.vol) * dt + t.vol * Math.sqrt(dt) * zEff);
      t.S = Math.max(0.5, t.S);
    }
    function pickHeadlineForJump(mag) {
      const sameSign = NEWS.filter((n) => mag >= 0 ? n[1] + n[2] >= 0 : n[1] + n[2] < 0);
      const pool = sameSign.length ? sameSign : NEWS;
      let best = pool[0];
      let bestDist = Infinity;
      for (const n of pool) {
        const mid = 0.5 * (n[1] + n[2]);
        const d = Math.abs(mid - mag);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
      return best;
    }
    function maybeNews() {
      const rp = REGIME_PARAMS[st.regime] || REGIME_PARAMS.calm;
      const prob = 4e-3 * rp.jumpMult;
      const names = Object.values(st.tickers).filter((t) => t.sym !== "FAM500");
      let anyJump = false;
      for (const t of names) {
        if (rng.next() >= prob) continue;
        const up = rng.next() < 0.45;
        const u = Math.min(1 - 1e-12, rng.next());
        const rawMag = up ? -0.02 * Math.log(1 - u) : 0.035 * Math.log(1 - u);
        const mag = Math.max(-0.45, Math.min(0.6, rawMag));
        t.S = Math.max(0.5, t.S * (1 + mag));
        if (t.intraday && t.intraday.length) t.intraday[t.intraday.length - 1].p = t.S;
        t.vol = Math.min(1.6, t.vol * (1 + Math.abs(mag) * 4));
        if (st.tickers.FAM500) {
          st.tickers.FAM500.S = Math.max(0.5, st.tickers.FAM500.S * (1 + mag * 0.12));
          if (st.tickers.FAM500.intraday && st.tickers.FAM500.intraday.length) {
            st.tickers.FAM500.intraday[st.tickers.FAM500.intraday.length - 1].p = st.tickers.FAM500.S;
          }
        }
        const n = pickHeadlineForJump(mag);
        pushEvent(
          mag >= 0 ? "\u{1F4C8}" : "\u{1F4C9}",
          n[0].replace("{n}", t.name).replace("{s}", t.sector) + ` (${t.sym} ${mag >= 0 ? "+" : ""}${(mag * 100).toFixed(1)}%)`
        );
        anyJump = true;
      }
      if (anyJump) emit("news", null);
    }
    function rollDay() {
      for (const t of Object.values(st.tickers)) {
        t.closes.push({ day: st.day, p: t.S });
        if (t.closes.length > 400) t.closes.shift();
        t.prevClose = t.S;
      }
      const closingDay = st.day;
      emit("dayClose", closingDay);
      st.day++;
      st.minute = 0;
      const drawnRegime = drawNextRegime(st.regime);
      if (!st.regimeLocked) {
        setRegime(drawnRegime);
      }
      applyScenarioTimeline(st.day, 0, "preOpen");
      const rp = REGIME_PARAMS[st.regime] || REGIME_PARAMS.calm;
      const zGapM = rng.gauss();
      for (const t of Object.values(st.tickers)) {
        let zGap;
        if (t.sym === "FAM500") {
          zGap = zGapM;
        } else {
          const zGapi = rng.gauss();
          const w = Math.max(-0.95, Math.min(0.95, (t.beta || 1) * rp.corr));
          zGap = w * zGapM + Math.sqrt(1 - w * w) * zGapi;
        }
        let gap = t.vol * Math.sqrt(1 / TRADING_YEAR2) * zGap * 0.6;
        if (t.nextEarnings === st.day) {
          const forcedSign = st.forcedEarnings[t.sym];
          let surprise;
          if (forcedSign !== void 0) {
            delete st.forcedEarnings[t.sym];
            rng.next();
            surprise = (forcedSign || 1) * 8e-3;
            gap = surprise;
          } else {
            surprise = (rng.next() - 0.45) * 0.16 * (t.beta || 1);
            gap += surprise;
          }
          t.vol = Math.max(0.08, t.vol * 0.72);
          t.nextEarnings = st.day + 16 + rng.int(12);
          pushEvent("\u{1F4CA}", `${t.name} (${t.sym}) reported earnings: stock ${surprise >= 0 ? "up" : "down"} ${(Math.abs(surprise) * 100).toFixed(1)}% \u2014 implied vol crushed.`);
        }
        t.S = Math.max(0.5, t.S * (1 + gap));
        t.dayOpen = t.S;
        t.intraday = [{ m: 0, p: t.S }];
      }
      applyScenarioTimeline(st.day, 0, "postOpen");
      emit("day", st.day);
    }
    function step() {
      st.minute += STEP_MIN;
      const zM = rng.gauss();
      for (const t of Object.values(st.tickers)) {
        stepTicker(t, STEP_MIN, zM);
        t.intraday.push({ m: st.minute, p: t.S });
        if (t.intraday.length > 500) t.intraday.shift();
      }
      maybeNews();
      if (st.minute < DAY_MIN) {
        applyScenarioTimeline(st.day, st.minute, "intraday");
      }
      if (st.minute >= DAY_MIN) rollDay();
    }
    function tick() {
      for (let i = 0; i < st.speed; i++) step();
      emit("tick", null);
    }
    function start5() {
      if (st.timer) return;
      st.running = true;
      st.timer = setInterval(tick, 1e3);
      emit("state", null);
    }
    function pause() {
      clearInterval(st.timer);
      st.timer = null;
      st.running = false;
      emit("state", null);
    }
    function setSpeed(x) {
      st.speed = x;
      emit("state", null);
    }
    function advanceDay2() {
      const target = st.day;
      while (st.day === target) step();
      emit("tick", null);
    }
    function expiries(sym) {
      const out = [];
      let d = Math.ceil((st.day + 1) / 5) * 5;
      while (out.length < 8) {
        out.push({ day: d, dte: +(d - st.day - st.minute / DAY_MIN).toFixed(3), label: `Day ${d} (${Math.max(0, Math.round(d - st.day))}d)` });
        d += out.length < 4 ? 5 : 15;
      }
      return out.filter((e) => e.dte > 0);
    }
    function strikes(sym) {
      const t = st.tickers[sym], step1 = strikeStep(t.S);
      const atm = Math.round(t.S / step1) * step1;
      const out = [];
      for (let i = -7; i <= 7; i++) out.push(+(atm + i * step1).toFixed(2));
      return out.filter((k) => k > 0);
    }
    function smileIV(t, K, dte) {
      const T = Math.max(dte, 0.3) / TRADING_YEAR2;
      const m = Math.log(K / t.S) / Math.max(0.35, Math.sqrt(T * 4));
      let iv = t.vol * (1 - (t.skew || 0.25) * m + 0.45 * m * m);
      const rp = REGIME_PARAMS[st.regime] || REGIME_PARAMS.calm;
      iv *= 1 + (rp.volTargetMult - 1) * 0.5 * Math.exp(-dte / 8);
      if (t.nextEarnings && t.nextEarnings <= Math.ceil(st.day + dte) && t.nextEarnings > st.day) {
        const earnVar = 25e-4 * (t.beta || 1);
        iv = Math.sqrt(iv * iv + earnVar / Math.max(T, 1 / TRADING_YEAR2));
      }
      return Math.max(0.05, Math.min(2.5, iv));
    }
    function optQuote(sym, strike, expDay, type) {
      const t = st.tickers[sym];
      const dte = Math.max(0, expDay - st.day - st.minute / DAY_MIN);
      const T = dte / TRADING_YEAR2;
      const iv = smileIV(t, strike, dte);
      const g = greeks({ S: t.S, K: strike, T, v: iv, r: 0.04, type });
      const mid = Math.max(0.01, g.price);
      const half = Math.max(0.02, mid * 0.025) / 2;
      return {
        bid: Math.max(0.01, +(mid - half).toFixed(2)),
        ask: +(mid + half).toFixed(2),
        mid: +mid.toFixed(2),
        iv,
        dte,
        ...g
      };
    }
    function quote(sym) {
      const t = st.tickers[sym];
      return { ...t, chg: t.S - t.prevClose, chgPct: (t.S - t.prevClose) / t.prevClose };
    }
    init2(opts.saved);
    return {
      start: start5,
      pause,
      setSpeed,
      advanceDay: advanceDay2,
      on,
      snapshot: snapshot2,
      clockLabel,
      expiries,
      strikes,
      optQuote,
      quote,
      smileIV,
      step,
      reset,
      setRegime,
      forceEarnings,
      jump,
      headline,
      get tickers() {
        return st.tickers;
      },
      get day() {
        return st.day;
      },
      get minute() {
        return st.minute;
      },
      get speed() {
        return st.speed;
      },
      get running() {
        return st.running;
      },
      get seed() {
        return st.seed;
      },
      get regime() {
        return st.regime;
      },
      get scenarioId() {
        return st.scenarioId;
      },
      get scenarioVersion() {
        return st.scenarioVersion;
      },
      list: () => Object.values(st.tickers)
    };
  }

  // src/state/bus.js
  var listeners = {};
  var bus = {
    on(ev, cb) {
      (listeners[ev] = listeners[ev] || []).push(cb);
      return () => {
        const a = listeners[ev];
        const i = a.indexOf(cb);
        if (i >= 0) a.splice(i, 1);
      };
    },
    emit(ev, ...args) {
      (listeners[ev] || []).forEach((cb) => {
        try {
          cb(...args);
        } catch (e) {
          console.error(e);
        }
      });
    }
  };

  // src/state/migrations.js
  var SCHEMA_VERSION = 3;
  function migrateV1toV2(v1) {
    return {
      schemaVersion: 2,
      profiles: (v1.profiles || []).map((p) => ({
        ...p,
        journal: p.journal || [],
        // v2: journal entries (Sprint 2)
        reserved: p.reserved || {}
        // v2: margin reserved per position id
      })),
      activeId: v1.activeId || null,
      market: v1.market || null
    };
  }
  function migrateV2toV3(db2) {
    for (const p of db2.profiles || []) {
      if (p.mode === "kid") {
        p.placement = p.placement || {};
        if (!p.placement.foundations) {
          p.placement.foundations = { startModule: 99, scorePct: 1, day: Date.now() };
        }
      }
      p.mode = "adult";
      if (!p.riskMode) p.riskMode = "all";
    }
    db2.schemaVersion = 3;
    return db2;
  }
  function loadDb(storage4) {
    try {
      const v2raw = storage4.getItem("oa.v2");
      if (v2raw) {
        const db2 = JSON.parse(v2raw);
        if (db2 && db2.schemaVersion === SCHEMA_VERSION) return db2;
        if (db2 && db2.schemaVersion < SCHEMA_VERSION) return upgrade(db2);
      }
      const v1raw = storage4.getItem("oa.v1");
      if (v1raw) return upgrade(migrateV1toV2(JSON.parse(v1raw)));
    } catch (e) {
      console.warn("storage load failed, starting fresh", e);
    }
    return { schemaVersion: SCHEMA_VERSION, profiles: [], activeId: null, market: null };
  }
  function upgrade(db2) {
    if ((db2.schemaVersion || 0) < 3) migrateV2toV3(db2);
    db2.schemaVersion = SCHEMA_VERSION;
    return db2;
  }

  // src/state/store.js
  var storage = typeof localStorage !== "undefined" ? localStorage : (
    /** @type {any} */
    {
      getItem: () => null,
      setItem: () => {
      }
      // test/node fallback; broker tests inject state directly
    }
  );
  var db = loadDb(storage);
  var saveT = null;
  function save() {
    const p = db.profiles.find((x) => x.id === db.activeId);
    if (p) p.lastActiveAt = Date.now();
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        storage.setItem("oa.v2", JSON.stringify(db));
      } catch (e) {
        console.warn("save failed", e);
      }
    }, 250);
  }
  function subStatus() {
    return db.subStatus || "none";
  }
  function setSubStatus(s2) {
    db.subStatus = s2;
    save();
  }
  function _dbForSync() {
    return db;
  }
  function _replaceDbFromSync(next) {
    db = next;
    save();
  }
  save();
  var LEVELS = [0, 100, 250, 500, 900, 1400, 2100, 3e3, 4200, 5800, 8e3];
  var LEVEL_NAMES = ["Rookie", "Apprentice", "Analyst", "Strategist", "Hedger", "Greek Scholar", "Vol Trader", "Risk Manager", "Market Maker", "Portfolio Pro", "Floor Legend"];
  var BADGES = [
    { id: "first-lesson", icon: "\u{1F4D6}", name: "First Page", desc: "Complete your first lesson" },
    { id: "first-quiz", icon: "\u{1F9E0}", name: "Quiz Taker", desc: "Pass your first quiz" },
    { id: "perfect-quiz", icon: "\u{1F4AF}", name: "Perfect Score", desc: "Ace a quiz with 100%" },
    { id: "first-trade", icon: "\u{1F3AB}", name: "Opening Bell", desc: "Place your first paper trade" },
    { id: "first-option", icon: "\u{1F4DC}", name: "Contract Holder", desc: "Trade your first option" },
    { id: "covered-call", icon: "\u{1F6E1}\uFE0F", name: "Covered Up", desc: "Open a covered call (stock + short call)" },
    { id: "spread", icon: "\u{1F98B}", name: "Spread Wings", desc: "Open a multi-leg spread" },
    { id: "winner", icon: "\u{1F3C6}", name: "Green Day", desc: "Close a trade for a profit" },
    { id: "survivor", icon: "\u{1F9EF}", name: "Loss Logged", desc: "Close a losing trade \u2014 and learn from it" },
    { id: "track-foundations", icon: "\u{1F9F1}", name: "Foundations Built", desc: "Finish the Foundations track" },
    { id: "track-core", icon: "\u{1F4D8}", name: "Core Graduate", desc: "Finish the Options Core track" },
    { id: "track-greeks-vol", icon: "\u{1F3DB}\uFE0F", name: "Greek Scholar", desc: "Finish Greeks & Volatility" },
    { id: "track-pro", icon: "\u{1F393}", name: "Pro Lab Alum", desc: "Finish the Pro Lab track" },
    { id: "streak-3", icon: "\u{1F525}", name: "On a Roll", desc: "Learn on 3 different days" },
    { id: "xp-1000", icon: "\u{1F48E}", name: "Scholar", desc: "Earn 1,000 XP" },
    { id: "first-mission", icon: "\u{1F9ED}", name: "Mission One", desc: "Pass your first guided mission" },
    { id: "mission-5", icon: "\u{1F5FA}\uFE0F", name: "Field Operative", desc: "Pass five missions" },
    { id: "first-journal", icon: "\u{1F4D3}", name: "Dear Journal", desc: "Complete your first trade debrief" }
  ];
  function blank(name, emoji) {
    return {
      id: "p" + Math.random().toString(36).slice(2, 8),
      name,
      emoji,
      mode: "adult",
      riskMode: "all",
      // 'all' | 'defined' — defined-risk-only safety (Settings)
      xp: 0,
      lessons: {},
      quizzes: {},
      badges: {},
      games: {},
      days: {},
      cash: 1e5,
      positions: [],
      trades: [],
      marks: [],
      journal: [],
      reserved: {},
      created: Date.now()
    };
  }
  function profiles() {
    return db.profiles;
  }
  function addProfile(name, emoji) {
    const p = blank(name, emoji);
    db.profiles.push(p);
    db.activeId = p.id;
    save();
    return p;
  }
  function setRiskMode(mode) {
    const p = active();
    if (!p) return;
    p.riskMode = mode === "defined" ? "defined" : "all";
    save();
  }
  var active = () => db.profiles.find((p) => p.id === db.activeId) || null;
  function setActive(id) {
    db.activeId = id;
    save();
  }
  function levelOf(xp) {
    let lv = 0;
    for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) lv = i;
    return { n: lv + 1, name: LEVEL_NAMES[lv], floor: LEVELS[lv], next: LEVELS[lv + 1] ?? null };
  }
  function addXP(amount, reason) {
    const p = active();
    if (!p) return;
    p.xp += amount;
    p.days[(/* @__PURE__ */ new Date()).toDateString()] = true;
    if (p.xp >= 1e3) grant("xp-1000");
    if (Object.keys(p.days).length >= 3) grant("streak-3");
    save();
    bus.emit("toast", `+${amount} XP \u2014 ${reason}`, "gain");
    bus.emit("profile");
  }
  function grant(badgeId) {
    const p = active();
    if (!p || p.badges[badgeId]) return;
    const b = BADGES.find((x) => x.id === badgeId);
    if (!b) return;
    p.badges[badgeId] = Date.now();
    save();
    bus.emit("toast", `${b.icon} Badge earned: ${b.name}!`, "gain");
  }
  function lessonDone(id, trackId, trackLessonIds = []) {
    const p = active();
    if (!p || p.lessons[id]) return;
    p.lessons[id] = Date.now();
    grant("first-lesson");
    addXP(50, "lesson complete");
    if (trackLessonIds.length && trackLessonIds.every((lid) => p.lessons[lid])) grant("track-" + trackId);
    save();
  }
  function quizDone(id, score, total) {
    const p = active();
    if (!p) return;
    const best = p.quizzes[id] || 0;
    p.quizzes[id] = Math.max(best, score);
    grant("first-quiz");
    if (score === total) {
      grant("perfect-quiz");
      addXP(25, "perfect quiz");
    }
    save();
  }
  function saveMarketSnapshot(snap) {
    db.market = snap;
    save();
  }
  function loadMarketSnapshot() {
    return db.market || null;
  }
  function exportJson() {
    return JSON.stringify({ ...db, exportedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 1);
  }
  function importJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { err: "That file is not valid JSON." };
    }
    if (!data || !Array.isArray(data.profiles)) return { err: "Not an Options Academy backup (no profiles found)." };
    if ((data.schemaVersion || 0) > SCHEMA_VERSION) return { err: "Backup is from a newer app version \u2014 update the app first." };
    data.schemaVersion = data.schemaVersion || 2;
    db = upgrade(data);
    db.activeId = db.activeId && db.profiles.some((p) => p.id === db.activeId) ? db.activeId : db.profiles[0]?.id || null;
    save();
    return { ok: true, profiles: db.profiles.length };
  }

  // src/state/entitlements.js
  var BUILD = (
    /** @type {'family'|'commercial'} */
    /** @type {any} */
    "commercial"
  );
  var buildOverride = (
    /** @type {string|null} */
    null
  );
  var FREE_LIMITS = {
    positions: 3,
    symbols: ["LMND", "FAM500"],
    lessonsPerTrack: 3,
    // first N lessons of the 'core' track
    freeTracks: ["core"],
    missions: ["first-covered-call", "crash-insurance"],
    journalEntries: 3
  };
  function isFamilyBuild() {
    return (buildOverride ?? BUILD) === "family";
  }
  function tier(p = active()) {
    if (isFamilyBuild()) return "family";
    const sub = subStatus();
    if (sub === "active" || sub === "trialing") return "pro";
    return p?.tier === "pro" ? "pro" : "free";
  }
  var isPaid = (p) => tier(p) !== "free";
  function canOpenPosition(p, sym) {
    if (isPaid(p)) return { ok: true };
    if (p.positions.length >= FREE_LIMITS.positions) {
      return { err: `Free practice account is limited to ${FREE_LIMITS.positions} open positions \u2014 upgrade to trade without limits.` };
    }
    if (!FREE_LIMITS.symbols.includes(sym)) {
      return { err: `Free practice trades ${FREE_LIMITS.symbols.join(" & ")} only \u2014 upgrade to trade every ticker.` };
    }
    return { ok: true };
  }
  function canStartMission(id, p = active()) {
    if (isPaid(p)) return { ok: true };
    if (FREE_LIMITS.missions.includes(id)) return { ok: true };
    return { err: "This mission is part of the full Academy \u2014 upgrade to unlock the whole mission pack." };
  }
  function canJournal(p = active()) {
    if (isPaid(p)) return { ok: true };
    const n = (p?.journal || []).length;
    if (n >= FREE_LIMITS.journalEntries) {
      return { err: `Free tier keeps your last ${FREE_LIMITS.journalEntries} journal entries \u2014 upgrade for unlimited journaling and score history.` };
    }
    return { ok: true };
  }
  function lessonTierLocked(trackId, lessonIndexInTrack, p = active()) {
    if (isPaid(p)) return false;
    if (!FREE_LIMITS.freeTracks.includes(trackId)) return true;
    return lessonIndexInTrack >= FREE_LIMITS.lessonsPerTrack;
  }

  // src/engine/payoff.js
  var mult = (leg) => leg.kind === "stock" ? 1 : 100;
  function valueAtExpiry(legs, S2) {
    return legs.reduce((sum, l) => {
      const v = l.kind === "stock" ? S2 : l.kind === "call" ? Math.max(0, S2 - l.strike) : Math.max(0, l.strike - S2);
      return sum + l.side * l.qty * mult(l) * v;
    }, 0);
  }
  function entryCost(legs) {
    return legs.reduce((sum, l) => sum + l.side * l.qty * mult(l) * l.entry, 0);
  }
  function pnlAtExpiry(legs, S2) {
    return valueAtExpiry(legs, S2) - entryCost(legs);
  }
  function tailSlopes(legs) {
    let up = 0, down = 0;
    for (const l of legs) {
      const m = l.side * l.qty * mult(l);
      if (l.kind === "stock") {
        up += m;
        down += m;
      } else if (l.kind === "call") up += m;
      else down -= m;
    }
    return { up, down };
  }
  function maxLossAtExpiry(legs, Sref) {
    const { up, down } = tailSlopes(legs);
    const lo = 0, hi = Math.max(Sref * 3, ...legs.filter((l) => l.strike).map((l) => l.strike * 2), 1);
    let worst = Infinity, at = null;
    const candidates = [lo, hi, Sref, ...legs.filter((l) => l.strike).map((l) => l.strike)];
    for (let i = 0; i <= 160; i++) candidates.push(lo + (hi - lo) * i / 160);
    for (const x of candidates) {
      const y = pnlAtExpiry(legs, x);
      if (y < worst) {
        worst = y;
        at = x;
      }
    }
    const bounded = up >= 0;
    return { amount: worst, bounded, at };
  }
  function isDefinedRisk(legs) {
    return maxLossAtExpiry(legs, legs.find((l) => l.strike)?.strike ?? 100).bounded;
  }
  function classify(legs) {
    const stocks = legs.filter((l) => l.kind === "stock");
    const calls = legs.filter((l) => l.kind === "call");
    const puts = legs.filter((l) => l.kind === "put");
    const opt = calls.length + puts.length;
    const longStock = stocks.reduce((s2, l) => s2 + l.side * l.qty, 0);
    if (opt === 0 && longStock > 0) return "long-stock";
    if (opt === 1 && calls.length === 1) {
      const c = calls[0];
      if (c.side < 0 && longStock >= c.qty * 100) return "covered-call";
      return c.side > 0 ? "long-call" : "short-call";
    }
    if (opt === 1 && puts.length === 1) {
      const p = puts[0];
      if (p.side > 0 && longStock > 0) return "protective-put";
      return p.side > 0 ? "long-put" : "cash-secured-put";
    }
    if (opt === 2 && calls.length === 1 && puts.length === 1 && calls[0].side > 0 && puts[0].side > 0) {
      return calls[0].strike === puts[0].strike ? "long-straddle" : "long-strangle";
    }
    if (opt === 2 && calls.length === 2 && calls[0].side !== calls[1].side) return "call-vertical";
    if (opt === 2 && puts.length === 2 && puts[0].side !== puts[1].side) return "put-vertical";
    if (opt === 4 && calls.length === 2 && puts.length === 2) return "iron-condor";
    return "custom";
  }

  // src/state/broker.js
  var FEE = 0.65;
  var feed = null;
  function init(marketFeed) {
    feed = marketFeed;
  }
  var getFeed = () => feed;
  var mult2 = (leg) => leg.kind === "stock" ? 1 : 100;
  function legValue(sym, leg) {
    if (leg.kind === "stock") return feed.quote(sym).S;
    return feed.optQuote(sym, leg.strike, leg.expDay, leg.kind).mid;
  }
  function posValue(pos) {
    return pos.legs.reduce((s2, l) => s2 + l.side * l.qty * mult2(l) * legValue(pos.sym, l), 0);
  }
  function posCost(pos) {
    return pos.legs.reduce((s2, l) => s2 + l.side * l.qty * mult2(l) * l.entry, 0);
  }
  function posPnl(pos) {
    return posValue(pos) - posCost(pos) + (pos.settledLegs || []).reduce((sum, l) => sum + l.settled.pnlContribution, 0);
  }
  function snapshot(sym, leg) {
    const S0 = feed.quote(sym).S, day0 = feed.day;
    if (leg.kind === "stock") return { ...leg, g0: { S0, day0 }, slip: 0 };
    const q = feed.optQuote(sym, leg.strike, leg.expDay, leg.kind);
    return { ...leg, g0: {
      S0,
      day0,
      iv0: q.iv,
      delta0: q.delta,
      gamma0: q.gamma,
      theta0: q.theta,
      vega0: q.vega,
      mid0: q.mid
    }, slip: leg.side * (leg.entry - q.mid) };
  }
  function touch(sym, leg, closing = false) {
    if (leg.kind === "stock") return feed.quote(sym).S;
    const q = feed.optQuote(sym, leg.strike, leg.expDay, leg.kind);
    return (closing ? -leg.side : leg.side) > 0 ? q.ask : q.bid;
  }
  var feesFor = (legs) => legs.reduce((sum, l) => sum + (l.kind === "stock" ? 0 : FEE * l.qty), 0);
  var emptyBuckets = () => ({ delta: 0, gamma: 0, theta: 0, vega: 0, slippage: 0 });
  function legBuckets(sym, leg, day = feed.day) {
    const b = emptyBuckets(), g = leg.g0;
    if (!g) return b;
    const dS = feed.quote(sym).S - g.S0;
    const scale = leg.side * leg.qty * mult2(leg);
    if (leg.kind === "stock") b.delta = scale * dS;
    else {
      const q = feed.optQuote(sym, leg.strike, leg.expDay, leg.kind);
      b.delta = scale * g.delta0 * dS;
      b.gamma = scale * 0.5 * g.gamma0 * dS ** 2;
      b.theta = scale * g.theta0 * (day - g.day0);
      b.vega = scale * g.vega0 * (q.iv - g.iv0) * 100;
      b.slippage = -(leg.slip || 0) * leg.qty * 100;
    }
    return b;
  }
  function attribution(pos) {
    const b = emptyBuckets();
    for (const l of [...pos.legs, ...pos.settledLegs || []]) {
      const part = l.settled ? l.settled.buckets : legBuckets(pos.sym, l);
      for (const key of Object.keys(b)) b[key] += part[key];
    }
    const total = posPnl(pos);
    const explained = b.delta + b.gamma + b.theta + b.vega + b.slippage;
    return { ...b, residual: total - explained, total };
  }
  function freezeLeg(pos, leg, price2, day, closing = false) {
    const buckets = legBuckets(pos.sym, leg, day);
    if (closing && leg.kind !== "stock") {
      const slip = leg.side * (legValue(pos.sym, leg) - price2);
      buckets.slippage -= slip * leg.qty * 100;
    }
    leg.settled = { pnlContribution: leg.side * leg.qty * mult2(leg) * (price2 - leg.entry), buckets };
    pos.settledLegs = pos.settledLegs || [];
    pos.settledLegs.push(leg);
  }
  function reserve(p, pos) {
    p.reserved = p.reserved || {};
    const req = marginRequirement(pos.sym, pos.legs);
    if (req > 0) p.reserved[pos.id] = req;
    else delete p.reserved[pos.id];
  }
  function marginRequirement(sym, legs) {
    const S2 = feed.quote(sym).S;
    let req = 0;
    let longStock = legs.filter((l) => l.kind === "stock" && l.side > 0).reduce((s2, l) => s2 + l.qty, 0);
    for (const type of ["call", "put"]) {
      const shorts = legs.filter((l) => l.kind === type && l.side < 0).flatMap((l) => Array(l.qty).fill(l.strike)).sort((a, b) => a - b);
      const longs = legs.filter((l) => l.kind === type && l.side > 0).flatMap((l) => Array(l.qty).fill(l.strike)).sort((a, b) => a - b);
      for (const k of shorts) {
        if (type === "call" && longStock >= 100) {
          longStock -= 100;
          continue;
        }
        if (longs.length) {
          let bestIdx = 0, bestWidth = Infinity;
          longs.forEach((lk, i) => {
            const w = Math.abs(lk - k);
            if (w < bestWidth) {
              bestWidth = w;
              bestIdx = i;
            }
          });
          req += bestWidth * 100;
          longs.splice(bestIdx, 1);
          continue;
        }
        const otm = type === "call" ? Math.max(0, k - S2) : Math.max(0, S2 - k);
        req += Math.max(0.2 * S2 - otm, 0.1 * k) * 100;
      }
    }
    return req;
  }
  function reservedTotal(p) {
    return Object.values(p.reserved || {}).reduce((s2, x) => s2 + x, 0);
  }
  function buyingPower(p) {
    return p.cash - reservedTotal(p);
  }
  function openPosition(sym, legs, label) {
    const p = active();
    if (!p) return { err: "No profile" };
    const cost = legs.reduce((s2, l) => s2 + l.side * l.qty * mult2(l) * l.entry, 0);
    const fees = legs.filter((l) => l.kind !== "stock").reduce((s2, l) => s2 + FEE * l.qty, 0);
    const req = marginRequirement(sym, legs);
    if (p.riskMode === "defined" && !isDefinedRisk(legs)) {
      return { err: "Defined-risk only is on for this account \u2014 this order has unbounded risk. Covered calls and spreads are fine; turn the guard off in Settings to trade naked shorts." };
    }
    const gate = canOpenPosition(p, sym);
    if (gate.err) return gate;
    if (cost + fees + req > buyingPower(p)) {
      return { err: `Not enough buying power: this needs ${fmtUsd(cost + fees)} plus ${fmtUsd(req)} margin reserve (available: ${fmtUsd(buyingPower(p))}).` };
    }
    legs = legs.map((l) => snapshot(sym, l));
    p.cash -= cost + fees;
    const pos = {
      id: "t" + Math.random().toString(36).slice(2, 8),
      sym,
      legs,
      label,
      openDay: feed.day,
      ts: Date.now()
    };
    p.positions.push(pos);
    p.reserved = p.reserved || {};
    if (req > 0) p.reserved[pos.id] = req;
    p.trades.unshift({ day: feed.day, text: `Opened ${label} on ${sym} for ${fmtUsd(cost + fees)}${req ? ` (+${fmtUsd(req)} margin held)` : ""}`, amt: -(cost + fees) });
    grant("first-trade");
    if (legs.some((l) => l.kind !== "stock")) grant("first-option");
    if (legs.length >= 2 && legs.some((l) => l.kind === "stock") && legs.some((l) => l.kind === "call" && l.side === -1)) grant("covered-call");
    if (legs.filter((l) => l.kind !== "stock").length >= 2) grant("spread");
    save();
    return { ok: true, pos };
  }
  function closePosition(id) {
    const p = active();
    if (!p) return;
    const i = p.positions.findIndex((x) => x.id === id);
    if (i < 0) return;
    const pos = p.positions[i];
    const fees = feesFor(pos.legs);
    const fills = pos.legs.map((l) => touch(pos.sym, l, true));
    const val = pos.legs.reduce((sum, l, n) => sum + l.side * l.qty * mult2(l) * fills[n], 0);
    pos.legs.forEach((l, n) => freezeLeg(pos, l, fills[n], feed.day, true));
    pos.legs = [];
    const pnl = posPnl(pos);
    p.cash += val - fees;
    if (p.reserved) delete p.reserved[pos.id];
    p.positions.splice(i, 1);
    p.trades.unshift({ day: feed.day, text: `Closed ${pos.label} on ${pos.sym}: P&L ${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)}`, amt: val });
    grant(pnl >= 0 ? "winner" : "survivor");
    save();
    return pnl;
  }
  function settle(closingDay, early) {
    for (const p of profiles()) {
      for (let i = p.positions.length - 1; i >= 0; i--) {
        const pos = p.positions[i], S2 = feed.quote(pos.sym).S;
        const intrinsic = (l) => l.kind === "call" ? Math.max(0, S2 - l.strike) : Math.max(0, l.strike - S2);
        const selected = pos.legs.filter((l) => {
          if (l.kind === "stock") return false;
          if (!early) return l.expDay <= closingDay;
          if (l.side >= 0) return false;
          const value = intrinsic(l);
          return value >= 0.05 * l.strike && feed.optQuote(pos.sym, l.strike, l.expDay, l.kind).mid - value < 0.03 - 1e-12;
        });
        if (!selected.length) continue;
        const pin = !early && selected.some((l) => Math.abs(S2 - l.strike) <= 5e-3 * l.strike + 1e-12);
        let credit = 0;
        for (const l of selected) {
          const price2 = intrinsic(l);
          credit += l.side * l.qty * 100 * price2;
          freezeLeg(pos, l, price2, closingDay);
        }
        pos.legs = pos.legs.filter((l) => !selected.includes(l));
        p.cash += credit;
        const text = `${early ? "\u26A1 Early assignment" : "Options expired"} on ${pos.sym} (${pos.label}) \u2014 settled for ${fmtUsd(credit)}${pin ? " \u2014 \u{1F4CC} Pin risk" : ""}`;
        p.trades.unshift({ day: closingDay, text, amt: credit });
        reserve(p, pos);
        if (!pos.legs.length) p.positions.splice(i, 1);
        if (p.id === active()?.id) bus.emit("toast", text);
      }
    }
    save();
  }
  function checkEarlyAssignment(closingDay) {
    settle(closingDay, true);
  }
  function settleExpirations(closingDay) {
    settle(closingDay, false);
  }
  function onDayClose(closingDay) {
    checkEarlyAssignment(closingDay);
    settleExpirations(closingDay);
  }
  function equity(p = active()) {
    if (!p) return 0;
    return p.cash + p.positions.reduce((s2, pos) => s2 + posValue(pos), 0);
  }
  function markEquity() {
    const p = active();
    if (!p) return;
    p.marks.push({ day: feed.day, eq: equity(p) });
    if (p.marks.length > 300) p.marks.shift();
    save();
  }
  function fmtUsd(x) {
    const sign = x < 0 ? "-" : "";
    return sign + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // src/state/context.js
  var saved = loadMarketSnapshot();
  var market = createMarket({ saved, seed: saved?.seed ?? Math.floor(Math.random() * 2 ** 31) });
  init(market);
  market.on("dayClose", (closingDay) => onDayClose(closingDay));
  market.on("day", () => {
    markEquity();
    saveMarketSnapshot(market.snapshot());
  });

  // src/ui/components.js
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return n;
  }
  function viewHeader(eyebrow, title) {
    return el(
      "header",
      { class: "view-header" },
      el("div", { class: "eyebrow" }, eyebrow),
      el("h1", {}, title)
    );
  }
  var esc = (s2) => String(s2).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function mdInline(s2) {
    return esc(s2).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`(.+?)`/g, "<code>$1</code>");
  }
  function md(text) {
    const blocks = String(text || "").split(/\n\s*\n/);
    return blocks.map((b) => {
      b = b.trim();
      if (!b) return "";
      if (/^###\s/.test(b)) return `<h3>${mdInline(b.replace(/^###\s*/, ""))}</h3>`;
      if (/^##\s/.test(b)) return `<h3>${mdInline(b.replace(/^##\s*/, ""))}</h3>`;
      if (/^[-*]\s/m.test(b) && b.split("\n").every((l) => /^[-*]\s/.test(l.trim()))) {
        return "<ul>" + b.split("\n").map((l) => `<li>${mdInline(l.replace(/^\s*[-*]\s*/, ""))}</li>`).join("") + "</ul>";
      }
      return `<p>${mdInline(b).replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }
  var toastBox = null;
  function toast(msg, kind = "", action = null) {
    if (!toastBox) {
      toastBox = el("div", { class: "oa-toasts" });
      document.body.appendChild(toastBox);
    }
    const t = el("div", { class: "oa-toast " + kind });
    if (typeof msg === "string" && /<[a-z/]/i.test(msg)) t.innerHTML = msg;
    else t.appendChild(document.createTextNode(String(msg)));
    if (action && action.label) {
      t.appendChild(el("a", {
        class: "toast-action",
        href: action.href || "#",
        onclick: (e) => {
          if (action.onClick) {
            e.preventDefault();
            action.onClick();
          }
          t.remove();
        }
      }, action.label));
    }
    toastBox.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transition = "opacity .3s";
      setTimeout(() => t.remove(), 350);
    }, 4200);
  }
  function gateToast(err) {
    if (!err) return;
    const free = !isFamilyBuild() && tier() === "free";
    if (free && /upgrade/i.test(String(err))) {
      toast(err, "loss", { label: "Upgrade", href: "#/upgrade" });
    } else {
      toast(err, "loss");
    }
  }
  bus.on("toast", (msg, kind) => {
    const text = String(msg || "");
    const free = !isFamilyBuild() && tier() === "free";
    if (free && /upgrade/i.test(text)) {
      toast(text, kind || "loss", { label: "Upgrade", href: "#/upgrade" });
    } else {
      toast(text, kind || "");
    }
  });
  function modal(contentEl2, { onClose } = {}) {
    const bg = el("div", { class: "oa-modal-bg" });
    const box = el("div", { class: "oa-modal", role: "dialog", "aria-modal": "true" });
    box.appendChild(contentEl2);
    bg.appendChild(box);
    const onKey = (e) => {
      if (e.key === "Escape" && onClose !== false) dismiss();
    };
    const dismiss = () => {
      document.removeEventListener("keydown", onKey);
      bg.remove();
      onClose && onClose();
    };
    bg.addEventListener("click", (e) => {
      if (e.target === bg && onClose !== false) dismiss();
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(bg);
    return { close: () => {
      document.removeEventListener("keydown", onKey);
      bg.remove();
    } };
  }
  function quiz(container, items, { onDone } = {}) {
    let score = 0, answered = 0;
    container.innerHTML = "";
    container.appendChild(el("h3", {}, `Check your understanding (${items.length} questions)`));
    items.forEach((it, qi) => {
      const qWrap = el("div", {});
      qWrap.appendChild(el("div", { class: "quiz-q" }, `${qi + 1}. ${it.q}`));
      const opts = it.choices.map((c, ci) => {
        const b = el("button", { class: "quiz-opt" }, c);
        b.addEventListener("click", () => {
          if (b.disabled) return;
          opts.forEach((o) => {
            o.disabled = true;
          });
          const correct = ci === it.answer;
          if (correct) {
            b.classList.add("correct");
            score++;
          } else {
            b.classList.add("wrong");
            opts[it.answer].classList.add("correct");
          }
          qWrap.appendChild(el("div", { class: "quiz-expl", html: (correct ? '<b class="q-right">\u2713 Right.</b> ' : '<b class="q-wrong">\u2717 Not quite.</b> ') + mdInline(it.explain) }));
          answered++;
          if (answered === items.length) onDone && onDone(score, items.length);
        });
        return b;
      });
      opts.forEach((o) => qWrap.appendChild(o));
      container.appendChild(qWrap);
    });
  }

  // src/ui/format.js
  var F = {
    usd(x, dp = 2) {
      if (x == null || !isFinite(x)) return "\u2014";
      const sign = x < 0 ? "-" : "";
      return sign + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    },
    usdSigned(x, dp = 2) {
      return (x >= 0 ? "+" : "") + F.usd(x, dp).replace("$-", "-$");
    },
    pct(x, dp = 1) {
      return x == null || !isFinite(x) ? "\u2014" : (x * 100).toFixed(dp) + "%";
    },
    pctSigned(x, dp = 2) {
      return (x >= 0 ? "+" : "") + (x * 100).toFixed(dp) + "%";
    },
    num(x, dp = 2) {
      return x == null || !isFinite(x) ? "\u2014" : x.toFixed(dp);
    }
  };

  // src/ui/onboarding.js
  var KEY = "oa.onboarding";
  var TOTAL = 5;
  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      return {};
    }
  }
  function writeAll(all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
    }
  }
  function pid(id) {
    return id || active()?.id || "_";
  }
  function get(id) {
    const all = readAll();
    const row = all[pid(id)];
    if (!row) return { step: 0, goal: null, done: false };
    return {
      step: Math.max(0, Math.min(TOTAL, Number(row.step) || 0)),
      goal: row.goal || null,
      coachDismissed: !!row.coachDismissed,
      done: !!row.done || (Number(row.step) || 0) >= TOTAL
    };
  }
  function start(id) {
    const all = readAll();
    const k = pid(id);
    if (!all[k] || all[k].done) {
      all[k] = { step: 0, goal: null, done: false };
      writeAll(all);
    }
    return get(k);
  }
  function setGoal(goal, id) {
    const all = readAll();
    const k = pid(id);
    all[k] = { ...get(k), goal, step: Math.max(get(k).step, 1) };
    writeAll(all);
    return get(k);
  }
  function setStep(step, id) {
    const all = readAll();
    const k = pid(id);
    const cur = get(k);
    const next = Math.max(0, Math.min(TOTAL, step));
    all[k] = { ...cur, step: next, done: next >= TOTAL };
    writeAll(all);
    return get(k);
  }
  function completeStep(n, id) {
    const cur = get(id);
    if (cur.step < n) return setStep(n, id);
    return cur;
  }
  function dismissCoach(id) {
    const all = readAll();
    const k = pid(id);
    all[k] = { ...get(k), coachDismissed: true };
    writeAll(all);
  }
  function finish(id) {
    return setStep(TOTAL, id);
  }
  function incomplete(id) {
    const s2 = get(id);
    if (s2.done || s2.step >= TOTAL) return false;
    const p = active();
    if (p && (p.xp >= 100 || Object.keys(p.lessons || {}).length >= 2 || (p.trades || []).length > 0)) return false;
    return true;
  }
  function currentStep(id) {
    return get(id).step;
  }
  var GOAL_COPY = {
    income: {
      label: "Earn income from stocks I own",
      tip: "Start with covered calls on names you already hold \u2014 Missions \u2192 First Covered Call is built for this."
    },
    protect: {
      label: "Protect what I have",
      tip: "Protective puts and collars are your tools \u2014 try Crash Insurance after your first paper trade."
    },
    direction: {
      label: "Trade direction with defined risk",
      tip: "Debit spreads keep max loss known. Strategy Lab \u2192 Bull Call / Bear Put, then paper-trade LMND."
    }
  };

  // src/ui/icons.js
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"/><path d="M10 21v-6h4v6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    balloon: '<circle cx="12" cy="8" r="5.25"/><path d="M12 13.5c-1.2 1.8-1.2 3 0 4.5s1.2 2.2 0 3"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    layers: '<path d="m12 2.5 9.5 5L12 12.5l-9.5-5z"/><path d="m2.5 12.5 9.5 5 9.5-5"/><path d="m2.5 17 9.5 5 9.5-5"/>',
    temple: '<path d="M3 21h18"/><path d="M5 18h14"/><path d="M6.5 18V10"/><path d="M10.2 18V10"/><path d="M13.8 18V10"/><path d="M17.5 18V10"/><path d="M3 9.5 12 3l9 6.5z"/>',
    wave: '<path d="M2 12c2.5 0 2.5-5.5 5-5.5S9.5 17 12 17s2.5-10.5 5-10.5S19.5 12 22 12"/>',
    notebook: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M8.5 2.5v19"/><path d="M12 7.5h4"/><path d="M12 11.5h4"/><path d="M12 15.5h2.5"/>',
    compass: '<circle cx="12" cy="12" r="9.25"/><path d="m15.8 8.2-2 5.6-5.6 2 2-5.6z" fill="currentColor" stroke="none"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 17.5V21"/><path d="M7 4h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 6H4.25C4.25 9 5.5 10.75 7 11"/><path d="M17 6h2.75c0 3-1.25 4.75-2.75 5"/>',
    gear: '<circle cx="12" cy="12" r="3.25"/><path d="M12 2.5v2.75"/><path d="M12 18.75v2.75"/><path d="M2.5 12h2.75"/><path d="M18.75 12h2.75"/><path d="m5.3 5.3 1.95 1.95"/><path d="m16.75 16.75 1.95 1.95"/><path d="m18.7 5.3-1.95 1.95"/><path d="m7.25 16.75-1.95 1.95"/>',
    scale: '<path d="M12 3v18"/><path d="M8.5 21h7"/><path d="M12 5.5 5 7.5m7-2 7 2"/><path d="M5 7.5 2.75 13a2.6 2.6 0 0 0 4.5 0z"/><path d="M19 7.5 16.75 13a2.6 2.6 0 0 0 4.5 0z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="m5 5 1.4 1.4"/><path d="m17.6 17.6 1.4 1.4"/><path d="m19 5-1.4 1.4"/><path d="m6.4 17.6-1.4 1.4"/>',
    moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.75 6.75 0 0 0 9.7 9.7z"/>',
    contrast: '<circle cx="12" cy="12" r="9.25"/><path d="M12 2.75a9.25 9.25 0 0 1 0 18.5z" fill="currentColor" stroke="none"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    cloud: '<path d="M17.5 19H6.75A4.25 4.25 0 0 1 6 10.55 6.5 6.5 0 0 1 18.7 11.9 3.75 3.75 0 0 1 17.5 19z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
    grad: '<path d="m12 4 10 5-10 5L2 9z"/><path d="M6.5 11.5V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.5"/><path d="M22 9v5"/>',
    shield: '<path d="M12 2.75 19.5 5.5v6c0 4.6-3 8.1-7.5 9.75C7.5 19.6 4.5 16.1 4.5 11.5v-6z"/>',
    umbrella: '<path d="M12 2.75a9.25 9.25 0 0 1 9.25 9.25H2.75A9.25 9.25 0 0 1 12 2.75z"/><path d="M12 12v6.5a2.25 2.25 0 0 0 4.5 0"/>',
    cart: '<path d="M3 4h2.25L7.5 15h11L21 7H6"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    ruler: '<path d="M3 21V3l18 18z"/><path d="M8 15.5v2"/><path d="M6.5 19H3"/><path d="M10.5 19h2"/>',
    cube: '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><path d="m9 15 6-6"/>',
    burst: '<circle cx="12" cy="12" r="2.75"/><path d="M12 2.5v4"/><path d="M12 17.5v4"/><path d="M2.5 12h4"/><path d="M17.5 12h4"/><path d="m5.3 5.3 2.6 2.6"/><path d="m16.1 16.1 2.6 2.6"/><path d="m18.7 5.3-2.6 2.6"/><path d="m7.9 16.1-2.6 2.6"/>',
    pin: '<path d="M12 21.25S5.25 14.9 5.25 10a6.75 6.75 0 0 1 13.5 0c0 4.9-6.75 11.25-6.75 11.25z"/><circle cx="12" cy="10" r="2.25"/>',
    scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.1 7.6 20 18"/><path d="M8.1 16.4 20 6"/>',
    bolt: '<path d="M13 2.5 4.75 13.25H11L10 21.5l8.25-10.75H13z"/>',
    bird: '<path d="M2.75 12.5C6.25 5.5 13 3.5 21.25 5c-3.4 1.5-4.4 4-5.9 6.5-2 3.4-6.4 5-12.6 1z"/><path d="M8 18.5c2.5 1 5.5.5 7.5-1"/>',
    trendDown: '<path d="m3 7 6.5 6.5L13 10l7.5 7.5"/><path d="M15.5 17.5h5v-5"/>',
    trendUp: '<path d="m3 17 6.5-6.5L13 14l7.5-7.5"/><path d="M15.5 6.5h5v5"/>',
    bookOpen: '<path d="M2.75 5.25A9.5 9.5 0 0 1 12 6.9a9.5 9.5 0 0 1 9.25-1.65V18.5A9.5 9.5 0 0 0 12 20.1a9.5 9.5 0 0 0-9.25-1.6z"/><path d="M12 6.9v13.2"/>',
    target: '<circle cx="12" cy="12" r="9.25"/><circle cx="12" cy="12" r="5.25"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    ticket: '<path d="M3 7a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 7v3a2 2 0 0 0 0 4v3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17v-3a2 2 0 0 0 0-4z"/><path d="M14.5 5.5v2.75"/><path d="M14.5 11v2"/><path d="M14.5 15.75v2.75"/>',
    scroll: '<path d="M8 3h10.5A2.5 2.5 0 0 1 21 5.5v13A2.5 2.5 0 0 1 18.5 21H8"/><path d="M8 3a2.5 2.5 0 0 0-2.5 2.5V18A3 3 0 0 1 8 21"/><path d="M11 8.5h6"/><path d="M11 12.5h6"/>',
    butterfly: '<path d="M12 6.5v12"/><path d="M12 9C10 4.5 4.5 4 4 8s4 7.5 8 4.5"/><path d="M12 9c2-4.5 7.5-5 8-1s-4 7.5-8 4.5"/><path d="M12 13.5c-1.5 2.5-4.5 4-6 2"/><path d="M12 13.5c1.5 2.5 4.5 4 6 2"/>',
    blocks: '<rect x="3" y="13.5" width="8" height="6.5" rx="1"/><rect x="13" y="13.5" width="8" height="6.5" rx="1"/><rect x="8" y="4.5" width="8" height="6.5" rx="1"/>',
    star: '<path d="m12 3.25 2.6 5.3 5.85.85-4.23 4.12 1 5.83L12 16.6l-5.22 2.75 1-5.83-4.23-4.12 5.85-.85z"/>',
    flame: '<path d="M12 2.75s5.75 4.75 5.75 10.25a5.75 5.75 0 0 1-11.5 0c0-2.5 1.4-4.6 2.75-6.25.4 1.4 1.2 2.4 2.25 3C11.25 7.5 11 5 12 2.75z"/>',
    gem: '<path d="M7 3.5h10l4 5.5-9 11.5L3 9z"/><path d="M3 9h18"/><path d="m7 3.5 5 5.5 5-5.5"/>',
    map: '<path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13"/><path d="M15 6.5v13"/>',
    bulb: '<path d="M9.5 18h5"/><path d="M10.25 21h3.5"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1 1.3-1 2.1h-5c0-.8-.2-1.5-1-2.1A6 6 0 0 1 12 3z"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    alert: '<path d="M12 3.5 22 20H2z"/><path d="M12 9.75v4.5"/><path d="M12 17.25h.01"/>',
    news: '<rect x="3" y="4.5" width="15" height="15" rx="2"/><path d="M18 8.5h1.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-3 0z"/><path d="M6.5 8.5H14"/><path d="M6.5 12H14"/><path d="M6.5 15.5h5"/>',
    rocket: '<path d="M12 2.75c3.25 1.75 5 5 5 8.75l-2.25 2.5h-5.5L7 11.5c0-3.75 1.75-7 5-8.75z"/><circle cx="12" cy="9" r="1.75"/><path d="m8.25 15.5-2 5 3.25-1.5 2.5 1.5 2.5-1.5 3.25 1.5-2-5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.75"/><path d="m15.5 15.5 5 5"/>',
    clock: '<circle cx="12" cy="12" r="9.25"/><path d="M12 6.5V12l3.5 2"/>',
    bell: '<path d="M18 9.5a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z"/><path d="M10.25 19.5a2 2 0 0 0 3.5 0"/>',
    bars: '<path d="M4.5 20V10"/><path d="M10.5 20V4.5"/><path d="M16.5 20v-7.5"/><path d="M21 20H3"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4.5c4-2 7 2 11.5.5V13c-4.5 1.5-7.5-2.5-11.5-.5"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>'
  };
  var MAP = {
    "\u{1F6E1}\uFE0F": "shield",
    "\u{1F6E1}": "shield",
    "\u{1F9EF}": "shield",
    "\u2614": "umbrella",
    "\u{1F6D2}": "cart",
    "\u{1F4D0}": "ruler",
    "\u{1F9CA}": "cube",
    "\u{1F4A5}": "burst",
    "\u{1F4CC}": "pin",
    "\u2702\uFE0F": "scissors",
    "\u2702": "scissors",
    "\u26A1": "bolt",
    "\u{1F985}": "bird",
    "\u{1F4C9}": "trendDown",
    "\u{1F4C8}": "trendUp",
    "\u{1F3DB}\uFE0F": "temple",
    "\u{1F3DB}": "temple",
    "\u{1F9ED}": "compass",
    "\u{1F30A}": "wave",
    "\u{1F4D6}": "bookOpen",
    "\u{1F9E0}": "bulb",
    "\u{1F4A1}": "bulb",
    "\u{1F4AF}": "target",
    "\u{1F3AF}": "target",
    "\u{1F3AB}": "ticket",
    "\u{1F4DC}": "scroll",
    "\u{1F98B}": "butterfly",
    "\u{1F9F1}": "blocks",
    "\u2B50": "star",
    "\u{1F31F}": "star",
    "\u{1F525}": "flame",
    "\u{1F48E}": "gem",
    "\u{1F5FA}\uFE0F": "map",
    "\u{1F5FA}": "map",
    "\u{1F4D8}": "book",
    "\u{1F4DA}": "book",
    "\u{1F4D3}": "notebook",
    "\u{1F393}": "grad",
    "\u{1F3C6}": "trophy",
    "\u{1F680}": "rocket",
    "\u{1F3C1}": "flag",
    "\u{1F514}": "bell",
    "\u{1F4CA}": "bars",
    "\u{1F4F0}": "news",
    "\u{1F324}\uFE0F": "sun",
    "\u{1F324}": "sun",
    "\u2600\uFE0F": "sun",
    "\u{1F60C}": "sun",
    "\u{1F4A4}": "moon",
    "\u{1F570}\uFE0F": "clock",
    "\u{1F570}": "clock",
    "\u{1F6A8}": "alert",
    "\u26A0\uFE0F": "alert",
    "\u26A0": "alert",
    "\u{1F52D}": "search",
    "\u{1F50D}": "search",
    "\u{1F9F2}": "target",
    "\u{1F34B}": "sun",
    "\u{1F388}": "balloon",
    "\u{1F9E9}": "layers",
    "\u{1F4FA}": "monitor"
  };
  function icon(name, o = {}) {
    const s2 = document.createElement("span");
    s2.className = "oi" + (o.cls ? " " + o.cls : "");
    s2.setAttribute("aria-hidden", "true");
    s2.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"${o.size ? ` style="width:${o.size}px;height:${o.size}px"` : ""}>${P[name] || P.sparkle}</svg>`;
    return s2;
  }
  function iconFor(val, fallback = "news", o = {}) {
    const slug = P[val] ? val : MAP[String(val || "").trim()];
    return icon(slug || fallback, o);
  }

  // src/ui/charts.js
  var registry = /* @__PURE__ */ new Set();
  var isMobile = () => !!(window.matchMedia && matchMedia("(max-width: 640px)").matches);
  var cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  var resolve = (c) => c && c.startsWith("--") ? cssVar(c) : c;
  function themeChanged() {
    registry.forEach((ch) => ch.draw());
  }
  var mo = new MutationObserver(themeChanged);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-pl"] });
  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeChanged);
    } catch {
    }
  }
  function setupCanvas(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth || 600;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    canvas.style.touchAction = "pan-y";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: height };
  }
  function niceTicks(lo, hi, n = 5) {
    if (!isFinite(lo) || !isFinite(hi) || lo === hi) {
      hi = lo + 1;
    }
    const span = hi - lo;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
    const t0 = Math.ceil(lo / step) * step;
    const out = [];
    for (let t = t0; t <= hi + 1e-9; t += step) out.push(+t.toFixed(10));
    return out;
  }
  function fingerprint(opts) {
    try {
      return JSON.stringify({
        series: opts.series?.map((s2) => ({
          n: s2.name,
          c: s2.color,
          w: s2.width,
          p: s2.points?.map((p) => [p.x, p.y])
        })),
        vbands: opts.vbands?.map((v) => [v.lo, v.hi, v.color, v.opacity])
      });
    } catch {
      return String(Date.now());
    }
  }
  function line(container, opts) {
    container.classList.add("chart-box");
    let canvas = container.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      container.appendChild(canvas);
    }
    canvas.style.touchAction = "pan-y";
    let tip = container.querySelector(".oa-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "oa-tip";
      container.appendChild(tip);
    }
    let o = opts;
    let hoverX = null;
    let pinX = null;
    let lastFp = "";
    let lastDrawAt = 0;
    let pendingOpts = null;
    let throttleTimer = null;
    const P2 = { l: 52, r: 14, t: 10, b: 26 };
    const PIN_HIT_PX = 18;
    function bounds() {
      let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
      for (const s2 of o.series) for (const p of s2.points) {
        if (p.x < xlo) xlo = p.x;
        if (p.x > xhi) xhi = p.x;
        if (p.y < ylo) ylo = p.y;
        if (p.y > yhi) yhi = p.y;
      }
      if (o.zeroLine) {
        ylo = Math.min(ylo, 0);
        yhi = Math.max(yhi, 0);
      }
      const pad = (yhi - ylo || 1) * (o.yPad ?? 0.08);
      return { xlo, xhi: xhi === xlo ? xlo + 1 : xhi, ylo: ylo - pad, yhi: yhi + pad };
    }
    function activeX() {
      return pinX != null ? pinX : hoverX;
    }
    function draw() {
      if (!canvas.isConnected) {
        registry.delete(chart);
        return;
      }
      const { ctx, w, h } = setupCanvas(canvas, o.height || 260);
      const b = bounds();
      const X = (x) => P2.l + (x - b.xlo) / (b.xhi - b.xlo) * (w - P2.l - P2.r);
      const Y = (y) => h - P2.b - (y - b.ylo) / (b.yhi - b.ylo) * (h - P2.t - P2.b);
      chart.X = X;
      chart.Y = Y;
      chart.b = b;
      chart.w = w;
      chart.h = h;
      lastDrawAt = Date.now();
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${parseFloat(cssVar("--chart-axis")) || 10.5}px "Cascadia Mono", Consolas, ui-monospace, monospace`;
      const grid = resolve("--grid"), muted = resolve("--ink-3");
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = muted;
      for (const t of niceTicks(b.ylo, b.yhi, 5)) {
        const y = Y(t);
        ctx.beginPath();
        ctx.moveTo(P2.l, y);
        ctx.lineTo(w - P2.r, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(o.fmtY ? o.fmtY(t) : String(t), P2.l - 7, y);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const t of niceTicks(b.xlo, b.xhi, 6)) {
        ctx.fillText(o.fmtX ? o.fmtX(t) : String(t), X(t), h - P2.b + 7);
      }
      ctx.strokeStyle = resolve("--baseline");
      ctx.beginPath();
      ctx.moveTo(P2.l, h - P2.b);
      ctx.lineTo(w - P2.r, h - P2.b);
      ctx.stroke();
      if (o.zeroLine && b.ylo < 0 && b.yhi > 0) {
        ctx.strokeStyle = resolve("--baseline");
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(P2.l, Y(0));
        ctx.lineTo(w - P2.r, Y(0));
        ctx.stroke();
      }
      for (const vb of o.vbands || []) {
        const lo = Math.max(vb.lo, b.xlo);
        const hi = Math.min(vb.hi, b.xhi);
        if (!(hi > lo)) continue;
        const x0 = X(lo), x1 = X(hi);
        ctx.save();
        ctx.globalAlpha = vb.opacity != null ? vb.opacity : 0.35;
        ctx.fillStyle = resolve(vb.color || "--brass-soft");
        ctx.fillRect(x0, P2.t, x1 - x0, h - P2.t - P2.b);
        ctx.restore();
      }
      for (const hl of o.hlines || []) {
        ctx.strokeStyle = resolve(hl.color || "--ink-3");
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(P2.l, Y(hl.y));
        ctx.lineTo(w - P2.r, Y(hl.y));
        ctx.stroke();
        ctx.setLineDash([]);
        if (hl.label) {
          ctx.fillStyle = resolve(hl.color || "--ink-3");
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(hl.label, P2.l + 4, Y(hl.y) - 3);
        }
      }
      for (const vl of o.vlines || []) {
        if (vl.x < b.xlo || vl.x > b.xhi) continue;
        ctx.strokeStyle = resolve(vl.color || "--ink-3");
        ctx.lineWidth = 1.2;
        ctx.setLineDash(vl.dash === false ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(X(vl.x), P2.t);
        ctx.lineTo(X(vl.x), h - P2.b);
        ctx.stroke();
        ctx.setLineDash([]);
        if (vl.label) {
          ctx.fillStyle = resolve(vl.color || "--ink-3");
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(vl.label, X(vl.x), P2.t + 10);
        }
      }
      for (const s2 of o.series) {
        if (!s2.points.length) continue;
        if (s2.area === "pnl") {
          const y0 = Y(Math.max(b.ylo, Math.min(b.yhi, 0)));
          for (const sign of [1, -1]) {
            ctx.beginPath();
            ctx.moveTo(X(s2.points[0].x), y0);
            for (const p of s2.points) ctx.lineTo(X(p.x), Y(sign > 0 ? Math.max(0, p.y) : Math.min(0, p.y)));
            ctx.lineTo(X(s2.points[s2.points.length - 1].x), y0);
            ctx.closePath();
            ctx.fillStyle = sign > 0 ? resolve("--gain-soft") : resolve("--loss-soft");
            ctx.fill();
          }
        } else if (s2.area) {
          ctx.beginPath();
          const yb = Y(b.ylo);
          ctx.moveTo(X(s2.points[0].x), yb);
          for (const p of s2.points) ctx.lineTo(X(p.x), Y(p.y));
          ctx.lineTo(X(s2.points[s2.points.length - 1].x), yb);
          ctx.closePath();
          const c = resolve(s2.color);
          ctx.fillStyle = c + "22";
          ctx.fill();
        }
      }
      for (const s2 of o.series) {
        if (!s2.points.length) continue;
        ctx.strokeStyle = resolve(s2.color);
        ctx.lineWidth = s2.width || 2;
        ctx.setLineDash(s2.dash ? [6, 5] : []);
        ctx.beginPath();
        s2.points.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const cx = activeX();
      if (cx != null) {
        const nearest = o.series.map((s2) => {
          let best = null, bd = Infinity;
          for (const p of s2.points) {
            const d = Math.abs(p.x - cx);
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
          return { s: s2, p: best };
        }).filter((n) => n.p);
        if (nearest.length) {
          const hx = X(nearest[0].p.x);
          ctx.strokeStyle = resolve(pinX != null ? "--brass" : "--ink-3");
          ctx.lineWidth = pinX != null ? 1.4 : 1;
          ctx.setLineDash(pinX != null ? [] : [3, 3]);
          ctx.beginPath();
          ctx.moveTo(hx, P2.t);
          ctx.lineTo(hx, h - P2.b);
          ctx.stroke();
          ctx.setLineDash([]);
          for (const n of nearest) {
            ctx.fillStyle = resolve(n.s.color);
            ctx.beginPath();
            ctx.arc(X(n.p.x), Y(n.p.y), pinX != null ? 5 : 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = resolve("--card");
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          const fx = o.fmtX ? o.fmtX(nearest[0].p.x) : nearest[0].p.x;
          tip.innerHTML = `<div class="t">${pinX != null ? "\u2316 " : ""}${o.tipLabel || ""}${fx}</div>` + nearest.map((n) => `<div><span style="color:${resolve(n.s.color)}">\u25CF</span> ${n.s.name}: <b>${o.fmtY ? o.fmtY(n.p.y) : n.p.y}</b></div>`).join("");
          tip.style.display = "block";
          const tw = tip.offsetWidth;
          tip.style.left = Math.min(w - tw - 6, Math.max(2, hx + 12)) + "px";
          tip.style.top = P2.t + 6 + "px";
        }
      } else tip.style.display = "none";
    }
    function xFromClient(clientX) {
      const r = canvas.getBoundingClientRect();
      const px = clientX - r.left;
      if (px < P2.l || px > chart.w - P2.r) return null;
      return chart.b.xlo + (px - P2.l) / (chart.w - P2.l - P2.r) * (chart.b.xhi - chart.b.xlo);
    }
    let downPt = null;
    function onMove(e) {
      if (e.pointerType === "touch") return;
      const x = xFromClient(e.clientX);
      if (x == null) {
        hoverX = null;
        draw();
        return;
      }
      hoverX = x;
      draw();
    }
    function onLeave() {
      hoverX = null;
      draw();
    }
    function onDown(e) {
      downPt = { x: e.clientX, y: e.clientY, t: Date.now() };
    }
    function onTap(e) {
      if (e.pointerType === "mouse" && e.button !== 0) {
        downPt = null;
        return;
      }
      if (!downPt) return;
      const moved = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
      const quick = Date.now() - downPt.t < 500;
      downPt = null;
      if (moved > 12 || !quick) return;
      const x = xFromClient(e.clientX);
      if (x == null) return;
      if (pinX != null && chart.X) {
        const dist = Math.abs(chart.X(x) - chart.X(pinX));
        if (dist <= PIN_HIT_PX) {
          pinX = null;
          draw();
          return;
        }
      }
      pinX = x;
      hoverX = null;
      draw();
    }
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onTap);
    const chart = {
      draw,
      update(newOpts) {
        const next = { ...o, ...newOpts };
        const fp = fingerprint(next);
        if (fp === lastFp) return;
        o = next;
        lastFp = fp;
        if (!isMobile()) {
          draw();
          return;
        }
        const wait = 2e3 - (Date.now() - lastDrawAt);
        if (wait <= 0) {
          draw();
          return;
        }
        pendingOpts = o;
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          if (pendingOpts) {
            o = pendingOpts;
            pendingOpts = null;
            draw();
          }
        }, wait);
      },
      destroy() {
        registry.delete(chart);
        ro.disconnect();
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointerup", onTap);
        if (throttleTimer) clearTimeout(throttleTimer);
      }
    };
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    registry.add(chart);
    lastFp = fingerprint(o);
    draw();
    return chart;
  }
  function legend(container, items) {
    let lg = container.querySelector(":scope > .chart-legend");
    if (!lg) {
      lg = document.createElement("div");
      lg.className = "chart-legend";
      container.appendChild(lg);
    }
    lg.innerHTML = items.map((i) => `<span class="li"><span class="sw" style="background:${i.color.startsWith("--") ? `var(${i.color})` : i.color}"></span>${i.name}</span>`).join("");
  }
  function spark(canvas, points, { color = "--s1", height = 30, baseline = null } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 70;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    canvas.style.touchAction = "pan-y";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (points.length < 2) return;
    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
      if (p < lo) lo = p;
      if (p > hi) hi = p;
    }
    if (baseline != null) {
      lo = Math.min(lo, baseline);
      hi = Math.max(hi, baseline);
    }
    if (hi === lo) hi = lo + 1;
    const X = (i) => i / (points.length - 1) * (w - 4) + 2;
    const Y = (v) => height - 4 - (v - lo) / (hi - lo) * (height - 8);
    if (baseline != null) {
      ctx.strokeStyle = resolve("--baseline");
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(2, Y(baseline));
      ctx.lineTo(w - 2, Y(baseline));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = resolve(color);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(X(i), Y(p)) : ctx.moveTo(X(i), Y(p)));
    ctx.stroke();
    ctx.fillStyle = resolve(color);
    ctx.beginPath();
    ctx.arc(X(points.length - 1), Y(points[points.length - 1]), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // src/content/missions.js
  var MISSIONS = [
    {
      id: "first-covered-call",
      title: "The Rent Collector",
      icon: "\u{1F6E1}\uFE0F",
      skill: "covered-call",
      lessonId: "c-covered-calls",
      scenarioId: "slow-bleed",
      seed: 20101,
      startCash: 25e3,
      endDay: 11,
      brief: "The tape is quiet and drifting sideways \u2014 the exact regime where equity holders get paid for patience instead of praying for a breakout.\n\n**Buy 100 shares of BRGR and sell 1 out-of-the-money call against them**, then hold the covered call through Day 10 while keeping your drawdown under 15%.",
      hints: [
        "A covered call pairs +100 shares of BRGR with \u22121 call on the same ticket.",
        "Select a call strike above the current spot price so you collect extrinsic rent while leaving modest upside room.",
        "Stay patient through Day 10 \u2014 time decay accelerates as expiration approaches."
      ],
      objectives: [
        { type: "open", strategy: "covered-call", sym: "BRGR", label: "Open a covered call on BRGR" },
        { type: "holdThrough", day: 10, sym: "BRGR", label: "Hold the BRGR position through Day 10" },
        { type: "maxDrawdown", pct: 0.15, label: "Keep drawdown under 15%" }
      ],
      debriefPass: "You collected steady theta while the slow-bleed tape went nowhere. Notice how the short call premium lowered your effective cost basis and buffered the mild downward drift across all ten sessions.",
      debriefFail: "Check whether you paired the 100 shares with a short call on BRGR and held through Day 10. In a slow-bleed regime where realized volatility undershoots implied, selling covered premium is how you get paid to wait."
    },
    {
      id: "crash-insurance",
      title: "The Umbrella Before the Storm",
      icon: "\u2614",
      skill: "protective-put",
      lessonId: "c-puts-protective",
      scenarioId: "crash-week",
      seed: 20102,
      startCash: 25e3,
      endDay: 6,
      brief: "Calm surface readings can hide sudden regime shifts, and hedging after a gap down means paying panic prices for protection.\n\n**Open a protective put on PWRS** (100 shares plus 1 long put) on Day 1 and hold through Day 5 while keeping your total drawdown under 12%.",
      hints: [
        "A protective put combines +100 shares and +1 put on the same ticket.",
        "Buy your put on Day 1 before the Day 2 panic regime shift inflates implied volatility and gaps the market lower.",
        "Pick an at-the-money or slightly out-of-the-money put strike to put a hard floor under your share losses."
      ],
      objectives: [
        { type: "open", strategy: "protective-put", sym: "PWRS", label: "Open stock + protective put on PWRS" },
        { type: "maxDrawdown", pct: 0.12, label: "Keep max drawdown under 12%" },
        { type: "holdThrough", day: 5, sym: "PWRS", label: "Hold protection through Day 5" }
      ],
      debriefPass: "When the Day 2 panic shock and Days 3\u20134 aftershocks hit the index, your long put gained intrinsic value and vega just as the shares fell. That hard floor under your equity curve is the exact tradeoff of prepaid insurance.",
      debriefFail: "Unhedged or oversized equity exposure gets mauled when correlations spike during a panic regime shift. Always attach the put on Day 1 while implied volatility is calm and keep your share size within the drawdown budget."
    },
    {
      id: "theta-tax-conviction",
      title: "Right Idea, Ticking Clock",
      icon: "\u23F1\uFE0F",
      skill: "long-call",
      lessonId: "c-buying-calls",
      scenarioId: "slow-bleed",
      seed: 20103,
      startCash: 25e3,
      endDay: 8,
      brief: "You want bullish exposure on RCKT, but buying calls means renting a melting asset on a strict deadline.\n\n**Open a long call on RCKT**, manage the position as the quiet tape unfolds, and **be completely flat by Day 6** with a drawdown under 8%.",
      hints: [
        "Avoid buying multiple far out-of-the-money contracts; one at-the-money or slightly in-the-money call wastes less cash on pure extrinsic value.",
        "Watch the daily mark as the slow-bleed sessions pass \u2014 without a sharp rally, theta eats the option every afternoon.",
        "Close your RCKT call before Day 6 begins so the flatBy objective latches green."
      ],
      objectives: [
        { type: "open", strategy: "long-call", sym: "RCKT", label: "Open a long call on RCKT" },
        { type: "flatBy", day: 6, label: "Close all positions by Day 6" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "You saw firsthand why call buyers need direction, magnitude, and speed all at once. Because the slow-bleed cassette delivered calm drift instead of a breakout, exiting by Day 6 salvaged your remaining time value before late-stage decay accelerated.",
      debriefFail: "Either you held past the Day 6 exit deadline or over-sized the call purchase. When a bullish catalyst fails to materialize on schedule, cutting a decaying long call early is how you preserve capital for the next trade."
    },
    {
      id: "paid-to-shop",
      title: "Paid to Wait at the Bid",
      icon: "\u{1F6D2}",
      skill: "cash-secured-put",
      lessonId: "c-puts-protective",
      scenarioId: "slow-bleed",
      seed: 20104,
      startCash: 25e3,
      endDay: 11,
      brief: "Instead of chasing BRGR at the market price, you can get paid upfront to post a lower limit-style entry by underwriting downside insurance.\n\n**Open a cash-secured put on BRGR** and hold it through Day 9 while keeping your drawdown under 10% and finishing with a net profit of at least $10.",
      hints: [
        "Select 1 short put (\u22121 put) on BRGR; the sandbox automatically reserves the strike cash to keep the trade fully secured.",
        "Choose an out-of-the-money put strike below spot so the mild slow-bleed drift stays comfortably above your breakeven.",
        "Let the quiet sessions run through Day 9 so theta drains the put premium into your cash balance."
      ],
      objectives: [
        { type: "open", strategy: "cash-secured-put", sym: "BRGR", label: "Open a cash-secured put on BRGR" },
        { type: "holdThrough", day: 9, sym: "BRGR", label: "Hold the short put through Day 9" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" },
        { type: "profit", min: 10, label: "Finish with at least +$10 net profit" }
      ],
      debriefPass: "While the slow-bleed tape drifted gently, realized volatility stayed well below the implied forecast embedded in your put. You harvested the time value as pure carry while standing ready to own BRGR at a discount.",
      debriefFail: "Check that you sold an out-of-the-money put on BRGR and held it through Day 9 without closing early at a loss. Selling a strike too deep in-the-money exposes you to delta losses on the mild downward drift."
    },
    {
      id: "defined-conviction-vertical",
      title: "Selling the Expensive Tail",
      icon: "\u{1F4D0}",
      skill: "call-vertical",
      lessonId: "c-vertical-spreads",
      scenarioId: "earnings-crush",
      seed: 20105,
      startCash: 25e3,
      endDay: 7,
      brief: "RCKT reports earnings on Day 6, and front-week implied volatility is swelling \u2014 making outright calls dangerously expensive to carry through the print.\n\n**Open a call vertical on RCKT** to offset your vega and theta exposure, then **close all positions by Day 6** with a max drawdown under 8%.",
      hints: [
        "Build a call vertical by pairing +1 call at a lower strike with \u22121 call at a higher strike in the same expiration.",
        "Selling the upper call leg finances part of the inflated pre-earnings IV, reducing both your net debit and your vega exposure.",
        "Close the spread on or before Day 6 so you are completely flat by the deadline."
      ],
      objectives: [
        { type: "open", strategy: "call-vertical", sym: "RCKT", label: "Open a call vertical on RCKT" },
        { type: "flatBy", day: 6, label: "Be flat by Day 6" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "By pairing a short call against your long call, you refused to overpay for the extreme tail of the pre-earnings distribution. Even when RCKT barely budged on Day 6 and front-week IV collapsed, the short leg cushioned the volatility crush.",
      debriefFail: "Make sure you opened a two-leg call vertical (+1 call, \u22121 call at a different strike) on RCKT and closed it by Day 6. Carrying unspread long premium into an earnings print leaves you fully exposed to the Day 6 volatility crush."
    },
    {
      id: "iv-crush-trap",
      title: "The IV-Crush Trap",
      icon: "\u{1F9CA}",
      skill: "long-straddle",
      lessonId: "c-straddles-strangles",
      scenarioId: "earnings-crush",
      seed: 20106,
      startCash: 25e3,
      endDay: 7,
      brief: 'Beginners love buying straddles right before earnings because "the stock has to move" \u2014 forgetting that the option market already priced the expected jump into the inflated premium.\n\nStep into the lab to see why: **open a long straddle on RCKT** before the Day 6 earnings release, then **close it and be flat by Day 7** while keeping your account drawdown under 20%. (Watch what Day 6 does to your both-sides premium!)',
      hints: [
        "A long straddle combines +1 call and +1 put at the exact same strike and expiration.",
        "Hold the straddle into Day 6 to observe the post-earnings implied volatility crush firsthand, then close it before Day 7.",
        "Keep your contract quantity small (1 lot) so the Day 6 IV collapse stays well inside the 20% drawdown cap."
      ],
      objectives: [
        { type: "open", strategy: "long-straddle", sym: "RCKT", label: "Open a long straddle on RCKT" },
        { type: "flatBy", day: 7, label: "Close the straddle and be flat by Day 7" },
        { type: "maxDrawdown", pct: 0.2, label: "Keep max drawdown under 20%" }
      ],
      debriefPass: "You survived the classic earnings lesson in a controlled sandbox. Notice how RCKT printed an in-line 0.8% move on Day 6 while front-month IV plunged by nearly a third \u2014 deflating both the call and the put simultaneously because reality fell short of the priced-in move.",
      debriefFail: "If you breached the drawdown limit, you bought too many straddle contracts at peak pre-earnings IV; if you missed the deadline, you forgot to close by Day 7. When you buy a straddle into a known event, you lose unless the actual move beats the implied move."
    },
    {
      id: "blowup-shield",
      title: "Calm Before the Detonation",
      icon: "\u{1F4A5}",
      skill: "protective-put",
      lessonId: "c-using-iv",
      scenarioId: "short-vol-blowup",
      seed: 20107,
      startCash: 25e3,
      endDay: 6,
      brief: "Four tranquil sessions have compressed implied volatility to cycle lows \u2014 the exact environment when portfolio protection is on sale and complacency is highest.\n\n**Open a protective put on LMND** (100 shares plus 1 put) while volatility is cheap and **hold it through Day 5** when the regime fractures, keeping your drawdown under 10%.",
      hints: [
        "A protective put on LMND combines +100 shares (~$4,200) and +1 put on a single ticket during the calm Days 1\u20134 window.",
        "Buy the put while the market is still in its calm regime so you pay cycle-low implied volatility before Day 5.",
        "Hold the position through the Day 5 \u22126% index shock so your long put floors the correlated selloff."
      ],
      objectives: [
        { type: "open", strategy: "protective-put", sym: "LMND", label: "Open a protective put on LMND" },
        { type: "holdThrough", day: 5, sym: "LMND", label: "Hold through the Day 5 vol blowup" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" }
      ],
      debriefPass: "You bought storm insurance during a four-day drought and held it straight through the Day 5 \u22126% panic shock. Because implied volatility sat near cycle lows on Days 1\u20134, the put cost very little before jumping in value when the regime flipped.",
      debriefFail: "Make sure you opened +100 shares of LMND paired with +1 put before the Day 5 shock and held through Day 5. Low-IV regimes are the cheapest moments to attach tail protection to equity positions."
    },
    {
      id: "pin-risk-escape",
      title: "Gravity Well at the Strike",
      icon: "\u{1F4CC}",
      skill: "put-vertical",
      lessonId: "p-expiry-vega-shocks",
      scenarioId: "pin-risk-friday",
      seed: 20108,
      startCash: 25e3,
      endDay: 5,
      brief: "Heavy open interest is magnetizing LMND toward its weekly strike as Friday expiration nears, turning at-the-money gamma into a violent coin flip.\n\n**Open a put vertical on LMND** early in the week, hold it through Day 3, and **get completely flat by Day 5** while keeping your drawdown under 10%.",
      hints: [
        "A put vertical pairs +1 put and \u22121 put at different strikes on LMND.",
        "Keep the spread open through Day 3 as dealer hedging pulls LMND back and forth.",
        "Close the vertical before Day 5 settlement so you are flat when LMND pins the strike."
      ],
      objectives: [
        { type: "open", strategy: "put-vertical", sym: "LMND", label: "Open a put vertical on LMND" },
        { type: "holdThrough", day: 3, sym: "LMND", label: "Hold the spread through Day 3" },
        { type: "flatBy", day: 5, label: "Be flat by Day 5 (pin day)" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" }
      ],
      debriefPass: "You harvested what the mid-week moves offered and stepped off the tracks before the Day 5 pin. When dealer delta-hedging traps spot right on a strike into Friday close, exiting early avoids exploding ATM gamma and last-hour pin risk.",
      debriefFail: "Review your timeline: you must hold the LMND put vertical through Day 3 and close it so you have zero open positions by Day 5. Carrying a vertical into a pinned expiration turns a controlled spread into an all-or-nothing settlement gamble."
    },
    {
      id: "strangle-the-quiet",
      title: "Cutting the Theta Bleed",
      icon: "\u2702\uFE0F",
      skill: "long-strangle",
      lessonId: "c-straddles-strangles",
      scenarioId: "slow-bleed",
      seed: 20109,
      startCash: 25e3,
      endDay: 9,
      brief: "You bought an out-of-the-money strangle on GLXY hoping for a media breakout, but the market just entered a dead-calm ten-day drift.\n\n**Open a long strangle on GLXY**, recognize that realized volatility is starving your position, and **cut the trade to be flat by Day 5** with a drawdown under 5% and total loss no worse than \u2212$150.",
      hints: [
        "A long strangle combines +1 OTM call and +1 OTM put at different strikes on GLXY.",
        "Do not wait for a miracle in a slow-bleed tape \u2014 every calm session drains extrinsic value from both wings.",
        "Close the strangle within a day or two of opening (and strictly before Day 5) so theta drag stays tiny."
      ],
      objectives: [
        { type: "open", strategy: "long-strangle", sym: "GLXY", label: "Open a long strangle on GLXY" },
        { type: "flatBy", day: 5, label: "Cut the trade and be flat by Day 5" },
        { type: "maxDrawdown", pct: 0.05, label: "Keep max drawdown under 5%" },
        { type: "profit", min: -150, label: "Keep net P&L above \u2212$150" }
      ],
      debriefPass: "A small, controlled scratch is a victory when your volatility thesis is wrong. In the slow-bleed cassette, realized volatility stayed far below implied; closing by Day 5 saved your wing premium from decaying to zero.",
      debriefFail: "Holding a long strangle through a quiet tape lets theta devour both legs day after day. Size the GLXY strangle modestly and close it well before Day 5 so the cumulative decay never breaches the \u2212$150 floor."
    },
    {
      id: "first-week-on-the-desk",
      title: "First Week on the Desk",
      icon: "\u{1F3DB}\uFE0F",
      skill: "iron-condor",
      lessonId: "c-vertical-spreads",
      scenarioId: "crash-week",
      seed: 20110,
      startCash: 25e3,
      endDay: 6,
      brief: "Welcome to the capstone evaluation: you have $25,000 on the desk, a full option chain across six tickers, and a volatile five-day week ahead.\n\n**Open any defined-risk position**, hold active exposure through Day 4, keep your max drawdown at or below 10%, and **finish Day 6 with P&L of \u2212$250 or better**.",
      hints: [
        "Crash Week hits on Day 2 with a \u22124% index shock and panic volatility \u2014 bearish verticals, protective puts, or tightly sized spreads survive best.",
        "Keep your position size small relative to your $25,000 ledger so the Day 2\u20134 aftershocks never threaten the 10% drawdown ceiling.",
        "Maintain at least one open position through Day 4 to satisfy the holdThrough requirement."
      ],
      objectives: [
        { type: "open", label: "Open a defined-risk position" },
        { type: "holdThrough", day: 4, label: "Hold exposure through Day 4" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" },
        { type: "profit", min: -250, label: "Finish with P&L of \u2212$250 or better" }
      ],
      debriefPass: "You traded through a \u22124% flash selloff and two days of forced-liquidation aftershocks without blowing your risk limits. Surviving a panic regime comes down to defined-risk structure selection and disciplined position sizing before the storm hits.",
      debriefFail: "Crash Week punishes oversized bullish bets and unhedged short volatility when Day 2 panic hits. Re-enter with a smaller defined-risk structure \u2014 such as a put vertical, protective put, or tight iron condor \u2014 and hold through Day 4."
    },
    {
      id: "w2-strangle-shock-catcher",
      title: "Convexity Before the Shock",
      icon: "\u26A1",
      skill: "long-strangle",
      lessonId: "c-straddles-strangles",
      scenarioId: "short-vol-blowup",
      seed: 21101,
      startCash: 25e3,
      endDay: 6,
      brief: "In Week 1 you learned to cut a long strangle when a slow-bleed tape starved it of volatility. Now see the other side of long-strangle discipline: buying out-of-the-money wings when implied volatility is compressed to cycle lows and a regime shock hits.\n\n**Open a long strangle on PWRS** during the calm window, **hold it through the Day 5 volatility blowup**, and **close the position to be flat by Day 6** while keeping your drawdown under 10%.",
      hints: [
        "A long strangle pairs +1 OTM call and +1 OTM put at different strikes in the same expiration on PWRS.",
        "Size modestly during Days 1\u20134 so four sessions of calm theta decay stay well inside your 10% drawdown ceiling.",
        "Let the Day 5 \u22126% panic shock reprice both implied volatility and your put wing, then close the strangle before Day 6."
      ],
      objectives: [
        { type: "open", strategy: "long-strangle", sym: "PWRS", label: "Open a long strangle on PWRS" },
        { type: "holdThrough", day: 5, sym: "PWRS", label: "Hold the strangle through Day 5" },
        { type: "flatBy", day: 6, label: "Harvest the spike and be flat by Day 6" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" }
      ],
      debriefPass: "That is textbook long-strangle discipline: you bought cheap convexity during a low-IV drought, sized small enough to endure four quiet sessions of theta bleed, and monetized the Day 5 panic move before time decay resumed.",
      debriefFail: "Make sure you opened +1 OTM call and +1 OTM put on PWRS, held through the Day 5 volatility expansion, and closed the trade before Day 6 without over-sizing into a 10% drawdown."
    },
    {
      id: "w2-condor-range-harvest",
      title: "Fencing the Quiet Range",
      icon: "\u{1F985}",
      skill: "iron-condor",
      lessonId: "c-vertical-spreads",
      scenarioId: "slow-bleed",
      seed: 21102,
      startCash: 25e3,
      endDay: 10,
      brief: "When realized volatility stays well below implied volatility across a ten-day drift, range traders can collect theta from both sides of the distribution while keeping tail risk strictly capped.\n\n**Open an iron condor on BRGR**, **hold the spread through Day 8** as time decay erodes both short verticals, keep your drawdown under 8%, and **finish with at least +$15 net profit**.",
      hints: [
        "An iron condor combines a short OTM put vertical (\u22121 higher-strike OTM put, +1 lower-strike OTM put) with a short OTM call vertical (\u22121 lower-strike OTM call, +1 higher-strike OTM call) in the same expiration.",
        "Place your short strikes outside the expected drift range of BRGR so spot stays between your inner wings through Day 8.",
        "Keep contract quantity small so your defined max loss reserves only a fraction of your $25,000 ledger."
      ],
      objectives: [
        { type: "open", strategy: "iron-condor", sym: "BRGR", label: "Open an iron condor on BRGR" },
        { type: "holdThrough", day: 8, sym: "BRGR", label: "Hold the condor through Day 8" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" },
        { type: "profit", min: 15, label: "Finish with at least +$15 net profit" }
      ],
      debriefPass: "By fencing BRGR inside wide out-of-the-money wings and capping both tails with long protection legs, you turned ten sleepy sessions into steady two-sided theta carry without taking naked short-volatility risk.",
      debriefFail: "Verify that all four legs of the BRGR iron condor share the same expiration and that your short strikes sit outside the mild downward drift so you can hold through Day 8 with at least +$15 net profit."
    },
    {
      id: "w2-crash-put-vertical",
      title: "Defined-Risk Bear Hedge",
      icon: "\u{1F4C9}",
      skill: "put-vertical",
      lessonId: "c-vertical-spreads",
      scenarioId: "crash-week",
      seed: 21103,
      startCash: 25e3,
      endDay: 6,
      brief: "Buying outright puts for a selloff requires overcoming steep extrinsic cost, whereas a put vertical sells a lower-strike put to help finance the hedge and define your target zone.\n\n**Open a put vertical on GLXY**, **hold it through Day 4** across the Crash Week selloff and aftershocks, and **close all positions by Day 5** with a drawdown under 8%.",
      hints: [
        "Build a bearish put vertical on GLXY by buying 1 near-the-money put (+1 put) and selling 1 lower-strike out-of-the-money put (\u22121 put) in the same expiration.",
        "Enter on Day 1 before the Day 2 panic gap down pushes GLXY toward your lower strike.",
        "Hold through the Day 3\u20134 aftershocks, then close the spread before Day 5 so the flatBy objective latches green."
      ],
      objectives: [
        { type: "open", strategy: "put-vertical", sym: "GLXY", label: "Open a put vertical on GLXY" },
        { type: "holdThrough", day: 4, sym: "GLXY", label: "Hold the spread through Day 4" },
        { type: "flatBy", day: 5, label: "Close the spread and be flat by Day 5" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "Your long put captured the directional slide across Days 2\u20134 while the short lower-strike put reduced your upfront debit and insulated the position when volatility plateaued into Day 5.",
      debriefFail: "Check that you opened a two-leg put vertical (+1 higher-strike put, \u22121 lower-strike put) on GLXY, held it through Day 4, and closed it completely before Day 5."
    },
    {
      id: "w2-fam500-index-discipline",
      title: "Index Discipline on FAM500",
      icon: "\u{1F9ED}",
      skill: "index-discipline",
      lessonId: "c-using-iv",
      scenarioId: "crash-week",
      seed: 21104,
      startCash: 25e3,
      endDay: 6,
      brief: "Single-name stocks carry idiosyncratic jump risk, while broad index options on FAM500 let you express macro regime discipline directly on the benchmark.\n\nTrade **FAM500 only**: **open any defined-risk position on FAM500**, **hold active FAM500 exposure through Day 4** as the Crash Week shocks unfold, and **be completely flat by Day 6** with a max drawdown under 8%.",
      hints: [
        "Stick strictly to the FAM500 index chain \u2014 a bearish put vertical or protective put structure handles the Day 2 \u22124% index gap and Days 3\u20134 aftershocks cleanly.",
        "Size your FAM500 contracts so the $500 index spot multiplier stays comfortably inside the 8% drawdown budget.",
        "Hold your FAM500 structure through Day 4 and close all legs before Day 6."
      ],
      objectives: [
        { type: "open", sym: "FAM500", label: "Open a defined-risk position on FAM500" },
        { type: "holdThrough", day: 4, sym: "FAM500", label: "Hold FAM500 exposure through Day 4" },
        { type: "flatBy", day: 6, label: "Close all positions and be flat by Day 6" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "You demonstrated clean index discipline on FAM500 \u2014 sizing for a high-notional benchmark, surviving three sessions of macro panic and forced liquidation, and flattening on schedule inside an 8% drawdown envelope.",
      debriefFail: "Make sure your trade is opened on FAM500, sized for a $500 index underlying so drawdown stays under 8%, held through Day 4, and closed before Day 6."
    }
  ];

  // src/state/missions.js
  var FEE2 = 0.65;
  var S = null;
  function list() {
    const p = active();
    return MISSIONS.map((m) => ({ ...m, done: !!p?.missions?.[m.id]?.passed, best: p?.missions?.[m.id] || null }));
  }
  var byId = (id) => MISSIONS.find((m) => m.id === id) || null;
  var session = () => S;
  function start2(id) {
    const def = byId(id);
    if (!def) return { err: "Unknown mission" };
    const gate = canStartMission(id);
    if (gate.err) return gate;
    const market2 = createMarket({ seed: def.seed, scenarioId: def.scenarioId });
    S = {
      def,
      market: market2,
      cash: def.startCash ?? 25e3,
      positions: [],
      log: [],
      marks: [{ day: market2.day, eq: def.startCash ?? 25e3 }],
      objectives: def.objectives.map((o) => ({ ...o, met: o.type === "flatBy" ? true : false, latched: false })),
      status: "active",
      failReason: null
    };
    log("\u{1F680}", `Mission start: ${def.title}`);
    bus.emit("mission", S);
    return { ok: true, session: S };
  }
  function log(icon2, text) {
    S.log.unshift({ icon: icon2, text, day: S.market.day });
  }
  var mult3 = (l) => l.kind === "stock" ? 1 : 100;
  function positionValue(pos) {
    return pos.legs.reduce((s2, l) => {
      const px = l.kind === "stock" ? S.market.quote(pos.sym).S : S.market.optQuote(pos.sym, l.strike, l.expDay, l.kind).mid;
      return s2 + l.side * l.qty * mult3(l) * px;
    }, 0);
  }
  function equity2() {
    if (!S) return 0;
    return S.cash + S.positions.reduce((s2, p) => s2 + positionValue(p), 0) + reservedTotal2();
  }
  var reservedTotal2 = () => S.positions.reduce((s2, p) => s2 + (p.reserved || 0), 0);
  function trade(sym, legsSpec, label) {
    if (!S || S.status !== "active") return { err: "No active mission" };
    const legs = legsSpec.map((l) => {
      if (l.kind === "stock") return { ...l, entry: S.market.quote(sym).S };
      const q = S.market.optQuote(sym, l.strike, l.expDay, l.kind);
      return { ...l, entry: l.side > 0 ? q.ask : q.bid };
    });
    if (!isDefinedRisk(legs)) return { err: "Missions allow defined-risk positions only \u2014 cap your downside first." };
    const cost = entryCost(legs);
    const fees = legs.filter((l) => l.kind !== "stock").reduce((s2, l) => s2 + FEE2 * l.qty, 0);
    const Sref = S.market.quote(sym).S;
    const ml = maxLossAtExpiry(legs, Sref);
    const reserved = cost < 0 ? Math.max(0, -ml.amount) : 0;
    if (cost + fees + reserved > S.cash) return { err: "Not enough mission cash for this position (including the risk reserve)." };
    S.cash -= cost + fees + reserved;
    const pos = { id: "m" + Math.random().toString(36).slice(2, 8), sym, legs, label: label || classify(legs), reserved, openDay: S.market.day };
    S.positions.push(pos);
    log("\u{1F3AB}", `Opened ${pos.label} on ${sym} (${cost >= 0 ? "debit" : "credit"} $${Math.abs(cost).toFixed(0)})`);
    evaluate("trade", pos);
    bus.emit("mission", S);
    return { ok: true, pos };
  }
  function closePos(id) {
    if (!S || S.status !== "active") return { err: "No active mission" };
    const i = S.positions.findIndex((p) => p.id === id);
    if (i < 0) return { err: "Unknown position" };
    const pos = S.positions[i];
    const val = pos.legs.reduce((s2, l) => {
      if (l.kind === "stock") return s2 + l.side * l.qty * S.market.quote(pos.sym).S;
      const q = S.market.optQuote(pos.sym, l.strike, l.expDay, l.kind);
      return s2 + l.side * l.qty * 100 * (l.side > 0 ? q.bid : q.ask);
    }, 0);
    const fees = pos.legs.filter((l) => l.kind !== "stock").reduce((s2, l) => s2 + FEE2 * l.qty, 0);
    S.cash += val - fees + (pos.reserved || 0);
    S.positions.splice(i, 1);
    log("\u{1F3C1}", `Closed ${pos.label}`);
    evaluate("close", pos);
    bus.emit("mission", S);
    return { ok: true };
  }
  function advanceDay() {
    if (!S || S.status !== "active") return;
    const un = S.market.on("dayClose", (closingDay) => settle2(closingDay));
    S.market.advanceDay();
    un();
    S.marks.push({ day: S.market.day, eq: equity2() });
    evaluate("day");
    bus.emit("mission", S);
  }
  function settle2(closingDay) {
    for (let i = S.positions.length - 1; i >= 0; i--) {
      const pos = S.positions[i];
      const expired = pos.legs.filter((l) => l.kind !== "stock" && l.expDay <= closingDay);
      if (!expired.length) continue;
      const px = S.market.quote(pos.sym).S;
      let credit = 0;
      for (const l of expired) {
        const intrinsic = l.kind === "call" ? Math.max(0, px - l.strike) : Math.max(0, l.strike - px);
        credit += l.side * l.qty * 100 * intrinsic;
      }
      pos.legs = pos.legs.filter((l) => !(l.kind !== "stock" && l.expDay <= closingDay));
      S.cash += credit;
      if (!pos.legs.length) {
        S.cash += pos.reserved || 0;
        S.positions.splice(i, 1);
      }
      log("\u23F3", `Options expired on ${pos.sym} \u2014 settled $${credit.toFixed(0)}`);
    }
  }
  function evaluate(trigger, pos) {
    if (!S || S.status !== "active") return;
    const eq = equity2();
    const start5 = S.def.startCash ?? 25e3;
    for (const o of S.objectives) {
      switch (o.type) {
        case "open":
          if (trigger === "trade" && pos && !o.latched) {
            const strat = classify(pos.legs);
            if ((!o.strategy || strat === o.strategy) && (!o.sym || pos.sym === o.sym)) {
              o.met = true;
              o.latched = true;
            }
          }
          break;
        case "holdThrough":
          if (!o.latched) {
            const held = S.positions.some((p) => (!o.sym || p.sym === o.sym) && p.openDay <= (o.fromDay ?? p.openDay));
            if (S.market.day >= o.day) {
              o.met = held || o.met;
              o.latched = true;
            } else if (trigger === "close" && !S.positions.length) {
            }
          }
          break;
        case "flatBy":
          if (S.market.day >= o.day) {
            o.met = S.positions.length === 0;
          }
          break;
        case "profit":
          o.met = eq - start5 >= o.min;
          break;
        case "maxDrawdown":
          if (eq < start5 * (1 - o.pct)) {
            fail(`Drawdown breached ${Math.round(o.pct * 100)}% \u2014 position sizing is the lesson here.`);
            return;
          }
          o.met = true;
          break;
      }
    }
    if (S.market.day >= S.def.endDay) {
      if (S.objectives.every((o) => o.met)) pass();
      else fail("Mission deadline reached with objectives unmet.");
    }
  }
  function pass() {
    S.status = "passed";
    const p = active();
    if (p) {
      p.missions = p.missions || {};
      const first = !Object.values(p.missions).some((m) => m.passed);
      p.missions[S.def.id] = { passed: true, equity: Math.round(equity2()), when: Date.now() };
      save();
      addXP(75, "mission passed");
      if (first) grant("first-mission");
      if (Object.values(p.missions).filter((m) => m.passed).length >= 5) grant("mission-5");
    }
    log("\u{1F3C6}", "Mission PASSED");
    bus.emit("mission", S);
  }
  function fail(reason) {
    S.status = "failed";
    S.failReason = reason;
    const p = active();
    if (p) {
      p.missions = p.missions || {};
      if (!p.missions[S.def.id]?.passed) p.missions[S.def.id] = { passed: false, when: Date.now() };
      save();
    }
    log("\u{1F4A5}", "Mission failed: " + reason);
    bus.emit("mission", S);
  }
  function abandon() {
    S = null;
    bus.emit("mission", null);
  }

  // src/state/billing-config.js
  var BILLING = {
    stripePublishableKey: "pk_test_51UasEn5ymM4ksXjVtNuF0sUi7gCdf6OwvaHw0MZgMPXuctEiv8caeQstX0Z3FbvgEwzasBgmUW0GGZVeRrNmWaz000x1arWsa3",
    // sandbox
    supabaseUrl: "https://txvjpkpgrsnpadhexwdg.supabase.co",
    supabaseAnonKey: "sb_publishable_70FODFBQHPyNzvORPiGtrQ_BSEmfa8c",
    // new-format publishable key (client-safe)
    priceIdMonthly: "price_1Uazg55ymM4ksXjV6NJS22eD",
    // $29/mo (sandbox)
    priceIdAnnual: "price_1Uazg55ymM4ksXjVPZJnVBbl",
    // $228/yr (sandbox)
    priceMonthlyUsd: 29,
    priceAnnualUsd: 228
  };

  // src/state/auth.js
  var STORAGE_KEY = "oa.auth";
  var REFRESH_MARGIN_MS = 6e4;
  var storage2 = typeof localStorage !== "undefined" ? localStorage : (
    /** @type {any} */
    {
      getItem: () => null,
      setItem: () => {
      },
      removeItem: () => {
      }
    }
  );
  var session2 = null;
  var refreshTimer = null;
  var inflightRefresh = null;
  var listeners2 = [];
  function configured() {
    return Boolean(
      BILLING && typeof BILLING.supabaseUrl === "string" && BILLING.supabaseUrl.trim() && typeof BILLING.supabaseAnonKey === "string" && BILLING.supabaseAnonKey.trim()
    );
  }
  function baseUrl() {
    return BILLING.supabaseUrl.trim().replace(/\/+$/, "") + "/auth/v1";
  }
  function headers(token) {
    const h = {
      apikey: BILLING.supabaseAnonKey.trim(),
      "Content-Type": "application/json"
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }
  function resolveExpiresAtMs(data) {
    if (typeof data?.expires_at === "number" && Number.isFinite(data.expires_at)) {
      return data.expires_at < 1e12 ? data.expires_at * 1e3 : data.expires_at;
    }
    const sec = typeof data?.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
    return Date.now() + sec * 1e3;
  }
  function friendlyError(data, status2) {
    const code = String(data?.error_code || data?.code || data?.error || "").toLowerCase();
    const raw = String(data?.msg || data?.error_description || data?.message || data?.error || "");
    const lower = raw.toLowerCase();
    if (code === "invalid_credentials" || code === "invalid_grant" || lower.includes("invalid login credentials")) {
      return "Invalid email or password.";
    }
    if (code === "user_already_exists" || code === "email_exists" || lower.includes("already registered") || lower.includes("already been registered")) {
      return "An account with this email already exists. Try signing in.";
    }
    if (code === "weak_password" || lower.includes("password should be") || lower.includes("weak password")) {
      return "Password is too weak \u2014 please use at least 6 characters.";
    }
    if (code === "email_not_confirmed" || lower.includes("email not confirmed")) {
      return "Please confirm your email address before signing in.";
    }
    if (status2 === 429 || code.includes("rate_limit") || lower.includes("rate limit") || lower.includes("too many")) {
      return "Too many attempts \u2014 please wait a moment and try again.";
    }
    if (lower.includes("unable to validate email") || lower.includes("invalid email")) {
      return "Please enter a valid email address.";
    }
    return raw || "Authentication failed. Please try again.";
  }
  function notify() {
    const u = user();
    for (const cb of [...listeners2]) {
      try {
        cb(u);
      } catch (e) {
        console.error(e);
      }
    }
  }
  function clearRefreshTimer() {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }
  function scheduleRefresh() {
    clearRefreshTimer();
    if (!configured() || !session2?.refresh_token) return;
    const delay = Math.max(1e3, session2.expires_at - Date.now() - REFRESH_MARGIN_MS);
    refreshTimer = setTimeout(() => {
      refreshSession().catch(() => {
      });
    }, delay);
  }
  function parseSession(data) {
    if (!data || typeof data.access_token !== "string" || !data.access_token) return null;
    const u = data.user;
    if (!u || typeof u.id !== "string") return null;
    return {
      access_token: data.access_token,
      refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : "",
      expires_at: resolveExpiresAtMs(data),
      user: { id: u.id, email: String(u.email || "") }
    };
  }
  function persistSession(next, emit = true) {
    session2 = next;
    try {
      if (next) storage2.setItem(STORAGE_KEY, JSON.stringify(next));
      else storage2.removeItem(STORAGE_KEY);
    } catch {
    }
    if (next) scheduleRefresh();
    else clearRefreshTimer();
    if (emit) notify();
  }
  function restoreSession() {
    if (!configured()) {
      session2 = null;
      return;
    }
    try {
      const raw = storage2.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const restored = parseSession(parsed);
      if (!restored) return;
      session2 = restored;
      scheduleRefresh();
    } catch {
      session2 = null;
    }
  }
  async function refreshSession() {
    if (!configured() || !session2?.refresh_token) return null;
    if (inflightRefresh) return inflightRefresh;
    inflightRefresh = (async () => {
      try {
        const res = await fetch(`${baseUrl()}/token?grant_type=refresh_token`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ refresh_token: session2.refresh_token })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            persistSession(null, true);
          }
          return null;
        }
        const next = parseSession(data);
        if (!next) {
          persistSession(null, true);
          return null;
        }
        persistSession(next, true);
        return next.access_token;
      } catch {
        return session2?.access_token ?? null;
      } finally {
        inflightRefresh = null;
      }
    })();
    return inflightRefresh;
  }
  async function signUp(email, password) {
    if (!configured()) return { err: "Cloud sync is not configured in this build." };
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail) return { err: "Please enter a valid email address." };
    if (!password || String(password).length < 6) {
      return { err: "Password is too weak \u2014 please use at least 6 characters." };
    }
    try {
      const res = await fetch(`${baseUrl()}/signup`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { err: friendlyError(data, res.status) };
      const next = parseSession(data) || parseSession(data?.session);
      if (next) {
        persistSession(next, true);
        return { ok: true, user: next.user };
      }
      const u = data?.user || (data?.id ? data : null);
      return {
        ok: true,
        confirmEmail: true,
        user: u?.id ? { id: String(u.id), email: String(u.email || cleanEmail) } : null
      };
    } catch {
      return { err: "Network error \u2014 check your connection and try again." };
    }
  }
  async function signIn(email, password) {
    if (!configured()) return { err: "Cloud sync is not configured in this build." };
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail || !password) return { err: "Invalid email or password." };
    try {
      const res = await fetch(`${baseUrl()}/token?grant_type=password`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { err: friendlyError(data, res.status) };
      const next = parseSession(data);
      if (!next) return { err: "Authentication failed. Please try again." };
      persistSession(next, true);
      return { ok: true, user: next.user };
    } catch {
      return { err: "Network error \u2014 check your connection and try again." };
    }
  }
  async function signOut() {
    const token = session2?.access_token;
    persistSession(null, true);
    if (!configured() || !token) return;
    try {
      await fetch(`${baseUrl()}/logout`, {
        method: "POST",
        headers: headers(token)
      });
    } catch {
    }
  }
  function user() {
    if (!configured() || !session2?.user) return null;
    return { id: session2.user.id, email: session2.user.email };
  }
  async function accessToken() {
    if (!configured() || !session2) return null;
    if (Date.now() + REFRESH_MARGIN_MS >= session2.expires_at) {
      return refreshSession();
    }
    return session2.access_token;
  }
  function onChange(cb) {
    listeners2.push(cb);
    return () => {
      const idx = listeners2.indexOf(cb);
      if (idx >= 0) listeners2.splice(idx, 1);
    };
  }
  restoreSession();

  // src/state/sync.js
  var DEVICE_KEY = "oa.device";
  var DEBOUNCE_MS = 3500;
  var storage3 = typeof localStorage !== "undefined" ? localStorage : (
    /** @type {any} */
    {
      getItem: () => null,
      setItem: () => {
      }
    }
  );
  var currentStatus = "off";
  var statusListeners = [];
  var pushTimer = null;
  var applyingRemote = false;
  var stopFn = null;
  function clone(val) {
    if (val === void 0 || val === null || typeof val !== "object") return val;
    return JSON.parse(JSON.stringify(val));
  }
  function getDeviceId() {
    try {
      let id = storage3.getItem(DEVICE_KEY);
      if (!id) {
        id = "dev_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        storage3.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return "dev_ephemeral";
    }
  }
  function restBaseUrl() {
    return BILLING.supabaseUrl.trim().replace(/\/+$/, "") + "/rest/v1";
  }
  function restHeaders(token, extra = {}) {
    return {
      apikey: BILLING.supabaseAnonKey.trim(),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra
    };
  }
  function setStatus(next) {
    if (currentStatus === next) return;
    currentStatus = next;
    for (const cb of [...statusListeners]) {
      try {
        cb(currentStatus);
      } catch (e) {
        console.error(e);
      }
    }
  }
  function clearPushTimer() {
    if (pushTimer !== null) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
  }
  function schedulePush() {
    if (applyingRemote) return;
    if (!configured() || !user()) return;
    clearPushTimer();
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushNow().catch(() => {
      });
    }, DEBOUNCE_MS);
  }
  function mergeEarliest(a, b) {
    const out = {};
    const srcA = a && typeof a === "object" ? a : {};
    const srcB = b && typeof b === "object" ? b : {};
    const keys = /* @__PURE__ */ new Set([...Object.keys(srcA), ...Object.keys(srcB)]);
    for (const k of keys) {
      const inA = Object.prototype.hasOwnProperty.call(srcA, k) && srcA[k] !== void 0;
      const inB = Object.prototype.hasOwnProperty.call(srcB, k) && srcB[k] !== void 0;
      if (inA && !inB) {
        out[k] = clone(srcA[k]);
      } else if (!inA && inB) {
        out[k] = clone(srcB[k]);
      } else if (inA && inB) {
        const va = srcA[k];
        const vb = srcB[k];
        if (typeof va === "number" && typeof vb === "number") {
          out[k] = Math.min(va, vb);
        } else if (typeof va === "string" && typeof vb === "string") {
          out[k] = va <= vb ? va : vb;
        } else {
          out[k] = clone(va);
        }
      }
    }
    return out;
  }
  function mergeMax(a, b) {
    const out = {};
    const srcA = a && typeof a === "object" ? a : {};
    const srcB = b && typeof b === "object" ? b : {};
    const keys = /* @__PURE__ */ new Set([...Object.keys(srcA), ...Object.keys(srcB)]);
    for (const k of keys) {
      const na = Number(srcA[k]);
      const nb = Number(srcB[k]);
      if (Number.isFinite(na) && Number.isFinite(nb)) out[k] = Math.max(na, nb);
      else if (Number.isFinite(na)) out[k] = na;
      else if (Number.isFinite(nb)) out[k] = nb;
    }
    return out;
  }
  function mergeMissions(a, b) {
    const out = {};
    const srcA = a && typeof a === "object" ? a : {};
    const srcB = b && typeof b === "object" ? b : {};
    const keys = /* @__PURE__ */ new Set([...Object.keys(srcA), ...Object.keys(srcB)]);
    for (const k of keys) {
      const ma = srcA[k];
      const mb = srcB[k];
      if (ma === void 0) {
        out[k] = clone(mb);
      } else if (mb === void 0) {
        out[k] = clone(ma);
      } else {
        const aPassed = typeof ma === "object" && ma !== null ? Boolean(ma.passed) : Boolean(ma);
        const bPassed = typeof mb === "object" && mb !== null ? Boolean(mb.passed) : Boolean(mb);
        if (aPassed && !bPassed) {
          out[k] = clone(ma);
        } else if (bPassed && !aPassed) {
          out[k] = clone(mb);
        } else if (aPassed && bPassed) {
          if (typeof ma === "object" && ma !== null && typeof mb === "object" && mb !== null) {
            const mergedMission = { ...clone(mb), ...clone(ma), passed: true };
            if (typeof ma.equity === "number" && typeof mb.equity === "number") {
              mergedMission.equity = Math.max(ma.equity, mb.equity);
            }
            if (typeof ma.when === "number" && typeof mb.when === "number") {
              mergedMission.when = Math.min(ma.when, mb.when);
            }
            out[k] = mergedMission;
          } else {
            out[k] = clone(ma);
          }
        } else {
          const aWhen = typeof ma === "object" && ma !== null ? Number(ma.when) || 0 : 0;
          const bWhen = typeof mb === "object" && mb !== null ? Number(mb.when) || 0 : 0;
          out[k] = bWhen > aWhen ? clone(mb) : clone(ma);
        }
      }
    }
    return out;
  }
  function mergeProfile(localProf, remoteProf) {
    const lAt = typeof localProf.lastActiveAt === "number" ? localProf.lastActiveAt : 0;
    const rAt = typeof remoteProf.lastActiveAt === "number" ? remoteProf.lastActiveAt : 0;
    const winner = rAt > lAt ? clone(remoteProf) : clone(localProf);
    if (typeof localProf.created === "number" && typeof remoteProf.created === "number") {
      winner.created = Math.min(localProf.created, remoteProf.created);
    }
    winner.xp = Math.max(Number(localProf.xp) || 0, Number(remoteProf.xp) || 0);
    winner.lessons = mergeEarliest(localProf.lessons, remoteProf.lessons);
    winner.badges = mergeEarliest(localProf.badges, remoteProf.badges);
    winner.games = mergeEarliest(localProf.games, remoteProf.games);
    winner.days = mergeEarliest(localProf.days, remoteProf.days);
    winner.quizzes = mergeMax(localProf.quizzes, remoteProf.quizzes);
    if (localProf.missions !== void 0 || remoteProf.missions !== void 0) {
      winner.missions = mergeMissions(localProf.missions, remoteProf.missions);
    }
    return winner;
  }
  function mergeDb(local, remote) {
    if (!local || typeof local !== "object") {
      if (!remote || typeof remote !== "object") {
        return { schemaVersion: SCHEMA_VERSION, profiles: [], activeId: null, market: null };
      }
      return normalizeModes(clone(remote));
    }
    if (!remote || typeof remote !== "object" || !Array.isArray(remote.profiles) || remote.profiles.length === 0) {
      return clone(local);
    }
    const localProfiles = Array.isArray(local.profiles) ? local.profiles : [];
    const remoteProfiles = remote.profiles;
    const remoteById = /* @__PURE__ */ new Map();
    for (const rp of remoteProfiles) {
      if (rp && typeof rp.id === "string") remoteById.set(rp.id, rp);
    }
    const seenIds = /* @__PURE__ */ new Set();
    const mergedProfiles = [];
    for (const lp of localProfiles) {
      if (!lp || typeof lp.id !== "string") {
        mergedProfiles.push(clone(lp));
        continue;
      }
      seenIds.add(lp.id);
      const rp = remoteById.get(lp.id);
      if (!rp) {
        mergedProfiles.push(clone(lp));
      } else {
        mergedProfiles.push(mergeProfile(lp, rp));
      }
    }
    for (const rp of remoteProfiles) {
      if (rp && typeof rp.id === "string" && !seenIds.has(rp.id)) {
        seenIds.add(rp.id);
        mergedProfiles.push(clone(rp));
      }
    }
    const out = {
      ...clone(local),
      schemaVersion: Math.max(
        Number(local.schemaVersion) || SCHEMA_VERSION,
        Number(remote.schemaVersion) || SCHEMA_VERSION
      ),
      profiles: mergedProfiles,
      activeId: local.activeId !== void 0 && local.activeId !== null ? local.activeId : remote.activeId ?? (mergedProfiles[0]?.id || null),
      market: local.market !== void 0 ? clone(local.market) : clone(remote.market ?? null)
    };
    if (remote.subStatus !== void 0) {
      out.subStatus = remote.subStatus;
    }
    return normalizeModes(out);
  }
  function normalizeModes(db2) {
    for (const p of db2.profiles || []) {
      if (p && p.mode !== "adult") p.mode = "adult";
    }
    return db2;
  }
  function status() {
    if (!configured() || !user()) return "off";
    return currentStatus;
  }
  function onStatus(cb) {
    statusListeners.push(cb);
    return () => {
      const idx = statusListeners.indexOf(cb);
      if (idx >= 0) statusListeners.splice(idx, 1);
    };
  }
  async function refreshSub() {
    if (!configured() || !user()) return "none";
    const token = await accessToken();
    if (!token) return "none";
    try {
      const res = await fetch(`${restBaseUrl()}/subscriptions?select=status,current_period_end`, {
        method: "GET",
        headers: restHeaders(token)
      });
      if (!res.ok) return subStatus();
      const rows2 = await res.json().catch(() => []);
      const sub = Array.isArray(rows2) && rows2[0]?.status ? String(rows2[0].status) : "none";
      applyingRemote = true;
      try {
        setSubStatus(sub);
      } finally {
        applyingRemote = false;
      }
      return sub;
    } catch {
      return subStatus();
    }
  }
  async function pushNow() {
    clearPushTimer();
    const u = user();
    if (!configured() || !u) {
      setStatus("off");
      return { ok: false };
    }
    const token = await accessToken();
    if (!token) {
      setStatus("off");
      return { ok: false };
    }
    setStatus("syncing");
    try {
      const payload = _dbForSync();
      const body = [{
        user_id: u.id,
        payload,
        schema_ver: payload?.schemaVersion || SCHEMA_VERSION,
        device_id: getDeviceId()
      }];
      const res = await fetch(`${restBaseUrl()}/user_progress`, {
        method: "POST",
        headers: restHeaders(token, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        setStatus("error");
        return { ok: false, err: `Push failed (${res.status})` };
      }
      setStatus("synced");
      return { ok: true };
    } catch {
      setStatus("error");
      return { ok: false, err: "Network error during sync push." };
    }
  }
  async function pullMergePush() {
    clearPushTimer();
    const u = user();
    if (!configured() || !u) {
      setStatus("off");
      return { ok: false };
    }
    const token = await accessToken();
    if (!token) {
      setStatus("off");
      return { ok: false };
    }
    setStatus("syncing");
    try {
      const [progRes] = await Promise.all([
        fetch(`${restBaseUrl()}/user_progress?select=payload,updated_at`, {
          method: "GET",
          headers: restHeaders(token)
        }),
        refreshSub()
      ]);
      if (!progRes.ok) {
        setStatus("error");
        return { ok: false, err: `Pull failed (${progRes.status})` };
      }
      const rows2 = await progRes.json().catch(() => []);
      const remotePayload = Array.isArray(rows2) && rows2[0]?.payload ? rows2[0].payload : null;
      const localDb = _dbForSync();
      const merged = mergeDb(localDb, remotePayload);
      merged.subStatus = subStatus();
      applyingRemote = true;
      try {
        _replaceDbFromSync(merged);
        bus.emit("profile");
      } finally {
        applyingRemote = false;
      }
      return await pushNow();
    } catch {
      setStatus("error");
      return { ok: false, err: "Network error during sync." };
    }
  }
  function start3() {
    if (!configured()) {
      setStatus("off");
      return () => {
      };
    }
    if (stopFn) return stopFn;
    const unAuth = onChange((u) => {
      if (u) {
        pullMergePush().catch(() => {
        });
      } else {
        clearPushTimer();
        setStatus("off");
      }
    });
    const unBus = bus.on("profile", () => {
      schedulePush();
    });
    const onOnline = () => {
      if (user()) pullMergePush().catch(() => {
      });
    };
    const onVisChange = () => {
      if (typeof document === "undefined" || !user()) return;
      if (document.visibilityState === "visible") {
        pullMergePush().catch(() => {
        });
      } else if (document.visibilityState === "hidden" && pushTimer !== null) {
        pushNow().catch(() => {
        });
      }
    };
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", onOnline);
      window.addEventListener("visibilitychange", onVisChange);
    }
    if (user()) {
      pullMergePush().catch(() => {
      });
    }
    stopFn = () => {
      unAuth();
      unBus();
      clearPushTimer();
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("visibilitychange", onVisChange);
      }
      stopFn = null;
    };
    return stopFn;
  }

  // src/state/billing.js
  function configured2() {
    return Boolean(BILLING.supabaseUrl && BILLING.supabaseAnonKey && BILLING.priceIdMonthly && BILLING.priceIdAnnual);
  }
  async function headers2() {
    if (!configured2()) return { err: "Billing is not configured yet. Please try again later." };
    const token = await accessToken();
    if (!token) return { err: "Please sign in to manage your subscription." };
    return { value: {
      apikey: BILLING.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    } };
  }
  async function call(name, body) {
    try {
      const h = await headers2();
      if (h.err) return { err: h.err };
      const response = await fetch(`${BILLING.supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`, {
        method: "POST",
        headers: h.value,
        body: JSON.stringify(body)
      });
      if (!response.ok) return { err: "Unable to open billing. Please try again." };
      const data = await response.json();
      if (typeof data.url !== "string" || new URL(data.url).protocol !== "https:") {
        return { err: "Unable to open billing. Please try again." };
      }
      return { url: data.url };
    } catch {
      return { err: "Unable to connect to billing. Please try again." };
    }
  }
  async function checkout(plan) {
    if (plan !== "monthly" && plan !== "annual") return { err: "Please choose a monthly or annual plan." };
    return call("create-checkout", { plan });
  }
  async function portal() {
    return call("create-portal", {});
  }
  async function refreshStatus() {
    try {
      const h = await headers2();
      if (h.err) return { err: h.err };
      const response = await fetch(`${BILLING.supabaseUrl.replace(/\/$/, "")}/rest/v1/subscriptions?select=status,current_period_end`, {
        headers: h.value
      });
      if (!response.ok) return { err: "Unable to refresh your subscription. Please try again." };
      const rows2 = await response.json();
      if (!Array.isArray(rows2) || rows2.length && typeof rows2[0]?.status !== "string") {
        return { err: "Unable to refresh your subscription. Please try again." };
      }
      const status2 = rows2[0]?.status || "none";
      setSubStatus(status2);
      return status2;
    } catch {
      return { err: "Unable to refresh your subscription. Please try again." };
    }
  }

  // src/ui/auth-ui.js
  var NUDGE_KEY = "oa.backupNudge";
  var SYNC_LABEL = {
    off: "Off",
    syncing: "Syncing\u2026",
    synced: "Synced",
    error: "Sync error"
  };
  function openAuthModal({ onSuccess } = {}) {
    if (isFamilyBuild()) return null;
    let mode = (
      /** @type {'in'|'up'} */
      "in"
    );
    let busy = false;
    const wrap = el("div", { class: "auth-modal" });
    const m = modal(wrap);
    function paint() {
      wrap.innerHTML = "";
      wrap.appendChild(el("h2", {}, mode === "in" ? "Sign in" : "Create account"));
      wrap.appendChild(el(
        "p",
        { class: "sub" },
        mode === "in" ? "Sign in to sync progress across devices." : "Create a free account to back up progress across devices."
      ));
      const tabs = el("div", { class: "seg auth-tabs mt2", role: "tablist" });
      const tabIn = el("button", {
        type: "button",
        role: "tab",
        "aria-selected": mode === "in" ? "true" : "false",
        class: mode === "in" ? "on" : "",
        onclick: () => {
          if (busy) return;
          mode = "in";
          paint();
        }
      }, "Sign in");
      const tabUp = el("button", {
        type: "button",
        role: "tab",
        "aria-selected": mode === "up" ? "true" : "false",
        class: mode === "up" ? "on" : "",
        onclick: () => {
          if (busy) return;
          mode = "up";
          paint();
        }
      }, "Create account");
      tabs.appendChild(tabIn);
      tabs.appendChild(tabUp);
      wrap.appendChild(tabs);
      const email = el("input", {
        type: "email",
        name: "email",
        required: true,
        autocomplete: mode === "in" ? "username" : "email",
        inputmode: "email",
        placeholder: "you@example.com",
        "aria-label": "Email"
      });
      const password = el("input", {
        type: "password",
        name: "password",
        required: true,
        autocomplete: mode === "in" ? "current-password" : "new-password",
        placeholder: mode === "in" ? "Password" : "Choose a password",
        "aria-label": "Password",
        minlength: "6"
      });
      const errEl = el("p", { class: "auth-err", role: "alert", hidden: true });
      wrap.appendChild(el("div", { class: "field mt2" }, el("label", {}, "Email"), email));
      wrap.appendChild(el("div", { class: "field mt1" }, el("label", {}, "Password"), password));
      wrap.appendChild(errEl);
      const submit = el(
        "button",
        { type: "submit", class: "btn primary" },
        mode === "in" ? "Sign in" : "Create account"
      );
      const cancel = el("button", {
        type: "button",
        class: "btn",
        onclick: () => {
          if (!busy) m.close();
        }
      }, "Cancel");
      const form = el(
        "form",
        { class: "mt2", onsubmit: async (e) => {
          e.preventDefault();
          if (busy) return;
          const em = email.value.trim();
          const pw = password.value;
          if (!em || !pw) {
            errEl.hidden = false;
            errEl.textContent = "Enter email and password.";
            return;
          }
          busy = true;
          submit.disabled = true;
          tabIn.disabled = true;
          tabUp.disabled = true;
          errEl.hidden = true;
          errEl.textContent = "";
          const res = mode === "in" ? await signIn(em, pw) : await signUp(em, pw);
          busy = false;
          submit.disabled = false;
          tabIn.disabled = false;
          tabUp.disabled = false;
          if (res && res.err) {
            errEl.hidden = false;
            errEl.textContent = String(res.err);
            return;
          }
          m.close();
          toast(mode === "in" ? "Signed in \u2014 syncing progress." : "Account created \u2014 progress will sync.", "gain");
          onSuccess && onSuccess();
        } },
        el("div", { class: "btn-row" }, submit, cancel)
      );
      wrap.appendChild(form);
      email.focus();
    }
    paint();
    return m;
  }
  function nudgeDone() {
    try {
      return !!(JSON.parse(localStorage.getItem(NUDGE_KEY) || "{}") || {}).done;
    } catch {
      return false;
    }
  }
  function markNudgeDone() {
    try {
      localStorage.setItem(NUDGE_KEY, JSON.stringify({ done: true }));
    } catch {
    }
  }
  function maybeBackupNudge() {
    if (isFamilyBuild()) return;
    if (user()) return;
    if (nudgeDone()) return;
    markNudgeDone();
    toast("Back up your progress \u2014 create a free account", "", {
      label: "Create account",
      onClick: () => openAuthModal()
    });
  }
  function mountAccountSection(parent) {
    if (isFamilyBuild()) return () => {
    };
    const host = el("div", { class: "card mt2 account-card" });
    parent.appendChild(host);
    const uns = [];
    function paint() {
      host.innerHTML = "";
      host.appendChild(el("div", { class: "eyebrow" }, "Account"));
      const u = user();
      if (!u) {
        host.appendChild(el(
          "p",
          { class: "sub" },
          "Create a free account to back up progress across devices"
        ));
        host.appendChild(el(
          "div",
          { class: "btn-row mt1" },
          el("button", {
            type: "button",
            class: "btn primary",
            onclick: () => openAuthModal({ onSuccess: paint })
          }, "Create free account")
        ));
        return;
      }
      host.appendChild(el(
        "div",
        { class: "flex-between account-email-row" },
        el(
          "div",
          {},
          el("div", { class: "small muted" }, "Signed in"),
          el("div", { class: "account-email" }, u.email || "")
        ),
        syncStatusChip(status())
      ));
      const manageBtn = el("button", {
        type: "button",
        class: "btn",
        onclick: async () => {
          manageBtn.disabled = true;
          const res = await portal();
          manageBtn.disabled = false;
          if (res && res.err) {
            toast(String(res.err), "loss");
            return;
          }
          if (res && res.url) location.href = res.url;
        }
      }, "Manage subscription");
      const outBtn = el("button", {
        type: "button",
        class: "btn",
        onclick: async () => {
          outBtn.disabled = true;
          await signOut();
          outBtn.disabled = false;
          toast("Signed out.", "gain");
          paint();
        }
      }, "Sign out");
      host.appendChild(el("div", { class: "btn-row mt2" }, manageBtn, outBtn));
    }
    paint();
    uns.push(onChange(() => paint()));
    uns.push(onStatus(() => {
      const chip = host.querySelector(".sync-chip");
      if (chip) updateSyncChip(
        /** @type {HTMLElement} */
        chip,
        status()
      );
      else paint();
    }));
    return () => {
      uns.forEach((u) => {
        try {
          u();
        } catch {
        }
      });
      host.remove();
    };
  }
  function syncStatusChip(status2) {
    const s2 = SYNC_LABEL[status2] ? status2 : "off";
    return el(
      "span",
      {
        class: "sync-chip sync-" + s2,
        title: "Sync: " + (SYNC_LABEL[s2] || s2)
      },
      el("span", { class: "sync-dot", "aria-hidden": "true" }),
      el("span", { class: "sync-label" }, SYNC_LABEL[s2] || s2)
    );
  }
  function updateSyncChip(chip, status2) {
    const s2 = SYNC_LABEL[status2] ? status2 : "off";
    chip.className = "sync-chip sync-" + s2;
    chip.title = "Sync: " + (SYNC_LABEL[s2] || s2);
    const lab = chip.querySelector(".sync-label");
    if (lab) lab.textContent = SYNC_LABEL[s2] || s2;
  }
  function mountSyncCloud(parent) {
    if (isFamilyBuild()) return () => {
    };
    const cloud = el("span", {
      class: "sync-cloud sync-off",
      "aria-hidden": "true",
      title: "Sync",
      hidden: true
    }, icon("cloud"));
    parent.appendChild(cloud);
    function paint() {
      const u = user();
      if (!u) {
        cloud.hidden = true;
        return;
      }
      cloud.hidden = false;
      const s2 = SYNC_LABEL[status()] ? status() : "off";
      cloud.className = "sync-cloud sync-" + s2;
      cloud.title = "Sync: " + (SYNC_LABEL[s2] || s2);
    }
    paint();
    const u1 = onChange(paint);
    const u2 = onStatus(paint);
    return () => {
      try {
        u1();
      } catch {
      }
      try {
        u2();
      } catch {
      }
      cloud.remove();
    };
  }
  function youSheetAccountItems() {
    if (isFamilyBuild()) return [];
    const u = user();
    if (!u) {
      return [{
        ic: "cloud",
        icon: "\u2601",
        label: "Create free account",
        onClick: () => openAuthModal()
      }];
    }
    const st = status();
    return [
      {
        icon: "\u25CF",
        label: `Sync: ${SYNC_LABEL[st] || st}`,
        onClick: () => {
          location.hash = "#/progress";
        }
      },
      {
        ic: "card",
        icon: "\u{1F4B3}",
        label: "Manage subscription",
        onClick: async () => {
          const res = await portal();
          if (res && res.err) {
            toast(String(res.err), "loss");
            return;
          }
          if (res && res.url) location.href = res.url;
        }
      },
      {
        icon: "\u238B",
        label: "Sign out",
        onClick: async () => {
          await signOut();
          toast("Signed out.", "gain");
        }
      }
    ];
  }

  // src/ui/views/welcome.js
  var STEPS = [
    { id: "goal", title: "Your goal" },
    { id: "trade", title: "First trade" },
    { id: "overnight", title: "Overnight risk" },
    { id: "mission", title: "Mission 1" },
    { id: "process", title: "Process Score" }
  ];
  function dots(step) {
    const row = el("div", { class: "onboard-dots", "aria-label": `Step ${step + 1} of ${STEPS.length}` });
    for (let i = 0; i < STEPS.length; i++) {
      row.appendChild(el("span", { class: i === step ? "on" : "", "aria-hidden": "true" }));
    }
    return row;
  }
  function skipRow(onSkip) {
    return el(
      "div",
      { class: "btn-row mt2" },
      el("button", { class: "btn", type: "button", onclick: onSkip }, "Skip")
    );
  }
  var view = {
    render(root) {
      const p = active();
      if (!p) {
        root.appendChild(el("p", { class: "sub" }, "Create a profile to begin setup."));
        return;
      }
      let st = get();
      if (st.done) {
        location.hash = "#/home";
        return;
      }
      if (st.step === 1 && (p.positions?.length || p.trades?.length)) {
        st = completeStep(2);
      }
      const missionDone = !!list().find((m) => m.id === "first-covered-call" && m.done);
      if (st.step >= 3 && missionDone) {
        st = completeStep(4);
      }
      let step = Math.min(st.step, STEPS.length - 1);
      let chart = null;
      const host = el("div", {});
      root.appendChild(host);
      function paint() {
        st = get();
        step = Math.min(st.step, STEPS.length - 1);
        host.innerHTML = "";
        chart?.destroy();
        chart = null;
        host.appendChild(el("div", { class: "eyebrow" }, "15-minute setup"));
        host.appendChild(el("h1", {}, STEPS[step].title));
        host.appendChild(dots(step));
        if (step === 0) renderGoal();
        else if (step === 1) renderTrade();
        else if (step === 2) renderOvernight();
        else if (step === 3) renderMission();
        else renderProcess();
      }
      function renderGoal() {
        host.appendChild(el(
          "p",
          { class: "sub", style: "max-width:60ch" },
          "Pick the outcome you care about most \u2014 we will route the practice path. You can change this later."
        ));
        const picks = el("div", { class: "goal-pick" });
        for (const [id, meta] of Object.entries(GOAL_COPY)) {
          picks.appendChild(el("button", {
            type: "button",
            class: st.goal === id ? "sel" : "",
            onclick: () => {
              setGoal(id);
              toast(meta.tip, "gain");
              paint();
            }
          }, meta.label));
        }
        host.appendChild(picks);
        if (st.goal) {
          host.appendChild(el("p", { class: "sub mt2" }, GOAL_COPY[st.goal]?.tip || ""));
          host.appendChild(el(
            "div",
            { class: "btn-row mt2" },
            el("button", { class: "btn primary", onclick: () => {
              setStep(1);
              paint();
            } }, "Continue \u2192")
          ));
        }
        host.appendChild(skipRow(() => {
          setStep(1);
          paint();
        }));
      }
      function renderTrade() {
        const tip = st.goal ? GOAL_COPY[st.goal]?.tip : null;
        host.appendChild(el(
          "p",
          { class: "sub", style: "max-width:60ch" },
          tip || "Open the Live Market and buy a call on LMND \u2014 tap an ASK in the chain. Paper money only."
        ));
        host.appendChild(el(
          "div",
          { class: "card mt2" },
          el("h3", {}, "Guided first trade"),
          el(
            "p",
            { class: "sub" },
            "We will open Live Market with a coach callout pointing at the chain. Completing any fill advances this step."
          ),
          el(
            "div",
            { class: "btn-row mt1" },
            el("a", { class: "btn primary", href: "#/market/LMND/coach" }, "Open Live Market \u2192")
          )
        ));
        host.appendChild(skipRow(() => {
          setStep(2);
          paint();
        }));
        if (p.positions?.length || p.trades?.length) {
          host.appendChild(el(
            "div",
            { class: "btn-row mt2" },
            el("button", { class: "btn primary", onclick: () => {
              setStep(2);
              paint();
            } }, "Trade done \u2014 continue \u2192")
          ));
        }
      }
      function renderOvernight() {
        host.appendChild(el(
          "p",
          { class: "sub", style: "max-width:60ch" },
          "What kills option buyers overnight? Two quiet forces: theta (time decay per market day) and IV crush (premium deflates when fear fades)."
        ));
        const box = el("div", { class: "card mt2" });
        host.appendChild(box);
        box.appendChild(el("div", { class: "chart-title" }, "Long ATM call \u2014 value vs days left (IV fixed)"));
        const chartBox = el("div", {});
        box.appendChild(chartBox);
        const S2 = 100, K = 100, iv = 0.35, r = 0;
        const ptsTheta = [];
        const ptsIv = [];
        for (let dte = 45; dte >= 1; dte--) {
          const T = dte / 252;
          ptsTheta.push({ x: dte, y: price({ S: S2, K, T, r, v: iv, type: "call" }) });
          ptsIv.push({ x: dte, y: price({ S: S2, K, T, r, v: iv * 0.7, type: "call" }) });
        }
        chart = line(chartBox, {
          height: 200,
          series: [
            { name: "IV 35%", color: "--s1", points: ptsTheta, width: 2 },
            { name: "IV 24.5% (crush)", color: "--s6", points: ptsIv, width: 2, dash: true }
          ],
          fmtX: (d) => Math.round(d) + "d",
          fmtY: (y) => "$" + y.toFixed(2),
          tipLabel: "DTE "
        });
        legend(chartBox, [
          { name: "IV 35%", color: "--s1" },
          { name: "After IV crush", color: "--s6" }
        ]);
        box.appendChild(el(
          "p",
          { class: "small muted mt1" },
          "Same strike, same stock \u2014 fewer days and lower IV both shrink the premium. Theta is labeled \u201Cper market day\u201D in the labs (252-day year)."
        ));
        host.appendChild(el(
          "div",
          { class: "btn-row mt2" },
          el("button", { class: "btn primary", onclick: () => {
            setStep(3);
            paint();
          } }, "Got it \u2014 continue \u2192"),
          el("a", { class: "btn", href: "#/greeks" }, "Optional: Greeks Lab")
        ));
        host.appendChild(skipRow(() => {
          setStep(3);
          paint();
        }));
      }
      function renderMission() {
        const done = !!list().find((m) => m.id === "first-covered-call" && m.done);
        host.appendChild(el(
          "p",
          { class: "sub", style: "max-width:60ch" },
          "Mission 1 \u2014 First Covered Call \u2014 puts the income playbook in a sandbox with clear objectives."
        ));
        host.appendChild(el(
          "div",
          { class: "card mt2" },
          el("div", {}, icon("compass", { size: 30 })),
          el("h3", {}, "First Covered Call"),
          el(
            "p",
            { class: "sub" },
            done ? "Mission complete \u2014 nice work. Continue to Process Score." : "Sandboxed drill: sell a call against shares you hold. Defined-risk practice before freestyle Live Market."
          ),
          el(
            "div",
            { class: "btn-row mt1" },
            done ? el("button", { class: "btn primary", onclick: () => {
              setStep(4);
              paint();
            } }, "Continue \u2192") : el("a", { class: "btn primary", href: "#/missions/first-covered-call" }, "Start Mission 1 \u2192")
          )
        ));
        if (done) {
        } else {
          host.appendChild(skipRow(() => {
            setStep(4);
            paint();
          }));
        }
      }
      function renderProcess() {
        host.appendChild(el(
          "p",
          { class: "sub", style: "max-width:60ch" },
          "Process Score grades the decision \u2014 not luck. Four equal pillars vs a pro checklist:"
        ));
        const rubric = [
          ["Thesis", "Direction, a real reason (\u226520 chars), and an exit plan before the fill."],
          ["Defined risk", "Know max loss at expiry before you click Place."],
          ["Sizing \u22642%", "Risk a small slice of equity \u2014 the journal flags >5%."],
          ["Exit discipline", "Debrief: did you follow the plan you wrote?"]
        ];
        const list2 = el("div", { class: "card mt2 score-bars" });
        for (const [k, copy] of rubric) {
          list2.appendChild(el(
            "div",
            { class: "mb2" },
            el(
              "div",
              { class: "flex-between" },
              el("span", { style: "font-weight:700" }, k),
              el("span", { class: "pill brass num" }, "25 pts")
            ),
            el("p", { class: "sub", style: "margin:4px 0 0" }, copy)
          ));
        }
        host.appendChild(list2);
        if (!isFamilyBuild() && tier() === "free") {
          host.appendChild(el(
            "div",
            { class: "card mt2", style: "border-color:var(--brass-ring)" },
            el("h3", {}, "Go further with Academy"),
            el(
              "p",
              { class: "sub" },
              "$29/mo \u2014 full missions, unlimited journal, every ticker. Educational simulation only; not investment advice."
            ),
            el("a", { class: "btn primary", href: "#/upgrade" }, "See plans \u2192")
          ));
        }
        host.appendChild(el(
          "div",
          { class: "btn-row mt2" },
          el("button", { class: "btn primary", onclick: () => {
            finish();
            toast("Setup complete \u2014 welcome to the floor.", "gain");
            maybeBackupNudge();
            location.hash = "#/home";
          } }, "Finish \u2192 Home")
        ));
        host.appendChild(skipRow(() => {
          finish();
          maybeBackupNudge();
          location.hash = "#/home";
        }));
      }
      paint();
      return () => {
        chart?.destroy();
      };
    }
  };

  // src/ui/views/upgrade.js
  function hashQuery() {
    const raw = (location.hash || "").replace(/^#\/?/, "");
    const i = raw.indexOf("?");
    if (i < 0) return {};
    const out = (
      /** @type {Record<string, string>} */
      {}
    );
    new URLSearchParams(raw.slice(i + 1)).forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  function stripSuccessParam() {
    const raw = (location.hash || "").replace(/^#\/?/, "");
    const i = raw.indexOf("?");
    if (i < 0) return;
    const path = raw.slice(0, i) || "upgrade";
    const q = new URLSearchParams(raw.slice(i + 1));
    if (!q.has("success")) return;
    q.delete("success");
    const next = q.toString() ? `#/${path}?${q}` : `#/${path}`;
    history.replaceState(null, "", next);
  }
  async function startCheckout(plan, btn, other) {
    if (!configured2()) return;
    if (btn.disabled) return;
    if (!user()) {
      openAuthModal({
        onSuccess: () => {
          startCheckout(plan, btn, other);
        }
      });
      return;
    }
    btn.disabled = true;
    if (other) other.disabled = true;
    const res = await checkout(plan);
    if (res && res.err) {
      btn.disabled = false;
      if (other) other.disabled = false;
      toast(String(res.err), "loss");
      return;
    }
    if (res && res.url) {
      location.href = res.url;
      return;
    }
    btn.disabled = false;
    if (other) other.disabled = false;
  }
  var view2 = {
    render(root) {
      if (isFamilyBuild()) {
        root.appendChild(el("div", { class: "eyebrow" }, "Family build"));
        root.appendChild(el("h1", {}, "Everything unlocked"));
        root.appendChild(el(
          "p",
          { class: "sub" },
          "This is the founder build \u2014 everything is unlocked and freemium gates are off. The commercial PWA is where Free vs Academy lives."
        ));
        root.appendChild(el("a", { class: "btn mt2", href: "#/home" }, "\u2190 Home"));
        return;
      }
      const lim = FREE_LIMITS;
      let paid = tier() === "pro";
      const q = hashQuery();
      const live = configured2();
      if (q.success === "1") {
        const banner = el(
          "div",
          { class: "upgrade-welcome card mt0" },
          el("div", { class: "eyebrow" }, "Academy"),
          el("h2", {}, "Welcome to the Academy"),
          el("p", { class: "sub" }, "Unlocking your full practice floor\u2026")
        );
        root.appendChild(banner);
        stripSuccessParam();
        (async () => {
          try {
            await refreshStatus();
            await pullMergePush();
          } catch {
          }
          paid = tier() === "pro";
          toast(paid ? "Academy unlocked \u2014 limits are off." : "Payment received \u2014 subscription activating\u2026", "gain");
          const h1 = root.querySelector("h1");
          if (h1 && paid) h1.textContent = "You are on Academy";
          const cta2 = root.querySelector(".upgrade-cta");
          if (cta2 && paid) {
            cta2.innerHTML = "";
            cta2.appendChild(el("p", { class: "sub" }, "You are on Academy \u2014 thank you."));
            cta2.appendChild(el("a", { class: "btn", href: "#/home" }, "\u2190 Back"));
          }
        })();
      }
      root.appendChild(el("div", { class: "eyebrow" }, "Options Academy"));
      root.appendChild(el("h1", {}, paid ? "You are on Academy" : "Free vs Academy"));
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:60ch" },
        "Practice on a simulated market. Hypothetical performance \u2014 educational only, not investment advice. No earnings or win-rate claims."
      ));
      const grid = el("div", { class: "grid2 mt2" });
      grid.appendChild(el(
        "div",
        { class: "card" },
        el("div", { class: "eyebrow" }, "Free"),
        el("h2", {}, "$0"),
        el("p", { class: "sub" }, "Paper trading with practice limits \u2014 enough to learn the craft.")
      ));
      grid.appendChild(el(
        "div",
        { class: "card", style: "border-color:var(--brass-ring);background:var(--brass-soft)" },
        el("div", { class: "eyebrow" }, "Academy"),
        el("h2", {}, "$29/mo"),
        el("p", { class: "sub num" }, "or $228/year"),
        el("p", { class: "sub" }, "Full missions, unlimited journal, every ticker.")
      ));
      root.appendChild(grid);
      const tbl = el("table", { class: "pricing-table card mt2", style: "padding:0;overflow:hidden" });
      tbl.appendChild(el("thead", {}, el(
        "tr",
        {},
        el("th", {}, "Feature"),
        el("th", {}, "Free"),
        el("th", {}, "Academy")
      )));
      const rows2 = [
        ["Open positions", String(lim.positions), "Unlimited"],
        ["Tradeable symbols", lim.symbols.join(", "), "Every ticker"],
        ["Curriculum tracks", lim.freeTracks.join(", ") + ` (first ${lim.lessonsPerTrack} lessons)`, "All tracks & lessons"],
        ["Missions", lim.missions.length + " starter missions", "Full mission pack"],
        ["Journal entries", String(lim.journalEntries), "Unlimited + score history"]
      ];
      const tb = el("tbody", {});
      for (const [feat, free, pro] of rows2) {
        tb.appendChild(el(
          "tr",
          {},
          el("td", {}, feat),
          el("td", { class: "num" }, free),
          el("td", { class: "num" }, pro)
        ));
      }
      tbl.appendChild(tb);
      root.appendChild(tbl);
      root.appendChild(el(
        "p",
        { class: "small muted mt2", style: "max-width:60ch" },
        "CFTC Rule 4.41: hypothetical or simulated performance results have certain limitations. Unlike an actual performance record, simulated results do not represent actual trading."
      ));
      const cta = el("div", { class: "btn-row mt2 upgrade-cta" });
      if (paid) {
        cta.appendChild(el("p", { class: "sub" }, "You are on Academy \u2014 thank you."));
        cta.appendChild(el("a", { class: "btn", href: "#/home" }, "\u2190 Back"));
      } else if (live) {
        const monthly = (
          /** @type {HTMLButtonElement} */
          el("button", {
            type: "button",
            class: "btn primary"
          }, "Monthly \xB7 $29")
        );
        const annual = (
          /** @type {HTMLButtonElement} */
          el("button", {
            type: "button",
            class: "btn primary"
          }, "Annual \xB7 $228")
        );
        monthly.addEventListener("click", () => startCheckout("monthly", monthly, annual));
        annual.addEventListener("click", () => startCheckout("annual", annual, monthly));
        cta.appendChild(monthly);
        cta.appendChild(annual);
        cta.appendChild(el("a", { class: "btn", href: "#/home" }, "\u2190 Back"));
      } else {
        cta.appendChild(el("button", {
          class: "btn primary",
          disabled: true,
          title: "Checkout arrives in beta \u2014 Sprint 4"
        }, "Checkout arrives in beta \u2014 Sprint 4"));
        cta.appendChild(el("a", { class: "btn", href: "#/home" }, "\u2190 Back"));
      }
      root.appendChild(cta);
    }
  };

  // src/state/settings.js
  var KEY2 = "oa.settings";
  var load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY2)) || {};
    } catch {
      return {};
    }
  };
  var s = load();
  var persist = () => {
    try {
      localStorage.setItem(KEY2, JSON.stringify(s));
    } catch {
    }
  };
  function tradierKey() {
    return s.tradierKey || "";
  }
  function setTradierKey(k) {
    s.tradierKey = String(k || "").trim();
    persist();
  }
  function clearTradierKey() {
    delete s.tradierKey;
    persist();
  }
  function realDataAllowed() {
    const p = active();
    if (!p) return false;
    return isFamilyBuild() || tier() === "pro";
  }
  function realDataReady() {
    return realDataAllowed() && !!tradierKey();
  }
  function feedMode() {
    return s.feedMode === "tradier" && realDataReady() ? "tradier" : "sim";
  }
  function setFeedMode(m) {
    s.feedMode = m === "tradier" ? "tradier" : "sim";
    persist();
  }

  // src/ui/views/settings.js
  function downloadBackup() {
    const json = exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `options-academy-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded.", "gain");
  }
  function versionLabel() {
    const build2 = isFamilyBuild() ? "founder" : "commercial";
    const hash = (
      /** @type {any} */
      "2026-11-13"
    );
    return `${hash} \xB7 ${build2}`;
  }
  var view3 = {
    render(root) {
      const p = active();
      root.appendChild(el("div", { class: "eyebrow" }, "Settings"));
      root.appendChild(el("h1", {}, "Device settings"));
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:68ch" },
        "Keys and backups stay on this device. Nothing here is synced to the cloud."
      ));
      {
        const realCard = el("div", { class: "card mt2 settings-section" });
        realCard.appendChild(el(
          "div",
          { class: "flex-between" },
          el("h3", {}, "Real market data"),
          realDataAllowed() ? null : el("a", { class: "pill brass lock-chip", href: "#/upgrade", style: "text-decoration:none" }, icon("lock"), " Upgrade")
        ));
        root.appendChild(realCard);
        if (!realDataAllowed()) {
          realCard.appendChild(el(
            "p",
            { class: "sub", style: "margin-bottom:0" },
            "Delayed real quotes (Tradier sandbox) are included with Academy. Simulated Live Market stays free."
          ));
          realCard.appendChild(el("a", { class: "btn primary mt1", href: "#/upgrade" }, "See plans \u2192"));
        } else {
          let paintFeed = function() {
            const ready = feedReady();
            simBtn.disabled = false;
            realBtn.disabled = !ready;
            simBtn.classList.toggle("on", mode === "sim");
            realBtn.classList.toggle("on", mode === "tradier");
            realBtn.title = ready ? "" : "Save a Tradier key first";
          };
          realCard.appendChild(el(
            "p",
            { class: "sub" },
            "Paste a Tradier sandbox API key to watch delayed quotes and chains. Stored only on this device \u2014 never synced."
          ));
          const keyIn = el("input", {
            type: "password",
            autocomplete: "off",
            spellcheck: "false",
            "aria-label": "Tradier sandbox API key",
            placeholder: "Paste sandbox key\u2026",
            value: tradierKey()
          });
          keyIn.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" || e.key === "Delete" || (e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) return;
            if (e.key.length === 1) e.preventDefault();
          });
          const feedReady = () => realDataReady();
          let mode = feedMode();
          const simBtn = el("button", { type: "button" }, "Sim");
          const realBtn = el("button", { type: "button" }, "Real (delayed)");
          const feedSeg = el("div", { class: "seg", role: "group", "aria-label": "Feed mode" }, simBtn, realBtn);
          simBtn.addEventListener("click", () => {
            setFeedMode("sim");
            mode = feedMode();
            paintFeed();
            toast("Feed: simulated Live Market.", "gain");
          });
          realBtn.addEventListener("click", () => {
            if (!feedReady()) return;
            setFeedMode("tradier");
            mode = feedMode();
            paintFeed();
            toast("Feed: real market (delayed ~15 min).", "gain");
          });
          paintFeed();
          realCard.appendChild(el(
            "div",
            { class: "field mt1" },
            el("label", {}, "Tradier sandbox key"),
            keyIn,
            el("div", { class: "small muted mt1" }, "Paste only \xB7 stored only on this device")
          ));
          realCard.appendChild(el(
            "div",
            { class: "btn-row mt1" },
            el("button", { class: "btn primary", type: "button", onclick: () => {
              setTradierKey(keyIn.value);
              keyIn.value = tradierKey();
              paintFeed();
              toast(tradierKey() ? "Key saved on this device." : "Key cleared.", "gain");
            } }, "Save"),
            el("button", { class: "btn", type: "button", onclick: () => {
              clearTradierKey();
              keyIn.value = "";
              setFeedMode("sim");
              mode = "sim";
              paintFeed();
              toast("Tradier key cleared.", "gain");
            } }, "Clear")
          ));
          realCard.appendChild(el(
            "div",
            { class: "field mt2" },
            el("label", {}, "Feed mode"),
            feedSeg,
            el(
              "div",
              { class: "small muted mt1" },
              "Real mode is watch + analyze only (no paper fills). Quotes delayed ~15 minutes."
            )
          ));
          realCard.appendChild(el(
            "p",
            { class: "small mt1", style: "margin-bottom:0" },
            el("a", { href: "https://developer.tradier.com/", target: "_blank", rel: "noopener" }, "Get a Tradier sandbox key \u2192")
          ));
        }
      }
      if (p) {
        const safety = el("div", { class: "card mt2 settings-section" });
        safety.appendChild(el("h3", {}, "Account safety"));
        safety.appendChild(el(
          "p",
          { class: "sub" },
          "Defined-risk only blocks orders whose loss is unbounded (like naked short calls). Long options, covered calls, and spreads stay available \u2014 the same training wheels real brokerages call Level 1\u20132 permissions."
        ));
        const isOn = () => active()?.riskMode === "defined";
        const allB = el("button", { type: "button" }, "All strategies");
        const defB = el("button", { type: "button" }, "Defined-risk only");
        const riskSeg = el("div", { class: "seg", role: "group", "aria-label": "Strategy permissions" }, allB, defB);
        const paintRisk = () => {
          allB.classList.toggle("on", !isOn());
          defB.classList.toggle("on", isOn());
        };
        allB.addEventListener("click", () => {
          setRiskMode("all");
          paintRisk();
          toast("Risk guard off \u2014 all strategies available.", "gain");
        });
        defB.addEventListener("click", () => {
          setRiskMode("defined");
          paintRisk();
          toast("Defined-risk only is ON for this profile.", "gain");
        });
        paintRisk();
        safety.appendChild(el("div", { class: "field mt1" }, el("label", {}, "Strategy permissions"), riskSeg));
        root.appendChild(safety);
      }
      const dataCard = el("div", { class: "card mt2 settings-section" });
      dataCard.appendChild(el("h3", {}, "Data"));
      dataCard.appendChild(el(
        "p",
        { class: "sub" },
        "Export a JSON backup of profiles, journal, and paper accounts. Import replaces data on this device."
      ));
      const fileIn = el("input", { type: "file", accept: "application/json,.json", "aria-label": "Import backup file", style: "display:none" });
      fileIn.addEventListener("change", async () => {
        const file = fileIn.files && fileIn.files[0];
        fileIn.value = "";
        if (!file) return;
        try {
          const text = await file.text();
          const res = importJson(text);
          if (res.err) {
            toast(res.err, "loss");
            return;
          }
          toast(`Imported ${res.profiles} profile${res.profiles === 1 ? "" : "s"} \u2014 reloading\u2026`, "gain");
          setTimeout(() => location.reload(), 400);
        } catch {
          toast("Could not read that file.", "loss");
        }
      });
      dataCard.appendChild(el(
        "div",
        { class: "btn-row" },
        el("button", { class: "btn primary", type: "button", onclick: downloadBackup }, "Export backup"),
        el("button", { class: "btn", type: "button", onclick: () => fileIn.click() }, "Import\u2026"),
        fileIn
      ));
      root.appendChild(dataCard);
      const appearance = el("div", { class: "card mt2 settings-section" });
      appearance.appendChild(el("h3", {}, "Appearance"));
      appearance.appendChild(el("p", { class: "sub" }, "Follow your device, or pick a side. Both themes are contrast-checked."));
      const current = (() => {
        try {
          return localStorage.getItem("oa.theme") || "system";
        } catch {
          return "system";
        }
      })();
      const applyTheme = (mode) => {
        const rootEl = document.documentElement;
        if (mode === "system") {
          rootEl.removeAttribute("data-theme");
          try {
            localStorage.removeItem("oa.theme");
          } catch {
          }
        } else {
          rootEl.setAttribute("data-theme", mode);
          try {
            localStorage.setItem("oa.theme", mode);
          } catch {
          }
        }
      };
      const seg = el("div", { class: "seg", role: "group", "aria-label": "Theme" });
      const mkBtn = (mode, label) => {
        const b = el("button", { class: current === mode ? "on" : "", onclick: () => {
          applyTheme(mode);
          seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
        } }, label);
        return b;
      };
      seg.appendChild(mkBtn("system", "System"));
      seg.appendChild(mkBtn("light", "Light"));
      seg.appendChild(mkBtn("dark", "Dark"));
      appearance.appendChild(seg);
      appearance.appendChild(el("div", { class: "field mt2" }, el("label", {}, "Gain / loss colors")));
      const plCurrent = (() => {
        try {
          return localStorage.getItem("oa.pl") || "default";
        } catch {
          return "default";
        }
      })();
      const applyPl = (mode) => {
        const rootEl = document.documentElement;
        if (mode === "default") {
          rootEl.removeAttribute("data-pl");
          try {
            localStorage.removeItem("oa.pl");
          } catch {
          }
        } else {
          rootEl.setAttribute("data-pl", mode);
          try {
            localStorage.setItem("oa.pl", mode);
          } catch {
          }
        }
      };
      const plSeg = el("div", { class: "seg", role: "group", "aria-label": "Gain and loss colors" });
      const mkPl = (mode, label) => {
        const b = el("button", { class: plCurrent === mode ? "on" : "", onclick: () => {
          applyPl(mode);
          plSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
        } }, label);
        return b;
      };
      plSeg.appendChild(mkPl("default", "Green / red"));
      plSeg.appendChild(mkPl("cvd", "Blue / orange"));
      plSeg.appendChild(mkPl("inverted", "Inverted"));
      appearance.appendChild(plSeg);
      appearance.appendChild(el(
        "div",
        { class: "small muted mt1" },
        "Blue / orange is colorblind-friendly (Okabe\u2013Ito palette). Inverted follows the East Asian convention \u2014 red means up."
      ));
      root.appendChild(appearance);
      const about = el("div", { class: "card mt2 settings-section" });
      about.appendChild(el("h3", {}, "About"));
      about.appendChild(el(
        "div",
        { class: "pos-greeks" },
        el("span", {}, "Version"),
        el("span", { class: "num" }, versionLabel())
      ));
      about.appendChild(el(
        "p",
        { class: "sub mt1", style: "margin-bottom:0" },
        "Educational simulation only \u2014 not investment advice. ",
        el("a", { href: "#/legal" }, "Disclosures")
      ));
      root.appendChild(about);
      root.appendChild(el(
        "div",
        { class: "btn-row mt2" },
        el("a", { class: "btn", href: "#/progress" }, "\u2190 Progress")
      ));
    }
  };

  // src/ui/legal.js
  var CFTC_441 = "HYPOTHETICAL OR SIMULATED PERFORMANCE RESULTS HAVE CERTAIN LIMITATIONS. UNLIKE AN ACTUAL PERFORMANCE RECORD, SIMULATED RESULTS DO NOT REPRESENT ACTUAL TRADING. ALSO, SINCE THE TRADES HAVE NOT BEEN EXECUTED, THE RESULTS MAY HAVE UNDER-OR-OVER COMPENSATED FOR THE IMPACT, IF ANY, OF CERTAIN MARKET FACTORS, SUCH AS LACK OF LIQUIDITY. SIMULATED TRADING PROGRAMS IN GENERAL ARE ALSO SUBJECT TO THE FACT THAT THEY ARE DESIGNED WITH THE BENEFIT OF HINDSIGHT. NO REPRESENTATION IS BEING MADE THAT ANY ACCOUNT WILL OR IS LIKELY TO ACHIEVE PROFIT OR LOSSES SIMILAR TO THOSE SHOWN.";
  var ACK_TEXT = "I understand Options Academy is for education only \u2014 it is not investment, financial, or trading advice; it is not a broker or advisor; all markets here are simulated; and options trading involves substantial risk of loss.";
  function simDisclaimer() {
    return el(
      "p",
      { class: "sim-disclaimer small muted", role: "note" },
      "Simulated market for education only \u2014 not investment advice; hypothetical results have inherent limitations. ",
      el("a", { href: "#/legal" }, "Full disclosures")
    );
  }
  var view4 = {
    render(root) {
      root.appendChild(el("div", { class: "eyebrow" }, "Disclosures & legal"));
      root.appendChild(el("h1", {}, "The fine print, in plain sight"));
      const S2 = (title, ...kids) => root.appendChild(el("div", { class: "card mt2", style: "max-width:76ch" }, el("h3", {}, title), ...kids));
      S2(
        "Education only \u2014 not advice",
        el("p", { class: "sub" }, "Options Academy (operated by Steadfast Labs LLC) is an educational product. Nothing here is investment, financial, legal, or tax advice, and nothing is a recommendation to buy or sell any security or derivative. We are not a registered investment adviser or broker-dealer. Every market, price, and account on this platform is simulated.")
      );
      S2(
        "Hypothetical performance (CFTC Rule 4.41)",
        el("p", { class: "small muted", style: "line-height:1.6" }, CFTC_441)
      );
      S2(
        "Options risk",
        el(
          "p",
          { class: "sub" },
          `Options trading involves substantial risk and is not suitable for all investors. Before trading real options, read the Options Clearing Corporation's "Characteristics and Risks of Standardized Options": `,
          el("a", { href: "https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document", target: "_blank", rel: "noopener" }, "theocc.com (ODD)"),
          ". Past performance \u2014 simulated or real \u2014 never guarantees future results."
        )
      );
      S2(
        "Subscriptions, cancellation & refunds",
        el("p", { class: "sub" }, "Paid plans renew automatically until canceled. Cancel anytime in one click from Account \u2192 Manage subscription \u2014 access continues through the period you paid for. If the product is not for you, email us within 14 days of your first charge for a full refund.")
      );
      S2(
        "Privacy",
        el("p", { class: "sub" }, "Your learning progress lives on your device; if you create an account it syncs to our database (Supabase), readable only by you. Payments are processed by Stripe \u2014 card details never touch our servers. We do not sell personal data. Delete your account to delete your synced data.")
      );
      S2(
        "Contact",
        el("p", { class: "sub", style: "margin-bottom:0" }, "Steadfast Labs LLC \xB7 support: lopez.j.ronald@gmail.com (placeholder \u2014 replace with support@ address before launch).")
      );
      root.appendChild(el("p", { class: "small muted mt2" }, "Draft for attorney review before paid launch."));
    }
  };

  // src/ui/views/start.js
  var CHAIN_ROWS = [
    { k: 98, call: "3.40", put: "1.12", atm: false },
    { k: 100, call: "2.15", put: "1.98", atm: true },
    { k: 102, call: "1.22", put: "3.05", atm: false },
    { k: 104, call: "0.68", put: "4.40", atm: false }
  ];
  function openStartLearning() {
    bus.emit("add-profile");
  }
  function exploreCurriculum() {
    if (!profiles().length) {
      bus.emit("add-profile", { then: "#/learn" });
      return;
    }
    location.hash = "#/learn";
  }
  function buildMiniTape(host) {
    const inner = el("div", { class: "fd-mini-tape-inner" });
    host.appendChild(inner);
    function paint() {
      inner.innerHTML = "";
      const list2 = market.list().slice(0, 8);
      for (const t of list2) {
        const q = market.quote(t.sym);
        const up = (q?.chg ?? 0) >= 0;
        inner.appendChild(el(
          "span",
          { class: "fd-tq" },
          el("span", { class: "sym" }, t.sym),
          el("span", { class: "px num" }, F.usd(q?.S)),
          el(
            "span",
            { class: "chg num " + (up ? "up" : "down") },
            (up ? "\u25B2" : "\u25BC") + F.pctSigned(q?.chgPct ?? 0)
          )
        ));
      }
    }
    paint();
    return paint;
  }
  function buildSpark(canvas) {
    const pts = [];
    let v = 100;
    for (let i = 0; i < 48; i++) {
      v += Math.sin(i / 5) * 0.4 + (i % 7 - 3) * 0.08;
      pts.push(v);
    }
    spark(canvas, pts, { color: "--brass", height: 56 });
    return pts;
  }
  function tickSpark(canvas, pts, reduced) {
    if (reduced) return;
    const last = pts[pts.length - 1] || 100;
    const next = last + Math.sin(Date.now() / 900) * 0.35 + (Date.now() % 11 - 5) * 0.02;
    pts.push(next);
    if (pts.length > 48) pts.shift();
    spark(canvas, pts, { color: "--brass", height: 56 });
  }
  function productShot() {
    const tape = el("div", { class: "fd-mini-tape", "aria-hidden": "true" });
    const sparkWrap = el(
      "div",
      { class: "fd-spark-wrap" },
      el(
        "div",
        { class: "fd-spark-label" },
        el("span", { class: "eyebrow" }, "LMND"),
        el("span", { class: "num muted" }, "sim tape")
      ),
      el("canvas", { class: "fd-spark", width: "280", height: "56" })
    );
    const canvas = (
      /** @type {HTMLCanvasElement} */
      sparkWrap.querySelector("canvas")
    );
    const chain = el(
      "div",
      { class: "fd-mini-chain" },
      el(
        "div",
        { class: "fd-chain-head" },
        el("span", {}, "Call"),
        el("span", {}, "Strike"),
        el("span", {}, "Put")
      )
    );
    for (const row of CHAIN_ROWS) {
      chain.appendChild(el(
        "div",
        { class: "fd-chain-row" + (row.atm ? " atm" : "") },
        el("span", { class: "num" }, row.call),
        el("span", { class: "num strike" }, String(row.k)),
        el("span", { class: "num" }, row.put)
      ));
    }
    const card = el(
      "div",
      { class: "fd-product-card" },
      tape,
      sparkWrap,
      chain
    );
    return { el: el("div", { class: "fd-product-stage" }, card), tape, canvas };
  }
  function processRing() {
    const r = 42;
    const c = 2 * Math.PI * r;
    const score = 82;
    const dash = score / 100 * c;
    const svg = el("div", { class: "fd-score-ring", role: "img", "aria-label": "Process Score 82 of 100" });
    svg.innerHTML = `<svg viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--inset)" stroke-width="8"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--brass)" stroke-width="8"
      stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}"
      transform="rotate(-90 50 50)"/>
    <text x="50" y="48" text-anchor="middle" class="num" fill="var(--ink)"
      font-family="var(--mono)" font-size="22" font-weight="700">82</text>
    <text x="50" y="64" text-anchor="middle" fill="var(--ink-3)"
      font-family="var(--sans)" font-size="9" letter-spacing="0.08em">/ 100</text>
  </svg>`;
    return svg;
  }
  function regimeBadges() {
    const regimes = [
      { label: "Calm", cls: "" },
      { label: "Earnings", cls: "hot" },
      { label: "Crash week", cls: "risk" },
      { label: "IV crush", cls: "hot" }
    ];
    const row = el("div", { class: "fd-regime-row" });
    for (const r of regimes) {
      row.appendChild(el("span", { class: "fd-regime-badge" + (r.cls ? " " + r.cls : "") }, r.label));
    }
    return row;
  }
  function missionMocks() {
    return el(
      "div",
      { class: "fd-mission-mocks" },
      el(
        "div",
        { class: "card pad-s fd-mission-mock" },
        el(
          "div",
          { class: "flex-between" },
          icon("compass", { cls: "mi" }),
          el("span", { class: "pill brass" }, "income")
        ),
        el("h3", {}, "First Covered Call"),
        el("p", { class: "sub" }, "Sell a call against shares you hold.")
      ),
      el(
        "div",
        { class: "card pad-s fd-mission-mock" },
        el(
          "div",
          { class: "flex-between" },
          icon("wave", { cls: "mi" }),
          el("span", { class: "pill brass" }, "vol")
        ),
        el("h3", {}, "Straddle the print"),
        el("p", { class: "sub" }, "Trade movement through an earnings gap.")
      )
    );
  }
  function storyBand(opts) {
    const { eyebrow, title, body, linkHref, linkLabel, graphic, alt } = opts;
    return el(
      "section",
      { class: "fd-band" + (alt ? " alt" : "") },
      el(
        "div",
        { class: "fd-band-inner" },
        el(
          "div",
          { class: "fd-band-copy" },
          el("div", { class: "eyebrow" }, eyebrow),
          el("h2", { class: "fd-band-title" }, title),
          el("p", { class: "sub" }, body),
          el("a", { class: "fd-inline-link", href: linkHref }, linkLabel + " \u2192")
        ),
        el("div", { class: "fd-band-graphic" }, graphic)
      )
    );
  }
  function pricingStrip() {
    if (isFamilyBuild()) {
      return el(
        "section",
        { class: "fd-pricing fd-family-note" },
        el(
          "div",
          { class: "fd-pricing-inner" },
          el("div", { class: "eyebrow" }, "Founder build"),
          el("h2", { class: "fd-band-title" }, "The unrestricted desk edition"),
          el(
            "p",
            { class: "sub" },
            "Every track, mission, and ticker unlocked \u2014 no account needed. The commercial PWA is where Free vs Academy lives."
          )
        )
      );
    }
    return el(
      "section",
      { class: "fd-pricing" },
      el(
        "div",
        { class: "fd-pricing-inner" },
        el("div", { class: "eyebrow" }, "Plans"),
        el("h2", { class: "fd-band-title" }, "Start free. Go Academy when you are ready."),
        el(
          "div",
          { class: "fd-price-row" },
          el(
            "div",
            { class: "card fd-price-card" },
            el("div", { class: "eyebrow" }, "Free"),
            el("div", { class: "fd-price num" }, "$0"),
            el("p", { class: "sub" }, "Paper trading with practice limits \u2014 enough to learn the craft."),
            el("button", { type: "button", class: "btn primary", onclick: openStartLearning }, "Start free")
          ),
          el(
            "div",
            { class: "card fd-price-card featured" },
            el("div", { class: "eyebrow" }, "Academy"),
            el("div", { class: "fd-price num" }, "$" + BILLING.priceMonthlyUsd, el("span", { class: "per" }, "/mo")),
            el("p", { class: "sub" }, "Full missions, unlimited journal, every ticker."),
            el("button", { type: "button", class: "btn", onclick: openStartLearning }, "Start free \u2014 upgrade later")
          )
        )
      )
    );
  }
  var view5 = {
    render(root) {
      const reduced = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
      const shot = productShot();
      const hero = el(
        "section",
        { class: "fd-hero" },
        el(
          "div",
          { class: "fd-hero-copy" },
          el("div", { class: "eyebrow fd-brand" }, "Options Academy"),
          el("h1", { class: "fd-display" }, "Learn options the way pilots learn to fly."),
          el(
            "p",
            { class: "fd-subhead" },
            "A live simulated market, guided missions, and a journal that grades your decisions \u2014 not your luck."
          ),
          el(
            "div",
            { class: "fd-cta-row" },
            el(
              "button",
              { type: "button", class: "btn primary lg", onclick: openStartLearning },
              "Start learning \u2014 free"
            ),
            el(
              "button",
              { type: "button", class: "btn ghost lg", onclick: exploreCurriculum },
              "Explore the curriculum"
            )
          ),
          !isFamilyBuild() ? el("p", { class: "fd-trust small muted" }, "No card required \xB7 Education only \xB7 Cancel anytime") : null
        ),
        shot.el
      );
      const page = el(
        "div",
        { class: "fd-page" },
        hero,
        storyBand({
          eyebrow: "The market",
          title: "A market that teaches",
          body: "Regimes, earnings gaps, IV crush, and replayable crash weeks \u2014 the sim is a flight school, not a slot machine.",
          linkHref: "#/market",
          linkLabel: "Open the Live Market",
          graphic: regimeBadges(),
          alt: false
        }),
        storyBand({
          eyebrow: "The journal",
          title: "Graded on process, not luck",
          body: "Process Score grades thesis, defined risk, sizing, and exit discipline \u2014 the decision, not the P&L.",
          linkHref: "#/journal",
          linkLabel: "See Process Score",
          graphic: processRing(),
          alt: true
        }),
        storyBand({
          eyebrow: "The drills",
          title: "Missions, not videos",
          body: "Sandboxed markets with clear objectives. Defined-risk drills before you freestyle on the tape.",
          linkHref: "#/missions",
          linkLabel: "Browse missions",
          graphic: missionMocks(),
          alt: false
        }),
        pricingStrip(),
        el("footer", { class: "fd-footer" }, simDisclaimer())
      );
      page.querySelectorAll('a[href="#/market"], a[href="#/journal"], a[href="#/missions"]').forEach((a) => {
        a.addEventListener("click", (e) => {
          if (!profiles().length) {
            e.preventDefault();
            bus.emit("add-profile", { then: a.getAttribute("href") });
          }
        });
      });
      root.appendChild(page);
      const paintTape = buildMiniTape(shot.tape);
      const sparkPts = buildSpark(shot.canvas);
      const tapeId = setInterval(paintTape, 1e3);
      const sparkId = reduced ? null : setInterval(() => tickSpark(shot.canvas, sparkPts, reduced), 1e3);
      return () => {
        clearInterval(tapeId);
        if (sparkId) clearInterval(sparkId);
      };
    }
  };

  // src/ui/shell.js
  var contentEl;
  var tapeInner;
  var clockEl;
  var navEl;
  var profileEl;
  var liveDot;
  var tabbarEl;
  var currentCleanup = null;
  var syncCloudCleanup = null;
  var VIEWS = {};
  var sheetHost = null;
  var NAV = [
    { sect: "Learn" },
    { id: "home", icon: "\u{1F3E0}", ic: "home", label: "Home" },
    { id: "learn", icon: "\u{1F4DA}", ic: "book", label: "Curriculum" },
    { sect: "Apply" },
    { id: "market", icon: "\u{1F4FA}", ic: "monitor", label: "Live Market" },
    { id: "strategy", icon: "\u{1F9E9}", ic: "layers", label: "Strategy Lab" },
    { id: "greeks", icon: "\u{1F3DB}\uFE0F", ic: "temple", label: "Greeks Lab" },
    { id: "vol", icon: "\u{1F30A}", ic: "wave", label: "Volatility Lab" },
    { id: "risk", icon: "\u{1F4CA}", ic: "grid", label: "Risk Desk" },
    { id: "journal", icon: "\u{1F4D3}", ic: "notebook", label: "Journal" },
    { id: "missions", icon: "\u{1F9ED}", ic: "compass", label: "Missions" },
    { sect: "You" },
    { id: "progress", icon: "\u{1F3C6}", ic: "trophy", label: "Progress" },
    { id: "settings", icon: "\u2699\uFE0F", ic: "gear", label: "Settings" },
    { id: "legal", icon: "\u2696\uFE0F", ic: "scale", label: "Disclosures" }
  ];
  var LABS = [
    { id: "strategy", icon: "\u{1F9E9}", ic: "layers", label: "Strategy Lab" },
    { id: "greeks", icon: "\u{1F3DB}\uFE0F", ic: "temple", label: "Greeks Lab" },
    { id: "vol", icon: "\u{1F30A}", ic: "wave", label: "Volatility Lab" },
    { id: "risk", icon: "\u{1F4CA}", ic: "grid", label: "Risk Desk" },
    { id: "missions", icon: "\u{1F9ED}", ic: "compass", label: "Missions" },
    { id: "journal", icon: "\u{1F4D3}", ic: "notebook", label: "Journal" }
  ];
  var LAB_IDS = new Set(LABS.map((l) => l.id));
  var YOU_IDS = /* @__PURE__ */ new Set(["progress", "settings", "upgrade", "welcome", "legal", "start"]);
  function navItems() {
    return NAV;
  }
  function closeSheet() {
    if (sheetHost) {
      sheetHost.remove();
      sheetHost = null;
    }
  }
  function openSheet(title, items) {
    closeSheet();
    const list2 = el(
      "div",
      { class: "oa-sheet", role: "dialog", "aria-label": title },
      el("div", { class: "oa-sheet-handle", "aria-hidden": "true" }),
      el("div", { class: "eyebrow" }, title)
    );
    for (const it of items) {
      list2.appendChild(el(
        "button",
        {
          type: "button",
          class: "oa-sheet-item",
          onclick: () => {
            closeSheet();
            it.onClick();
          }
        },
        it.ic ? icon(it.ic, { cls: "si" }) : el("span", { class: "si" }, it.icon),
        el("span", {}, it.label)
      ));
    }
    sheetHost = el("div", { class: "oa-sheet-bg", onclick: (e) => {
      if (e.target === sheetHost) closeSheet();
    } }, list2);
    document.body.appendChild(sheetHost);
  }
  function openLabsSheet() {
    openSheet("Labs", LABS.map((l) => ({
      ic: l.ic,
      icon: l.icon,
      label: l.label,
      onClick: () => {
        location.hash = "#/" + l.id;
      }
    })));
  }
  function openYouSheet() {
    const items = [
      { ic: "trophy", icon: "\u{1F3C6}", label: "Progress", onClick: () => {
        location.hash = "#/progress";
      } },
      { ic: "gear", icon: "\u2699\uFE0F", label: "Settings", onClick: () => {
        location.hash = "#/settings";
      } },
      { ic: "user", icon: "\u{1F464}", label: "Switch profile", onClick: () => profilePicker() },
      { ic: "contrast", icon: "\u25D0", label: "Toggle theme", onClick: () => toggleTheme() }
    ];
    if (!isFamilyBuild() && tier() === "free") {
      items.push({ ic: "sparkle", icon: "\u2728", label: "Upgrade to Academy", onClick: () => {
        location.hash = "#/upgrade";
      } });
    }
    for (const it of youSheetAccountItems()) items.push(it);
    openSheet("You", items);
  }
  function buildTabbar() {
    const tabs = [
      { id: "learn", ic: "book", label: "Learn", href: "#/learn" },
      { id: "market", ic: "monitor", label: "Market", href: "#/market" },
      { id: "labs", ic: "layers", label: "Labs", onClick: openLabsSheet }
    ];
    tabs.push({ id: "you", ic: "user", label: "You", onClick: openYouSheet });
    tabbarEl = el("nav", { class: "oa-tabbar", "aria-label": "Primary" });
    for (const t of tabs) {
      if (t.href) {
        tabbarEl.appendChild(el(
          "a",
          { href: t.href, "data-tab": t.id },
          icon(t.ic, { cls: "ti" }),
          el("span", {}, t.label)
        ));
      } else {
        tabbarEl.appendChild(el(
          "button",
          { type: "button", "data-tab": t.id, onclick: t.onClick },
          icon(t.ic, { cls: "ti" }),
          el("span", {}, t.label)
        ));
      }
    }
    return tabbarEl;
  }
  function refreshTabActive(routeName) {
    if (!tabbarEl) return;
    const learnActive = routeName === "learn" || routeName === "home";
    const labsActive = LAB_IDS.has(routeName);
    const youActive = YOU_IDS.has(routeName);
    tabbarEl.querySelectorAll("[data-tab]").forEach((a) => {
      const id = a.getAttribute("data-tab");
      let on = id === routeName;
      if (id === "learn") on = learnActive;
      if (id === "labs") on = labsActive;
      if (id === "you") on = youActive;
      a.classList.toggle("active", on);
    });
  }
  function build() {
    const app = document.getElementById("oa-app");
    app.innerHTML = "";
    navEl = el("nav", { class: "oa-nav" });
    for (const n of navItems()) {
      if (n.sect) {
        navEl.appendChild(el("div", { class: "oa-nav-sect" }, n.sect));
        continue;
      }
      navEl.appendChild(el(
        "a",
        { href: "#/" + n.id, "data-nav": n.id },
        n.ic ? icon(n.ic, { cls: "ni" }) : el("span", { class: "ni" }, n.icon),
        el("span", { class: "lbl" }, n.label)
      ));
    }
    profileEl = el("div", {
      class: "oa-profile",
      tabindex: "0",
      role: "button",
      "aria-label": "Switch profile",
      onclick: () => profilePicker(),
      onkeydown: (e) => {
        if (e.key === "Enter") profilePicker();
      }
    });
    const rail = el(
      "aside",
      { class: "oa-rail" },
      el(
        "div",
        { class: "oa-logo" },
        el("div", { class: "oa-logo-mark" }, "\u0394"),
        el(
          "div",
          {},
          el("div", { class: "oa-logo-name" }, "Options Academy"),
          el("div", { class: "oa-logo-sub" }, "Academy Exchange")
        )
      ),
      navEl,
      profileEl
    );
    tapeInner = el("div", { class: "oa-tape-inner" });
    liveDot = el("span", { class: "oa-live-dot" });
    clockEl = el("span", {}, "");
    const themeBtn = el("button", { class: "theme-btn", title: "Toggle light/dark", "aria-label": "Toggle theme", onclick: toggleTheme }, icon("contrast"));
    const tape = el(
      "div",
      { class: "oa-tape" },
      tapeInner,
      el("div", { class: "oa-tape-clock" }, liveDot, clockEl, themeBtn)
    );
    contentEl = el("div", { class: "oa-content" });
    const main = el("main", { class: "oa-main" }, tape, contentEl);
    app.appendChild(rail);
    app.appendChild(main);
    app.appendChild(buildTabbar());
    renderTape();
    refreshProfile();
  }
  function toggleTheme() {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme") || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
    try {
      localStorage.setItem("oa.theme", root.getAttribute("data-theme"));
    } catch {
    }
  }
  function renderTape() {
    tapeInner.innerHTML = "";
    for (const t of market.list()) {
      const q = market.quote(t.sym);
      const up = q.chg >= 0;
      tapeInner.appendChild(el(
        "span",
        { class: "oa-tq", onclick: () => location.hash = "#/market/" + t.sym },
        el("span", { class: "sym" }, t.sym),
        el("span", { class: "px" }, F.usd(q.S)),
        el("span", { class: "chg " + (up ? "up" : "down") }, (up ? "\u25B2" : "\u25BC") + F.pctSigned(q.chgPct))
      ));
    }
    clockEl.textContent = market.clockLabel() + " \xB7 " + (market.running ? market.speed + "\xD7" : "paused");
    liveDot.className = "oa-live-dot" + (market.running ? "" : " paused");
  }
  function refreshProfile() {
    const p = active();
    if (syncCloudCleanup) {
      try {
        syncCloudCleanup();
      } catch {
      }
      syncCloudCleanup = null;
    }
    profileEl.innerHTML = "";
    if (!p) {
      profileEl.appendChild(el("div", { class: "pn" }, "Choose profile\u2026"));
      return;
    }
    const lv = levelOf(p.xp);
    profileEl.appendChild(avEl(p));
    profileEl.appendChild(el(
      "div",
      { class: "pt" },
      el("div", { class: "pn" }, p.name),
      el("div", { class: "px num" }, `Lv ${lv.n} ${lv.name} \xB7 ${p.xp} XP`)
    ));
    syncCloudCleanup = mountSyncCloud(profileEl);
  }
  var EMOJIS = ["\u{1F981}", "\u{1F98A}", "\u{1F43C}", "\u{1F989}", "\u{1F42C}", "\u{1F984}", "\u{1F42F}", "\u{1F680}", "\u{1F31F}", "\u{1F3AF}", "\u{1F9E0}", "\u{1F3C4}"];
  function avEl(p, cls = "av") {
    if (isFamilyBuild()) return el("span", { class: cls }, p.emoji);
    return el("span", { class: cls + " monogram" }, (p.name || "?").trim().charAt(0).toUpperCase());
  }
  function profilePicker(firstRun = false) {
    const wrap = el("div", {});
    wrap.appendChild(el("h2", {}, firstRun === true ? "Welcome to Options Academy" : "Select a trader profile"));
    wrap.appendChild(el("p", { class: "sub" }, firstRun === true ? "A simulated trading floor: learn a concept, then apply it on a live simulated market. Each profile tracks its own progress, XP, and paper-money account." : "Switch profiles or add a new trader."));
    const grid = el("div", { class: "profile-grid" });
    for (const p of profiles()) {
      const lv = levelOf(p.xp);
      grid.appendChild(el(
        "div",
        {
          class: "profile-tile" + (active()?.id === p.id ? " sel" : ""),
          tabindex: "0",
          role: "button",
          onclick: () => {
            setActive(p.id);
            m.close();
            refreshProfile();
            route();
          }
        },
        avEl(p),
        el("div", { class: "pn", style: "font-weight:600" }, p.name),
        el("div", { class: "small muted" }, "Trader"),
        el("div", { class: "small num muted" }, `Lv ${lv.n} \xB7 ${p.xp} XP`)
      ));
    }
    grid.appendChild(el(
      "div",
      { class: "profile-tile", tabindex: "0", role: "button", onclick: () => {
        m.close();
        addProfileModal();
      } },
      el("div", { class: "av" }, icon("plus")),
      el("div", { style: "font-weight:600" }, "New profile")
    ));
    wrap.appendChild(grid);
    const m = modal(wrap, { onClose: firstRun === true ? false : void 0 });
    return m;
  }
  function addProfileModal(opts = {}) {
    let emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const nameIn = el("input", { type: "text", placeholder: "Name", "aria-label": "Profile name", style: "padding:8px 10px;border:1px solid var(--hairline);border-radius:6px;width:100%;background:var(--card);" });
    const emojiRow = el("div", { class: "btn-row", style: "margin:10px 0" });
    const emBtns = EMOJIS.map((e2) => {
      const b = el("button", { class: "btn sm" + (e2 === emoji ? " primary" : ""), onclick: () => {
        emoji = e2;
        emBtns.forEach((x) => x.classList.remove("primary"));
        b.classList.add("primary");
      } }, e2);
      return b;
    });
    emBtns.forEach((b) => emojiRow.appendChild(b));
    const needAck = !isFamilyBuild();
    const ackBox = el("input", { type: "checkbox", id: "oa-ack", style: "margin-top:3px;flex:0 0 auto" });
    const ackRow = needAck ? el(
      "label",
      { for: "oa-ack", class: "small", style: "display:flex;gap:8px;align-items:flex-start;margin-top:12px;max-width:46ch;cursor:pointer" },
      ackBox,
      el("span", { class: "muted" }, ACK_TEXT, " ", el("a", { href: "#/legal" }, "Disclosures"))
    ) : null;
    const wrap = el(
      "div",
      {},
      el("h2", {}, "New profile"),
      el("div", { class: "field mt2" }, el("label", {}, "Name"), nameIn),
      isFamilyBuild() ? el("div", { class: "mt1" }, el("div", { class: "field" }, el("label", {}, "Avatar")), emojiRow) : null,
      ackRow,
      el(
        "div",
        { class: "btn-row mt2" },
        el("button", { class: "btn primary", onclick: () => {
          if (needAck && !ackBox.checked) {
            toast("Please confirm the education-only acknowledgment to continue.", "loss");
            return;
          }
          const name = nameIn.value.trim() || "Learner";
          const p = addProfile(name, emoji);
          m.close();
          refreshProfile();
          toast(`Welcome, ${name}! You start with ${F.usd(1e5, 0)} of paper money.`, "gain");
          const dest = opts.then || "#/welcome";
          start(p?.id || active()?.id);
          if ((location.hash || "") === "#/start") location.replace(dest);
          else location.hash = dest;
          route();
        } }, "Start learning")
      )
    );
    const m = modal(wrap);
    nameIn.focus();
  }
  function route() {
    closeSheet();
    const hash = location.hash || "#/home";
    const parts = hash.replace(/^#\//, "").split("/");
    let name = (parts[0] || "home").split("?")[0] || "home";
    if (name === "kids") {
      location.replace("#/learn");
      return;
    }
    if (!profiles().length && name !== "start" && name !== "legal") {
      location.replace("#/start");
      return;
    }
    const landing = name === "start";
    document.body.classList.toggle("oa-landing", landing);
    const view16 = VIEWS[name] || VIEWS.home;
    if (currentCleanup) {
      try {
        currentCleanup();
      } catch {
      }
      currentCleanup = null;
    }
    navEl.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
    refreshTabActive(name);
    contentEl.innerHTML = "";
    window.scrollTo(0, 0);
    currentCleanup = view16.render(contentEl, parts.slice(1)) || null;
  }
  function boot(views) {
    VIEWS = { welcome: view, upgrade: view2, settings: view3, start: view5, ...views };
    try {
      const th = localStorage.getItem("oa.theme");
      if (th) document.documentElement.setAttribute("data-theme", th);
    } catch {
    }
    try {
      const pl = localStorage.getItem("oa.pl");
      if (pl) document.documentElement.setAttribute("data-pl", pl);
    } catch {
    }
    build();
    market.on("tick", renderTape);
    market.on("state", renderTape);
    bus.on("profile", refreshProfile);
    bus.on("profile-picker", () => profilePicker());
    bus.on("add-profile", (opts) => addProfileModal(opts && typeof opts === "object" ? opts : {}));
    bus.on("tape", renderTape);
    setInterval(() => saveMarketSnapshot(market.snapshot()), 15e3);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (market.running) {
          market.pause();
          market._autoPaused = true;
        }
      } else if (market._autoPaused) {
        market._autoPaused = false;
        market.start();
      }
    });
    market.start();
    window.addEventListener("hashchange", route);
    route();
  }

  // src/content/curriculum.js
  var curriculum = {
    "tracks": [
      {
        "id": "foundations",
        "title": "Money & Risk Foundations",
        "audience": "First-principles primer",
        "description": "Probability, expected value, asymmetric payoffs, portfolio correlation, and the economics of insurance \u2014 the quantitative mental models behind every sound option trade.",
        "modules": [
          {
            "id": "f-chance",
            "title": "Thinking in Probabilities",
            "lessons": [
              {
                "id": "f-what-is-probability",
                "title": "Base Rates, Sample Size, and the Law of Large Numbers",
                "objective": "Treat probability as a long-run frequency between 0 and 1, separate single-trade noise from statistical edge, and avoid the gambler's fallacy.",
                "body": `Every market decision lives between certainty (1.0) and impossibility (0.0). When an option chain implies a 25% probability that Lumend Brands (LMND, trading near $42) finishes above $45 by expiration, the market is quoting a **base rate**: across hundreds of comparable setups with identical volatility and time remaining, roughly one in four finishes in-the-money. Probability does not predict what happens on Friday; it prices the distribution of outcomes across a large sample.

That distinction separates disciplined traders from tourists. Over a small sample \u2014 five or ten trades \u2014 **variance dominates**. A 25%-probability trade can easily win three times in a row or fail twelve times straight without anything being broken in your model. Only as the sample grows toward 100 or 1,000 independent trials does the realized win rate converge toward the true probability. Statisticians call this convergence the **law of large numbers**; trading desks call it surviving long enough for your edge to show up.

Forgetting sample size breeds two opposite errors. The first is the **gambler's fallacy**: assuming that after four consecutive losses on independent setups, a win is "due" and increasing position size. The market keeps no memory of your P&L ledger; the fifth trade carries the exact same probability as the first. The second error is abandoning a sound strategy after a normal three-trade drawdown, mistaking routine statistical noise for a broken thesis.

When you read a probability on a trading screen \u2014 whether a 70% historical earnings-beat rate or a 30-delta call option \u2014 translate it immediately into frequency language: "In ten independent occurrences under these conditions, roughly three pay off and seven expire worthless." Thinking in distributions rather than single-outcome prophecies is the foundation of risk management.`,
                "key_takeaways": [
                  "Probability (0 to 1) measures long-run frequency across many independent trials, never a guarantee for the next trade.",
                  "Small samples are dominated by variance; convergence to the true odds requires a large sample (the law of large numbers).",
                  "Independent trades have no memory \u2014 a losing streak never makes the next trade 'due' (the gambler's fallacy).",
                  "Read market probabilities as base rates ('3 out of 10 setups like this'), not forecasts of a single outcome."
                ],
                "sim": "market",
                "sim_task": "On the Live Market, open the option chain for Lumend Brands (LMND, ~$42) and locate an out-of-the-money call near 0.25 delta (roughly a 25% implied probability of finishing in-the-money). Paper-trade one contract and step the clock forward to expiration across five separate sessions, logging how streaky short-run outcomes can be even when the underlying odds hold steady.",
                "quiz": [
                  {
                    "q": "An option setup has a 30% probability of finishing in-the-money. What does that figure actually mean?",
                    "choices": [
                      "The option will gain 30% in price",
                      "Across a large sample of identical setups, roughly 30% finish in-the-money",
                      "Exactly 3 out of every 10 trades are guaranteed to win",
                      "The probability cannot be estimated until expiration"
                    ],
                    "answer": 1,
                    "explain": "A 30% probability describes the long-run frequency over many comparable trials \u2014 roughly 30 winners per 100 trades \u2014 not a quota for any 10-trade stretch."
                  },
                  {
                    "q": "You take four independent 50%-probability trades and lose all four. What is the probability of winning on the fifth independent setup?",
                    "choices": [
                      "Greater than 50% \u2014 a win is statistically overdue",
                      "Less than 50% \u2014 the strategy is in a cold streak",
                      "Still 50%",
                      "Zero"
                    ],
                    "answer": 2,
                    "explain": "Independent trials have no memory. Assuming a win is 'due' after a streak of losses is the gambler's fallacy and leads traders to oversize at the worst time."
                  },
                  {
                    "q": "A macro model assigns an 80% probability that the Academy 500 Index (FAM500) holds above support this week. How should a trader interpret that number?",
                    "choices": [
                      "The index will spend 80% of the week above support",
                      "In roughly 8 out of 10 weeks with identical macro conditions, support holds \u2014 and in 2 out of 10 it breaks",
                      "Support is guaranteed to hold",
                      "The analyst is 80% confident in their career"
                    ],
                    "answer": 1,
                    "explain": "Probabilistic forecasts describe an ensemble of similar regimes: 80% means failure still occurs roughly one time in five, so position sizing must survive the 20% tail."
                  }
                ]
              },
              {
                "id": "f-expected-value",
                "title": "Expected Value: Pricing the Edge",
                "objective": "Calculate expected value (EV) across discrete outcomes, separate process quality from single-trade results, and size positions to survive variance.",
                "body": "Consider a short-dated directional trade on Burgess Restaurant Group (BRGR, ~$67): you pay $200 in premium for a setup that has a 20% probability of returning $750 at expiration and an 80% probability of expiring worthless ($0). Should you take the trade? Intuition gets distracted by the 3.75-to-1 payout; a professional computes **expected value (EV)**.\n\n**Expected value** is the probability-weighted average outcome per trade over a large sample. Multiply each scenario's payoff by its probability and sum the parts: here, the expected gross payoff is ($750 \xD7 0.20) + ($0 \xD7 0.80) = $150. Subtract the $200 entry cost, and your net EV is **\u2212$50 per trade**. Run that exact setup 100 times and you should expect to bleed roughly $5,000 before fees \u2014 even though you will celebrate around twenty dramatic $550 net winners along the way.\n\nThat is the trap that sustains overpriced speculative markets: **negative-EV trades still produce vivid, memorable winners.** Conversely, suppose the market reprices that contract to $110 while the 20% payoff probability holds steady. Now your $150 expected payoff costs $110, yielding **+$40 of positive EV** per trade. Over 100 repetitions, that edge compounds into roughly $4,000 of expected profit.\n\nTwo desk rules follow immediately. First, expected value describes the *long-run average*, never today's print: a +$40-EV trade still loses 80% of the time in our example, meaning five or six consecutive losses are completely routine. If you risk 25% of your account on each try, a normal losing streak bankrupts you before the positive expectancy ever materializes. Second, never judge a decision by a single outcome: **good trade, bad result** (and bad trade, lucky result) happens every day. Audit your process by its expected value, not by the last ticket.",
                "key_takeaways": [
                  "Expected value (EV) = sum of (each outcome \xD7 its probability) minus the cost of entry.",
                  "A $150 expected payoff that costs $200 has a net EV of \u2212$50 per trade \u2014 a long-run loser regardless of occasional big wins.",
                  "Negative-EV strategies still produce loud winners; positive-EV strategies still suffer routine losing streaks.",
                  "Keep position size small enough that a statistically normal drawdown cannot knock you out of the market."
                ],
                "sim": "market",
                "sim_task": "On the Live Market, inspect the option chain for Burgess Restaurant Group (BRGR, ~$67). Compare an expensive far-OTM call (around 0.10 delta) against a near-the-money call (around 0.50 delta): estimate the move required for each to break even, paper-trade one contract of each across several simulated weeks, and track how entry price dictates net expected value.",
                "quiz": [
                  {
                    "q": "A trade costs $200 to enter. It has a 25% probability of paying out $600 and a 75% probability of expiring at $0. What is the net expected value per trade?",
                    "choices": [
                      "+$150 per trade",
                      "\u2212$50 per trade",
                      "$0 (breakeven)",
                      "+$400 per trade"
                    ],
                    "answer": 1,
                    "explain": "Expected gross payoff = $600 \xD7 0.25 = $150. Subtracting the $200 entry cost leaves \u2212$50 per trade on average."
                  },
                  {
                    "q": "A trader buys a far out-of-the-money weekly option, triples their money on an unexpected headline, and claims the setup is a proven money-maker. What is the flaw in that reasoning?",
                    "choices": [
                      "None \u2014 a profitable outcome proves positive EV",
                      "One outcome never establishes expected value; negative-EV setups regularly produce isolated winners",
                      "Weekly options only work on Fridays",
                      "They should double their size on the next trade while hot"
                    ],
                    "answer": 1,
                    "explain": "A single realization cannot validate expectancy. Negative-EV lottery-style trades must pay off occasionally or no one would buy them; over a full sample, the overpriced premium erodes capital."
                  },
                  {
                    "q": "You have a rigorously tested strategy with positive expected value, but your first three trades all lose. What is the disciplined response?",
                    "choices": [
                      "Scrap the model immediately",
                      "Recognize that losing streaks are normal even with positive EV, and keep position sizing small enough to weather them",
                      "Double your position size on trade four to recover the drawdown at once",
                      "Positive EV means three losses in a row are mathematically impossible"
                    ],
                    "answer": 1,
                    "explain": "Expectancy governs the long run, not three trials. Martingale-style doubling after losses turns a survivable streak into account ruin."
                  }
                ]
              },
              {
                "id": "f-risk-vs-reward",
                "title": "Risk, Reward, and Payoff Asymmetry",
                "objective": "Evaluate trades by their full payoff distribution rather than win rate alone, and anchor every decision on worst-case survival.",
                "body": 'Suppose you can allocate $10,000 into a risk-free Treasury bill yielding a guaranteed $500, or into an equity position with a 50% chance of gaining $1,250 and a 50% chance of losing $0 (breaking even). The equity allocation has the higher expected value ($625 vs. $500), yet a trader who needs that exact $500 to meet a fixed liability next month may rationally choose the Treasury bill. **Expected value is only half of capital allocation; the other half is dispersion and worst-case survival.**\n\nIn liquid markets, **risk** (the magnitude and probability of adverse outcomes) and **reward** (the compensation for bearing that uncertainty) are structurally linked. Higher expected returns exist precisely because investors demand compensation for enduring drawdowns. Whenever a promoter pitches high, steady returns with "near-zero risk," they are either concealing a catastrophic tail risk or running a fraud.\n\nBefore entering any position on a professional desk, two questions come before the profit target: **"What is the maximum possible loss?"** and **"Can my capital base survive that worst case intact?"** A positive-EV trade whose worst-case scenario forces a margin call or liquidates your account is an uninvestable trade. Rule one of compounding is staying solvent.\n\nFinally, never confuse **win rate** with low risk. Consider a strategy that collects $100 ninety times out of 100, and loses $2,000 the other ten times. A 90% win rate looks seductive on a marketing sheet, yet its net expectancy is (90 \xD7 $100) \u2212 (10 \xD7 $2,000) = **\u2212$11,000 per 100 trades**. Unhedged option selling often hides exactly this **negative skew**: frequent small credits punctuated by rare, account-erasing blowups. Always inspect the full payoff shape \u2014 both the probability of loss and the severity of the tail.',
                "key_takeaways": [
                  "Expected return and risk are structurally linked; outsized reward requires bearing real drawdown risk.",
                  "Always ask two questions first: What is the worst-case loss, and can my account survive it?",
                  "High win rate is meaningless without payoff magnitude \u2014 one tail loss can erase dozens of small wins.",
                  "Any pitch promising high returns with zero risk is either hiding a fat left tail or selling fraud."
                ],
                "sim": "market",
                "sim_task": "On the Live Market, compare low-volatility Galaxy Media (GLXY, ~$23.50) with high-volatility Rocket Robotics (RCKT, ~$182). Size an equal-dollar stock position (~$3,600: 150 shares of GLXY vs. 20 shares of RCKT), step forward ten trading days, and compare the daily P&L swings and worst single-day drawdown of each position.",
                "quiz": [
                  {
                    "q": "A trading strategy wins $100 on 90% of its trades and loses $2,000 on the remaining 10%. Over 100 trades, what is its expected net P&L?",
                    "choices": [
                      "Profitable \u2014 a 90% win rate guarantees an edge",
                      "\u2212$11,000 per 100 trades",
                      "Breakeven if you stop after a winning week",
                      "Impossible to determine without knowing the ticker"
                    ],
                    "answer": 1,
                    "explain": "90 wins \xD7 $100 = +$9,000; 10 losses \xD7 $2,000 = \u2212$20,000. Net result = \u2212$11,000. Win rate without loss severity tells you nothing about expectancy."
                  },
                  {
                    "q": "Why might a portfolio manager rationally prefer a guaranteed $500 Treasury return over a volatile position with a $625 expected value?",
                    "choices": [
                      "Portfolio managers ignore math",
                      "If failing to clear $500 triggers a costly constraint or margin liability, eliminating downside variance outweighs the extra $125 of EV",
                      "Guaranteed returns always have higher expected value",
                      "Volatile positions never pay out"
                    ],
                    "answer": 1,
                    "explain": "Utility depends on constraints and ruin thresholds. When a shortfall carries severe consequences, variance reduction is worth paying for in forgone EV."
                  },
                  {
                    "q": "An online newsletter advertises a 'guaranteed 8% monthly options income strategy with zero downside risk.' What can you conclude immediately?",
                    "choices": [
                      "It is a rare institutional inefficiency worth testing",
                      "It is either fraudulent or concealing severe tail risk \u2014 market returns require bearing commensurate risk",
                      "You should allocate 5% of your portfolio to verify the track record",
                      "8% per month is standard for covered call writing"
                    ],
                    "answer": 1,
                    "explain": "No liquid market pays ~150% annualized returns risk-free. Strategies marketed this way either fabricate results or sell deep out-of-the-money tail risk that eventually blows up."
                  }
                ]
              }
            ]
          },
          {
            "id": "f-markets",
            "title": "Equities, Price Discovery & Portfolio Correlation",
            "lessons": [
              {
                "id": "f-what-is-a-stock",
                "title": "Equity Ownership and How Markets Price the Future",
                "objective": "Understand a common share as a residual claim on a business's cash flows and assets, and see how continuous two-sided markets aggregate expectations into price.",
                "body": "Suppose Burgess Restaurant Group (BRGR) operates a profitable regional chain and wants $10 million to build twenty new locations. Management can borrow the capital from a bank \u2014 taking on mandatory interest payments that could sink the company during a recession \u2014 or it can issue **common stock**: dividing ownership of the enterprise into fractional shares and selling them to investors. Every share represents a proportional **residual claim** on the company's net assets and future earnings.\n\nWhy do investors part with cash for equity? Because if the expanded chain generates strong free cash flow year after year, each share entitles its holder to a proportional claim on those compounding earnings \u2014 paid out via dividends or retained to grow intrinsic value. Equity investing is not a wager on ticker symbols; it is the purchase of a productive cash-flow engine.\n\nOnce issued, those shares trade in a **secondary market** \u2014 an electronic order book where buyers post **bids** (the highest price they will pay) and sellers post **asks** (the lowest price they will accept). When a holder wants liquidity, they do not ask Burgess Restaurant Group for their money back; they sell their shares to another participant at the current market-clearing price. With BRGR trading near $67, that figure is simply the live equilibrium where marginal optimists and marginal pessimists agree to exchange cash for equity.\n\nWhy does BRGR trade at $67 in the morning and $65.80 by the close? Because market prices are **forward-looking discounting machines**. Every commodity cost report, consumer spending print, competitor announcement, or interest-rate shift alters investors' projections of future cash flows. Price movement is the continuous repricing of collective expectations.",
                "key_takeaways": [
                  "A share of common stock is a fractional ownership claim on a real business's net assets and future cash flows.",
                  "Secondary markets match buyers (bids) and sellers (asks) to provide continuous liquidity without tapping the company's treasury.",
                  "The market price is the live clearing point between optimists and pessimists \u2014 a discounting of future cash flows.",
                  "Prices move continuously as new information changes consensus expectations about earnings and risk."
                ],
                "sim": "market",
                "sim_task": "On the Live Market, pull up Burgess Restaurant Group (BRGR, ~$67) and Lumend Brands (LMND, ~$42). Buy 50 shares of BRGR, observe the bid-ask spread on the order ticket, and advance the simulation through several days of news headlines to watch how the market reprices the equity in real time.",
                "quiz": [
                  {
                    "q": "When you purchase 100 shares of Burgess Restaurant Group (BRGR), what do you legally own?",
                    "choices": [
                      "A senior debt contract that the company must repay with interest",
                      "A fractional ownership claim on the company's net assets and future earnings",
                      "A revenue voucher redeemable at company locations",
                      "A purely synthetic betting slip with no tie to the underlying business"
                    ],
                    "answer": 1,
                    "explain": "Common stock is residual equity ownership. Shareholders participate in the business's compounding earnings and asset value after debt obligations are met."
                  },
                  {
                    "q": "Why does a publicly traded stock's price fluctuate throughout the trading session?",
                    "choices": [
                      "Exchanges reset official valuations every hour",
                      "Buyers and sellers continuously update their valuations as new information alters future cash-flow expectations",
                      "Share prices follow a purely mechanical random-number generator",
                      "The issuing company reprices its shares whenever it needs working capital"
                    ],
                    "answer": 1,
                    "explain": "Price discovery is continuous. Every shift in macro data, sector news, or order flow changes where marginal buyers and sellers meet on the order book."
                  },
                  {
                    "q": "An investor bought shares of Lumend Brands (LMND) at $38 last quarter. Following a strong earnings beat, what are those shares worth today?",
                    "choices": [
                      "Exactly $38 \u2014 book cost determines market value",
                      "Whatever price a willing buyer currently bids in the secondary market, likely above $38",
                      "Nothing until the company liquidates its factories",
                      "The book value of inventory per share"
                    ],
                    "answer": 1,
                    "explain": "Historical cost is irrelevant to current value; a security is worth the current market-clearing bid where a buyer and seller agree to transact."
                  }
                ]
              },
              {
                "id": "f-diversification",
                "title": "Correlation, Variance Reduction, and Diversification",
                "objective": "Understand how combining imperfectly correlated assets reduces portfolio variance without sacrificing expected return, and recognize when apparent diversification fails.",
                "body": "Consider an airline and an energy producer such as PowerSun Energy (PWRS, ~$95). When crude oil and wholesale energy prices spike, the airline's operating margins compress while the energy producer's cash flows surge; when energy prices slump, the tailwinds reverse. Held in isolation, each equity exposes you to violent macro swings. Held together in a balanced portfolio, the energy windfalls cushion the airline drawdowns. Your combined equity curve smooths out \u2014 not because either business became less volatile, but because their shocks **offset**. That variance reduction is **diversification**.\n\nThe mathematical engine behind diversification is **correlation** \u2014 how closely two assets move together in response to the same shock. Owning five high-growth robotics companies alongside Rocket Robotics (RCKT, ~$182) is **not** diversification: a single spike in interest rates or a tech-sector valuation reset hammers all five simultaneously. True diversification requires combining exposures driven by genuinely different economic factors \u2014 pairing consumer staples like Lumend Brands (LMND, ~$42), energy (PWRS, ~$95), and broad index exposure (FAM500, ~$500).\n\nWhy do professionals call diversification the closest thing to a free lunch in finance? Because portfolio expected return is the weighted average of the holdings' expected returns, while portfolio volatility \u2014 thanks to imperfect correlation \u2014 is **strictly less** than the weighted average of their individual volatilities. You improve your return-to-risk ratio and keep your worst-case drawdown survivable.\n\nOne critical caveat: **correlations are not static.** In a severe liquidity crisis or broad market panic, correlations across equities often spike toward 1.0 as leveraged funds liquidate everything at once. Diversification dampens idiosyncratic and sector shocks \u2014 a vital seatbelt \u2014 but capping systemic market crash risk requires explicit hedging tools like index puts, which we introduce next.",
                "key_takeaways": [
                  "Diversification reduces portfolio variance by combining assets that react differently to the same economic shocks.",
                  "Owning multiple stocks in the same high-beta sector is concentration in disguise; correlation matters more than ticker count.",
                  "Imperfect correlation lowers portfolio volatility without lowering expected return \u2014 improving risk-adjusted performance.",
                  "In systemic market sell-offs, equity correlations rise; diversification smooths sector shocks but does not replace explicit crash protection."
                ],
                "sim": "market",
                "sim_task": "On the Live Market, construct a two-asset portfolio by pairing 50 shares of PowerSun Energy (PWRS, ~$95) with 70 shares of Burgess Restaurant Group (BRGR, ~$67), and compare its daily P&L fluctuations over ten simulated sessions against putting the entire ~$9,500 into high-beta Rocket Robotics (RCKT, ~$182).",
                "quiz": [
                  {
                    "q": "Which portfolio achieves the strongest genuine diversification?",
                    "choices": [
                      "Five high-volatility robotics and AI hardware stocks",
                      "An energy producer (PWRS), a consumer staple brand (LMND), and a restaurant operator (BRGR)",
                      "Two share classes of the same media company",
                      "A single concentrated position in Rocket Robotics (RCKT)"
                    ],
                    "answer": 1,
                    "explain": "Energy, consumer staples, and restaurants respond differently to inflation, fuel costs, and rate cycles. Five robotics stocks share the same factor exposure and sell off together."
                  },
                  {
                    "q": "What risk does equity diversification primarily mitigate?",
                    "choices": [
                      "All possible portfolio declines in every market environment",
                      "Idiosyncratic and single-sector blowups that could otherwise cripple a concentrated account",
                      "Brokerage transaction fees",
                      "Short-term capital gains taxes"
                    ],
                    "answer": 1,
                    "explain": "Diversification prevents a single earnings disaster, regulatory ruling, or sector slump from destroying your capital base, keeping drawdowns survivable."
                  },
                  {
                    "q": "Why is diversification described as improving risk-adjusted return?",
                    "choices": [
                      "It eliminates commissions",
                      "When imperfectly correlated assets are combined, portfolio volatility drops below the average volatility of the parts while expected return stays equal to the weighted average",
                      "It guarantees positive returns every quarter",
                      "Diversified stocks always have higher dividend yields"
                    ],
                    "answer": 1,
                    "explain": "Offsetting fluctuations cancel out part of the variance without diluting the combined expected return \u2014 delivering less risk per unit of expected reward."
                  }
                ]
              }
            ]
          },
          {
            "id": "f-insurance",
            "title": "The Economics of Insurance & Risk Transfer",
            "lessons": [
              {
                "id": "f-lemonade-insurance",
                "title": "Risk Transfer: Why Both Sides of an Insurance Contract Win",
                "objective": "Analyze insurance as an asymmetric risk transfer: paying a small, certain premium to eliminate a ruinous tail loss while the underwriter profits on average across a pooled book.",
                "body": "Consider a commercial orchard expecting $300,000 in net harvest revenue \u2014 unless a late spring freeze hits, wiping out the crop and leaving the grower with $80,000 in unrecoverable input costs. One freeze hurts; two consecutive freezes trigger foreclosure. An agricultural insurer offers a frost policy: **pay a $15,000 fixed premium before the season starts, and if temperatures drop below the threshold, the policy pays out $120,000.**\n\nEvery risk-transfer contract has this exact anatomy. The $15,000 is the **premium** \u2014 a known, prepaid expense absorbed in every scenario. The $120,000 is the **contingent payout** \u2014 capital that arrives only when the adverse tail event occurs. By purchasing the policy, the grower deliberately trims their best-case sunny-year profit from $300,000 to $285,000 in exchange for lifting their worst-case freeze outcome from a ruinous \u2212$80,000 to a survivable +$25,000.\n\nNow run the expected-value math from the underwriter's desk. If meteorological data shows a 1-in-10 annual probability of a severe freeze, the insurer collects $15,000 per year ($150,000 per decade) and expects to pay out $120,000 once per decade \u2014 earning a **+$30,000 expected underwriting margin** by pooling thousands of uncorrelated farms across regions. For the grower, buying the policy has a *negative* standalone dollar EV (\u2212$3,000 per year), yet signing it is completely rational: **expected value is the wrong objective when the tail event causes bankruptcy.**\n\nHold on to this economic symmetry: **the hedger pays a small, certain drag to amputate a catastrophic left tail; the underwriter collects a risk premium for warehousing that tail across a diversified book.** Both parties improve their position. When you step onto an options desk in the next lesson, you will see that an equity put option is this exact underwriting contract standardized for the stock market.",
                "key_takeaways": [
                  "Insurance trades a small, certain upfront cost (the premium) for a contingent payout that caps a catastrophic loss.",
                  "Underwriters earn positive EV by pooling risks; hedgers rationally pay negative EV to eliminate ruinous tail outcomes.",
                  "Hedging reshapes the return distribution: it trims the upside slightly to place a hard floor under the downside.",
                  "Every put option in financial markets is built on this exact risk-transfer bargain between hedger and underwriter."
                ],
                "sim": "market",
                "sim_task": "On the Live Market, inspect the option chain for PowerSun Energy (PWRS, ~$95). Compare the quoted premiums of a 30-day 90-strike put and an 85-strike put: calculate what percentage of the $95 share price each 'deductible' level costs to insure for one month.",
                "quiz": [
                  {
                    "q": "In a commercial frost or property insurance contract, what is the 'premium'?",
                    "choices": [
                      "The contingent payout received after a loss occurs",
                      "The fixed, upfront cost paid by the hedger regardless of whether a loss occurs",
                      "The net profit earned in a loss-free year",
                      "The deductible absorbed by the business owner"
                    ],
                    "answer": 1,
                    "explain": "The premium is the known, certain cost paid up front to transfer tail risk to the underwriter, kept by the seller whether or not the insured event happens."
                  },
                  {
                    "q": "If an insurance underwriter prices policies to earn a positive expected profit margin, why do businesses and investors still rationally buy coverage?",
                    "choices": [
                      "They shouldn't \u2014 rational actors never accept negative dollar EV",
                      "Because paying a small, survivable fee to eliminate a bankruptcy-inducing tail loss is rational even at negative standalone EV",
                      "Because underwriters usually miscalculate the odds",
                      "Because insurance policies guarantee positive investment returns"
                    ],
                    "answer": 1,
                    "explain": "Maximizing raw EV only applies when you can survive every outcome and repeat the bet indefinitely. When a tail loss threatens solvency, paying a risk premium to cap the downside is optimal."
                  },
                  {
                    "q": "How does purchasing insurance reshape a business's or portfolio's distribution of outcomes?",
                    "choices": [
                      "Both best-case and worst-case outcomes improve",
                      "The best case is reduced by the premium paid, while the worst case is floored at a survivable level",
                      "Both best-case and worst-case outcomes worsen",
                      "The distribution stays identical"
                    ],
                    "answer": 1,
                    "explain": "In quiet periods you trail an uninsured peer by the premium paid; in a crisis the payout floors your loss. Insurance trims the right tail slightly to cut off the left tail."
                  }
                ]
              },
              {
                "id": "f-bridge-to-options",
                "title": "From Commercial Insurance to Equity Put Options",
                "objective": "Map insurance mechanics directly onto listed put options: strike as deductible floor, expiration as policy term, premium as cost, and implied volatility as storm-season pricing.",
                "body": "Suppose you hold 100 shares of PowerSun Energy (PWRS) trading at $95 \u2014 a $9,500 equity position. You want to hold the shares for long-term appreciation, but an upcoming regulatory ruling and earnings print could trigger a 30% gap down. Rather than liquidating your core holding, you turn to the options market and buy one **PWRS 90-strike put option** expiring in 60 days for a premium of $3.00 per share ($300 total, since one standard contract covers 100 shares).\n\nMap the contract terms directly to an insurance policy. The **$90 strike price** is your guaranteed floor: no matter how far PWRS falls before the 60-day **expiration**, you hold the contractual right to sell your 100 shares at $90 ($9,000). The **$5 gap** between today's $95 price and the $90 strike acts like your **deductible** \u2014 the first $500 of decline you absorb yourself. If PWRS rallies to $115, the put expires worthless; your shares are worth $11,500 and the $300 premium was simply the cost of two months' protection. If PWRS crashes to $65 on bad news, you exercise (or sell) the put, capping your maximum loss at $500 of share decline plus $300 of premium = **$800 total**, instead of a $3,000 drawdown.\n\nWho stands on the other side of your trade? An **option writer** acting as the underwriter: collecting your $300 premium up front and accepting the legal obligation to buy 100 shares at $90 if PWRS breaks below the strike. Just like coastal property insurance in hurricane season, option premiums are not fixed \u2014 when market turbulence rises or traders scramble for protection ahead of a major catalyst, put premiums expand across the board (a force you will soon measure as **implied volatility**).\n\nCarry this institutional framing through every track ahead: options are not casino chips. They are **precision instruments for transferring and reshaping risk** \u2014 whether you are buying a floor under an equity position, renting out upside you do not need, or underwriting protection for a fee.",
                "key_takeaways": [
                  "A protective put is listed equity insurance: paying a premium buys the contractual right to sell 100 shares at the strike price until expiration.",
                  "If the stock rallies and the put expires worthless, the premium was not a mistake \u2014 it was the cost of a floored worst case.",
                  "Put premiums expand when expected turbulence and hedging demand rise, just like property coverage ahead of storm season.",
                  "Approach every option trade by asking: what risk is being transferred here, and who is paying whom to warehouse it?"
                ],
                "sim": "market",
                "sim_task": "On the Live Market, buy 100 shares of Lumend Brands (LMND, ~$42) and simultaneously buy one 60-day 40-strike put option. Advance the simulator through two weeks of trading, observing how the put's value responds on down days versus up days and verifying that your combined position's worst-case loss stays strictly capped.",
                "quiz": [
                  {
                    "q": "Buying a protective put option against 100 shares of stock you own is economically equivalent to:",
                    "choices": [
                      "Buying a lottery ticket on the company's earnings",
                      "Purchasing a casualty insurance policy with a fixed term, a deductible (spot minus strike), and a prepaid premium",
                      "Taking out a margin loan from your broker",
                      "Short-selling the company's bonds"
                    ],
                    "answer": 1,
                    "explain": "A protective put transfers downside tail risk below the strike price to the option writer for a fixed term in exchange for an upfront premium."
                  },
                  {
                    "q": "You pay $300 for a 90-strike put to protect 100 shares of PWRS at $95, and the stock rallies to $110 through expiration. Was buying the put an error?",
                    "choices": [
                      "Yes \u2014 the $300 expired worthless",
                      "No \u2014 unused protection is the normal cost of capping downside risk during a window of uncertainty",
                      "Yes \u2014 you should only buy puts when you are certain a crash will occur",
                      "Only if the stock failed to pay a dividend"
                    ],
                    "answer": 1,
                    "explain": "Judge hedges ex-ante, not ex-post. Just as you do not regret an accident-free year on an insured property, the $300 bought a hard floor during a risky window."
                  },
                  {
                    "q": "Under what market conditions do put option premiums become significantly more expensive, even before the stock price falls?",
                    "choices": [
                      "When volatility is low and investor sentiment is complacent",
                      "When expected turbulence rises and institutional demand for downside protection increases",
                      "Option premiums are fixed by the exchange and never change for a given strike",
                      "Only on the final day of the calendar year"
                    ],
                    "answer": 1,
                    "explain": "Just like coastal insurance ahead of hurricane season, heightened uncertainty and hedging demand bid up option premiums \u2014 an increase in implied volatility."
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "core",
        "title": "Options Core",
        "audience": "Adult beginner",
        "description": "From first definitions to spreads and volatility, following the arc of McMillan's Options as a Strategic Investment (5th ed.) \u2014 with every strategy built and stress-tested in the labs.",
        "modules": [
          {
            "id": "c-language",
            "title": "The Language of Options",
            "lessons": [
              {
                "id": "c-calls-puts-defined",
                "title": "Calls, Puts, and the Anatomy of a Contract",
                "objective": "Define calls and puts precisely, and master the five terms \u2014 strike, expiration, premium, underlying, multiplier \u2014 that appear in every options conversation.",
                "body": `An option is a contract about a future transaction. A **call option** gives its buyer the right \u2014 not the obligation \u2014 to *buy* 100 shares of a stock at a fixed price, on or before a deadline. A **put option** gives the right to *sell* 100 shares at a fixed price. The fixed price is the **strike**; the deadline is the **expiration**; the stock itself is the **underlying**; and the price you pay for the contract is the **premium**. One US equity option controls 100 shares \u2014 the **multiplier** \u2014 so a quoted premium of $2.50 costs $250 in real money.

Concrete example: SIM stock LMND trades at $100. The "LMND 105 call, 60 days" might cost $2.00 ($200). Buying it means: any time in the next 60 days, you may buy 100 LMND shares at $105, regardless of market price. If LMND runs to $120, that right is worth at least $15 per share \u2014 $1,500 against your $200 outlay. If LMND stays below $105, the right is worthless at expiration and your loss is the $200 premium. Known, capped, prepaid.

Every option trade has two sides. The **buyer** pays premium and receives rights. The **seller** (or *writer*) collects premium and takes on **obligations**: a call writer must deliver shares at the strike if asked; a put writer must buy shares at the strike if asked. This asymmetry \u2014 buyer's risk capped at the premium, seller's risk potentially large \u2014 is the single most important structural fact in options. Most beginner disasters come from selling obligations without understanding them.

Finally, orientation vocabulary you'll use constantly: a call is **in-the-money (ITM)** when the stock is above the strike, **out-of-the-money (OTM)** when below, and **at-the-money (ATM)** near the strike. Puts mirror this. These aren't judgments of quality \u2014 an OTM option isn't 'bad' \u2014 they describe where the strike sits relative to today's price, which, as you'll see next lesson, determines what the premium is made of.`,
                "key_takeaways": [
                  "Calls = right to buy at the strike; puts = right to sell at the strike; both expire on a known date.",
                  "The multiplier is 100: a $2.00 premium is $200 of real money.",
                  "Buyers pay premium for rights (risk capped); writers collect premium for obligations (risk can be large).",
                  "ITM/ATM/OTM describe where the strike sits relative to the stock price, not whether the option is 'good'."
                ],
                "source": "OASI 5e ch. 1 (Definitions)",
                "sim": "strategy",
                "sim_task": "In the Strategy Lab, buy one LMND 105 call (60 days) with LMND at $100. Read off the premium, max loss, and breakeven from the payoff diagram, then drag the expiration-day price slider to $120 and verify the profit matches (120 \u2212 105 \u2212 premium) \xD7 100.",
                "quiz": [
                  {
                    "q": "You buy a LMND 95 put for $3.00 with the stock at $100. What is your maximum possible loss?",
                    "choices": [
                      "Unlimited",
                      "$300 \u2014 the premium paid",
                      "$9,500",
                      "$95 per share"
                    ],
                    "answer": 1,
                    "explain": "Option buyers can never lose more than the premium. The worst case is the put expiring worthless: $3.00 \xD7 100 = $300."
                  },
                  {
                    "q": "Who has obligations in an options contract?",
                    "choices": [
                      "The buyer",
                      "The seller (writer)",
                      "Both equally",
                      "Neither \u2014 options are rights only"
                    ],
                    "answer": 1,
                    "explain": "The writer collects the premium in exchange for an obligation: deliver stock at the strike (short call) or buy stock at the strike (short put) if assigned. The buyer holds only rights."
                  },
                  {
                    "q": "LMND trades at $100. Which option is in-the-money?",
                    "choices": [
                      "The 105 call",
                      "The 95 call",
                      "The 95 put",
                      "The 100 straddle"
                    ],
                    "answer": 1,
                    "explain": "A call is ITM when the stock is above its strike: 100 > 95. The 105 call and 95 put are both OTM with the stock at $100."
                  },
                  {
                    "q": "An option quoted at $1.45 costs how much to buy (one contract, standard US equity)?",
                    "choices": [
                      "$1.45",
                      "$14.50",
                      "$145",
                      "$1,450"
                    ],
                    "answer": 2,
                    "explain": "The 100-share multiplier applies to the premium: $1.45 \xD7 100 = $145. Forgetting the multiplier is a classic (and expensive) rookie error."
                  }
                ]
              },
              {
                "id": "c-pricing-intuition",
                "title": "What You're Really Paying For: Intrinsic and Time Value",
                "objective": "Decompose any option premium into intrinsic value and time value, and build intuition for the forces (moneyness, time, volatility) that set the price.",
                "body": `Every option premium splits cleanly into two parts. **Intrinsic value** is what the option would be worth if exercised right now: for a call, max(stock \u2212 strike, 0); for a put, max(strike \u2212 stock, 0). With LMND at $103, the 100 call has $3 of intrinsic value. Everything else in the premium is **time value** (also called extrinsic value): if that call trades at $5.40, then $2.40 of it is time value \u2014 the price of *possibility*, what the market charges for everything that might still happen before expiration.

Three forces set time value, and you can reason about each without any formula. **Time**: more days means more chances for the stock to make the option pay, so longer-dated options cost more \u2014 but note, 60 days doesn't cost twice as much as 30, because uncertainty grows roughly with the *square root* of time. **Moneyness**: time value is biggest at-the-money, where the option's fate is most genuinely undecided; deep ITM and far OTM options have little time value because their endings feel nearly written. **Volatility**: a jumpier stock has more chances of a big move, so *every* option on it \u2014 calls and puts alike \u2014 costs more. Volatility is to options what storm frequency is to insurance premiums.

Time value is not a bonus; it's a **melting asset**. Every day that passes with nothing happening, a little of it evaporates \u2014 faster and faster as expiration approaches for at-the-money options. This decay (you'll later meet it formally as *theta*) is the rent option buyers pay and option sellers collect. Understanding who is paying rent to whom, and for what, is half of options literacy.

One practical habit to start now: when you look at any option price, mentally split it. "LMND at $103, the 100 call at $5.40 \u2014 that's $3 intrinsic, $2.40 of melting time value." Ask whether the possibility you're buying is worth the rent. That one reflex \u2014 decompose, then judge \u2014 will keep you out of more bad trades than any strategy you'll ever learn.`,
                "key_takeaways": [
                  "Premium = intrinsic value + time value; intrinsic is what exercising now would yield.",
                  "Time value peaks at-the-money and grows with time and volatility \u2014 it's the price of possibility.",
                  "Time value melts every day (decay), accelerating near expiration for ATM options.",
                  "Habit: decompose every premium into its two parts before judging whether it's worth paying."
                ],
                "source": "OASI 5e ch. 1 (Definitions) and pricing-factor discussions in Part I",
                "sim": "greeks",
                "sim_task": "In the Greeks Lab, load a LMND 100 call with the stock at $103. Read the intrinsic/time-value split, then (1) slide days-to-expiry from 60 to 7 and watch time value melt, and (2) slide volatility from 20% to 40% and watch it swell. Confirm intrinsic value never changes during either move.",
                "quiz": [
                  {
                    "q": "LMND trades at $98. The 95 call costs $5.10. What's the split?",
                    "choices": [
                      "$5.10 intrinsic, $0 time",
                      "$3 intrinsic, $2.10 time",
                      "$0 intrinsic, $5.10 time",
                      "$2.10 intrinsic, $3 time"
                    ],
                    "answer": 1,
                    "explain": "Intrinsic = max(98 \u2212 95, 0) = $3. The remaining $2.10 of the premium is time value."
                  },
                  {
                    "q": "Which option carries the MOST time value, all else equal?",
                    "choices": [
                      "Deep in-the-money call",
                      "At-the-money call",
                      "Far out-of-the-money call",
                      "They're all equal"
                    ],
                    "answer": 1,
                    "explain": "Time value peaks ATM, where the outcome is most uncertain. Deep ITM options behave almost like stock; far OTM options are mostly dead weight \u2014 both have little possibility left to price."
                  },
                  {
                    "q": "Volatility on LMND doubles overnight with the stock price unchanged. What happens to option premiums?",
                    "choices": [
                      "Calls rise, puts fall",
                      "Puts rise, calls fall",
                      "Both calls and puts rise",
                      "Nothing until the stock moves"
                    ],
                    "answer": 2,
                    "explain": "Higher expected movement increases the chance of big payoffs in BOTH directions, so all options gain time value \u2014 just as insurance costs more in storm season."
                  },
                  {
                    "q": "Why doesn't a 60-day option cost twice as much as a 30-day option?",
                    "choices": [
                      "Market makers give volume discounts",
                      "Uncertainty grows roughly with the square root of time, not linearly",
                      "Longer options are less popular",
                      "It does cost exactly twice as much"
                    ],
                    "answer": 1,
                    "explain": "Expected price dispersion scales with \u221Atime, so doubling the days multiplies the uncertainty by about 1.41, not 2 \u2014 and premiums follow suit."
                  }
                ]
              }
            ]
          },
          {
            "id": "c-first-strategies",
            "title": "First Strategies: Options with (and without) Stock",
            "lessons": [
              {
                "id": "c-buying-calls",
                "title": "Buying Calls: Leverage with a Known Worst Case",
                "objective": "Learn when buying a call makes sense, how to compute its breakeven, and why time decay makes 'being right' about direction insufficient.",
                "body": `Buying a call is the simplest bullish option trade: you pay a premium for upside exposure with a hard floor under your losses. LMND at $100; the 60-day 105 call costs $2.00. Your **maximum loss is $200**, period. Your **breakeven at expiration is strike + premium = $107**. Above that, you keep dollar-for-dollar upside: at $115 the call is worth $10, a $800 profit on $200 risked \u2014 a 4-to-1 payoff from a 15% stock move. That amplification is **leverage**, and it's the honest appeal of call buying.

Now the honest cost. For the trade to profit, LMND must rise **past $107 within 60 days**. The stock can go up 5% \u2014 you were *right* about direction \u2014 and your call can still expire worthless. Call buyers aren't just betting on direction; they're betting on direction, *magnitude*, and *deadline* simultaneously. The premium you paid is mostly time value, and time value melts whether or not your thesis is on schedule.

Strike selection shapes the bet. The 100 (ATM) call might cost $4.50: more expensive, but breakeven is only $104.50 and it gains value quickly on any rally. The 115 call might cost $0.45: cheap lottery-ticket feel, but LMND needs a 15%+ move just to break even, and most such options expire worthless. McMillan's enduring advice runs against the beginner instinct: cheap far-OTM calls are usually the *worst* buys because their probability of paying is tiny; slightly ITM or ATM calls put more of your premium into intrinsic value that doesn't melt.

Two discipline rules before your first real call purchase. First, size by max loss: only buy premium you're fully prepared to lose, because total loss is a routine outcome, not a tail event. Second, have an exit plan for *time*, not just price \u2014 a call bought at 60 days behaves very differently at 10 days, and "hold and hope" into the final week is how time decay eats accounts.`,
                "key_takeaways": [
                  "Call buyer's breakeven = strike + premium; max loss = premium; upside open-ended.",
                  "You must be right on direction, size, AND timing \u2014 right-but-slow still loses.",
                  "Cheap far-OTM calls are usually poor buys; ATM/slightly-ITM calls waste less premium on melting time value.",
                  "Size positions assuming total loss of premium is a normal outcome."
                ],
                "source": "OASI 5e ch. 3 (Call Buying)",
                "sim": "strategy",
                "sim_task": "In the Strategy Lab with LMND at $100, build three bullish trades: the 100 call, the 105 call, and the 115 call (60 days each). Record each breakeven, then use the time-scrub slider to see which trades are profitable if LMND reaches $110 in 20 days versus in 59 days.",
                "quiz": [
                  {
                    "q": "You buy the LMND 105 call for $2.00 with the stock at $100. At expiration LMND is $106. What's your P&L?",
                    "choices": [
                      "+$100",
                      "\u2212$100",
                      "+$600",
                      "$0"
                    ],
                    "answer": 1,
                    "explain": "The call is worth 106 \u2212 105 = $1.00 at expiry, but you paid $2.00. You lose $1.00 \xD7 100 = $100 \u2014 despite the stock rising 6%. Breakeven was $107."
                  },
                  {
                    "q": "Why are very cheap, far out-of-the-money calls usually poor purchases?",
                    "choices": [
                      "Their commissions are higher",
                      "Low cost means low risk, so they're actually good",
                      "Their probability of finishing in-the-money is tiny, so most expire worthless",
                      "They can't be sold before expiration"
                    ],
                    "answer": 2,
                    "explain": "The low price reflects a low probability of payoff. Habitually buying them is like buying lottery tickets \u2014 occasional wins, negative expectancy."
                  },
                  {
                    "q": "Which third dimension, beyond direction and size of move, must a call buyer get right?",
                    "choices": [
                      "The dividend date",
                      "Timing \u2014 the move must happen before expiration",
                      "The Federal Reserve meeting",
                      "The bid-ask spread"
                    ],
                    "answer": 1,
                    "explain": "Options expire. A correct directional thesis that plays out a month after expiration pays nothing; the premium melts while you wait."
                  }
                ]
              },
              {
                "id": "c-puts-protective",
                "title": "Buying Puts & Protective Puts: Profit from Falls, Insure What You Own",
                "objective": "Use puts two ways: as a defined-risk bearish position, and as portfolio insurance attached to stock you own.",
                "body": "A **long put** is the mirror of a long call: defined-risk exposure to a *falling* stock. LMND at $100; the 60-day 95 put costs $2.50. Breakeven at expiration is **strike \u2212 premium = $92.50**; below that you profit roughly dollar-for-dollar, down to a maximum if the stock somehow hit zero. Compare this to short-selling stock: the short seller has unlimited risk if LMND rallies, margin requirements, and borrow costs. The put buyer risks exactly $250, known in advance. That's the structural trade: you pay melting time value in exchange for a capped, prepaid worst case.\n\nThe second use is the one McMillan treats as fundamental for investors: the **protective put**. You own 100 LMND shares at $100 and buy the 95 put for $2.50. Now assemble the worst case: if LMND crashes to $70, you can still sell at $95. Total damage = $5 of stock decline + $2.50 premium = $750, versus $3,000 unprotected. Your upside remains open \u2014 at $120 you've made $2,000 on the stock minus the $250 insurance cost. You've reshaped the outcome: trimmed the top to put a hard floor under the bottom. This is the commercial frost-insurance policy from Foundations, contract for contract.\n\nWhen does protection earn its keep? Around identifiable dangers: concentrated positions you can't or won't sell (tax reasons, founder stock), earnings announcements, or simply sleep-at-night value when a position has grown large. The cost is real \u2014 spend 2.5% per quarter on puts forever and you'll surrender roughly 10% a year, which no portfolio survives. Professionals therefore insure *selectively*: specific risks, specific windows, or cheaper partial protection (lower strikes, or spreads you'll meet soon).\n\nNotice what this lesson did to the reputation of options. Used this way, a put doesn't add risk to your life \u2014 it *removes* it, for a fee. The combined position (stock + put) has strictly less risk than the stock alone. Anyone who tells you options are inherently dangerous hasn't understood this trade.",
                "key_takeaways": [
                  "Long put breakeven = strike \u2212 premium; max loss = premium; a defined-risk alternative to shorting.",
                  "Protective put = stock + put: upside kept (minus premium), downside floored at the strike.",
                  "Continuous insurance is ruinously expensive \u2014 insure specific risks and windows, not all of life.",
                  "Stock + put is LESS risky than stock alone; options can remove risk, not just add it."
                ],
                "source": "OASI 5e Put Buying and Protective Put chapters (Part III)",
                "sim": "strategy",
                "sim_task": "In the Strategy Lab, build (a) 100 LMND shares alone and (b) 100 shares + one 95 put at $2.50. Overlay the payoff diagrams and find the exact crash price below which the protected version outperforms. Then check what the protection costs you if LMND instead rallies to $115.",
                "quiz": [
                  {
                    "q": "You own LMND at $100 with a protective 95 put bought for $2.50. LMND crashes to $70. What's your total loss?",
                    "choices": [
                      "$3,000",
                      "$750",
                      "$250",
                      "$500"
                    ],
                    "answer": 1,
                    "explain": "The put lets you sell at $95: stock loss (100\u219295) = $500, plus premium $250 = $750 total \u2014 versus $3,000 unprotected."
                  },
                  {
                    "q": "Compared to short-selling stock, buying a put offers:",
                    "choices": [
                      "Higher probability of profit",
                      "Unlimited upside",
                      "A known, capped maximum loss",
                      "No time pressure"
                    ],
                    "answer": 2,
                    "explain": "The put buyer's worst case is the premium. Short stock has theoretically unlimited loss on a rally. The put's cost is time decay and the expiration deadline."
                  },
                  {
                    "q": "Why don't professionals keep protective puts on everything at all times?",
                    "choices": [
                      "Puts are illegal in retirement accounts",
                      "Continuous premiums compound into a huge drag \u2014 insurance is bought selectively",
                      "Protective puts cap the upside at the strike",
                      "Brokers limit put purchases"
                    ],
                    "answer": 1,
                    "explain": "Rolling 2-3% quarterly premiums can consume ~10% a year. Like real-world insurance, protection is most sensible for specific, identified risks and periods."
                  }
                ]
              },
              {
                "id": "c-covered-calls",
                "title": "Covered Calls: Renting Out Your Upside",
                "objective": "Construct a covered call, locate its breakeven and maximum profit, and understand the real trade-off: income now for capped upside later.",
                "body": `A **covered call** is the first strategy McMillan teaches after definitions, and for good reason: it's the gentlest introduction to being an option *seller*. You own 100 LMND shares at $100 and sell the 60-day 105 call for $2.00. You collect $200 today, yours to keep no matter what. In exchange, you've promised to sell your shares at $105 if called upon. The word "covered" means your obligation is backed by stock you already own \u2014 unlike a *naked* call, there's no open-ended risk on the upside, just a cap.

Walk the outcomes. LMND finishes at $100: the call expires worthless, you keep $200 \u2014 about 2% in two months just for renting out upside you might not have used. LMND finishes at $103: you keep the $200 plus $300 of stock gains. LMND rockets to $125: your shares are called away at $105; you make $500 on the stock plus $200 premium \u2014 a fine profit, but you *gave up* $2,000 of further gains. LMND drops to $90: you lose $1,000 on the stock, softened by $200 of premium. Notice the shape: the covered call **wins in flat, mild-up, and mild-down markets**, underperforms in big rallies, and only cushions \u2014 never prevents \u2014 big losses.

The seller's arithmetic: **breakeven = stock cost \u2212 premium = $98**. **Maximum profit = (strike \u2212 stock cost) + premium = $700**, reached at or above $105. Your true risk in this position is the stock itself; the call simply trades a slice of possible upside for certain cash today. That reframe matters because the classic covered-call mistake is emotional, not mathematical: writers feel "robbed" when the stock blows through the strike, forgetting they were *paid in advance* for exactly that scenario.

Two craft points. First, strike choice is a dial: selling the 110 call brings less premium but more room to run; selling the 100 call maximizes income but caps gains immediately. Second, never write calls on stock you'd refuse to sell at the strike \u2014 assignment is not a malfunction; it's the contract working as designed. If $105 would genuinely pain you, you had no business promising your shares at $105.`,
                "key_takeaways": [
                  "Covered call = long 100 shares + short 1 call; premium is kept in every scenario.",
                  "Breakeven = stock cost \u2212 premium; max profit = (strike \u2212 cost) + premium, capped at the strike.",
                  "It outperforms in flat/mild markets and underperforms in big rallies; downside is cushioned, not protected.",
                  "Only sell calls at strikes where you'd be genuinely content to part with the shares."
                ],
                "source": "OASI 5e ch. 2 (Covered Call Writing)",
                "sim": "strategy",
                "sim_task": "Build a covered call on SIM stock LMND in the Strategy Lab (buy 100 shares at $100, sell the 60-day 105 call) and find its breakeven and max profit on the payoff diagram. Then re-run with the 110 and 100 strikes and compare premium collected versus upside kept.",
                "quiz": [
                  {
                    "q": "LMND bought at $100; you sold the 105 call for $2.00. LMND expires at $130. Your total profit is:",
                    "choices": [
                      "$3,200",
                      "$700",
                      "$500",
                      "$3,000"
                    ],
                    "answer": 1,
                    "explain": "Shares are called at $105: stock gain $500 + premium $200 = $700. The cap is the price of the income \u2014 you knew the ceiling when you sold."
                  },
                  {
                    "q": "What is the breakeven of that covered call position?",
                    "choices": [
                      "$105",
                      "$102",
                      "$98",
                      "$100"
                    ],
                    "answer": 2,
                    "explain": "The $2 premium lowers your effective cost: $100 \u2212 $2 = $98. Below $98 at expiration, the position is a net loser."
                  },
                  {
                    "q": "In which market does a covered call UNDERPERFORM simply holding the stock?",
                    "choices": [
                      "A big rally through the strike",
                      "A flat market",
                      "A mild decline",
                      "A crash"
                    ],
                    "answer": 0,
                    "explain": "In flat, mildly-up, or down markets the premium makes the covered call the better holding. Only when the stock rallies well past strike + premium does the uncapped stockholder win."
                  },
                  {
                    "q": "Why is a covered call vastly safer than a naked (uncovered) short call?",
                    "choices": [
                      "It isn't \u2014 they're identical",
                      "The owned shares satisfy the delivery obligation, so there's no open-ended upside loss",
                      "Covered calls can't be assigned",
                      "Naked calls have no premium income"
                    ],
                    "answer": 1,
                    "explain": "A naked call writer must buy stock at any price to deliver \u2014 unlimited risk. The covered writer already holds the shares; the 'loss' in a rally is only forgone profit."
                  }
                ]
              }
            ]
          },
          {
            "id": "c-spreads",
            "title": "Spreads and Combinations",
            "lessons": [
              {
                "id": "c-vertical-spreads",
                "title": "Vertical Spreads: Buying Direction, Selling the Excess",
                "objective": "Build bull and bear vertical spreads, compute max profit/loss/breakeven, and understand why capping your upside can be a rational trade.",
                "body": `A **vertical spread** pairs a long option with a short option of the same type and expiration at a different strike. The flagship is the **bull call spread**: with LMND at $100, buy the 100 call for $4.50 and sell the 110 call for $1.50 \u2014 net cost (the **debit**) $3.00. The short call finances the long one, cutting your cost by a third. The price: your profit now caps at $110. **Max loss = $300** (the debit). **Max profit = spread width \u2212 debit = $10 \u2212 $3 = $700**. **Breakeven = lower strike + debit = $103**.

Why voluntarily cap upside? Because you're selling the part of the distribution you least believe in. If your honest thesis is "LMND grinds to $108-ish over two months," the gains above $110 you surrendered were low-probability anyway \u2014 and the $1.50 you collected for them lowers your breakeven from $104.50 to $103 and cuts your worst case by a third. Spreads let you pay only for the scenario you actually forecast. McMillan frames bull spreads exactly this way: a tool for *moderately* bullish opinions, where outright calls overpay for upside you don't expect.

The bearish mirror works identically. A **bear put spread** \u2014 buy the 100 put, sell the 90 put \u2014 profits on a decline down to $90, with the same arithmetic (max profit = width \u2212 debit, breakeven = upper strike \u2212 debit). You can also build either direction for a **credit** using the opposite option type (e.g., selling a 100/110 call spread is bearish-to-neutral and collects premium up front); the risk/reward math is the mirror image, and at identical strikes the debit and credit versions are economically near-twins.

One behavioral note that saves real money: spreads reach their maximum value *slowly*. With LMND at $115 and a week left, your 100/110 spread might trade at $9.60, not $10 \u2014 the short leg still carries time value. Beginners panic that the position is 'broken.' It isn't; the last few cents arrive at expiration. Decide in advance whether you'll take 90-95% of max profit early (usually wise) rather than discovering this quirk live.`,
                "key_takeaways": [
                  "Bull call spread: max loss = debit, max profit = width \u2212 debit, breakeven = lower strike + debit.",
                  "Spreads sell the low-probability tail of your own forecast to cheapen the part you believe in.",
                  "Bear put spreads mirror the math; credit and debit constructions at the same strikes are near-equivalent.",
                  "Spreads converge to max value slowly \u2014 plan to harvest most of the profit before expiry."
                ],
                "source": "OASI 5e ch. 7 (Bull Spreads) and ch. 8 (Bear Spreads)",
                "sim": "strategy",
                "sim_task": "In the Strategy Lab with LMND at $100, build the 100/110 bull call spread for a ~$3 debit. Verify max loss, max profit, and the $103 breakeven on the diagram. Then scrub time: with LMND at $112, compare the spread's value at 30 days remaining versus expiration day.",
                "quiz": [
                  {
                    "q": "You buy the 100/110 bull call spread for $3.00. LMND expires at $108. Your P&L?",
                    "choices": [
                      "+$500",
                      "+$800",
                      "\u2212$300",
                      "+$700"
                    ],
                    "answer": 0,
                    "explain": "At $108 the long 100 call is worth $8, the short 110 call expires worthless: $8 \u2212 $3 debit = $5 \u2192 +$500."
                  },
                  {
                    "q": "Why might a moderately bullish trader prefer the spread over just buying the 100 call for $4.50?",
                    "choices": [
                      "Spreads always make more money",
                      "The sold call lowers cost and breakeven, giving up only upside the trader doesn't expect",
                      "Spreads have no time decay",
                      "Brokers require spreads"
                    ],
                    "answer": 1,
                    "explain": "The $1.50 collected cuts the debit to $3.00 and breakeven to $103. The cost is forgoing gains above $110 \u2014 which the moderate forecast didn't anticipate anyway."
                  },
                  {
                    "q": "LMND is at $115 with one week left; your 100/110 spread trades at $9.55, not $10. Why?",
                    "choices": [
                      "The market is mispricing it \u2014 arbitrage!",
                      "The short 110 call still holds some time value, which only fully decays at expiration",
                      "Your broker is skimming",
                      "Spreads can never reach max value"
                    ],
                    "answer": 1,
                    "explain": "Deep ITM spreads approach max value asymptotically. The residual time value in the short leg melts away only at the very end \u2014 normal, not broken."
                  }
                ]
              },
              {
                "id": "c-straddles-strangles",
                "title": "Straddles & Strangles: Betting on Movement Itself",
                "objective": "Construct long straddles and strangles, compute their breakevens, and understand them as the first trades about volatility rather than direction.",
                "body": `Everything so far required a directional opinion. A **long straddle** doesn't: buy the ATM call *and* the ATM put, same strike, same expiry. LMND at $100; the 60-day 100 call costs $4.50 and the 100 put $4.00 \u2014 total $8.50. You now profit if LMND finishes **below $91.50 or above $108.50** (strike \xB1 total premium). Direction is irrelevant; *distance* is everything. You're long movement.

The **long strangle** is the budget version: buy an OTM call and an OTM put \u2014 say the 110 call ($1.50) and the 90 put ($1.30) for $2.80 total. Breakevens widen to $87.20 and $112.80, so you need a bigger move, but the worst case shrinks to $280 and the position stays sensitive across a wider price range. Straddle versus strangle is a dial between cost and required move size.

Here's the trap that turns this lesson into a volatility lesson: these trades look like free money before known events ("earnings next week \u2014 it HAS to move!"). But option prices already contain the market's movement forecast. If the straddle costs $8.50, the market is pricing roughly an 8.5% move. If earnings land and LMND moves $6 \u2014 a big move! \u2014 the straddle still loses, and worse, the moment uncertainty resolves, time value collapses across the board (the post-earnings **volatility crush**). You don't profit from movement; you profit from **more movement than the premium implied**. Read a straddle's price as a forecast: your edge exists only when your forecast genuinely differs.

Selling straddles and strangles reverses everything: you collect the premium and win if the stock stays inside the breakevens \u2014 a high-win-rate strategy with rare but potentially severe losses when a genuine surprise lands. The short straddle has a respectable professional pedigree *with* disciplined hedging (that's much of the Greeks track), but naked short straddles sized by their win rate rather than their worst case have ended more trading careers than any other beginner strategy. Learn the long side first; respect the short side until the Greeks track arms you properly.`,
                "key_takeaways": [
                  "Straddle breakevens = strike \xB1 total premium; strangles are cheaper but need bigger moves.",
                  "The premium IS a movement forecast \u2014 you profit only if reality beats it.",
                  "Known events are priced in; post-event volatility crush can sink even correct 'it will move' bets.",
                  "Short straddles/strangles win often and lose big \u2014 not for beginners without hedging skills."
                ],
                "source": "OASI 5e straddle and strangle (combination) buying chapters",
                "sim": "strategy",
                "sim_task": "In the Strategy Lab, build the LMND 100 straddle for ~$8.50 and mark both breakevens. Then switch to the Vol Lab's earnings scenario: watch the straddle's value through an announcement where the stock jumps $6 but implied volatility drops 15 points. Explain the loss.",
                "quiz": [
                  {
                    "q": "LMND 100 straddle costs $8.50. At expiration LMND is at $107. Your P&L?",
                    "choices": [
                      "+$700",
                      "\u2212$150",
                      "\u2212$850",
                      "+$150"
                    ],
                    "answer": 1,
                    "explain": "The call is worth $7, the put $0. Value $7.00 against $8.50 paid = \u2212$1.50 \u2192 \u2212$150. A 7% move still wasn't enough; breakeven was $108.50."
                  },
                  {
                    "q": "Why can buying a straddle right before earnings lose money even when the stock moves sharply?",
                    "choices": [
                      "Exchanges halt options during earnings",
                      "The expected move was already in the premium, and post-event volatility crush deflates what remains",
                      "Straddles only work on quiet stocks",
                      "The put and call cancel each other out"
                    ],
                    "answer": 1,
                    "explain": "Pre-event premiums are inflated to price the expected jump. Unless the actual move exceeds that forecast, the combination of insufficient movement and collapsing implied volatility produces a loss."
                  },
                  {
                    "q": "Compared to a straddle, a long strangle has:",
                    "choices": [
                      "Lower cost and wider breakevens",
                      "Higher cost and narrower breakevens",
                      "The same cost, different expiry",
                      "No defined max loss"
                    ],
                    "answer": 0,
                    "explain": "Using OTM strikes shrinks the premium (and max loss) but pushes the breakevens farther out \u2014 you pay less and need more."
                  }
                ]
              },
              {
                "id": "c-calendar-spreads",
                "title": "Calendar Spreads: Trading Time Against Time",
                "objective": "Build a calendar spread, understand how it profits from differential time decay, and recognize its unique risk \u2014 exposure to shifts between near- and far-dated option prices.",
                "body": "Every spread so far mixed strikes. A **calendar spread** mixes *expirations*: sell the near-dated option and buy the longer-dated one at the same strike. LMND at $100: sell the 30-day 100 call for $3.20, buy the 90-day 100 call for $5.60 \u2014 net debit $2.40. Your thesis isn't direction; it's that **time melts the near option faster than the far one**. Remember the decay curve from the pricing lesson: ATM decay accelerates into expiration. Your short leg is sliding down the steep part while your long leg ambles down the gentle part. The gap between those melt rates is your potential profit.\n\nThe ideal outcome: LMND sits near $100 for 30 days. The short call expires worthless (+$320), and you still own a 60-day call that's retained most of its value \u2014 perhaps $4.60. You could sell it, or sell the *next* 30-day call against it and repeat. The payoff picture at the near expiry is a tent centered on the strike: maximum profit right at $100, eroding if LMND wanders far in either direction \u2014 because a big move makes both options trade near intrinsic value, collapsing the time-value gap you bought.\n\nCalendars carry a risk no vertical spread has. A vertical's two legs share one expiration, so one volatility number dominates both. A calendar's legs live in *different* expirations, whose implied volatilities can move independently \u2014 the **term structure**. If near-dated implied volatility spikes (an unexpected event announcement lands inside your short leg's window), the option you're short inflates faster than the one you own, and the spread loses even with the stock pinned at $100. Conversely, calendars bought when near-dated vol is unusually rich can profit from that alone. You're trading the *relationship between two forecasts*, not just decay.\n\nThis lesson completes your strategy toolkit's three axes: verticals trade **direction**, straddles trade **movement size**, calendars trade **time and the term structure**. Most structures you'll ever meet \u2014 butterflies, condors, diagonals \u2014 are combinations of these three primitives. If you can decompose a position into its primitives, you can predict its behavior before the market shows you.",
                "key_takeaways": [
                  "Calendar = short near-dated + long far-dated, same strike; profits from faster near-term decay.",
                  "Max profit occurs with the stock pinned at the strike at near expiry; big moves collapse the spread.",
                  "Unique risk: near and far implied volatilities can move independently (term structure risk).",
                  "Verticals trade direction, straddles trade movement, calendars trade time \u2014 the three primitives of all structures."
                ],
                "source": "OASI 5e ch. 9 (Calendar Spreads)",
                "sim": "strategy",
                "sim_task": "Build a 100-strike call calendar on LMND (short 30-day, long 90-day) in the Strategy Lab. Scrub time forward 30 days with the stock held at $100 and record the profit. Re-run with the stock drifting to $115 \u2014 then explain why the tent collapsed.",
                "quiz": [
                  {
                    "q": "A calendar spread profits most when, at the near expiration, the stock is:",
                    "choices": [
                      "Far above the strike",
                      "Far below the strike",
                      "Right at the strike",
                      "Anywhere \u2014 calendars always profit"
                    ],
                    "answer": 2,
                    "explain": "At the strike, the short option dies worthless while the long option retains maximal time value. Large moves in either direction push both legs toward intrinsic value and crush the spread."
                  },
                  {
                    "q": "Which risk does a calendar have that a vertical spread largely avoids?",
                    "choices": [
                      "Assignment risk",
                      "Independent movement between near-dated and far-dated implied volatility",
                      "Time decay",
                      "Commissions"
                    ],
                    "answer": 1,
                    "explain": "A vertical's legs share one expiry and one vol environment. A calendar spans two expirations whose implied vols can diverge \u2014 a near-dated vol spike inflates the short leg against you."
                  },
                  {
                    "q": "Why does the near-dated short leg decay faster than the far-dated long leg?",
                    "choices": [
                      "It doesn't \u2014 decay is linear and equal",
                      "ATM time decay accelerates as expiration approaches, so the closer option is on the steeper part of the curve",
                      "Short options always decay faster than long options",
                      "Market makers decay near options manually"
                    ],
                    "answer": 1,
                    "explain": "ATM theta grows as expiry nears. The 30-day option sheds value per day much faster than the 90-day option \u2014 that differential melt is the calendar's engine."
                  }
                ]
              }
            ]
          },
          {
            "id": "c-volatility-basics",
            "title": "Volatility: The Hidden Price Inside Every Option",
            "lessons": [
              {
                "id": "c-what-is-volatility",
                "title": "Measuring the Wiggle: Historical and Implied Volatility",
                "objective": "Define historical and implied volatility, learn the square-root-of-time scaling that turns an annual percentage into daily expected moves, and read IV as the market's forecast.",
                "body": `**Volatility** measures how much a stock wiggles \u2014 formally, the standard deviation of its returns, quoted as an annualized percentage. A 20%-vol stock is expected to finish a typical year within \xB120% of its start about two-thirds of the time. There are two versions, and the distinction powers everything ahead. **Historical (realized) volatility** is measured from past prices: what the stock actually did. **Implied volatility (IV)** is extracted from option prices: what the market is *paying for* it to do next. History is a fact; implied is a forecast \u2014 and forecasts are where trades live.

Make the number tangible with the square-root-of-time rule: a one-day standard deviation is roughly the annual IV divided by 16 (\u221A252 trading days \u2248 15.9). LMND at $100 with 32% IV implies typical daily moves of about 32/16 = 2%, or $2. Suddenly IV isn't abstract: when you see IV at 32%, you should think "$2-ish days." If LMND has actually been moving 80 cents a day, its options are priced for triple the turbulence the stock is delivering \u2014 and that mismatch should make your trading antennae twitch.

Why does IV wander away from recent history? Three drivers. **Recent movement itself** \u2014 volatility clusters, so wild weeks beget expectations of wild weeks. **Scheduled uncertainty** \u2014 earnings, trials, elections inflate IV before the news and crush it after. **Supply and demand for options** \u2014 options are insurance, and when holders get nervous they bid premiums up regardless of what the stock is doing. Reading WHY implied volatility sits where it does tells you whether an option's price is fear, forecast, or flow.

Here's the practical payoff for your existing toolkit: every strategy you've learned is quietly a volatility position. Buying calls, puts, straddles \u2014 you're long volatility, paying IV's forecast and needing reality to beat it. Covered calls and credit spreads \u2014 you're short volatility, collecting the forecast and needing calm. The same strategy can be brilliant at 20% IV and terrible at 45% IV. Price matters, and IV *is* the price.`,
                "key_takeaways": [
                  "Historical vol = what happened; implied vol = what option prices forecast.",
                  "Daily expected move \u2248 annual IV \xF7 16: a 32%-IV, $100 stock implies ~$2 daily wiggles.",
                  "IV is driven by recent movement, scheduled events, and insurance-style supply and demand.",
                  "Every option strategy is implicitly long or short volatility \u2014 know which side you're on and what price you're paying."
                ],
                "source": "OASI 5e volatility chapters (Part VI, The Basics of Volatility Trading); Volcube Trading Implied Volatility",
                "sim": "vol",
                "sim_task": "In the Vol Lab, load LMND with IV at 32% and realized vol at 18%. Compute the implied daily move (\u2248$2) and compare it to the simulated tape's actual daily moves for ten sessions. Decide: are LMND options rich or cheap, and which of your Core strategies fits that view?",
                "quiz": [
                  {
                    "q": "LMND trades at $50 with annual IV of 32%. Roughly what daily move are options pricing in?",
                    "choices": [
                      "$0.50",
                      "$1.00",
                      "$2.00",
                      "$3.20"
                    ],
                    "answer": 1,
                    "explain": "Daily \u03C3 \u2248 50 \xD7 0.32 / 16 = $1.00. The divide-by-16 rule (\u221A252 \u2248 16) converts annual IV into a daily yardstick."
                  },
                  {
                    "q": "What is the key difference between historical and implied volatility?",
                    "choices": [
                      "Historical is for stocks, implied is for bonds",
                      "Historical measures the past; implied is the forecast embedded in current option prices",
                      "Implied is always higher",
                      "They're two names for the same number"
                    ],
                    "answer": 1,
                    "explain": "Historical vol is computed from past returns. Implied vol is solved backwards from option prices \u2014 it's what buyers are currently paying for expected future movement."
                  },
                  {
                    "q": "A company's big court verdict is due Friday. What do you expect of its options' IV this week and next Monday?",
                    "choices": [
                      "Flat all the way through",
                      "Elevated before the verdict, sharply lower after",
                      "Lower before, higher after",
                      "IV doesn't respond to scheduled events"
                    ],
                    "answer": 1,
                    "explain": "Scheduled uncertainty inflates IV in advance; once the news lands, uncertainty resolves and IV crushes \u2014 the pattern behind the earnings volatility crush."
                  }
                ]
              },
              {
                "id": "c-using-iv",
                "title": "Trading with IV: Cheap Options, Rich Options, and Strategy Fit",
                "objective": "Use implied volatility level and context to choose between premium-buying and premium-selling strategies, and avoid the classic IV traps.",
                "body": "You now have a strategy toolkit and a price gauge. This lesson connects them. The core discipline: **before any option trade, ask where IV sits relative to its own history for that underlying.** LMND's IV at 35% means nothing in isolation \u2014 if LMND normally trades at 45%, options are relatively cheap; if it normally trades at 22%, they're expensive. Context, not level, defines rich and cheap. (Professionals formalize this as IV rank or percentile; the labs compute it for you.)\n\nStrategy fit follows naturally. **When IV is low** relative to history, buying premium gets attractive: long calls and puts cost less, straddles need smaller moves to pay, protective puts are cheap insurance \u2014 storm coverage priced in a drought. **When IV is high**, selling premium gains edge: covered calls collect fat rent, credit spreads are paid handsomely for defined risk. This isn't a mechanical rule \u2014 IV is sometimes high for excellent reasons \u2014 but fighting it, like buying straddles at the top of the IV range, means you need an *extraordinary* move just to overcome the price you paid.\n\nNow the traps. **Trap one: 'IV is high, so sell it' before a known event.** Pre-earnings IV is high because a jump is genuinely coming; selling that premium naked is picking up dollars in front of a scheduled steamroller. High IV with a visible cause is a fair price, not free money. **Trap two: comparing IV across stocks.** A sleepy utility at 25% IV is expensive; a biotech at 60% might be cheap. Compare each name to itself. **Trap three: forgetting IV when comparing your own trades over time.** The covered call that yielded 2% monthly last year in a 40%-IV environment yields 0.8% today at 20% IV \u2014 the strategy didn't break; its price changed.\n\nThis completes the Core track. You can define any basic option, split its price into parts, deploy covered calls, protective puts, verticals, straddles, and calendars \u2014 and now, crucially, judge whether the market is offering you good or bad prices for each. The Greeks & Volatility track adds the instrument panel: delta, gamma, theta, and vega, the numbers professionals use to see all of this at a glance.",
                "key_takeaways": [
                  "Judge IV against the same stock's own history (IV rank), never against other stocks or in isolation.",
                  "Low IV favors buying premium (insurance in a drought); high IV favors selling it \u2014 with judgment.",
                  "High IV before a known event is a fair price for real risk, not an automatic selling opportunity.",
                  "The same strategy's returns swing with the IV environment \u2014 track the price of what you sell and buy."
                ],
                "source": "OASI 5e volatility chapters; Volcube Trading Implied Volatility",
                "sim": "market",
                "sim_task": "In the Market Lab, scan the option chains of three SIM tickers and rank each one's IV against its 52-week range. Pick the richest name and paper-trade a defined-risk premium sale (credit spread); pick the cheapest and buy a straddle. Track both for five simulated sessions.",
                "quiz": [
                  {
                    "q": "LMND's IV is 35%. Its one-year IV range is 20%-40%. RCKT's IV is 55% with a range of 50%-110%. Whose options are relatively cheap?",
                    "choices": [
                      "LMND's",
                      "RCKT's",
                      "Both equally",
                      "Neither \u2014 higher IV always means more expensive"
                    ],
                    "answer": 1,
                    "explain": "LMND sits near the top of its own range (rich); RCKT near the bottom of its own (cheap). IV is only meaningful relative to the same underlying's history."
                  },
                  {
                    "q": "IV on a stock doubles the day before a major FDA ruling. The best characterization is:",
                    "choices": [
                      "Free money for premium sellers",
                      "A fair price for genuine, scheduled risk",
                      "A data error",
                      "A reason to buy straddles \u2014 they always win before events"
                    ],
                    "answer": 1,
                    "explain": "The market is pricing a real, imminent jump. Selling it naked courts a steamroller; buying it pays a full forecast. Neither side gets automatic edge from a correctly-priced event."
                  },
                  {
                    "q": "In a very low-IV environment relative to history, which adjustment makes most sense?",
                    "choices": [
                      "Favor premium-selling strategies like credit spreads",
                      "Favor premium-buying strategies like protective puts and straddles",
                      "Stop trading options entirely",
                      "Only trade weekly options"
                    ],
                    "answer": 1,
                    "explain": "Low relative IV means possibility is on sale: insurance, calls, and straddles are cheap. Selling premium at depressed prices collects thin rent against the same tail risks."
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "greeks-vol",
        "title": "Greeks & Volatility",
        "audience": "Intermediate",
        "description": "The professional instrument panel: delta, theta, vega, and gamma as living, interacting risk numbers \u2014 then implied versus realized volatility and the smile, the concepts that turn strategy users into risk managers.",
        "modules": [
          {
            "id": "g-first-order",
            "title": "The First-Order Greeks",
            "lessons": [
              {
                "id": "g-delta",
                "title": "Delta: Four Readings of One Number",
                "objective": "Master delta's four interpretations \u2014 slope, probability, equivalent stock position, and hedge ratio \u2014 and the sign rules that trip up even experienced traders.",
                "body": `**Delta** is the change in an option's value per $1 move in the underlying. A 50-delta call gains about $0.50 when the stock rises $1. Calls have deltas between 0 and +1; puts between \u22121 and 0. Deltas add across a position, with shorts flipping sign \u2014 and here lives the classic trap: **shorting a put adds positive delta**. Sell a \u221230-delta put and your position gets +30 deltas more bullish. Double negatives claim victims weekly; traders who hedge long calls by *buying* stock have made the infamous "Texas hedge" \u2014 doubling exposure while believing they reduced it.

Delta repays four readings. **One: the slope** \u2014 your P&L estimate for small moves. **Two: a rough probability** of finishing in-the-money: a 25-delta call is roughly a one-in-four shot, which is why traders select strikes by delta and why "the 25-delta puts" is a location on the board, comparable across stocks and expiries in a way dollar strikes never are. **Three: equivalent stock position** \u2014 contracts \xD7 delta \xD7 100. Forty calls at 0.50 delta behave like 2,000 shares. **Four: the hedge ratio** \u2014 to neutralize those 40 calls, short 2,000 shares. Four workflows, one number.

What moves delta? Three anchors: deep ITM \u2192 |delta| near 100; ATM \u2192 near 50; far OTM \u2192 near 0. Between the anchors, **time and volatility reshape the curve the same way**: less time or lower vol pushes deltas toward their extremes (the outcome is nearly decided), while more time or higher vol drags everything toward 50 (anything could still happen). This "less time acts like less vol" rhyme recurs through every Greek \u2014 learn it once here and you'll reuse it constantly.

Two cautions before the lab. The probability reading is a *this-instant, model-flavored* estimate, not a prophecy \u2014 it shifts the moment spot or vol moves. And delta is a *local* number: using the starting delta to project a $10 move badly underestimates call gains, because delta itself changes during the move. That changing-of-delta has its own Greek \u2014 gamma \u2014 and its own module.`,
                "key_takeaways": [
                  "Delta = value change per $1 of stock; calls 0 to +1, puts \u22121 to 0; shorts flip the sign.",
                  "Four readings: slope, rough ITM probability, equivalent shares (qty \xD7 delta \xD7 100), and hedge ratio.",
                  "Less time or lower vol pushes deltas toward 0/100; more of either drags them toward 50.",
                  "Delta is local \u2014 projecting big moves with the starting delta systematically misestimates P&L."
                ],
                "source": "Volcube Option Greeks for Traders Part I (Delta)",
                "sim": "greeks",
                "sim_task": "In the Greeks Lab, load the LMND delta curve. Slide IV from 40% down to 10% and watch OTM deltas collapse toward 0 while ITM deltas snap toward 100. Then build a position of long 10 calls (40\u0394) and short 20 puts (\u221225\u0394) and compute its equivalent share position before checking the lab's answer.",
                "quiz": [
                  {
                    "q": "You are long 10 calls at 0.40 delta and short 20 puts at \u22120.25 delta (multiplier 100). Your equivalent stock position is:",
                    "choices": [
                      "Long 900 shares",
                      "Short 100 shares",
                      "Long 400 shares",
                      "Long 100 shares"
                    ],
                    "answer": 0,
                    "explain": "Long calls: 10 \xD7 0.40 \xD7 100 = +400. Short puts flip the negative sign: \u221220 \xD7 (\u22120.25) \xD7 100 = +500. Total +900 share-equivalents."
                  },
                  {
                    "q": "What is a 'Texas hedge'?",
                    "choices": [
                      "Hedging with oil futures",
                      "Trading the underlying in the SAME direction as your option exposure, doubling risk instead of reducing it",
                      "A hedge placed after hours",
                      "Hedging only half a position"
                    ],
                    "answer": 1,
                    "explain": "E.g., buying stock to 'hedge' long calls. Sign confusion \u2014 especially around puts and short puts \u2014 is the usual cause."
                  },
                  {
                    "q": "Implied volatility collapses. What happens to the delta of a far OTM call?",
                    "choices": [
                      "Rises toward 50",
                      "Falls toward 0",
                      "Unchanged \u2014 vol doesn't affect delta",
                      "Becomes negative"
                    ],
                    "answer": 1,
                    "explain": "Lower vol means the big move needed to rescue the OTM option is less likely; its fate is sealed, and delta heads to 0. Lower vol (like less time) pushes deltas to their extremes."
                  },
                  {
                    "q": "Why is the 'delta \u2248 probability of finishing ITM' reading dangerous to take literally?",
                    "choices": [
                      "It's off by exactly 2x",
                      "It's a model-based, instantaneous estimate that changes as spot, vol, and time change",
                      "Probabilities don't apply to markets",
                      "It only works for puts"
                    ],
                    "answer": 1,
                    "explain": "It's a useful instantaneous approximation under model assumptions \u2014 not a forecast. A 90-delta option can still expire worthless; the number re-prices continuously."
                  }
                ]
              },
              {
                "id": "g-theta",
                "title": "Theta: The Rent on Possibility",
                "objective": "Quantify time decay, learn why desks say 'paying' or 'collecting' theta, and understand theta's uneven, accelerating profile into expiration.",
                "body": "**Theta** is the value an option sheds per day, all else frozen. A $4.00 option with 5 cents of theta should be a $3.95 option tomorrow if nothing happens. Only **extrinsic value decays** \u2014 intrinsic value is stock-vs-strike arithmetic and doesn't erode. Because sign conventions differ across platforms, professionals sidestep ambiguity with cash-flow language: net-long option books are **paying theta**; net-short books are **collecting theta**. Say it that way and you'll never be misunderstood on a desk.\n\nTheta has a unique superpower among the Greeks: it **adds cleanly across everything** \u2014 strikes, expirations, even different underlyings \u2014 because time passes at the same rate for all of them. A firm can state one overnight theta bill for its entire book. (Hold that thought for vega, which enjoys no such luxury.) Theta is largest where extrinsic value is largest: at-the-money, and higher-IV options carry more theta because they have more extrinsic value on the same clock.\n\nThe decay *profile* is where intuition most often fails. ATM theta is not linear \u2014 it **accelerates** into expiration, spiking in the final days as the last time value evaporates on a deadline. A 90-day ATM option might shed half a cent a day; the same option with 3 days left can shed 20+ cents a day. Far OTM options behave differently again: their theta can actually *shrink* late, because there's almost nothing left to decay \u2014 they fade from relevance rather than burning out. And a deep ITM option with zero extrinsic value has zero theta... until a sharp move back toward the strike revives its optionality and its decay.\n\nWhy does anyone willingly pay this rent? That's the question that organizes the entire rest of this track. Preview: theta is not money torched \u2014 it's the **price of gamma**, the right to profit from movement. Long options pay rent and own movement; short options collect rent and owe movement. Whether the rent is fair depends on how much the market actually moves \u2014 which is precisely the implied-versus-realized question the Volatility module tackles.",
                "key_takeaways": [
                  "Theta = daily decay; only extrinsic value melts. Say 'paying' or 'collecting' theta, never ambiguous long/short.",
                  "Theta alone adds cleanly across strikes, months, and underlyings \u2014 one firm-wide nightly bill.",
                  "ATM theta accelerates into expiry; far-OTM theta can fade instead; zero-extrinsic options have zero theta.",
                  "Theta is the price of gamma: rent paid for the right to profit from movement."
                ],
                "source": "Volcube Option Greeks for Traders Part I (Theta)",
                "sim": "greeks",
                "sim_task": "In the Greeks Lab, run the 'theta decay race': plot value and theta for an ATM, a 25-delta, and a 5-delta LMND option as the calendar scrubs from 60 days to expiry. Note the day each option's theta peaks, and which option's theta actually declines near the end.",
                "quiz": [
                  {
                    "q": "Which option has the HIGHEST theta, all else equal?",
                    "choices": [
                      "Deep ITM, 60 days out",
                      "ATM, 10 days out",
                      "Far OTM, 3 days out",
                      "ATM, 1 year out"
                    ],
                    "answer": 1,
                    "explain": "Theta concentrates where extrinsic value is large and the deadline near: short-dated ATM options. Deep ITM has little extrinsic; far-OTM late has almost nothing left to lose; long-dated ATM decays slowly."
                  },
                  {
                    "q": "Why does theta add cleanly across expirations when vega doesn't?",
                    "choices": [
                      "Theta is smaller",
                      "Time passes identically for every option; implied vols across months move by different amounts",
                      "Vega is always negative",
                      "It's a regulatory convention"
                    ],
                    "answer": 1,
                    "explain": "There's one clock but many implied vols. Every option loses a day together; a vol shock hits front and back months unevenly, so raw vega can't just be summed."
                  },
                  {
                    "q": "An ATM option worth $1.50 shows 5 cents of theta with 10 days left. Is '$1.00 at expiration-minus-0 if the stock never moves' a good linear estimate... of what it will be worth in 10 days?",
                    "choices": [
                      "Yes \u2014 10 \xD7 5 cents = 50 cents of decay is exact",
                      "No \u2014 ATM theta accelerates, so today's 5 cents understates the later days' decay; it will decay to zero",
                      "No \u2014 theta decelerates near expiry",
                      "Options never reach zero"
                    ],
                    "answer": 1,
                    "explain": "If the stock sits exactly ATM, all $1.50 of extrinsic value must be gone by expiry. Today's theta is the smallest daily bite of the remaining 10 \u2014 the rate grows as the deadline closes in."
                  }
                ]
              },
              {
                "id": "g-vega",
                "title": "Vega: P&L per Point of Fear",
                "objective": "Use vega to translate implied volatility changes into dollars, read price changes in vol terms, and learn why raw vega must never be summed across expirations.",
                "body": "**Vega** is the option value change per one-point move in implied volatility \u2014 'one point' meaning 25% \u2192 26%, never 25% \u2192 25.25%. An option with 0.12 vega gains $12 per contract when IV ticks up a point. Vega is never negative for a plain option: more expected movement can only help a right-without-obligation. So long options are long vega; short options are short vega. Vega peaks **at-the-money** and grows with **time** \u2014 a one-point vol change has a year to matter in a LEAP and a weekend to matter in a weekly.\n\nVega unlocks the professional habit of reading prices in vol units. Rearrange the definition: **IV change = price change \xF7 vega**. Two options sell off: option A drops 10 cents carrying 5 vega; option B drops 7.5 cents carrying 3 vega. In cents, A fell more. In vol terms, A cheapened 2 points while B cheapened 2.5 \u2014 **B is the bigger value change**. Desks compare everything this way because cents are polluted by delta and moneyness while vol points are comparable across the entire board. This is also how a market's quote width gets judged: an 8-cent-wide market on a 16-vega option is half a vol wide \u2014 tight or absurd depending on how much IV moves per day in that product.\n\nNow the most important warning in this module: **raw vega does not add across expirations.** Spot price is one shared number \u2014 every option on LMND feels the same $1 move, so deltas and gammas aggregate cleanly. But implied volatility is not one number: each expiry has its own, and front-month IV routinely moves two or three times as much as back-month IV. A book that's long 10 raw vega in March against short 10 in June is *not* flat \u2014 in a vol shock, March swings far harder. The standard fix weights by relative vol-of-vol, often approximated by a square-root-of-time ratio. Approximate, honest, and far better than the precise-looking lie of a raw sum.\n\nHedging vega has its own catch: only other options (or vol products) respond to implied vol, so every vega hedge adds new legs with their own strikes and side effects \u2014 and any hedge is a static snapshot that spot drift and time can quietly un-neutralize. A ratio hedge that's vega-flat today can become dangerously short vega if spot migrates toward the short strike. Vega management is ongoing stewardship, not a one-time fix.",
                "key_takeaways": [
                  "Vega = $ per 1 IV point (25%\u219226%); peaks ATM, grows with time; long options are always long vega.",
                  "Read markets in vol terms: IV change = price change \xF7 vega \u2014 cents lie, vol points compare.",
                  "Never sum raw vega across expirations; front-month IV moves hardest, so weight (\u2248\u221Atime ratio) first.",
                  "Vega hedges require other options, add their own risks, and drift un-neutral as spot and time move."
                ],
                "source": "Volcube Option Greeks for Traders Part I (Vega)",
                "sim": "vol",
                "sim_task": "In the Vol Lab, hold long 20 front-month ATM LMND calls against short back-month calls sized to raw-vega-neutral. Fire the 'vol shock +5 points' scenario and record the P&L of the 'flat' book. Rebuild with \u221Atime-weighted sizing and fire the same shock.",
                "quiz": [
                  {
                    "q": "A portfolio shows \u2212$8,000 cash vega. Implied vol falls 0.5 points. The P&L is approximately:",
                    "choices": [
                      "\u2212$4,000",
                      "+$4,000",
                      "+$8,000",
                      "\u2212$8,000"
                    ],
                    "answer": 1,
                    "explain": "Short vega profits when IV falls: \u2212$8,000 per point \xD7 (\u22120.5 points) = +$4,000."
                  },
                  {
                    "q": "Option A fell 10 cents (vega 5); option B fell 7.5 cents (vega 3). Which cheapened more in implied-vol terms?",
                    "choices": [
                      "A \u2014 bigger cent move",
                      "B \u2014 2.5 vol points versus A's 2.0",
                      "Equal",
                      "Can't tell without the strikes"
                    ],
                    "answer": 1,
                    "explain": "Divide by vega: A moved 10/5 = 2 vols; B moved 7.5/3 = 2.5 vols. Vol units, not cents, measure real repricing."
                  },
                  {
                    "q": "Why is 'long 10 raw vega in March, short 10 raw vega in June' NOT a flat volatility position?",
                    "choices": [
                      "Vega can't be shorted",
                      "March and June IVs move by different amounts \u2014 front-month vol is more volatile",
                      "June options have no vega",
                      "It is flat"
                    ],
                    "answer": 1,
                    "explain": "Each expiry has its own implied vol, and near-dated IV swings hardest. A parallel-looking book is net long front-month vol risk unless the legs are weighted (\u2248 by \u221Atime ratio)."
                  },
                  {
                    "q": "Which instrument can genuinely hedge vega?",
                    "choices": [
                      "The underlying stock",
                      "Futures on the stock",
                      "Other options (or volatility products)",
                      "Treasury bonds"
                    ],
                    "answer": 2,
                    "explain": "Only instruments whose value responds to implied volatility can offset vega. Stock and futures have zero vega \u2014 they hedge delta, never vol."
                  }
                ]
              }
            ]
          },
          {
            "id": "g-gamma-dynamics",
            "title": "Gamma and the Dynamics of Hedging",
            "lessons": [
              {
                "id": "g-gamma-intro",
                "title": "Gamma: Why Your Delta Won't Sit Still",
                "objective": "Define gamma as delta's rate of change, learn its sign rules and drivers (moneyness, time, IV), and use the average-delta trick for big-move estimates.",
                "body": "Delta told you your exposure; **gamma** tells you how fast that exposure changes. Gamma is the change in delta per $1 move in the underlying. An ATM call with 50 delta and 10 gamma becomes roughly a 60-delta call after a $1 rally and a 40-delta call after a $1 drop. The sign rule is absolute and worth tattooing somewhere: **owning any option \u2014 call or put \u2014 is long gamma; being short any option is short gamma.** There are no exceptions, and sloppy mental accounting here (especially with puts: a rally moves put delta toward zero, i.e., *up*) causes real losses.\n\nThree drivers shape gamma, and each has a clean intuition. **Moneyness**: gamma peaks at-the-money, where the option's fate flips most easily between worthless and valuable; far OTM strikes barely react to anything. **Time**: shorter-dated options carry more gamma \u2014 the same $1 move matters enormously with two days left and barely at all with a year left. **Implied volatility**: *lower* IV means more gamma, because in a quiet market a $1 move is a big deal; high IV acts like extra time on the clock, diluting any single move's significance. Notice the inversion: the cheapest-looking, shortest, quietest options are the most explosive per dollar.\n\nGamma rescues you from delta's big-move problem. Projecting a long call over a $4 rally using the starting 50 delta underestimates badly, because delta climbs during the move. The fix is the **average-delta trick**: estimate the ending delta (start + gamma \xD7 move), average it with the starting delta, and multiply by the move. With 10 gamma: ending delta \u2248 90, average \u2248 70, value gain \u2248 $2.80 versus the naive $2.00. One extra step, dramatically better estimates \u2014 and it works in reverse for declines.\n\nGammas add across all options on the same underlying regardless of expiry (one spot price moves them all), so your book has one meaningful net gamma number per name. What that number *means* in P&L \u2014 why long gamma mints money from movement and short gamma bleeds it \u2014 is the next lesson, and it's the heart of the entire options business.",
                "key_takeaways": [
                  "Gamma = delta change per $1 spot move; long any option = long gamma, short any option = short gamma.",
                  "Gamma peaks ATM and swells with less time and lower IV \u2014 quiet, short-dated options are the twitchiest.",
                  "Average-delta trick: use (start delta + end delta)/2 \xD7 move for big-move estimates.",
                  "Gamma sums across all expirations on one underlying \u2014 one net number per name."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "greeks",
                "sim_task": "In the Greeks Lab, plot gamma versus strike for LMND at 60, 20, and 5 days to expiry on one chart and watch the ATM peak sharpen. Then take a 50-delta, 8-gamma call: predict its delta after a $2 rally using gamma, and check against the lab's repricing.",
                "quiz": [
                  {
                    "q": "A call shows 50 delta and 8 gamma with the stock at $200. After a rally to $202, its delta is approximately:",
                    "choices": [
                      "50",
                      "58",
                      "66",
                      "42"
                    ],
                    "answer": 2,
                    "explain": "Delta gains \u2248 gamma \xD7 move = 8 \xD7 2 = 16, so \u2248 66. (Strictly, gamma itself drifts during the move, but this first-order estimate is the working tool.)"
                  },
                  {
                    "q": "You are short puts and short calls on the same stock. Your gamma is:",
                    "choices": [
                      "Long \u2014 the puts and calls offset",
                      "Short \u2014 selling any option is short gamma",
                      "Flat",
                      "Depends on the strikes"
                    ],
                    "answer": 1,
                    "explain": "No exceptions to the sign rule: every short option contributes negative gamma, calls and puts alike. Strikes affect magnitude, never the sign."
                  },
                  {
                    "q": "Which option has the MOST gamma, all else equal?",
                    "choices": [
                      "1-year ATM option at 40% IV",
                      "1-week ATM option at 15% IV",
                      "1-week far-OTM option at 15% IV",
                      "1-year far-OTM option at 40% IV"
                    ],
                    "answer": 1,
                    "explain": "Gamma concentrates ATM, in short-dated options, and at LOW implied vol \u2014 each $1 move matters most when time is short and the market is quiet."
                  },
                  {
                    "q": "A put has \u221230 delta and 5 gamma. The stock rallies $1. The new put delta is:",
                    "choices": [
                      "\u221235",
                      "\u221225",
                      "+5",
                      "\u221230"
                    ],
                    "answer": 1,
                    "explain": "Gamma adds to delta on rallies for ALL options: \u221230 + 5 = \u221225. The put's delta moved toward zero \u2014 up \u2014 which is exactly what long gamma does."
                  }
                ]
              },
              {
                "id": "g-hedging-stale",
                "title": "Delta Hedging and the Profit Hiding in Movement",
                "objective": "Understand why every delta hedge goes stale, and why a delta-hedged long-gamma position profits from moves in either direction.",
                "body": "Suppose you're long 100 LMND calls at 50 delta (multiplier 100) and want no directional risk. You short 5,000 shares. Now small moves net to zero: the calls gain what the stock hedge loses, and vice versa. You are **delta-neutral** \u2014 at this instant. Here's the catch that creates an entire profession: that hedge was computed at one spot price. The moment LMND moves, gamma changes your option delta, and your 5,000-share hedge is wrong. **Every delta hedge is born going stale.**\n\nNow watch what the staleness is worth. LMND rallies $2; with 10 gamma per contract, your calls' delta climbs from 50 toward 70. On the way up, the options were gaining at an *average* delta of about 60 while your short stock lost at a flat 50 \u2014 the position made money on the rally. Run it in reverse: LMND drops $2, call delta shrinks toward 30, the options lose at an average delta of 40 while the short stock earns at 50 \u2014 you made money on the *decline* too. A delta-hedged, long-gamma position profits from movement in **either direction**. The stock hedge is a straight line; the option is a curve bending above it both ways.\n\nThat profit is unrealized \u2014 if LMND round-trips back to $100, it evaporates. Locking it in is the **re-hedge**: after the $2 rally you're long ~2,000 unwanted deltas, so you sell 2,000 shares at the higher price. After a drop, you buy shares at the lower price. Notice what long gamma forces you to do: **sell rallies, buy dips \u2014 mechanically, unemotionally, repeatedly.** Each re-hedge crystallizes a chunk of movement profit and resets you to neutral for the next swing. The estimator for each chunk: **P&L \u2248 \xBD \xD7 gamma \xD7 (move)\xB2**.\n\nShort gamma mirrors everything painfully: after a rally your book gets *shorter* delta, forcing you to buy high; after declines, to sell low. Every re-hedge locks in a loss. So why would anyone run short gamma? Because nothing here was free: the long-gamma trader pays theta daily for this machine, and the short-gamma trader collects it for bearing the mirror image. Movement profits versus rent \u2014 that collision is the next lesson.",
                "key_takeaways": [
                  "A delta hedge is only correct at the spot where it was placed; gamma makes it stale immediately.",
                  "Delta-hedged long gamma profits from moves in BOTH directions \u2014 the curve beats the line.",
                  "Re-hedging locks in gains: long gamma sells rallies and buys dips; short gamma is forced to do the opposite.",
                  "Per-hedge profit \u2248 \xBD \xD7 gamma \xD7 (move)\xB2; unhedged gains evaporate if spot retraces."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "greeks",
                "sim_task": "In the Greeks Lab's hedge-drift sandbox, start delta-neutral with long 100 LMND calls. Drag spot up $2 and watch deltas accumulate and unrealized P&L grow; press Re-hedge to bank it. Then drag spot DOWN $2 from neutral and confirm you profit that way too. Estimate each banked chunk with \xBD\u0393(\u0394S)\xB2 first.",
                "quiz": [
                  {
                    "q": "A delta-neutral trader is long 50 gamma. Spot moves $2 and they re-hedge. The locked-in profit is approximately:",
                    "choices": [
                      "$50",
                      "$100",
                      "$200",
                      "$25"
                    ],
                    "answer": 1,
                    "explain": "\xBD \xD7 gamma \xD7 move\xB2 = \xBD \xD7 50 \xD7 4 = $100. Note the square: a $4 move would yield $400, not $200."
                  },
                  {
                    "q": "After a sharp rally, a SHORT-gamma trader must do what to re-flatten?",
                    "choices": [
                      "Sell stock \u2014 locking in a profit",
                      "Buy stock \u2014 locking in a loss",
                      "Nothing; short gamma self-corrects",
                      "Buy more options"
                    ],
                    "answer": 1,
                    "explain": "Short gamma makes the book shorter delta as spot rises, forcing purchases after the rise. Buy-high/sell-low is structural for short gamma in moving markets \u2014 the cost of collecting theta."
                  },
                  {
                    "q": "Your long-gamma book shows $800 of unrealized gamma profit after a rally. You don't re-hedge and spot returns to the start. The profit is now:",
                    "choices": [
                      "Still $800 \u2014 it accrued",
                      "Roughly zero \u2014 unhedged gamma P&L evaporates on retracement",
                      "Doubled \u2014 movement happened twice",
                      "Converted to vega"
                    ],
                    "answer": 1,
                    "explain": "Gamma profit is only banked by trading against the move. A round trip with no re-hedge returns the position (minus theta) to where it began."
                  },
                  {
                    "q": "Why does a delta-hedged long call position profit even when the stock FALLS?",
                    "choices": [
                      "Puts kick in automatically",
                      "The call's delta shrinks on the way down, so it loses less than the static short-stock hedge earns",
                      "It doesn't \u2014 long calls need rallies",
                      "The exchange rebates losses"
                    ],
                    "answer": 1,
                    "explain": "Falling delta means the option bleeds at a decreasing rate while the short stock earns at the fixed hedge ratio. The gap \u2014 curve over line \u2014 is gamma profit, in both directions."
                  }
                ]
              },
              {
                "id": "g-gamma-theta-tradeoff",
                "title": "Gamma vs. Theta: The Daily Bargain",
                "objective": "Frame every option position as movement-profits versus rent, compute the breakeven daily move, and understand the asymmetric payoffs of long versus short gamma.",
                "body": "Now collide the two forces. Long gamma earns \xBD\u0393(\u0394S)\xB2 from movement; theta charges rent nightly. The position profits on any day the movement income beats the bill. Set them equal and solve: the **breakeven move = \u221A(2 \xD7 daily theta / gamma)**. Concrete: you pay $75/night in theta holding 50 gamma. Breakeven = \u221A(2 \xD7 75 / 50) = **$1.73**. Days when LMND travels more than $1.73 (hedged once at that distance), you win; quieter days, you bleed. One number converts your entire position into a daily question: *will it move more than this?*\n\nAnd that question has a market forecast you already know how to read. If LMND trades at $100 with 25% IV, the implied daily standard deviation is \u2248 100 \xD7 0.25 / 15.8 \u2248 **$1.58**. Your $1.73 breakeven sits above the typical implied day \u2014 this position needs above-forecast movement to pay. This is the deep point the Volcube texts hammer: **gamma trading is realized volatility versus implied volatility.** Theta is set by what the market *expects* (implied); your hedging profits are set by what *happens* (realized). Long gamma bets realized beats implied; short gamma bets the reverse. Everything else is mechanics.\n\nThe quadratic P&L has a sneaky corollary for hedge sizing: hedge at half the breakeven distance and each hedge captures only a **quarter** of the P&L \u2014 you'd need four times as many hedges to pay the same bill. Tight hedging collects crumbs with high certainty; loose hedging waits for feasts that may never arrive, and the market can oscillate maddeningly inside your trigger levels, paying you nothing. There is no provably optimal rule \u2014 breakeven-based triggers, standard-deviation triggers, and partial hedges are all legitimate crafts, which is why the simulator teaches what formulas can't.\n\nFinally, respect the asymmetry of the two seats. **Long gamma: worst case known** (the theta bill \u2014 you can compute your maximum bleed to the penny), **best case open** (a crash or melt-up pays quadratically). **Short gamma: best case capped** at the theta collected, **worst case open-ended** \u2014 and its failure modes are sudden, while long gamma's failure mode (slow bleed through quiet weeks) is gradual and visible. Neither seat is morally superior; theta income compounds beautifully in calm regimes. But position sizing must respect which tail you're exposed to \u2014 slow-bleed risks forgive sizing errors; sudden-death risks don't.",
                "key_takeaways": [
                  "Breakeven daily move = \u221A(2\u03B8/\u0393); compare it to the implied daily SD (spot \xD7 IV / 15.8) to judge the bet.",
                  "Gamma trading = realized vol vs implied vol: theta is priced off the forecast, hedge profits off reality.",
                  "Halving hedge distance quarters per-hedge profit \u2014 hedging frequency is judgment, not formula.",
                  "Long gamma: capped loss, open upside, slow failure. Short gamma: capped gain, open downside, sudden failure. Size accordingly."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "vol",
                "sim_task": "In the Vol Lab's gamma-scalping simulator, take a long-gamma LMND book paying $75/night with 50 gamma. Compute the $1.73 breakeven, then run 20 sessions hedging at breakeven, at half-breakeven, and never. Compare the three equity curves against the realized-vol readout.",
                "quiz": [
                  {
                    "q": "A book pays $100/night theta and holds 50 gamma. The daily breakeven move is:",
                    "choices": [
                      "$1.00",
                      "$2.00",
                      "$4.00",
                      "$1.41"
                    ],
                    "answer": 1,
                    "explain": "\u221A(2 \xD7 100 / 50) = \u221A4 = $2.00. One hedge at a $2 move earns \xBD \xD7 50 \xD7 4 = $100, exactly covering the night's rent."
                  },
                  {
                    "q": "Same book: hedging every $1 instead of every $2 earns how much per hedge?",
                    "choices": [
                      "$50 \u2014 half as much",
                      "$25 \u2014 a quarter as much",
                      "$100 \u2014 the same",
                      "$12.50"
                    ],
                    "answer": 1,
                    "explain": "P&L is quadratic: \xBD \xD7 50 \xD7 1\xB2 = $25. Half the distance, one quarter the profit \u2014 you'd need four $1-hedges to match one $2-hedge."
                  },
                  {
                    "q": "Spot $100, IV 25%. The implied one-day standard deviation is roughly:",
                    "choices": [
                      "$2.50",
                      "$1.58",
                      "$0.63",
                      "$25"
                    ],
                    "answer": 1,
                    "explain": "Spot \xD7 IV / 15.8 = 100 \xD7 0.25 / 15.8 \u2248 $1.58 (15.8 \u2248 \u221A250 trading days). This is the yardstick for judging whether a day's move was 'big' relative to what options priced."
                  },
                  {
                    "q": "What is the maximum a short-gamma trader can make in a single day (ignoring vega)?",
                    "choices": [
                      "Unlimited if the market crashes",
                      "The theta collected overnight",
                      "\xBD\u0393(\u0394S)\xB2",
                      "Twice the theta"
                    ],
                    "answer": 1,
                    "explain": "The short-gamma seat's best day is a motionless market: keep the full rent. Gains are capped at theta; losses from forced bad re-hedges are uncapped \u2014 the defining asymmetry."
                  }
                ]
              }
            ]
          },
          {
            "id": "g-volatility",
            "title": "Volatility: Forecast, Price, and Shape",
            "lessons": [
              {
                "id": "g-implied-vs-realized",
                "title": "Implied vs. Realized: The Number Being Traded",
                "objective": "Understand how IV is backed out of prices, what moves it, and why implied and realized volatility are tethered but not equal.",
                "body": `A pricing model is a machine: feed in spot, strike, time, rates, and one expected-volatility number; out comes a value. **Implied volatility is that machine run backwards**: observe the option's market price, and solve for the single vol number that produces it. The mapping is one-to-one \u2014 higher vol always means a dearer option \u2014 so every listed option price *implies* exactly one volatility. When a trader says "the 100 calls are 24 bid," they're quoting the vol, not the cents; dollars are just the delivery format.

IV is quoted annualized purely for comparability. A 40% IV on a two-week earnings option is not a one-year forecast \u2014 it describes expected turbulence over those two weeks, scaled to an annual yardstick so it can sit next to any other option on any other stock. Rescale with \u221Atime as needed (\xF716 for a daily figure). And remember what the number is: a **forecast standard deviation**, resting on fragile distributional assumptions \u2014 a practical benchmark, not gospel.

What actually moves IV? The three drivers from the Core track, now with trading consequences. Recent realized vol anchors it (volatility clusters \u2014 yesterday's turbulence is the best naive forecast of tomorrow's). Event expectations distort it locally (earnings premium concentrates violently in the expiry that contains the event). And order flow pushes it around even with zero news \u2014 options are insurance, and a wave of institutional protection-buying lifts IV mechanically. The professional's first question when IV looks 'wrong': **is this flow, or is this information?** Flow dislocations mean-revert tradeably; informed repricing runs you over.

Why can't implied and realized drift apart forever? Arbitrage-ish pressure tethers them. If IV sat persistently miles below realized, buying options and gamma-scalping would print money; the buying itself would lift IV. In equity indices, IV does run *persistently slightly above* realized \u2014 the insurance premium sellers demand \u2014 and harvesting that small, real gap while surviving the occasional crash is one of the oldest professional franchises. The tether is loose, not rigid: gaps of several vol points open and persist for weeks. Those gaps are the raw material of every trade in the Pro track.`,
                "key_takeaways": [
                  "IV is solved backwards from the option's market price \u2014 one price, one vol; desks quote the vol.",
                  "Annualization is a comparability convention; a 2-week option's IV describes 2 weeks only.",
                  "IV moves on realized-vol clustering, event expectations, and raw insurance flow \u2014 diagnose which before trading it.",
                  "Implied and realized are tethered by hedging economics but gap tradeably; index IV persistently exceeds realized by a small premium."
                ],
                "source": "Volcube Trading Implied Volatility",
                "sim": "vol",
                "sim_task": "In the Vol Lab's two-way pricing explorer, drag the vol slider and watch the option price respond; then flip to reverse mode, drag the PRICE, and watch the solver back out IV. Finish on the IV-vs-realized chart: find a session where the gap exceeded 5 points and check which converged toward the other.",
                "quiz": [
                  {
                    "q": "An option's market price uniquely determines its implied volatility because:",
                    "choices": [
                      "Exchanges publish the IV",
                      "Option value rises strictly with the vol input, so one price maps to exactly one vol",
                      "All traders use the same model",
                      "IV is defined as 20% minus the price"
                    ],
                    "answer": 1,
                    "explain": "The price-vol mapping is monotonic (more expected movement always adds value), so it inverts cleanly: run the model backwards from the price and a single vol pops out."
                  },
                  {
                    "q": "A two-week option shows 60% IV. This means:",
                    "choices": [
                      "The stock is expected to move \xB160% over the next year",
                      "Annualized turbulence of 60% is expected over those two weeks \u2014 about 3.75% per day",
                      "The option is mispriced",
                      "Realized vol was 60% last year"
                    ],
                    "answer": 1,
                    "explain": "IV describes the option's remaining life, quoted on an annual scale. Daily \u2248 60/16 = 3.75%. It says nothing about volatility after the option dies."
                  },
                  {
                    "q": "A huge pension fund buys protective puts for a week straight with no news. IV rises. The best diagnosis is:",
                    "choices": [
                      "The market knows something \u2014 stay away",
                      "A flow-driven dislocation that may mean-revert once the buying ends",
                      "Realized volatility rose",
                      "A data glitch"
                    ],
                    "answer": 1,
                    "explain": "Supply and demand move IV independent of information. Distinguishing flow (tradable mean-reversion) from information (a steamroller) is the volatility trader's core diagnostic."
                  },
                  {
                    "q": "Why can't implied vol sit far below realized vol indefinitely?",
                    "choices": [
                      "Regulators force convergence",
                      "Buying cheap options and gamma-scalping would be reliably profitable, and that buying lifts IV",
                      "Realized vol always falls to meet it",
                      "It can and often does for years"
                    ],
                    "answer": 1,
                    "explain": "A persistent free lunch attracts hedged buyers whose demand raises option prices \u2014 and thus IV \u2014 closing the gap. The tether is economic, not mechanical."
                  }
                ]
              },
              {
                "id": "g-iv-as-price",
                "title": "Thinking in Vol: IV as the True Price of an Option",
                "objective": "Complete the shift from dollar-thinking to vol-thinking: strip out delta noise, compare value in vol points, and treat resting dollar orders as floating vol quotes.",
                "body": "A call trades at $3.15. An hour later it's $3.25. Did options get more expensive? **You cannot answer from the dollar prices.** If LMND rallied 20 cents and the call carries 50 delta, the entire dime is explained by spot drift \u2014 the option's optionality costs exactly what it did an hour ago. Its IV is unchanged; to a volatility trader, its *price* is unchanged. Dollar prices bundle two things: intrinsic/delta content (hedgeable noise) and extrinsic value (the actual product). IV isolates the product.\n\nThis is why put-call parity lets professionals halve the board: a delta-hedged ITM put and OTM call at the same strike are the same trade, so desks quote and think entirely in the OTM option at every strike \u2014 everything above spot is 'a call,' everything below is 'a put.' Intrinsic value is mechanical, hedgeable, and carries no disagreement; **all trading opinion lives in extrinsic value, and extrinsic value is denominated in vol.** When volatility traders talk shop, notice: they never say they bought an option for $1.52 \u2014 they say they bought vol at 24.\n\nThe conversion toolkit is vega, both directions. Price difference \u2192 vol difference: an option fair at $1.50 on 25% IV with vega 5 (per point), bought at $1.40, was bought at **23 vol** \u2014 two points of edge. Vol view \u2192 dollar target: expecting IV to rise 3 points on a 12-vega position means expecting +$36 per contract. Practice until the translation is reflexive; every lesson in the Pro track assumes it.\n\nOne elegant consequence to cement the mindset: a resting dollar-denominated order is a **floating vol quote**. You left a bid at $1.40 when fair value was $1.50 (bidding 23 vol against a 25 market \u2014 reasonable). Overnight, the market's IV drops to 23: your untouched $1.40 bid is now bidding *fair value* \u2014 and if IV keeps sliding, you're the highest vol bid on the screen, first in line to buy what everyone's selling. The dollar number never moved; its vol meaning did. Traders who think in dollars get picked off by traders who think in vol. From here on, you think in vol.",
                "key_takeaways": [
                  "Dollar price changes driven by spot movement (delta) carry zero information about option expensiveness.",
                  "All disagreement lives in extrinsic value; parity means only the OTM side of each strike matters.",
                  "Convert fluently: vol edge = price difference \xF7 vega; dollar target = vega \xD7 expected IV change.",
                  "Resting dollar orders are floating vol quotes \u2014 their meaning re-rates as the market's IV moves."
                ],
                "source": "Volcube Trading Implied Volatility; Option Market Making",
                "sim": "vol",
                "sim_task": "In the Vol Lab's intrinsic/extrinsic decomposer, drag LMND's spot \xB1$5 and watch the option's dollar price swing while its IV holds still. Then work the drill set: five option fills with given vegas and fair IVs \u2014 compute each fill's vol level and rank the trades by edge before revealing answers.",
                "quiz": [
                  {
                    "q": "LMND rallies $0.40; a 50-delta call rises from $2.00 to $2.20. In volatility terms, the option:",
                    "choices": [
                      "Got 20 cents richer",
                      "Is unchanged \u2014 the rise is fully explained by delta",
                      "Got cheaper",
                      "Cannot be analyzed"
                    ],
                    "answer": 1,
                    "explain": "Delta accounts for 0.50 \xD7 $0.40 = $0.20 \u2014 the whole move. Extrinsic value and IV are untouched; a vol trader's 'price' hasn't budged."
                  },
                  {
                    "q": "Fair value $1.50 at 25% IV, vega 5 cents per vol point (per share). You buy at $1.35. You bought vol at:",
                    "choices": [
                      "25",
                      "22",
                      "28",
                      "23.5"
                    ],
                    "answer": 1,
                    "explain": "Discount of $0.15 \xF7 vega 0.05 = 3 vol points below 25 \u2192 bought at 22. Three points of edge, in the only units that compare across the board."
                  },
                  {
                    "q": "Why do desks treat every strike below spot as 'the put' and above as 'the call'?",
                    "choices": [
                      "Exchange rules",
                      "Delta-hedged, the ITM and OTM option at a strike are equivalent \u2014 and only the OTM side is pure extrinsic value",
                      "Puts are illegal above spot",
                      "It halves commissions"
                    ],
                    "answer": 1,
                    "explain": "Put-call parity makes the hedged pair interchangeable; quoting the OTM side strips out mechanical intrinsic value and leaves only the tradeable quantity: vol."
                  }
                ]
              },
              {
                "id": "g-skew-smile",
                "title": "The Smile: Why Every Strike Has Its Own Vol",
                "objective": "Understand the volatility skew/smile, why equity put skew exists, and how to separate curve-level moves from curve-shape moves.",
                "body": "One expiry, many strikes \u2014 and if you back out IV strike by strike, you won't get a flat line. In equities you'll typically find downside puts trading at *higher* IV than ATM options, with upside calls lower or gently rising: the **skew**, or when both wings lift, the **smile**. LMND ATM might trade 25% while the 90-strike puts trade 31% and the 110 calls 23%. The model's one-vol assumption fails systematically, and the curve is the market's handwritten correction.\n\nWhy does equity put skew persist? Three mutually reinforcing reasons. **Structural demand**: the world is long stocks and buys downside insurance, bidding puts up \u2014 hurricane coverage in hurricane country. **Fat left tails**: crashes are faster and fatter than rallies; realistic return distributions deserve pricier downside wings than lognormal models suggest. **The vol-spot correlation**: when markets fall, vol rises \u2014 so a downside put pays off in high-vol states, making it worth more. The skew isn't a mispricing to 'correct'; it's information. Though it does wander, and its wanderings are tradeable.\n\nHere's the professional decomposition: the curve can **shift** (everything up or down a point \u2014 a level move) or **twist** (put wing steepens while ATM sits still \u2014 a shape move). These are distinct risks with distinct hedges, and a book can be immune to one while dangerously exposed to the other. A straddle is nearly pure level risk \u2014 its ATM strikes barely feel shape changes. A **risk reversal** (sell the 25-delta put, buy the 25-delta call, delta-hedged) has its headline vega largely netted out \u2014 it's close to a pure *shape* trade. Skew traders track metrics like the 25-delta put IV minus 25-delta call IV against history, and trade the dislocations.\n\nOne working rule and one warning. The rule: **skew only lives in the wings** \u2014 ATM options carry essentially none of it, so your skew exposure is whatever your wing positions say. The warning: positions *migrate*. A strangle sold comfortably in the wings becomes an ATM short straddle in vol terms after a big move \u2014 and the skew exposure you had quietly transformed into level exposure at the worst moment. The deeper Greeks behind these effects (vanna, vomma) headline in the Pro track; for now, learn to see every book twice \u2014 once against level, once against shape.",
                "key_takeaways": [
                  "Each strike trades its own IV; equity curves slope up toward downside puts (skew).",
                  "Skew exists for real reasons: insurance demand, fat crash tails, and the vol-up-when-spot-down correlation.",
                  "Decompose curve moves into level (shift) and shape (twist) \u2014 different risks, different hedges.",
                  "Skew lives in the wings; straddles trade level, risk reversals trade shape \u2014 and spot moves migrate your exposure between them."
                ],
                "source": "Volcube Option Volatility Trading: Strategies and Risk",
                "sim": "vol",
                "sim_task": "In the Vol Lab's skew workbench, load LMND's smile and apply (a) a +2-point parallel shift and (b) a put-wing steepening with ATM fixed. Record the P&L of a straddle and a 25-delta risk reversal under each scenario \u2014 then explain why each structure ignored one move and felt the other.",
                "quiz": [
                  {
                    "q": "In equity markets, which strikes typically trade at the highest implied vol?",
                    "choices": [
                      "At-the-money",
                      "Downside (put) strikes",
                      "Upside (call) strikes",
                      "All equal by arbitrage"
                    ],
                    "answer": 1,
                    "explain": "Equity skew slopes toward the puts: structural insurance demand, fat crash tails, and the spot-down/vol-up correlation all make downside wings dearer."
                  },
                  {
                    "q": "A delta-hedged 25-delta risk reversal is primarily a bet on:",
                    "choices": [
                      "The overall level of implied volatility",
                      "The SHAPE of the curve \u2014 put wing vs call wing",
                      "Interest rates",
                      "Time decay"
                    ],
                    "answer": 1,
                    "explain": "Roughly symmetric wing legs net out most headline vega, isolating the put-vs-call IV differential. That's precisely why desks use it to trade skew."
                  },
                  {
                    "q": "The whole LMND curve drops 2 points with its shape unchanged. Which position feels this most?",
                    "choices": [
                      "A delta-hedged ATM straddle",
                      "A vega-netted risk reversal",
                      "A box spread",
                      "Long stock"
                    ],
                    "answer": 0,
                    "explain": "A straddle is concentrated long vega \u2014 pure level exposure. The risk reversal's netted vega largely shrugs at parallel shifts; it's waiting for a twist."
                  },
                  {
                    "q": "You sold a wide LMND strangle. The stock then crashes to your put strike. Your skew exposure has:",
                    "choices": [
                      "Disappeared",
                      "Transformed \u2014 the short put is now effectively an ATM straddle leg carrying big level risk",
                      "Doubled as pure skew",
                      "Become rho risk"
                    ],
                    "answer": 1,
                    "explain": "Moneyness migration: what was a wing (shape exposure) is now at-the-money (gamma/vega/level exposure), while the far call fades to a teeny. Positions must be re-read after every big move."
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "pro",
        "title": "Pro Lab",
        "audience": "Advanced",
        "description": "Running money like a desk: gamma scalping campaigns, implied-volatility trades across the curve and the calendar, market-making intuition, and the risk-matrix discipline that keeps complex books alive.",
        "modules": [
          {
            "id": "p-gamma-scalping",
            "title": "Gamma Scalping as a Campaign",
            "lessons": [
              {
                "id": "p-scalping-craft",
                "title": "The Scalper's Craft: Rules, Orders, and Partial Hedges",
                "objective": "Turn gamma-hedging mechanics into an operating playbook: hedge triggers, resting orders, split fills, and partial hedging.",
                "body": "You know the physics: long gamma earns \xBD\u0393(\u0394S)\xB2, theta charges rent, breakeven = \u221A(2\u03B8/\u0393). This lesson is the engineering. A scalping **campaign** \u2014 running a hedged book for weeks against its theta bill \u2014 lives or dies on a written hedging policy, decided before the market opens, not during the adrenaline. The menu: hedge at breakeven multiples (bank rent-covering chunks), at fractions of breakeven (smoother equity curve, crumb-sized pieces), at standard-deviation triggers (keyed to the implied forecast), or discretionarily around known levels. No rule is provably optimal \u2014 realized paths decide retroactively \u2014 but *having* a rule beats improvising, because the improvising trader systematically hedges too eagerly on frightening days and too late on boring ones.\n\nThe single highest-value operational habit: **resting orders, working in advance**. A flash spike that touches $104.80 and reverses in ninety seconds pays the trader whose sell order has been resting there since breakfast and pays the reactive trader nothing. Long gamma's forced trades are mercifully pre-known \u2014 sell above, buy below \u2014 so you can write them all down in the order book ahead of time. Craft refinements: split size across several levels rather than one all-or-nothing order that misses by a tick, and shade placement around widely-watched support/resistance, where other people's stop-losses provide your fills.\n\n**Partial hedging** deserves formal status in your playbook. Spot rallies $2, you're long 1,000 unwanted deltas; selling 400 is a legitimate professional choice, not indecision. You've banked some retracement protection while keeping 600 deltas of trend exposure. Partial hedges acknowledge the honest truth that you don't know whether this move extends or reverses \u2014 they buy optionality on your own hedging decision.\n\nTwo traps that end campaigns. **Residual-delta abandonment**: after a juicy move you sell your options into a rich IV bid \u2014 nice exit \u2014 but forget the stock hedge still on the books. Without gamma, that hedge no longer self-corrects; it's now a naked directional punt that can torch the campaign's whole P&L. Unwinding means unwinding *both* legs. **Cross-contract contamination**: hedging June options with the more liquid September future quietly accumulates a calendar-basis position that must someday be unwound at a price you don't control. Both traps share an anatomy: the option trade ended, the hedge lived on, nobody was watching it.",
                "key_takeaways": [
                  "Write the hedging rule before the session; improvised hedging is systematically mistimed.",
                  "Rest orders in advance at pre-known levels \u2014 long gamma's forced trades are predictable, so pre-place them, split across prices.",
                  "Partial hedging is a legitimate middle path: bank some retracement risk, keep some trend exposure.",
                  "When exiting options, unwind the stock hedge too \u2014 residual deltas without gamma are naked punts; and hedge in the matching contract month."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "vol",
                "sim_task": "In the Vol Lab's gamma-scalping simulator, run the same 10-day LMND price path three times: hedging at full breakeven with resting orders, hedging reactively at the same levels (orders entered after each move), and 50% partial hedging. The path includes one flash spike \u2014 compare what each policy captured.",
                "quiz": [
                  {
                    "q": "Why do resting orders beat reactive hedging for a long-gamma book?",
                    "choices": [
                      "Lower commissions",
                      "Spike-and-reverse moves get captured only if the order was already working at the level",
                      "Exchanges prioritize resting orders' P&L",
                      "They don't \u2014 reaction is more flexible"
                    ],
                    "answer": 1,
                    "explain": "Long gamma's hedge trades are known in advance (sell above, buy below). A pre-placed order monetizes a 90-second spike; a reactive trader watches it round-trip unhedged."
                  },
                  {
                    "q": "After a favorable move, you sell all your long options at a rich IV but leave the short stock hedge on. Your position is now:",
                    "choices": [
                      "Flat and safe",
                      "A naked short-delta bet with no gamma to self-correct it",
                      "Long gamma from the stock",
                      "Hedged by the realized profits"
                    ],
                    "answer": 1,
                    "explain": "The gamma that made the hedge self-adjusting left with the options. The residual stock is pure directional risk \u2014 a rally now produces outright, uncorrected losses."
                  },
                  {
                    "q": "Spot rallied and you hold 1,000 long deltas; you sell 400. The main case for this partial hedge is:",
                    "choices": [
                      "It halves commissions",
                      "It banks protection against retracement while retaining exposure to a continued trend",
                      "Partial hedges are required by brokers",
                      "It maximizes theta collection"
                    ],
                    "answer": 1,
                    "explain": "You genuinely don't know if the move extends. Hedging a fraction trades off some retracement risk against some trend participation \u2014 a deliberate, legitimate middle path."
                  },
                  {
                    "q": "Hedging June-expiry option deltas with September futures 'because they're more liquid' quietly builds:",
                    "choices": [
                      "Extra gamma",
                      "A calendar/basis spread position that must eventually be unwound",
                      "Free rho exposure",
                      "Nothing \u2014 futures months are interchangeable"
                    ],
                    "answer": 1,
                    "explain": "June and September futures don't move identically. The mismatch accumulates into a real spread position with its own P&L \u2014 a silent contaminant in the book."
                  }
                ]
              },
              {
                "id": "p-quadratic-frequency",
                "title": "Path Dependency: Same Vol, Different P&L",
                "objective": "Internalize why gamma P&L depends on the path, not just the realized volatility \u2014 and why two traders on opposite sides of the same trade can both win.",
                "body": `Here is the most counterintuitive sentence in the volatility business: **two traders can take opposite sides of the same option trade, realized volatility can print exactly between their forecasts, and both can finish profitable.** If that sounds impossible, this lesson is for you \u2014 because the resolution is the concept that separates professionals from textbook-readers: the vol you *lock in* is not the vol that *prints*. It's the vol your hedging path actually captured.

Mechanism by example. Trader A sells the LMND straddle at 25% IV and hedges **once daily at the close**. Trader B buys the same straddle at 25% and hedges **intraday on big swings**. Now feed them a specific month: LMND whipsaws violently intraday but mean-reverts to nearly unchanged closes. Close-to-close realized vol prints 19% \u2014 quiet! Trader A's daily hedges barely trade; she collects her theta against small hedge losses priced off those sleepy closes. **A wins.** Trader B's intraday triggers caught the wild swings \u2014 selling tops, buying bottoms inside each day; his hedge profits, driven by intraday variance the closing prints never saw, outran the same theta bill. **B wins too.** Nobody got lucky at anyone's expense: they harvested *different volatilities from the same path*, because "realized vol" has no single value until you choose a sampling frequency \u2014 and your hedge schedule IS a sampling frequency.

The quadratic payoff deepens the path dependence. \xBD\u0393(\u0394S)\xB2 means one $4 move pays like sixteen $1 moves. A month of realized vol delivered as steady small oscillations is a completely different asset than the same headline vol delivered as twenty dead days and one earthquake \u2014 identical variance, radically different harvests depending on your trigger spacing. Tight hedgers feast on choppy paths and miss earthquakes (they re-flattened at +$1, surrendering the ride to +$4); loose hedgers starve through chop and feast on gaps. **Match your hedge spacing to the move structure you forecast, not just the vol level**: expecting grind, hedge tight; expecting gaps, hedge loose and accept the bleed while waiting.

This is why the simulator matters more than the formula sheet. Run the same path with different hedge rules and watch P&L vary by multiples; run different paths with the same realized vol and watch the same rule prosper and starve. Once you've *felt* path dependency, you'll never again say "realized was 22, implied was 25, so shorts made money" \u2014 the honest sentence is "shorts who hedged like *this* made money on *that* path." Precision about this is a professional tell.`,
                "key_takeaways": [
                  "The vol you lock in depends on your hedging path \u2014 realized vol has no single value until you pick a sampling frequency.",
                  "Both sides of one trade can profit: different hedge schedules harvest different volatilities from the same path.",
                  "Quadratic P&L makes move STRUCTURE matter: one $4 move = sixteen $1 moves; chop and gaps are different assets at equal variance.",
                  "Forecast the path character, not just the vol number \u2014 and match trigger spacing to it."
                ],
                "source": "Volcube Trading Implied Volatility; Option Gamma Trading",
                "sim": "vol",
                "sim_task": "In the Vol Lab, load the 'whipsaw month' path (wild intraday, flat closes). Run a SHORT straddle hedged daily-at-close and a LONG straddle hedged on 1.5-sigma intraday triggers \u2014 confirm both finish green, then write one sentence explaining which volatility each trader actually harvested.",
                "quiz": [
                  {
                    "q": "Two traders on opposite sides of the same straddle both profit. The mechanism is:",
                    "choices": [
                      "One miscounted",
                      "Different hedge schedules sampled different volatilities from the same price path",
                      "The exchange paid rebates",
                      "Vega gains offset for both"
                    ],
                    "answer": 1,
                    "explain": "Hedging frequency is a sampling choice. Intraday swings can deliver high vol to a frequent hedger while flat closes deliver low vol to a daily hedger \u2014 simultaneously, on one path."
                  },
                  {
                    "q": "A month realizes 20% vol as nineteen still days plus one enormous gap. Which long-gamma hedger does best?",
                    "choices": [
                      "The tightest hedger \u2014 more trades, more profit",
                      "The loose hedger whose deltas were running when the gap hit",
                      "Identical results at equal realized vol",
                      "Neither can profit at 20%"
                    ],
                    "answer": 1,
                    "explain": "\xBD\u0393(\u0394S)\xB2 concentrates the month's entire payoff in the gap. Tight hedgers kept re-flattening for crumbs; the loose hedger's accumulated deltas caught the quadratic feast."
                  },
                  {
                    "q": "Why is 'implied 25, realized 22, therefore option sellers won' imprecise?",
                    "choices": [
                      "The spread is too small to matter",
                      "Seller P&L depends on the hedging path \u2014 a violent-chop path can bankrupt a seller despite soft headline realized vol",
                      "Sellers always win",
                      "Realized vol can't be measured"
                    ],
                    "answer": 1,
                    "explain": "Headline close-to-close vol may not reflect the intraday structure the seller's hedges actually traded against. The honest claim always specifies the hedge rule and the path."
                  }
                ]
              },
              {
                "id": "p-expiry-vega-shocks",
                "title": "The Edges of the Map: Expiration, Pin Risk, and Vega Shocks",
                "objective": "Recognize where standard gamma-trading logic breaks down: exploding ATM gamma near expiry, pinning, and the vega interactions that compound or cushion spot shocks.",
                "body": "Every framework has edges where it stops working, and gamma trading's edges are violent. **Edge one: expiration week.** As expiry approaches, an ATM option's gamma grows without bound \u2014 its delta must resolve to 0 or 100, so with hours left, tiny spot wiggles flip delta violently. Your campaign was a weeks-long realized-vs-implied play; in expiry week, one wild afternoon at peak gamma can dominate the entire month's carefully accumulated P&L in either direction. The breakeven arithmetic still computes, but its variance explodes: you're no longer averaging over many days, you're flipping one giant coin. Many professionals simply exit or roll before the final week \u2014 not cowardice, but refusing a bet whose variance has outgrown its edge.\n\n**Edge two: pinning.** When a strike holds heavy open interest into expiry, the hedging of the crowd that's *long* that strike becomes a market force: they all sell above the strike and buy below it, and that collective flow can trap spot at the strike into the close \u2014 the market makers' gravity well. If you're long that strike, pinning is your nightmare (maximum gamma, zero movement to harvest, final theta bills at the steepest rate). Pin risk adds a final indignity: uncertainty about assignment itself, leaving you guessing your weekend stock position.\n\n**Edge three: vega doesn't wait its turn.** The clean gamma-vs-theta ledger assumes IV holds still during your spot move; it never does. A short-gamma book is usually short vega too, so a crash hits twice \u2014 losing re-hedges *and* mark-to-market losses as IV gets bid in the panic. Correlated, not coincidental: the same fear driving the move drives the vol. Sometimes the correlation rescues instead: short gamma through earnings can lose on the gap yet be bailed out by the post-event IV crush. Sophisticated desks pre-position for the interaction \u2014 hedging tighter in the direction where vega would compound the damage, looser where vega would cushion it.\n\nSynthesize with the **gamma-theta ratio**, the desk's quality metric. Skew means different strikes sell gamma at different rents: buying gamma via rich high-IV wings while shorting cheap ATM strikes can assemble the worst book in the business \u2014 **short gamma AND paying theta**. Before adding any leg, price it: how much gamma per theta dollar? Long-gamma books want that ratio high, short books want it low, and tracking it over time tells you whether you're sourcing your risk economically or being quietly skinned by the smile.",
                "key_takeaways": [
                  "ATM gamma explodes near expiry \u2014 one afternoon can dominate a month; exiting before expiry week is a position, not a retreat.",
                  "Heavy-open-interest strikes can pin spot via the crowd's own hedging; long that strike = max gamma, no movement, peak theta.",
                  "Spot shocks and IV moves are correlated: short gamma + short vega lose twice in crashes; earnings IV-crush can cushion.",
                  "Audit gamma-per-theta-dollar across the smile \u2014 avoid books that are simultaneously short gamma and paying theta."
                ],
                "source": "Volcube Option Gamma Trading; Option Volatility Trading: Strategies and Risk",
                "sim": "vol",
                "sim_task": "In the Vol Lab, run the expiration pressure-cooker: hold a long ATM LMND straddle through the final five days with pin-mode enabled toward the 100 strike. Then rerun as a SHORT straddle with the vega-shock overlay and decompose the crash day's loss into its gamma and vega components.",
                "quiz": [
                  {
                    "q": "Why does an ATM option's gamma become enormous in the final hours before expiration?",
                    "choices": [
                      "Theta converts into gamma",
                      "Delta must resolve to 0 or 100, so tiny spot moves flip it violently",
                      "Market makers raise it",
                      "Low liquidity inflates Greeks"
                    ],
                    "answer": 1,
                    "explain": "With almost no time left, a penny through the strike is the difference between stock-equivalent and worthless. Delta snaps between extremes \u2014 which IS huge gamma."
                  },
                  {
                    "q": "A strike with massive open interest often 'pins' spot at expiration because:",
                    "choices": [
                      "The exchange freezes trading there",
                      "Traders long the strike collectively sell above it and buy below it, and that hedging flow traps price",
                      "Short sellers collude",
                      "It's statistical coincidence"
                    ],
                    "answer": 1,
                    "explain": "Long-gamma holders of the strike hedge mechanically \u2014 sell rallies above, buy dips below. At scale, that flow is a gravity well dragging spot back to the strike."
                  },
                  {
                    "q": "A short-gamma, short-vega book faces a sharp sell-off with an IV spike. The two distinct losses are:",
                    "choices": [
                      "Theta and rho",
                      "Losing forced re-hedges (buy high/sell low) AND mark-to-market losses on short vega as IV rises",
                      "Pin risk and assignment",
                      "Commissions and slippage"
                    ],
                    "answer": 1,
                    "explain": "The crash forces loss-locking re-hedges while panic bids up IV against the short-vega position. Same fear, two correlated wounds \u2014 the classic double hit."
                  },
                  {
                    "q": "A book built by buying expensive high-IV wing options and selling cheap ATM options can end up:",
                    "choices": [
                      "Long gamma, collecting theta \u2014 ideal",
                      "Short gamma AND paying theta \u2014 the worst of both worlds",
                      "Perfectly hedged",
                      "Pure long vega"
                    ],
                    "answer": 1,
                    "explain": "ATM strikes carry the most raw gamma; wings carry less gamma per theta dollar when bought through rich skew. Sell the gamma-dense leg, buy the overpriced one, and the book pays rent for negative movement rights."
                  }
                ]
              }
            ]
          },
          {
            "id": "p-trading-iv",
            "title": "Trading Implied Volatility",
            "lessons": [
              {
                "id": "p-outright-vol",
                "title": "Outright Vol: Buying Cheap Fear, Selling Rich Fear",
                "objective": "Structure outright long/short IV trades, manage the two silent killers \u2014 theta drag and vega slippage \u2014 and choose the right vehicle for the view.",
                "body": "The purest volatility view: this IV number is simply too low (or too high) against its own history, and will revert. The instinctive vehicle is the delta-hedged **straddle** \u2014 maximum vega per dollar, no directional noise. But holding long vol through time means fighting two silent killers the forecast says nothing about, and most failed vol trades die of these rather than wrong views.\n\n**Killer one: theta drag.** You buy LMND vol at 18% expecting 24% within a month, and you're right \u2014 but it takes seven weeks to get there, and your position bled rent every one of those 49 nights. Being right late is a loss. Mitigations: gamma-scalp the position so realized movement pays some rent while you wait (cheap vol usually comes with quiet tape, so budget for partial coverage at best); or buy longer-dated options, where vega is fat relative to theta \u2014 you pay less rent per unit of vol exposure in exchange for less gamma.\n\n**Killer two: vega slippage** \u2014 subtler and crueler. Your straddle's vega is concentrated at its strike. LMND drifts from $100 to $112 over three weeks; your 100-strike straddle is now a deep ITM call plus a teeny put, and its vega has withered. *Then* the vol spike arrives \u2014 on a position that barely feels it. Right view, mistimed geography, hollow payoff. Mitigations: **strangles** spread vega across a range and hold exposure as spot wanders (their wing vomma even grows vega as vol rises \u2014 leaning the right way at the right moment); or discipline yourself to **re-strike** \u2014 roll the structure back to ATM when spot migrates, paying transaction costs to keep the position pointed at your view.\n\nVehicle choice completes the craft. Options deliver IV exposure bundled with delta, gamma, theta \u2014 a hen bought for its eggs. Vol-index products (VIX futures, ETPs) look purer but carry their own distortions: futures track *expected future* index levels, not spot vol, so a spike that the curve already priced pays nothing; ETPs bleed roll drag in contango; levered versions decay structurally; ETNs add issuer credit. Variance swaps are cleanest and mostly institutional. The professional reflex: pick the vehicle whose embedded frictions your specific view can out-earn \u2014 and before entering, ask the diagnostic question from the Greeks track: is this IV level flow or information? Cheap vol before a delisting announcement is cheap for a reason.",
                "key_takeaways": [
                  "Outright vol trades die of theta drag and vega slippage more often than wrong forecasts \u2014 plan for both at entry.",
                  "Strangles hold vega across a spot range (and their vomma leans the right way); straddles concentrate it and hollow out when spot migrates \u2014 re-strike or diversify strikes.",
                  "Longer-dated options buy more vega per theta dollar; shorter-dated buy more gamma \u2014 match tenor to the view's timing.",
                  "Every vehicle embeds frictions (option Greeks, futures curve, ETP roll drag) \u2014 pick the one your edge out-earns."
                ],
                "source": "Volcube Trading Implied Volatility",
                "sim": "vol",
                "sim_task": "In the Vol Lab, buy LMND vol at the bottom of its IV range twice: once via the ATM straddle, once via the 25-delta strangle. Run the 'slow grind +12% then vol spike' scenario and compare how much vega each structure still owned when the spike finally hit.",
                "quiz": [
                  {
                    "q": "You bought a 100-strike straddle for its vega; the stock then trended to $115. When IV finally spikes, your payoff is disappointing because:",
                    "choices": [
                      "IV spikes don't affect straddles",
                      "Vega slippage \u2014 the structure's vega withered as spot left the strike",
                      "Theta turned positive",
                      "The put expired early"
                    ],
                    "answer": 1,
                    "explain": "Vega concentrates near the strike. At $115 the position is mostly a deep ITM call with modest extrinsic value \u2014 the vol view was right, but the vehicle had drifted off target."
                  },
                  {
                    "q": "Why might a long-vol trader prefer a strangle to a straddle, citing one higher-order Greek?",
                    "choices": [
                      "Strangles have more theta",
                      "Wing options carry positive vomma: vega GROWS as vol rises \u2014 the exposure leans the right way exactly when it pays",
                      "Strangles have no gamma",
                      "Charm is higher in strangles"
                    ],
                    "answer": 1,
                    "explain": "Vomma lives in the wings. Rising vol makes the strangle longer vega (and falling vol shrinks the exposure) \u2014 the same self-favoring convexity gamma provides against spot."
                  },
                  {
                    "q": "A VIX spike occurs, but the VIX future you own barely moves. Most likely explanation:",
                    "choices": [
                      "The future is broken",
                      "The futures curve had already priced an elevated future vol level \u2014 futures track expectations of the index, not its spot",
                      "VIX futures never move",
                      "Your broker delayed the fill"
                    ],
                    "answer": 1,
                    "explain": "VIX futures settle to where the index will BE, not where it is. A spike the curve anticipated was already in your purchase price \u2014 a core vol-ETP/futures friction."
                  },
                  {
                    "q": "You're confident IV will rise from 18% to 24% but unsure if it takes one month or three. Which structure best fits?",
                    "choices": [
                      "Short-dated ATM straddle \u2014 maximum vega now",
                      "Longer-dated options \u2014 more vega per theta dollar, so being early costs less rent",
                      "Selling strangles",
                      "Deep ITM calls"
                    ],
                    "answer": 1,
                    "explain": "Timing uncertainty argues for tenor: long-dated options hold fat vega with gentle theta, making a late-arriving repricing survivable. Short-dated structures bleed out waiting."
                  }
                ]
              },
              {
                "id": "p-term-structure",
                "title": "The Calendar Dimension: Term Structure and Time-Weighted Vega",
                "objective": "Trade IV differences across expirations: understand why front vol moves hardest, size calendars with time-weighted vega, and respect event-driven dislocations.",
                "body": "Line up LMND's expirations and their ATM IVs \u2014 1-month at 22%, 3-month at 24%, 6-month at 25% \u2014 and you have the **term structure**, a forward curve for fear. Its mechanics are dominated by one asymmetry: **front-month IV is far more volatile than back-month IV.** A shock that lifts 1-month vol 10 points might lift 6-month vol 2. The intuition is dilution: a one-week crisis is an earthquake annualized over a month and a tremor annualized over a year. Any trade spanning expirations is exposed to this asymmetry before anything else.\n\nWhich breaks raw vega as a sizing tool. Short 10 raw vega front against long 10 raw vega back looks flat and is actually a large short-front-vol position in any shock. The correction is **time-weighted vega**: scale each month's vega by its expected vol-responsiveness, approximated by a square-root-of-time ratio. With 0.1 years against 0.18 years, back-month vega gets weighted by \u221A(0.1/0.18) \u2248 0.75 before summing. A convenient near-coincidence: because vega itself grows roughly with \u221Atime, **equal-lot calendars come out approximately time-weighted-vega neutral** \u2014 the old desk habit of trading calendars one-to-one has quiet mathematics underneath it.\n\nScheduled events turn the term structure into a scalpel. Earnings premium loads violently into whichever expiry contains the date: the containing month might carry 45% IV against 28% just behind it. The event trade decomposes cleanly \u2014 the event month's IV embeds a one-day jump plus baseline vol, and you can back out the implied jump size and ask whether *that number* is rich or cheap against the company's gap history. This is also the standing warning for mean-reversion screens: a 'dislocated' calendar that's three sigmas out of line usually has an announcement sitting inside the front expiry. **Check the calendar of events before trading the calendar of vols** \u2014 what screens as dislocation is often information, correctly priced.\n\nPost-event, the structure snaps back \u2014 front IV crushes toward baseline while back months barely blink. Trading that crush profitably is harder than it looks: the crush is priced too (the market expects the event month to deflate ~15 points \u2014 only *more or less than 15* is tradeable edge), and the gap itself is the short leg's chance to detonate first. Pin your edge to a specific number \u2014 implied jump versus historical gaps \u2014 or admit you don't have one.",
                "key_takeaways": [
                  "Front-month IV moves multiples of back-month IV \u2014 the first risk in any cross-expiry trade.",
                  "Size calendars with time-weighted vega (\u221Atime ratio); equal-lot calendars are approximately neutral by near-coincidence.",
                  "Event premium concentrates in the containing expiry \u2014 back out the implied jump and judge THAT number.",
                  "Screened 'dislocations' across months usually contain scheduled news; check the event calendar first."
                ],
                "source": "Volcube Trading Implied Volatility; Option Greeks for Traders Part I",
                "sim": "vol",
                "sim_task": "In the Vol Lab's term-structure board, build LMND front/back calendars two ways \u2014 raw-vega-neutral and equal-lot \u2014 then fire the 'front-month vol spike' scenario and compare damage. Next, load the earnings preset and back out the implied one-day jump from the front month's 45% IV.",
                "quiz": [
                  {
                    "q": "A market shock hits. One-month LMND IV jumps 8 points. Six-month IV most plausibly moves:",
                    "choices": [
                      "About 8 points \u2014 vol is vol",
                      "Around 1-3 points \u2014 long horizons dilute short crises",
                      "16 points \u2014 leverage",
                      "Zero always"
                    ],
                    "answer": 1,
                    "explain": "A brief crisis is a large share of a month and a small share of half a year, annualized. Front vol's higher vol-of-vol is the structural fact behind all cross-expiry sizing."
                  },
                  {
                    "q": "Front month: vega 12.6, 0.1 years left. Back month: vega 17, 0.18 years. An equal-lot calendar is roughly:",
                    "choices": [
                      "Massively long back vega",
                      "Time-weighted-vega neutral \u2014 17 \xD7 \u221A(0.1/0.18) \u2248 12.7 vs 12.6",
                      "Raw-vega neutral",
                      "Unhedgeable"
                    ],
                    "answer": 1,
                    "explain": "Weighting back vega by \u221A(time ratio): 17 \xD7 0.745 \u2248 12.7, nearly matching the front's 12.6. Equal lots approximate the properly weighted hedge \u2014 the desk habit has math under it."
                  },
                  {
                    "q": "Your screen flags LMND's front/back IV spread as 3 sigmas 'too wide.' Before trading the mean reversion, you should:",
                    "choices": [
                      "Double the size \u2014 more sigmas, more edge",
                      "Check whether a scheduled event (earnings, ruling) sits inside the front expiry",
                      "Switch to raw vega sizing",
                      "Trade it immediately before it closes"
                    ],
                    "answer": 1,
                    "explain": "Event premium legitimately inflates the containing month. A statistically 'dislocated' spread with a known catalyst inside it is correctly priced information, not an opportunity."
                  },
                  {
                    "q": "The market prices a 15-point post-earnings IV crush in the event month. Shorting that month's vol has edge only if:",
                    "choices": [
                      "The crush happens at all",
                      "You expect the crush (net of the gap move) to exceed what's already priced",
                      "Back-month vol rises",
                      "The stock gaps up rather than down"
                    ],
                    "answer": 1,
                    "explain": "The expected crush is embedded in the pre-event premium. Profit requires reality to beat the embedded forecast \u2014 deflation beyond 15 points, or a gap smaller than the implied jump."
                  }
                ]
              }
            ]
          },
          {
            "id": "p-market-making",
            "title": "Market Making and Book Risk",
            "lessons": [
              {
                "id": "p-mm-business",
                "title": "The Market Maker's Business: Edge, Width, and Skewed Quotes",
                "objective": "Understand market making as a volatility business \u2014 pricing the spread in vol terms, skewing quotes around inventory, and sizing as a strategic signal.",
                "body": "Strip the mystique: a market maker quotes a bid and an offer, buys low, sells high, and prays the inventory acquired along the way doesn't rot before it can be recycled. The dream is high turnover with small net positions; the nightmare is one-sided flow stacking inventory precisely as prices turn against it. Exchanges pay this role with the spread because continuous two-sided quotes are what make a market a market \u2014 someone must be sellable-to at 3:57pm on a Friday.\n\nThe craft decision is **width**, and the professional prices it in vol. An 8-cent-wide quote on a 16-vega option is **half a vol point wide** (width \xF7 vega). If that product's IV routinely moves 3 vols a day, half a vol of edge is a razor \u2014 you're being paid a drizzle to stand under a waterfall. Too wide, and tighter competitors take every trade; the spread must clear the realistic cost of carrying what you'll be hit with, at the tightest width that still wins flow. And when your model's value disagrees with a liquid market's, the professional default is humility: adjust your vol input toward the market. A desk that insists the market is wrong gets to keep buying from it until bankruptcy confirms the market's opinion.\n\n**Fit-to-book** is where quoting becomes position-aware. The question is never 'what is this option worth?' in isolation \u2014 it's 'does buying or selling this help or hurt my aggregate book?' Long a warehouse of front-month vega? Your offer sits close to fair (eager to sell), your bid sits low (reluctant to add) \u2014 and critically, you **shift both sides**, preserving width while relocating it. Moving only one side just narrows your spread and donates edge. The iron constraint: never skew so far that you'd bid above or offer below your own value \u2014 self-arbitrage, gift-wrapped for whoever's watching. Reading the client tilts the skew further (days of persistent buying in a strike suggests the next RFQ is a buyer too), but a tilt is all it earns: skew past your value on a guess and either the client runs you over from the other side or a rival picks off your mispriced quote.\n\n**Size is the second keyboard.** Showing bigger size on your preferred side signals genuine willingness and often earns a larger pro-rata allocation when brokers split fills among dealers at the same price. In illiquid names, shrink size and widen up regardless of how clean your current book is \u2014 the edge isn't banked at the fill; it's banked at the *exit*, and an option you can't exit is inventory risk wearing a profit costume. Every quote is really four decisions \u2014 two prices, two sizes \u2014 all answering one question: what does my book want?",
                "key_takeaways": [
                  "Judge quote width in vol terms (width \xF7 vega) against the product's daily IV movement \u2014 that's the real compensation per fill.",
                  "When a liquid market disagrees with your model, move your vol input toward the market.",
                  "Skew BOTH sides of the quote around inventory; never through your own value.",
                  "Size is strategy: show it on the preferred side, shrink it where exit liquidity is poor \u2014 profit is banked at the exit, not the fill."
                ],
                "source": "Volcube Option Market Making",
                "sim": "market",
                "sim_task": "In the Market Lab's RFQ simulator, make markets in LMND options for a 30-request session against bot competitors. Start neutral, inherit a long-vega book midway, and practice skewing both sides down. Finish by checking your P&L decomposition: spread captured versus inventory losses.",
                "quiz": [
                  {
                    "q": "An option has 16 vega; your quote is 8 cents wide. In vol terms your market is:",
                    "choices": [
                      "2 vols wide",
                      "Half a vol wide",
                      "8 vols wide",
                      "Unmeasurable"
                    ],
                    "answer": 1,
                    "explain": "0.08 \xF7 0.16 per vol = 0.5 vol points. Against a product whose IV moves 3 vols daily, that's very thin compensation for the inventory risk per fill."
                  },
                  {
                    "q": "You're net long front-month options and want to shed risk. The correct quote adjustment is:",
                    "choices": [
                      "Lower only your offer",
                      "Raise only your bid",
                      "Shift BOTH bid and offer down, keeping the width",
                      "Widen both sides symmetrically"
                    ],
                    "answer": 2,
                    "explain": "A genuine skew relocates the whole quote toward selling. Dropping only the offer narrows your spread \u2014 surrendering edge without changing your stance."
                  },
                  {
                    "q": "Your model values an option at $1.60; the deep, liquid market trades $1.48-$1.52. The professional move is:",
                    "choices": [
                      "Buy aggressively \u2014 the market is wrong",
                      "Adjust your vol input toward the market's level",
                      "Quote $1.58 at $1.62 anyway",
                      "Stop quoting the product"
                    ],
                    "answer": 1,
                    "explain": "A persistent gap against a liquid consensus means your input \u2014 almost always the vol \u2014 is off. Desks that assume the market is wrong get filled repeatedly on the wrong side."
                  },
                  {
                    "q": "Why shrink quote sizes in an illiquid option even when your current inventory is clean?",
                    "choices": [
                      "Exchange rules require it",
                      "Edge is only realized at exit \u2014 poor exit liquidity makes every fill a longer, riskier hold",
                      "Small sizes attract more flow",
                      "To hide from brokers"
                    ],
                    "answer": 1,
                    "explain": "The spread captured at the fill is theoretical until the position is recycled. Where recycling is slow and expensive, each lot of inventory carries more risk, so you take on less per quote."
                  }
                ]
              },
              {
                "id": "p-risk-matrix",
                "title": "Seeing the Whole Book: Risk Matrix and Butterfly-Stripping",
                "objective": "Manage positions from the risk matrix rather than the inventory list, and compress sprawling books into their core exposures by stripping near-zero-risk structures.",
                "body": "A real book \u2014 yours after three months of trading, a market maker's after a morning \u2014 is hundreds of line items across strikes and months. The rookie stares at the inventory list; the professional reads the **risk matrix**: Greeks and P&L tabulated across a ladder of spot prices, re-runnable at shifted dates and vols. The matrix exposes what no snapshot can \u2014 **dynamic risk**, how your exposures themselves morph across states of the world. A book can be short gamma below spot yet flip long gamma and long vega in a rally; today's Greeks line reads 'roughly flat' while the matrix reads 'catastrophic at 94, lovely at 112.' The Volcube fire-drill: fleeing a burning office, grab the matrix, not the inventory. The matrix says what can kill you; the inventory is just a list of names.\n\nReading the matrix is pattern work, and the patterns earn their own lesson in the static-versus-dynamic frame. Ratio spreads and ladders are the classic ambush: near-zero static risk at today's spot, explosive risk where the stacked short strikes wait. Short-gamma-downside/long-gamma-upside says your shorts cluster below spot and your longs above \u2014 nightmare scenario: sharp sell-off with a vol spike. From the matrix alone, before opening the inventory, you can identify the two worst cells and design the offsetting trade \u2014 often a structure from the Core track deployed as a *hedge*: a risk reversal to flatten an asymmetry, a wing purchase to cap a tail cell.\n\nTo understand *why* the book behaves as it does, compress it by **butterfly-stripping**. Tight, evenly-spaced flies and condors carry near-zero vega (fly vega = wing + wing \u2212 2\xD7body: 12 + 9.5 \u2212 2\xD710.5 = 0.5, versus 24 for the straddle) \u2014 so you can mentally remove them from the inventory without materially changing the risk. Blend neighboring strikes into synthetics with quantity-weighted averages: 1,000 of the 94 puts plus 500 of the 92 puts \u2248 1,500 of a synthetic 93.33 put. Iterate, and a 40-line inventory collapses to a sentence: 'short the downside 95 puts, short a 110/115 one-by-two.' Now the matrix's shape has an explanation \u2014 and the optimal fix is often counterintuitive: **buying more of a strike you already own** can complete a fly against existing shorts and *reduce* total risk. Two cautions: stripping assumes ample time to expiry (flies un-flatten as gamma concentrates), and never strip a fly that IS the book's risk.\n\nFinal discipline: the matrix is a *scheduled* instrument, not a crisis one. Books drift un-neutral through pure calendar time \u2014 charm bleeds OTM deltas toward zero over a weekend, so Friday's flat book opens Monday with a position nobody traded into. Re-run the matrix time-shifted before every weekend; pre-trade the predictable drift when it's large. The craft isn't reacting to Monday's surprise \u2014 it's making sure there isn't one.",
                "key_takeaways": [
                  "Manage from the risk matrix (Greeks \xD7 spot ladder, re-run at shifted dates/vols), not the inventory list.",
                  "Static risk is today's Greeks; dynamic risk is how they morph \u2014 ratios and ladders hide explosions the snapshot can't see.",
                  "Strip near-zero-vega flies/condors and blend neighbor strikes to compress any book to its core exposures; sometimes buying MORE of a long reduces risk.",
                  "Charm drifts books un-neutral through time alone \u2014 run the time-shifted matrix before weekends and pre-trade predictable bleed."
                ],
                "source": "Volcube Option Volatility Trading: Strategies and Risk",
                "sim": "strategy",
                "sim_task": "In the Strategy Lab's risk-matrix trainer, you're shown a Greeks-vs-spot matrix for a mystery LMND book with no inventory visible. Identify the two worst cells, propose a hedge, and watch the matrix re-render. Then open the 12-line inventory and strip it to its core position by removing flies and blending strikes.",
                "quiz": [
                  {
                    "q": "A fly's legs carry vegas of 12 (low wing), 10.5 (body), 9.5 (high wing). The fly's net vega (+1/\u22122/+1) is:",
                    "choices": [
                      "32",
                      "0.5",
                      "21",
                      "12"
                    ],
                    "answer": 1,
                    "explain": "12 + 9.5 \u2212 2 \xD7 10.5 = 0.5 \u2014 effectively nothing versus 24 for a straddle in the body. Near-zero net risk is exactly why tight flies can be stripped from a book summary."
                  },
                  {
                    "q": "Your matrix shows negative gamma at all lower spots, flipping positive in a strong rally. Your nightmare scenario is:",
                    "choices": [
                      "A slow grind higher",
                      "A sharp sell-off accompanied by a vol spike",
                      "A quiet expiration",
                      "Rates rising"
                    ],
                    "answer": 1,
                    "explain": "The pattern says shorts cluster below spot (with short vega usually attached) and longs sit above. A fast move into the short zone plus panic vol is the double hit."
                  },
                  {
                    "q": "Why can buying MORE of a strike you already own reduce the book's total risk?",
                    "choices": [
                      "It can't \u2014 adding is always more risk",
                      "The purchase can complete a butterfly/condor against existing shorts, spreading the book off",
                      "Brokers net the margin",
                      "More longs always means less risk"
                    ],
                    "answer": 1,
                    "explain": "Risk lives in the book's unspread structure. If your shorts are flanked by longs, adding the missing wing completes a near-zero-risk fly \u2014 counterintuitive but routine on real desks."
                  },
                  {
                    "q": "You leave Friday delta-neutral holding long OTM puts against short stock. Monday shows a long delta nobody traded. The responsible Greek and mechanism:",
                    "choices": [
                      "Vega \u2014 weekend vol rose",
                      "Charm \u2014 the puts' deltas decayed toward zero over the weekend, leaving the stock hedge oversized",
                      "Rho \u2014 rates moved",
                      "Gamma \u2014 spot gapped"
                    ],
                    "answer": 1,
                    "explain": "Charm is delta's decay with time. OTM option deltas bleed toward zero as the clock runs even with spot frozen, so the static stock hedge becomes the net position."
                  }
                ]
              },
              {
                "id": "p-higher-order",
                "title": "The Hidden Machinery: Vanna, Vomma, Charm, and Shock Survival",
                "objective": "Use the higher-order Greeks to predict how a book's risk profile morphs under combined spot, vol, and time shocks \u2014 and build positions that fail gracefully.",
                "body": "First-order Greeks describe your book; higher-order Greeks describe how that description *lies to you* under stress. Three matter most, and each has a desk-grade intuition. **Vomma** (vega's response to vol changes) lives in the wings: long wings mean your vega grows as vol rises and shrinks as it falls \u2014 leaning the right way both times, the vol-space twin of gamma. The underrated danger runs in reverse: a short-vega, short-vomma book can see its short-vega position *evaporate* as vol collapses \u2014 flipping toward long vega just as falling vol was finally paying you. The winning trade dismantles itself mid-victory.\n\n**Vanna** couples the two dimensions: delta's response to vol changes (equivalently, vega's response to spot). Wing calls carry positive vanna, wing puts negative, ATM options none. Consequence: a delta-neutral book grows 'mystery deltas' when vol moves without spot. Hedged long wing puts, vol spikes 5 points \u2014 the puts' absolute deltas swell, and you're suddenly short real deltas you never traded. Wonderful if spot is simultaneously crashing (the usual companion of a vol spike), painful if vol spiked on a rumor while spot rallied. Desks that anticipate vol-spot correlation pre-position for vanna: hedge tighter in the direction where it'll hurt, looser where it'll help. And note the structural fact from the smile lesson: **ATM options are pure first-order; wings are where the second-order machinery lives** \u2014 a strangle is substantially a vomma/vanna position wearing a vega costume.\n\n**Charm** \u2014 delta's decay with time \u2014 is vanna's calendar sibling (passing time and falling vol push options the same direction). OTM deltas bleed toward zero as the clock runs; a risk reversal is double-exposed since both legs bleed the same way, which is how Friday-flat books open Monday with positions nobody traded. The professional countermeasure is mundane and powerful: run the time-shifted risk report Friday afternoon and pre-trade the bleed.\n\nNow assemble everything into the stress-test reflex this track has been building toward. Take any book and shock it in *combinations* \u2014 crash plus vol spike, rally plus vol crush, three quiet weeks \u2014 because the cross-Greeks only reveal themselves when multiple inputs move together. A short put ladder looks placid statically: the crash-plus-spike scenario detonates it through gamma (forced re-hedges), vega (short vol marked against you), vanna (deltas swelling shortward mid-crash), and vomma (shorter vega as vol climbs) \u2014 four simultaneous wounds from one scenario, every one invisible in the first-order snapshot. Your standing discipline, and this curriculum's closing sentence: know your Greeks, know how your Greeks change, and never carry a position whose combined-shock behavior you haven't already watched \u2014 in the lab, where watching is free.",
                "key_takeaways": [
                  "Vomma (wings): long = vega grows exactly when that pays; short-vega-short-vomma books can flip long vega mid-collapse.",
                  "Vanna creates 'mystery deltas' when vol moves without spot \u2014 pre-position hedges for the vol-spot correlation you expect.",
                  "Charm bleeds OTM deltas with time; falling vol and passing time push the same direction \u2014 pre-trade weekend drift.",
                  "Stress-test in combinations (crash+spike, rally+crush): cross-Greeks only show themselves when inputs move together."
                ],
                "source": "Volcube Option Volatility Trading: Strategies and Risk; Option Market Making",
                "sim": "greeks",
                "sim_task": "In the Greeks Lab's morphing dashboard, load a short LMND put ladder and fire the 'crash + vol spike' scenario. Decompose the loss into gamma, vega, vanna, and vomma contributions. Then fire 'rally + vol crush' on a short-vega book and watch vomma flip its vega sign mid-scenario.",
                "quiz": [
                  {
                    "q": "You're short vega and short vomma. Implied vol collapses \u2014 your winning scenario. Why might you be unhappy mid-move?",
                    "choices": [
                      "Theta turned against you",
                      "Vomma pushes your vega longer as vol falls \u2014 the short-vega position shrinks or flips just as the decline pays",
                      "Vanna doubled your delta",
                      "You can't be \u2014 falling vol always pays short vega"
                    ],
                    "answer": 1,
                    "explain": "Short vomma means vega rises as vol falls. The profitable exposure dismantles itself during the collapse \u2014 and can flip outright long vega into the lows."
                  },
                  {
                    "q": "A delta-neutral book holds hedged long wing puts. Vol spikes 5 points with spot unchanged. The book is now:",
                    "choices": [
                      "Still delta-neutral \u2014 spot didn't move",
                      "Short delta \u2014 negative vanna swelled the puts' absolute deltas beyond the static hedge",
                      "Long delta",
                      "Flat but longer theta"
                    ],
                    "answer": 1,
                    "explain": "Wing puts carry negative vanna: rising vol pushes their deltas more negative. The stock hedge, sized at the old vol, is now too small \u2014 mystery short deltas appeared without a single trade."
                  },
                  {
                    "q": "Why are vanna and charm described as siblings?",
                    "choices": [
                      "Both are third-order",
                      "Falling implied vol and passing time affect options similarly, so vol-driven and time-driven delta drift behave alike",
                      "Both only affect ATM options",
                      "They always cancel"
                    ],
                    "answer": 1,
                    "explain": "Less time and less vol both shrink an OTM option's chances, pushing its delta toward zero. One mechanism, two clocks \u2014 which is why the master equivalence keeps recurring."
                  },
                  {
                    "q": "A short put ladder in a crash-plus-vol-spike loses through FOUR channels. They are:",
                    "choices": [
                      "Delta, rho, dividends, carry",
                      "Gamma (losing re-hedges), vega (short vol marked up), vanna (deltas swelling short in the fall), vomma (vega growing shorter as vol rises)",
                      "Theta, charm, rho, delta",
                      "Only gamma and theta"
                    ],
                    "answer": 1,
                    "explain": "The combined shock activates every cross-term at once: forced bad re-hedges, short vega repriced against you, vol-driven delta growth into the crash, and convexity making the vol short bigger as it loses. Static reports showed almost none of it."
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  // src/state/journal.js
  function computeChecks(sym, legs) {
    const feed2 = getFeed();
    const Sref = feed2 ? feed2.quote(sym).S : legs.find((l) => l.strike)?.strike ?? 100;
    const ml = maxLossAtExpiry(legs, Sref);
    const eq = equity() || 1;
    const riskAmount = ml.bounded ? Math.max(0, -ml.amount) : Infinity;
    const riskPct = riskAmount / eq;
    return {
      definedRisk: ml.bounded,
      maxLoss: ml.bounded ? ml.amount : null,
      riskAmount: ml.bounded ? riskAmount : null,
      riskPct: ml.bounded ? riskPct : null,
      sizeOk: ml.bounded && riskPct <= 0.02,
      sizeWarn: ml.bounded && riskPct > 0.02 && riskPct <= 0.05
    };
  }
  function thesisQuality(thesis) {
    if (!thesis) return 0;
    let pts = 0;
    if (thesis.direction) pts += 8;
    if ((thesis.reason || "").trim().length >= 20) pts += 9;
    if ((thesis.exitPlan || "").trim().length >= 10) pts += 8;
    return pts;
  }
  function attachThesis(posId, sym, legs, label, thesis) {
    const p = active();
    if (!p) return null;
    p.journal = p.journal || [];
    const gate = canJournal(p);
    if (gate.err) {
      bus.emit("toast", gate.err);
      return null;
    }
    const checks = computeChecks(sym, legs);
    const entry = {
      id: "j" + Math.random().toString(36).slice(2, 8),
      posId,
      sym,
      label,
      openDay: getFeed()?.day ?? 0,
      thesis: { ...thesis },
      checks,
      status: "open",
      debrief: null,
      score: null,
      pnl: null,
      closeDay: null
    };
    p.journal.unshift(entry);
    if (p.journal.length > 200) p.journal.pop();
    save();
    return entry;
  }
  function entryForPosition(posId) {
    const p = active();
    if (!p) return null;
    return (p.journal || []).find((e) => e.posId === posId) || null;
  }
  function closeDebrief(entryId, debrief, pnl) {
    const p = active();
    if (!p) return null;
    const e = (p.journal || []).find((x) => x.id === entryId);
    if (!e || e.status === "closed") return e;
    e.status = "closed";
    e.closeDay = getFeed()?.day ?? e.openDay;
    e.debrief = { ...debrief };
    e.pnl = pnl;
    const discipline = debrief.followedPlan === "yes" ? 25 : debrief.followedPlan === "partial" ? 12 : 0;
    const sizing = e.checks.sizeOk ? 25 : e.checks.sizeWarn ? 12 : 0;
    const defined = e.checks.definedRisk ? 25 : 0;
    e.score = thesisQuality(e.thesis) + defined + sizing + discipline;
    save();
    addXP(30, "trade journaled");
    if ((p.journal || []).filter((x) => x.status === "closed").length === 1) {
      grant("first-journal");
      bus.emit("toast", "First trade fully journaled \u2014 this habit is the real edge.", "gain");
    }
    return e;
  }
  function entries() {
    const p = active();
    return p ? p.journal || [] : [];
  }
  function avgScore(n = 10) {
    const closed = entries().filter((e) => e.status === "closed" && e.score != null).slice(0, n);
    if (!closed.length) return null;
    return Math.round(closed.reduce((s2, e) => s2 + e.score, 0) / closed.length);
  }
  function scoreBreakdown(e) {
    return [
      { k: "Thesis", v: thesisQuality(e.thesis), max: 25 },
      { k: "Defined risk", v: e.checks?.definedRisk ? 25 : 0, max: 25 },
      { k: "Sizing \u22642%", v: e.checks?.sizeOk ? 25 : e.checks?.sizeWarn ? 12 : 0, max: 25 },
      { k: "Discipline", v: e.debrief ? e.debrief.followedPlan === "yes" ? 25 : e.debrief.followedPlan === "partial" ? 12 : 0 : 0, max: 25 }
    ];
  }

  // src/ui/views/home.js
  var TIPS = [
    "McMillan's first rule of spreads: know your maximum loss before you enter \u2014 the Strategy Lab prints it for every build.",
    "Theta never sleeps, but it only collects on trading days. Speed the sim to 30\xD7 and literally watch an option melt.",
    "Before earnings, implied vol inflates; after, it crushes. Watch a RCKT straddle through an earnings day and feel it.",
    "Delta \u2248 the market's probability the option finishes in-the-money. A 20-delta put is a 1-in-5 shot \u2014 price it like one.",
    "Long options: your worst case is the premium. Short options: your best case is the premium. Decide which side of that trade you are on.",
    `The vol trader's question is never "will it go up?" \u2014 it is "will it move MORE or LESS than the options are charging for?"`,
    "Buy the straddle when you expect realized > implied. The Volatility Lab lets you test that bet 60 paths at a time.",
    "A covered call trades your upside above the strike for cash today. Great on stock you'd happily sell there anyway."
  ];
  var view6 = {
    render(root) {
      const p = active();
      const hour = (/* @__PURE__ */ new Date()).getHours();
      const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      root.appendChild(viewHeader("Academy Exchange", p ? `${greet}, ${p.name}` : "Welcome to Options Academy"));
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:70ch" },
        "Learn a concept, then apply it on a live simulated market \u2014 the way traders actually learn. Built on the desk library: McMillan's Options as a Strategic Investment and the Volcube volatility series."
      ));
      if (p && incomplete()) {
        const n = Math.min(currentStep() + 1, TOTAL);
        root.appendChild(el("a", {
          class: "pill brass onboard-continue",
          href: "#/welcome",
          style: "text-decoration:none"
        }, `Continue setup (step ${n}/${TOTAL})`));
      }
      const row1 = el("div", { class: "row mt2" });
      root.appendChild(row1);
      const contCard = el("div", { class: "card w66" });
      row1.appendChild(contCard);
      let nextLesson = null, trackTitle = "";
      if (curriculum?.tracks && p) {
        outer: for (const t of curriculum.tracks) {
          for (const m of t.modules) for (const l of m.lessons) {
            if (!p.lessons[l.id]) {
              nextLesson = l;
              trackTitle = t.title;
              break outer;
            }
          }
        }
      }
      contCard.appendChild(el("h3", {}, "Continue learning"));
      if (nextLesson) {
        contCard.appendChild(el("div", { class: "small muted" }, trackTitle));
        contCard.appendChild(el("h2", { class: "mt1" }, nextLesson.title));
        contCard.appendChild(el("p", { class: "sub" }, nextLesson.objective));
        contCard.appendChild(el(
          "div",
          { class: "btn-row" },
          el("a", { class: "btn primary", href: "#/learn/lesson/" + nextLesson.id }, "Start lesson \u2192"),
          el("a", { class: "btn", href: "#/learn" }, "Browse curriculum")
        ));
      } else if (p) {
        contCard.appendChild(el(
          "p",
          { class: "sub" },
          "All tracks complete \u2014 legend status. The market is still ticking, though."
        ));
        contCard.appendChild(el("a", { class: "btn primary", href: "#/market" }, "Live Market \u2192"));
      } else {
        contCard.appendChild(el("p", { class: "sub" }, "Create a profile to begin."));
      }
      const sideCol = el("div", { class: "w33", style: "display:flex;flex-direction:column;gap:16px" });
      row1.appendChild(sideCol);
      if (p) {
        const lv = levelOf(p.xp);
        const avg = avgScore(10);
        const sess = session();
        sideCol.appendChild(el(
          "div",
          { class: "card" },
          el("h3", {}, p.name),
          el("div", { class: "small muted" }, `Level ${lv.n} \u2014 ${lv.name}`),
          el(
            "div",
            { class: "stats mt1" },
            el("div", { class: "stat" }, el("div", { class: "k" }, "XP"), el("div", { class: "v" }, String(p.xp))),
            el("div", { class: "stat" }, el("div", { class: "k" }, "Equity"), el("div", { class: "v" }, F.usd(equity(), 0))),
            el("div", { class: "stat" }, el("div", { class: "k" }, "Process Score"), el("div", { class: "v" }, avg == null ? "\u2014" : String(avg)))
          ),
          sess && sess.status === "active" ? el(
            "a",
            { class: "pill brass mt1", href: "#/missions/" + sess.def.id, style: "margin-top:10px;display:inline-flex;text-decoration:none" },
            icon("compass"),
            ` Resume: ${sess.def.title}`
          ) : null,
          el("a", { class: "btn sm mt1", href: "#/progress", style: "margin-top:10px;display:inline-flex" }, "View progress")
        ));
      }
      sideCol.appendChild(el(
        "div",
        { class: "card" },
        el("h3", {}, "Floor wisdom"),
        el("p", { class: "sub", style: "margin-bottom:0" }, TIPS[Math.floor(Math.random() * TIPS.length)])
      ));
      if (realDataReady()) {
        root.appendChild(el(
          "a",
          {
            class: "card mt2 real-data-card",
            href: "#/market",
            style: "text-decoration:none;color:inherit",
            onclick: () => {
              if (feedMode() !== "tradier") setFeedMode("tradier");
            }
          },
          el(
            "div",
            { class: "flex-between", style: "flex-wrap:wrap;gap:8px" },
            el(
              "div",
              {},
              el("h3", { style: "margin:0" }, "Real market (delayed)"),
              el("p", { class: "sub", style: "margin:4px 0 0" }, "Watch Tradier sandbox quotes \xB7 analyze in Strategy Lab")
            ),
            el("span", { class: "pill real-delayed-badge" }, "REAL \xB7 DELAYED 15 MIN")
          )
        ));
      }
      const mkCard = el("div", { class: "card mt2" });
      root.appendChild(mkCard);
      mkCard.appendChild(el(
        "div",
        { class: "flex-between" },
        el("h3", {}, "Market snapshot \u2014 " + market.clockLabel()),
        el("a", { class: "btn sm", href: "#/market" }, "Open Live Market")
      ));
      const snap = el("div", { class: "row mt1" });
      mkCard.appendChild(snap);
      function renderSnap() {
        snap.innerHTML = "";
        for (const t of market.list()) {
          const q = market.quote(t.sym);
          const up = q.chg >= 0;
          snap.appendChild(el(
            "a",
            { class: "stat", style: "flex:1 1 130px;text-decoration:none;color:inherit", href: "#/market/" + t.sym },
            el("div", { class: "k" }, t.sym),
            el("div", { class: "v", style: "font-size:17px" }, F.usd(q.S)),
            el("div", { class: "d " + (up ? "up" : "down") }, (up ? "\u25B2 " : "\u25BC ") + F.pctSigned(q.chgPct))
          ));
        }
      }
      renderSnap();
      const unTick = market.on("tick", renderSnap);
      const labs = el("div", { class: "grid3 mt2" });
      root.appendChild(labs);
      const lab = (href, slug, name, desc) => el(
        "a",
        { class: "card", href, style: "text-decoration:none;color:inherit" },
        el("div", { class: "lab-ic" }, icon(slug, { size: 24 })),
        el("h3", { class: "mt1" }, name),
        el("p", { class: "sub", style: "margin:0" }, desc)
      );
      labs.appendChild(lab("#/strategy", "layers", "Strategy Lab", "Build spreads, see payoff curves and breakevens before you trade."));
      labs.appendChild(lab("#/greeks", "temple", "Greeks Lab", "Sliders for delta, gamma, theta, vega \u2014 build the intuition."));
      labs.appendChild(lab("#/vol", "wave", "Volatility Lab", "Gamma-scalp a straddle; learn the realized-vs-implied game."));
      return () => unTick();
    }
  };

  // src/content/placement.js
  var PLACEMENT = {
    core: {
      questions: [
        {
          q: "You buy one standard US equity call option with a $50 strike for a quoted premium of $2.35. What right does this contract give you, and what is your total cash outlay (ignoring commissions)?",
          choices: [
            "The obligation to buy 100 shares at $50; outlay is $2.35",
            "The right, but not the obligation, to buy 100 shares at $50 on or before expiration; outlay is $235",
            "The right to sell 100 shares at $50; outlay is $235",
            "The right to buy 1 share at $50; outlay is $2,350"
          ],
          answer: 1,
          explain: "A call buyer pays the premium for the right (never the obligation) to buy 100 shares at the strike price. Because of the 100-share multiplier, a $2.35 quote costs $235."
        },
        {
          q: "A stock trades at $84, and its 80-strike call is quoted at $6.50. How does that $6.50 premium split into intrinsic value and time (extrinsic) value?",
          choices: [
            "$6.50 intrinsic value and $0 time value",
            "$0 intrinsic value and $6.50 time value",
            "$4.00 intrinsic value and $2.50 time value",
            "$2.50 intrinsic value and $4.00 time value"
          ],
          answer: 2,
          explain: "For a call, intrinsic value is max(S \u2212 K, 0) = $84 \u2212 $80 = $4.00. The remaining $2.50 of the $6.50 premium is melting time value."
        },
        {
          q: "You buy a 60-strike put for $3.20 when the stock is at $62. At expiration, what is your breakeven stock price and your maximum possible loss on the contract?",
          choices: [
            "Breakeven $56.80; maximum loss $320",
            "Breakeven $63.20; maximum loss $320",
            "Breakeven $56.80; maximum loss $5,680",
            "Breakeven $58.80; maximum loss unlimited"
          ],
          answer: 0,
          explain: "A long put breaks even at strike minus premium ($60 \u2212 $3.20 = $56.80). As an option buyer, your worst case is capped at the $320 premium paid."
        },
        {
          q: "You buy a 30-day 105-strike call for $2.00 when a stock trades at $100. On expiration day the stock closes at $106. What is your net P&L, and why?",
          choices: [
            "+$100, because the option finished in-the-money",
            "\u2212$100, because the $1.00 intrinsic value at expiry is less than the $2.00 premium paid",
            "+$600, because the stock rose $6.00",
            "\u2212$200, because all calls below $107 expire worthless"
          ],
          answer: 1,
          explain: "At $106, the 105 call settles for $1.00 ($100), leaving a net loss of $1.00 ($100) against your $2.00 entry cost. Being right on direction isn\u2019t enough if the move falls short of your $107 breakeven."
        },
        {
          q: "You buy 100 shares at $70 and sell one 75-strike call for $1.80 (a covered call). What are your breakeven price and maximum possible profit at expiration?",
          choices: [
            "Breakeven $71.80; maximum profit unlimited",
            "Breakeven $68.20; maximum profit $680",
            "Breakeven $68.20; maximum profit $500",
            "Breakeven $73.20; maximum profit $680"
          ],
          answer: 1,
          explain: "The $1.80 call credit lowers your cost basis to $68.20 per share. If the stock finishes at or above $75, your shares are called away for a $5.00 stock gain plus $1.80 premium = $6.80 ($680) max profit."
        },
        {
          q: "You sell one cash-secured 50-strike put for $1.60 while reserving $5,000 in cash. If the stock drops to $44 at expiration and you are assigned, what is your effective purchase price per share?",
          choices: [
            "$50.00",
            "$44.00",
            "$48.40",
            "$42.40"
          ],
          answer: 2,
          explain: "Assignment obligates you to buy 100 shares at the $50 strike, but you keep the $1.60 premium collected upfront, bringing your net cost basis to $48.40 per share."
        },
        {
          q: "You construct a bull call vertical spread by buying the 100 call for $4.80 and selling the 110 call (same expiry) for $1.60. What are the net debit, maximum profit, and breakeven at expiration?",
          choices: [
            "Debit $3.20 ($320); max profit $6.80 ($680); breakeven $103.20",
            "Debit $6.40 ($640); max profit $3.60 ($360); breakeven $106.40",
            "Debit $3.20 ($320); max profit $10.00 ($1,000); breakeven $104.80",
            "Debit $1.60 ($160); max profit $8.40 ($840); breakeven $101.60"
          ],
          answer: 0,
          explain: "Net debit is $4.80 \u2212 $1.60 = $3.20. Max profit at or above $110 is the $10 strike width minus the $3.20 debit ($6.80, or $680), and breakeven is the lower strike plus debit ($103.20)."
        },
        {
          q: "A stock trades at $80 with an annualized implied volatility (IV) of 32%. Using the square-root-of-time rule (\u221A252 \u2248 16), roughly what 1-standard-deviation daily move are options pricing in?",
          choices: [
            "About $0.50 per day (0.6%)",
            "About $1.60 per day (2.0%)",
            "About $2.56 per day (3.2%)",
            "About $5.00 per day (6.25%)"
          ],
          answer: 1,
          explain: "Dividing the 32% annual IV by 16 gives an implied daily standard deviation of 2.0%. On an $80 stock, 2.0% is $1.60 per trading day."
        },
        {
          q: "Just before an earnings announcement, you buy a 100-strike straddle (100 call + 100 put) for $9.00 total. The next morning the stock gaps up to $106 and implied volatility drops sharply. Why is your straddle showing a loss despite a 6% rally?",
          choices: [
            "The call and put deltas always cancel to zero regardless of how far the stock moves",
            "A $9.00 straddle priced in at least a $9.00 move; a $6.00 move plus the post-earnings IV crush leaves the combined value below $9.00",
            "Long straddles only profit when the underlying stock falls",
            "Market makers freeze intrinsic value on earnings day"
          ],
          answer: 1,
          explain: "The $9.00 premium embedded a forecast move of \xB1$9.00. Because the actual $6.00 jump fell short of that forecast and post-event IV collapsed, both legs lost extrinsic value."
        },
        {
          q: "Ticker A has an implied volatility of 34% (52-week range: 18%\u201336%). Ticker B has an implied volatility of 52% (52-week range: 48%\u201395%). How should a trader compare the relative expensiveness of their options?",
          choices: [
            "Ticker B\u2019s options are more expensive because 52% is higher than 34%",
            "Ticker A\u2019s options are near the top of its historical range (high IV rank), while Ticker B\u2019s are near the bottom of its own range",
            "Both are overpriced because any IV above 30% favors selling naked options",
            "IV cannot be compared across time for a single stock"
          ],
          answer: 1,
          explain: "Implied volatility must be judged against the same underlying\u2019s own history. Ticker A is rich relative to its norm (high IV rank), whereas Ticker B is near cycle lows for its business."
        },
        {
          q: "You open a long call calendar spread at the $100 strike (short 30-day 100 call, long 90-day 100 call). Which combination of events produces the best outcome for this structure?",
          choices: [
            "The stock rockets to $130 within the first week",
            "The stock stays near $100 into the 30-day expiration while front-month option value decays faster than the 90-day leg",
            "Front-month implied volatility spikes 15 points while back-month volatility falls",
            "The stock crashes to $70 before the 30-day expiration"
          ],
          answer: 1,
          explain: "A calendar spread harvests the steeper at-the-money time decay of the near-dated short leg while spot stays near the strike. Large moves in either direction collapse the time-value spread between the two expirations."
        },
        {
          q: "Why can a bull vertical spread that is deep in-the-money (for example, a 100/110 call spread with the stock at $118 and two weeks left to expiry) trade at $9.45 instead of its full $10.00 maximum value?",
          choices: [
            "Vertical spreads can never reach their full width even at expiration",
            "The short 110 call still retains extrinsic value and negative gamma; the spread only converges to $10.00 as remaining time value decays to zero",
            "Dividends are automatically deducted from the width of every call vertical",
            "Put-call parity caps vertical spreads at 95% of strike width"
          ],
          answer: 1,
          explain: "As long as time remains before expiration, the short upper leg carries residual extrinsic value that offsets the long leg. The final cents of max profit only materialize as expiration arrives."
        }
      ]
    },
    "greeks-vol": {
      questions: [
        {
          q: "Your option book on LMND consists of long 15 calls at +0.40 delta and short 10 puts at \u22120.30 delta (multiplier 100). What is your net equivalent share position, and how many shares hedge it to delta-neutral?",
          choices: [
            "Long 300 shares; sell 300 shares to hedge",
            "Long 900 shares; sell 900 shares to hedge",
            "Short 300 shares; buy 300 shares to hedge",
            "Long 600 shares; sell 600 shares to hedge"
          ],
          answer: 1,
          explain: "Long calls contribute 15 \xD7 0.40 \xD7 100 = +600 deltas. Shorting puts flips their negative sign (\u221210 \xD7 \u22120.30 \xD7 100 = +300 deltas), leaving you net long 900 share-equivalents, which requires selling 900 shares to flatten."
        },
        {
          q: "A call option with the stock at $100 has +0.50 delta and +0.08 gamma. If the stock rallies $3 to $103, what is the new approximate delta, and what is the estimated option gain per share using the average-delta rule?",
          choices: [
            "New delta +0.58; estimated gain $1.50",
            "New delta +0.74; estimated gain $1.86",
            "New delta +0.26; estimated gain $1.14",
            "New delta +0.74; estimated gain $2.22"
          ],
          answer: 1,
          explain: "New delta \u2248 0.50 + (3 \xD7 0.08) = 0.74. Averaging the starting and ending deltas gives (0.50 + 0.74) / 2 = 0.62, which across a $3 move produces 0.62 \xD7 $3 = $1.86 per share."
        },
        {
          q: "All else equal, how does the gamma of an at-the-money option behave as expiration approaches and implied volatility is low?",
          choices: [
            "Gamma shrinks toward zero because little time value remains",
            "Gamma concentrates sharply at the strike, making delta flip rapidly on small spot moves",
            "Gamma flattens out evenly across all deep OTM and ITM strikes",
            "Gamma turns negative for long calls and positive for long puts"
          ],
          answer: 1,
          explain: "With little time or volatility left, a small move across the strike decides whether the option finishes worth 100 deltas or 0 deltas. That rapid delta sensitivity is high positive gamma."
        },
        {
          q: "A delta-neutral book is long 60 gamma (in share-equivalent units per $1 move) and pays $120 per trading day in theta. Using \u221A(2\u03B8/\u0393), what daily move is required to break even on the overnight theta bill?",
          choices: [
            "$1.00",
            "$1.41",
            "$2.00",
            "$4.00"
          ],
          answer: 2,
          explain: "Gamma P&L is \xBD \xD7 \u0393 \xD7 (\u0394S)\xB2. Setting \xBD \xD7 60 \xD7 (\u0394S)\xB2 = $120 gives (\u0394S)\xB2 = 4, or a $2.00 breakeven move in either direction."
        },
        {
          q: "Why does a delta-hedged long-gamma trader lock in a profit when the underlying stock drops sharply and they re-hedge back to delta-neutral?",
          choices: [
            "Because long gamma makes theta turn positive during market selloffs",
            "Because option delta becomes less long (or more negative) as spot falls, so the options lose less than the static short-stock hedge gains, and buying shares lower banks the difference",
            "Because short stock has positive vega",
            "They do not \u2014 long gamma only profits on upward moves"
          ],
          answer: 1,
          explain: "As the stock falls, positive gamma reduces the option book\u2019s delta, meaning the options lose at a shrinking rate while the initial short-stock hedge gains linearly. Buying shares at the lower price to re-flatten locks in that curvature advantage."
        },
        {
          q: "Option X drops $0.12 and carries $0.06 of vega per 1-point IV move. Option Y drops $0.09 and carries $0.03 of vega (with spot unchanged). Which option cheapened more in implied-volatility terms?",
          choices: [
            "Option X, because 12 cents is larger than 9 cents",
            "Option Y, which fell 3.0 vol points compared to Option X\u2019s 2.0 vol points",
            "Both cheapened by the exact same amount of implied volatility",
            "Neither, because vega only measures time decay"
          ],
          answer: 1,
          explain: "Converting price changes to vol points via \u0394Price \xF7 Vega shows Option X fell 0.12 / 0.06 = 2.0 vols, while Option Y fell 0.09 / 0.03 = 3.0 vols."
        },
        {
          q: "Why can desk risk managers sum raw theta directly across different expirations, whereas summing raw vega across front-month and back-month options is misleading?",
          choices: [
            "Theta is measured in percentages while vega is measured in days",
            "Every expiration loses exactly one day of time per session, but implied volatilities across expirations move by different amounts (front-month IV is much more volatile than back-month IV)",
            "Back-month options have zero vega",
            "Exchange margin rules prohibit adding vega"
          ],
          answer: 1,
          explain: "Calendar time advances uniformly for every option on the board. Implied volatility, however, has a term structure where near-dated IV swings far harder than long-dated IV, requiring time-weighted vega to measure net exposure."
        },
        {
          q: "You sell a delta-hedged straddle at 28% implied volatility. Over the life of the option, the stock\u2019s realized volatility on your hedging schedule is 21%. Ignoring vega marks along the way, what determines your campaign P&L?",
          choices: [
            "You lose money because any realized volatility above 20% bankrupts short gamma",
            "You profit overall because the daily theta collected (priced at 28% IV) exceeded the cumulative buy-high/sell-low re-hedging losses (generated by 21% realized vol)",
            "You break even because delta hedging eliminates all profit and loss",
            "Your P&L depends only on whether the stock finished higher or lower than its starting price"
          ],
          answer: 1,
          explain: "Delta-hedged option trading is a contest between implied and realized volatility. When realized volatility undershoots the implied volatility you sold, the theta rent collected outweighs your gamma re-hedging costs."
        },
        {
          q: "A stock rallies $0.50 while a 40-delta call rises from $2.10 to $2.30. How much did the option\u2019s price change in volatility terms (ignoring second-order effects)?",
          choices: [
            "It rose by 20 vol points",
            "Zero \u2014 the $0.20 price increase is completely explained by its 0.40 delta across the $0.50 stock move",
            "It fell, because calls always lose implied volatility on rallies",
            "It rose by $0.20 of extrinsic value"
          ],
          answer: 1,
          explain: "A 0.40 delta call is expected to gain 0.40 \xD7 $0.50 = $0.20 from spot movement alone. Because the entire dollar change came from delta, its implied volatility \u2014 the true price of optionality \u2014 did not budge."
        },
        {
          q: "In equity index and single-stock option markets, why do out-of-the-money downside puts typically trade at higher implied volatilities than equidistant upside calls (negative skew)?",
          choices: [
            "Put options have more days to expiration than call options",
            "Persistent hedging demand for crash protection, fatter left-tail return distributions, and the tendency for volatility to spike when stock prices drop",
            "Dividends increase put intrinsic value at expiration",
            "Market makers aren\u2019t allowed to short puts"
          ],
          answer: 1,
          explain: "Investors structurally own equities and bid up downside puts for insurance, while historical crashes exhibit fat tails and strong negative correlation between spot prices and volatility."
        },
        {
          q: "You want to isolate a view on the steepness of the volatility skew (downside put IV relative to upside call IV) while keeping net headline vega near zero. Which delta-hedged structure directly targets this shape risk?",
          choices: [
            "An at-the-money straddle",
            "A 25-delta risk reversal (long 25-delta wing in one direction, short 25-delta wing in the other, delta-hedged)",
            "An outright long stock position",
            "A deep in-the-money call"
          ],
          answer: 1,
          explain: "An ATM straddle trades parallel shifts in the overall vol level. A delta-hedged risk reversal pairs opposite wings so their baseline vegas largely offset, isolating changes in the slope (skew) between puts and calls."
        },
        {
          q: "A trader holds a delta-neutral book of hedged long out-of-the-money puts. Suddenly, implied volatility spikes 6 points while the stock price stays temporarily unchanged. Which higher-order Greek causes the book to become net short delta, and why?",
          choices: [
            "Theta, because time decay speeds up during volatility spikes",
            "Vanna (dDelta/dVol), because higher implied volatility increases the probability of reaching the OTM put strike, pushing the puts\u2019 negative deltas closer to \u22120.50 beyond the static stock hedge",
            "Charm, because weekend drift reverses during market hours",
            "Rho, because interest rates move with volatility"
          ],
          answer: 1,
          explain: "Vanna measures how delta changes when implied volatility moves. Rising IV pulls OTM options toward 50 delta, making long OTM puts more negative in delta and leaving a previously neutral book net short delta."
        }
      ]
    }
  };

  // src/state/mastery.js
  var QUIZ_PASS_AVG = 0.6;
  function track(trackId) {
    return curriculum.tracks.find((t) => t.id === trackId) || null;
  }
  function moduleQuizAvg(p, mod) {
    const ratios = mod.lessons.map((l) => {
      const total = (l.quiz || []).length;
      if (!total) return 1;
      return Math.min(1, (p.quizzes[l.id] || 0) / total);
    });
    return ratios.reduce((s2, x) => s2 + x, 0) / Math.max(1, ratios.length);
  }
  function moduleComplete(p, mod) {
    return mod.lessons.every((l) => p.lessons[l.id]) && moduleQuizAvg(p, mod) >= QUIZ_PASS_AVG;
  }
  function recordPlacement(trackId, scorePct) {
    const p = active();
    if (!p) return 0;
    const t = track(trackId);
    if (!t) return 0;
    const idx = scorePct >= 0.8 ? Math.min(2, t.modules.length - 1) : scorePct >= 0.5 ? Math.min(1, t.modules.length - 1) : 0;
    p.placement = p.placement || {};
    p.placement[trackId] = { startModule: idx, scorePct, day: Date.now() };
    save();
    addXP(20, "placement test");
    return idx;
  }
  function placement(trackId) {
    const p = active();
    return p?.placement?.[trackId] || null;
  }
  function moduleStatus(trackId) {
    const p = active();
    const t = track(trackId);
    if (!t) return [];
    const start5 = p?.placement?.[trackId]?.startModule ?? 0;
    let prevComplete = true;
    return t.modules.map((mod, i) => {
      const complete = p ? moduleComplete(p, mod) : false;
      const unlocked = !p ? i === 0 : i <= start5 || prevComplete;
      const status2 = { id: mod.id, title: mod.title, index: i, unlocked, complete, quizAvg: p ? moduleQuizAvg(p, mod) : 0 };
      prevComplete = complete;
      return status2;
    });
  }
  function isLessonUnlocked(lessonId) {
    for (const t of curriculum.tracks) {
      for (let i = 0; i < t.modules.length; i++) {
        if (t.modules[i].lessons.some((l) => l.id === lessonId)) {
          const ms = moduleStatus(t.id);
          return ms[i] ? ms[i].unlocked : true;
        }
      }
    }
    return true;
  }
  function trackOverview(trackId) {
    const ms = moduleStatus(trackId);
    return {
      modules: ms,
      unlockedCount: ms.filter((m) => m.unlocked).length,
      completeCount: ms.filter((m) => m.complete).length,
      needsPlacement: !placement(trackId) && ms.length > 1
    };
  }

  // src/ui/views/learn.js
  var SIM_LINKS = {
    strategy: { href: "#/strategy", label: "Open the Strategy Lab", icon: "\u{1F9E9}" },
    greeks: { href: "#/greeks", label: "Open the Greeks Lab", icon: "\u{1F3DB}\uFE0F" },
    vol: { href: "#/vol", label: "Open the Volatility Lab", icon: "\u{1F30A}" },
    market: { href: "#/market", label: "Open the Live Market", icon: "\u{1F4FA}" }
  };
  function allLessons() {
    return curriculum.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, trackId: t.id, trackTitle: t.title, moduleTitle: m.title }))));
  }
  function trackProgress(t) {
    const p = active();
    const ids = t.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const done = p ? ids.filter((id) => p.lessons[id]).length : 0;
    return { done, total: ids.length };
  }
  function loadPlacement() {
    return Promise.resolve(PLACEMENT || {});
  }
  function openPlacementQuiz(trackId, questions, onDone) {
    const box = el("div", {});
    box.appendChild(el("h2", {}, "Placement test"));
    box.appendChild(el("p", { class: "sub" }, "Three minutes. We route you to the right module \u2014 no shame in starting earlier."));
    const quizBox = el("div", { class: "mt1" });
    box.appendChild(quizBox);
    const m = modal(box, { onClose: false });
    quiz(quizBox, questions, {
      onDone: (score, total) => {
        const pct = total ? score / total : 0;
        const startIdx = recordPlacement(trackId, pct);
        toast(`Placement complete \u2014 starting at module ${startIdx + 1}.`, "gain");
        m.close();
        onDone && onDone(startIdx);
      }
    });
  }
  function renderIndex(root) {
    root.appendChild(viewHeader("Curriculum", "Learn the craft, then trade it"));
    root.appendChild(el(
      "p",
      { class: "sub", style: "max-width:68ch" },
      "Four tracks, built on the desk reference library \u2014 the McMillan topic arc plus the Volcube series on gamma, volatility, market making, and the Greeks. Every lesson ends with a task on the live simulator: learn it, then do it."
    ));
    const wrap = el("div", { class: "grid2 mt2" });
    for (const t of curriculum.tracks) {
      const pr = trackProgress(t);
      const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
      const ov = trackOverview(t.id);
      wrap.appendChild(el(
        "a",
        { class: "card track-card", href: "#/learn/track/" + t.id, style: "text-decoration:none;color:inherit" },
        el(
          "div",
          { class: "track-head" },
          el("h2", {}, t.title),
          el("span", { class: "pill " + (pct === 100 ? "gain" : "brass") }, pct === 100 ? "\u2713 Complete" : pct + "%")
        ),
        el("div", { class: "small muted" }, t.audience),
        el("p", { class: "sub", style: "margin:4px 0 8px" }, t.description || ""),
        el("div", { class: "prog-bar" + (pct === 100 ? " green" : "") }, el("div", { style: "width:" + pct + "%" })),
        el(
          "div",
          { class: "small muted num" },
          `${pr.done}/${pr.total} lessons \xB7 ${ov.unlockedCount}/${t.modules.length} modules unlocked`
        )
      ));
    }
    root.appendChild(wrap);
  }
  function renderTrack(root, tid) {
    const t = curriculum.tracks.find((x) => x.id === tid);
    if (!t) {
      root.appendChild(el("p", {}, "Track not found."));
      return;
    }
    const p = active();
    const statuses = moduleStatus(tid);
    const statusById = Object.fromEntries(statuses.map((s2) => [s2.id, s2]));
    const overview = trackOverview(tid);
    root.appendChild(el("div", { class: "crumb" }, el("a", { href: "#/learn" }, "\u2190 Curriculum")));
    root.appendChild(el("div", { class: "eyebrow" }, t.audience));
    root.appendChild(el("h1", {}, t.title));
    root.appendChild(el("p", { class: "sub", style: "max-width:68ch" }, t.description || ""));
    const bannerHost = el("div", {});
    root.appendChild(bannerHost);
    if (overview.needsPlacement) {
      loadPlacement().then((PLACEMENT2) => {
        const bank = PLACEMENT2[tid];
        const questions = bank?.questions || [];
        if (!questions.length || !bannerHost.isConnected) return;
        bannerHost.appendChild(el(
          "div",
          { class: "placement-banner" },
          icon("pin", { size: 22 }),
          el(
            "div",
            { style: "flex:1;min-width:200px" },
            el("div", { style: "font-weight:700" }, "New here? Take the 3-minute placement test"),
            el("div", { class: "sub" }, "Skip modules you already know \u2014 mastery gates still apply going forward.")
          ),
          el("button", { class: "btn primary", onclick: () => {
            openPlacementQuiz(tid, questions, () => {
              location.hash = "#/learn/track/" + tid;
              const hash = location.hash;
              location.hash = "";
              location.hash = hash;
            });
          } }, "Start placement")
        ));
      });
    }
    for (const m of t.modules) {
      const st = statusById[m.id] || { unlocked: true, complete: false };
      const card = el("div", { class: "card mt2" + (st.unlocked ? "" : " module-locked") });
      card.appendChild(el(
        "div",
        { class: "flex-between" },
        el("h3", { style: "margin:0" }, st.unlocked ? m.title : el("span", { class: "locked-title" }, icon("lock"), " " + m.title)),
        st.complete ? el("span", { class: "pill gain" }, "\u2713 Complete") : st.unlocked ? el("span", { class: "pill brass" }, "Unlocked") : el("span", { class: "pill" }, "Locked")
      ));
      if (!st.unlocked) {
        card.appendChild(el(
          "p",
          { class: "small muted", style: "margin:6px 0 0" },
          "Complete previous module (quiz avg \u226560%)"
        ));
      }
      const list2 = el("div", { class: "lesson-list" });
      const flatIds = t.modules.flatMap((mod) => mod.lessons.map((x) => x.id));
      for (const l of m.lessons) {
        const done = p && p.lessons[l.id];
        const lessonIdxInTrack = flatIds.indexOf(l.id);
        const tierLocked = lessonTierLocked(tid, lessonIdxInTrack);
        if (st.unlocked && !tierLocked) {
          list2.appendChild(el(
            "a",
            { class: "lesson-item" + (done ? " done" : ""), href: "#/learn/lesson/" + l.id },
            el("span", { class: "lcheck" }, done ? "\u2713" : ""),
            el(
              "span",
              {},
              el("div", { class: "lt" }, l.title),
              el("div", { class: "lo" }, l.objective)
            )
          ));
        } else {
          list2.appendChild(el(
            "div",
            { class: "lesson-item", role: "text" },
            el("span", { class: "lcheck" }, icon("lock", { size: 13 })),
            el(
              "span",
              {},
              el(
                "div",
                { class: "lt" },
                l.title,
                tierLocked && !isFamilyBuild() ? el("a", { class: "pill brass lock-chip", href: "#/upgrade", style: "text-decoration:none;margin-left:8px" }, "Upgrade") : null
              ),
              el(
                "div",
                { class: "lo" },
                tierLocked ? "Academy unlock \u2014 upgrade to continue this track" : l.objective
              )
            )
          ));
        }
      }
      card.appendChild(list2);
      root.appendChild(card);
    }
  }
  function renderLesson(root, lid) {
    const lessons = allLessons();
    const idx = lessons.findIndex((l2) => l2.id === lid);
    if (idx < 0) {
      root.appendChild(el("p", {}, "Lesson not found."));
      return;
    }
    const l = lessons[idx];
    const next = lessons[idx + 1];
    const p = active();
    root.appendChild(el(
      "div",
      { class: "crumb" },
      el("a", { href: "#/learn" }, "Curriculum"),
      " / ",
      el("a", { href: "#/learn/track/" + l.trackId }, l.trackTitle),
      " / ",
      l.moduleTitle
    ));
    const track2 = curriculum.tracks.find((t) => t.id === l.trackId);
    const flatIds = (track2?.modules || []).flatMap((m) => m.lessons.map((x) => x.id));
    const lessonIdxInTrack = flatIds.indexOf(lid);
    if (lessonTierLocked(l.trackId, lessonIdxInTrack)) {
      root.appendChild(el(
        "div",
        { class: "card mt2", style: "max-width:68ch;text-align:center" },
        el("div", { style: "font-size:36px" }, "\u{1F512}"),
        el("h1", {}, "Academy lesson"),
        el(
          "p",
          { class: "sub" },
          "Free practice includes the first lessons of the core track. Upgrade to unlock the full curriculum."
        ),
        el(
          "div",
          { class: "btn-row mt1", style: "justify-content:center" },
          el("a", { class: "btn", href: "#/learn/track/" + l.trackId }, "Back to track"),
          el("a", { class: "btn primary", href: "#/upgrade" }, "Upgrade")
        )
      ));
      return;
    }
    if (!isLessonUnlocked(lid)) {
      root.appendChild(el(
        "div",
        { class: "card mt2", style: "max-width:68ch;text-align:center" },
        el("div", { style: "font-size:36px" }, "\u{1F512}"),
        el("h1", {}, "Lesson locked"),
        el(
          "p",
          { class: "sub" },
          "Complete the previous module with a quiz average of at least 60%, or take the placement test on the track page."
        ),
        el("a", { class: "btn primary", href: "#/learn/track/" + l.trackId }, "Back to track")
      ));
      return;
    }
    root.appendChild(el("h1", {}, l.title));
    root.appendChild(el("p", { class: "sub", style: "max-width:68ch" }, l.objective));
    if (l.source) root.appendChild(el("div", { class: "pill mt1" }, icon("bookOpen"), " " + l.source));
    const prose = el("div", { class: "lesson-prose mt2", html: md(l.body) });
    if (l.key_takeaways && l.key_takeaways.length) {
      prose.appendChild(el(
        "div",
        { class: "takeaways" },
        el("h3", {}, "Key takeaways"),
        el("ul", {}, ...l.key_takeaways.map((k) => el("li", { html: mdInline(k) })))
      ));
    }
    root.appendChild(prose);
    if (l.sim && SIM_LINKS[l.sim]) {
      const s2 = SIM_LINKS[l.sim];
      root.appendChild(el(
        "div",
        { class: "apply-card", style: "max-width:68ch" },
        iconFor(s2.icon, "book", { cls: "ic" }),
        el(
          "div",
          { style: "flex:1;min-width:220px" },
          el("div", { style: "font-weight:700" }, "Apply it on the simulator"),
          el("div", { class: "sub" }, l.sim_task || "Try what you just learned.")
        ),
        el("a", { class: "btn primary", href: s2.href }, s2.label)
      ));
    }
    const quizBox = el("div", { class: "card mt2", style: "max-width:68ch" });
    root.appendChild(quizBox);
    const doneBtn = el("button", { class: "btn primary", disabled: !(p && p.lessons[l.id]) ? true : false }, "");
    const already = p && p.lessons[l.id];
    function refreshDoneBtn(enabled) {
      doneBtn.textContent = p && p.lessons[l.id] ? "\u2713 Lesson complete" : "Mark lesson complete (+50 XP)";
      doneBtn.disabled = !enabled && !(p && p.lessons[l.id]);
      if (p && p.lessons[l.id]) doneBtn.disabled = true;
    }
    quiz(quizBox, l.quiz || [], {
      onDone: (score, total) => {
        quizDone(l.id, score, total);
        quizBox.appendChild(el("div", { class: "big-result" }, `${score}/${total} ${score === total ? "\u2014 perfect!" : score >= total * 0.6 ? "\u2014 nice work" : "\u2014 review and retry anytime"}`));
        refreshDoneBtn(true);
      }
    });
    const footer = el("div", { class: "btn-row mt2", style: "max-width:68ch" }, doneBtn);
    doneBtn.addEventListener("click", () => {
      const trackIds = flatIds;
      lessonDone(l.id, l.trackId, trackIds);
      refreshDoneBtn(true);
      bus.emit("profile");
    });
    if (next && isLessonUnlocked(next.id)) {
      footer.appendChild(el("a", { class: "btn", href: "#/learn/lesson/" + next.id }, "Next: " + next.title + " \u2192"));
    }
    refreshDoneBtn(already || !(l.quiz || []).length);
    root.appendChild(footer);
  }
  var view7 = {
    render(root, params) {
      if (!curriculum || !curriculum.tracks?.length) {
        root.appendChild(el("p", { class: "sub" }, "Curriculum loading\u2026"));
        return;
      }
      if (params[0] === "track") return renderTrack(root, params[1]);
      if (params[0] === "lesson") return renderLesson(root, params[1]);
      renderIndex(root);
    }
  };

  // src/engine/analytics.js
  function coneBands(S2, iv, daysArr, sigmas = [1, 2]) {
    if (!Array.isArray(daysArr)) return [];
    const sSafe = Number.isFinite(S2) && S2 > 0 ? S2 : 0;
    const vSafe = Number.isFinite(iv) && iv > 0 ? iv : 0;
    const sigList = Array.isArray(sigmas) ? sigmas : [1, 2];
    return daysArr.map((rawDays) => {
      const d = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 0;
      const volSqrtT = d > 0 && vSafe > 0 ? vSafe * Math.sqrt(d / TRADING_YEAR) : 0;
      const bands = sigList.map((rawSigma) => {
        const sigma = Number.isFinite(rawSigma) ? Math.abs(rawSigma) : 0;
        if (sSafe <= 0 || volSqrtT === 0 || sigma === 0) {
          return { sigma, lo: sSafe, hi: sSafe };
        }
        return {
          sigma,
          lo: sSafe * Math.exp(-sigma * volSqrtT),
          hi: sSafe * Math.exp(sigma * volSqrtT)
        };
      });
      return { days: d, bands };
    });
  }
  function closePrice(c) {
    return typeof c === "number" ? c : c && typeof c === "object" ? c.p : NaN;
  }
  function closeDay(c, idx) {
    return typeof c === "object" && c !== null && typeof c.day === "number" ? c.day : idx + 1;
  }
  function hv(closes, window2 = 20) {
    if (!Array.isArray(closes) || !Number.isFinite(window2) || window2 <= 0) return 0;
    const w = Math.floor(window2);
    if (w <= 0) return 0;
    const prices = [];
    for (let i = 0; i < closes.length; i++) {
      const p = closePrice(closes[i]);
      if (Number.isFinite(p) && p > 0) prices.push(p);
    }
    if (prices.length < 2) return 0;
    const slice = prices.slice(-(w + 1));
    const rets = [];
    for (let i = 1; i < slice.length; i++) {
      rets.push(Math.log(slice[i] / slice[i - 1]));
    }
    if (rets.length === 0) return 0;
    if (rets.length === 1) return Math.abs(rets[0]) * Math.sqrt(TRADING_YEAR);
    const mean = rets.reduce((acc, r) => acc + r, 0) / rets.length;
    const sumSq = rets.reduce((acc, r) => acc + (r - mean) * (r - mean), 0);
    const variance = sumSq / (rets.length - 1);
    return Math.sqrt(variance * TRADING_YEAR);
  }
  function hvSeries(closes, window2 = 20) {
    if (!Array.isArray(closes) || !Number.isFinite(window2) || window2 <= 0) return [];
    const w = Math.floor(window2);
    if (w <= 0) return [];
    const valid = [];
    for (let i = 0; i < closes.length; i++) {
      const p = closePrice(closes[i]);
      if (Number.isFinite(p) && p > 0) {
        valid.push({ day: closeDay(closes[i], i), p });
      }
    }
    if (valid.length <= w) return [];
    const series = [];
    for (let i = w; i < valid.length; i++) {
      series.push({
        day: valid[i].day,
        hv: hv(valid.slice(i - w, i + 1), w)
      });
    }
    return series;
  }
  function parseIvHistory(ivHistory) {
    if (!Array.isArray(ivHistory)) return [];
    const vals = [];
    for (let i = 0; i < ivHistory.length; i++) {
      const item = ivHistory[i];
      const raw = typeof item === "number" ? item : item && typeof item === "object" ? item.iv ?? item.v ?? item.p ?? NaN : NaN;
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        vals.push(raw);
      }
    }
    return vals;
  }
  function ivRank(currentIv, ivHistory) {
    if (typeof currentIv !== "number" || !Number.isFinite(currentIv) || currentIv < 0) return null;
    const vals = parseIvHistory(ivHistory);
    if (vals.length < 2) return null;
    let min = vals[0];
    let max = vals[0];
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] < min) min = vals[i];
      if (vals[i] > max) max = vals[i];
    }
    if (max <= min) return null;
    const raw = (currentIv - min) / (max - min);
    return Math.max(0, Math.min(1, raw));
  }
  function probAbove(S2, K, iv, days) {
    if (!Number.isFinite(S2) || S2 <= 0) return 0;
    if (!Number.isFinite(K) || K <= 0) return 1;
    if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(iv) || iv <= 0) {
      if (S2 > K) return 1;
      if (S2 < K) return 0;
      return 0.5;
    }
    const T = days / TRADING_YEAR;
    const volSqrtT = iv * Math.sqrt(T);
    const d2 = (Math.log(S2 / K) - 0.5 * iv * iv * T) / volSqrtT;
    return ncdf(d2);
  }

  // src/ui/analyze-stash.js
  var KEY3 = "oa.analyzeStash";
  function writeAnalyzeStash(payload) {
    try {
      sessionStorage.setItem(KEY3, JSON.stringify({ ...payload, at: Date.now() }));
    } catch {
    }
  }
  function readAnalyzeStash() {
    try {
      const raw = sessionStorage.getItem(KEY3);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.sym || !Array.isArray(data.legs)) return null;
      return data;
    } catch {
      return null;
    }
  }
  function clearAnalyzeStash() {
    try {
      sessionStorage.removeItem(KEY3);
    } catch {
    }
  }
  function takeAnalyzeStash() {
    const data = readAnalyzeStash();
    if (data) clearAnalyzeStash();
    return data;
  }

  // src/ui/views/strategy.js
  var viewState = {};
  var PRESETS = [
    { id: "long-call", name: "Long Call", legs: () => [{ kind: "call", side: 1, qty: 1, k: 0 }] },
    { id: "long-put", name: "Long Put", legs: () => [{ kind: "put", side: 1, qty: 1, k: 0 }] },
    { id: "covered-call", name: "Covered Call", legs: () => [{ kind: "stock", side: 1, qty: 100 }, { kind: "call", side: -1, qty: 1, k: 1 }] },
    { id: "protective-put", name: "Protective Put", legs: () => [{ kind: "stock", side: 1, qty: 100 }, { kind: "put", side: 1, qty: 1, k: -1 }] },
    { id: "csp", name: "Cash-Secured Put", legs: () => [{ kind: "put", side: -1, qty: 1, k: -1 }] },
    { id: "bull-call", name: "Bull Call Spread", legs: () => [{ kind: "call", side: 1, qty: 1, k: 0 }, { kind: "call", side: -1, qty: 1, k: 2 }] },
    { id: "bear-put", name: "Bear Put Spread", legs: () => [{ kind: "put", side: 1, qty: 1, k: 0 }, { kind: "put", side: -1, qty: 1, k: -2 }] },
    { id: "straddle", name: "Long Straddle", legs: () => [{ kind: "call", side: 1, qty: 1, k: 0 }, { kind: "put", side: 1, qty: 1, k: 0 }] },
    { id: "strangle", name: "Long Strangle", legs: () => [{ kind: "call", side: 1, qty: 1, k: 2 }, { kind: "put", side: 1, qty: 1, k: -2 }] },
    { id: "iron-condor", name: "Iron Condor", legs: () => [{ kind: "put", side: 1, qty: 1, k: -4 }, { kind: "put", side: -1, qty: 1, k: -2 }, { kind: "call", side: -1, qty: 1, k: 2 }, { kind: "call", side: 1, qty: 1, k: 4 }] },
    { id: "butterfly", name: "Call Butterfly", legs: () => [{ kind: "call", side: 1, qty: 1, k: -2 }, { kind: "call", side: -2, qty: 1, k: 0 }, { kind: "call", side: 1, qty: 1, k: 2 }] },
    { id: "collar", name: "Collar", legs: () => [{ kind: "stock", side: 1, qty: 100 }, { kind: "put", side: 1, qty: 1, k: -2 }, { kind: "call", side: -1, qty: 1, k: 2 }] }
  ];
  function modelWinOdds(S2, iv, days, valueAtExpiry2, cost) {
    try {
      if (!(S2 > 0) || !(iv > 0) || days == null) return null;
      const lo = S2 * 0.45, hi = S2 * 1.55, N = 160;
      const cuts = [lo];
      let prev = valueAtExpiry2(lo) - cost;
      for (let i = 1; i <= N; i++) {
        const x = lo + (hi - lo) * i / N;
        const y = valueAtExpiry2(x) - cost;
        if (prev <= 0 && y > 0 || prev >= 0 && y < 0) {
          cuts.push(prev === y ? x : x - (hi - lo) / N + (0 - prev) / (y - prev) * ((hi - lo) / N));
        }
        prev = y;
      }
      cuts.push(hi);
      cuts.sort((a, b) => a - b);
      let p = 0;
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1];
        if (!(b > a)) continue;
        const mid = (a + b) / 2;
        if (valueAtExpiry2(mid) - cost <= 0) continue;
        const pa = probAbove(S2, a, iv, days);
        const pb = probAbove(S2, b, iv, days);
        if (pa == null || pb == null) continue;
        p += Math.max(0, pa - pb);
      }
      if (!isFinite(p)) return null;
      return Math.max(0, Math.min(1, p));
    } catch {
      return null;
    }
  }
  var view8 = {
    render(root) {
      let sym = viewState.sym || "LMND";
      let expIdx = 1;
      let legs = [];
      let chart = null;
      let realCtx = null;
      root.appendChild(viewHeader("Strategy Lab", "Build it, see it, trade it"));
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:70ch" },
        "Pick a strategy or build your own legs. The solid line is profit at expiration; the dashed line is the position today (T+0), repriced live as the market ticks. When it looks right, send it to the Live Market as a paper trade."
      ));
      root.appendChild(simDisclaimer());
      const realBanner = el("div", {});
      root.appendChild(realBanner);
      const controls = el("div", { class: "card mt2" });
      const chartCard = el("div", { class: "card mt2" });
      const statsRow = el("div", { class: "stats mt2" });
      const greeksRow = el("div", { class: "card mt2" });
      root.appendChild(controls);
      root.appendChild(statsRow);
      root.appendChild(chartCard);
      root.appendChild(greeksRow);
      const chartBox = el("div", {});
      chartCard.appendChild(el("div", { class: "chart-title" }, "Profit / loss at expiration vs. underlying price"));
      chartCard.appendChild(chartBox);
      legend(chartCard, [
        { name: "At expiration", color: "--s1" },
        { name: "Today (T+0)", color: "--s6" },
        { name: "\xB11\u03C3 / \xB12\u03C3 model cone", color: "--brass" }
      ]);
      chartCard.appendChild(el(
        "p",
        { class: "small muted cone-note", style: "margin:6px 0 0" },
        "Shaded bands are model-implied expected move (\xB11\u03C3 / \xB12\u03C3) \u2014 not a forecast."
      ));
      function spot() {
        if (realCtx) return realCtx.S;
        if (market.tickers[sym]) return market.quote(sym).S;
        return 100;
      }
      function strikeList() {
        if (realCtx || !market.tickers[sym]) {
          const S2 = spot();
          const step = S2 >= 200 ? 5 : S2 >= 50 ? 2.5 : 1;
          const mid = Math.round(S2 / step) * step;
          const out = [];
          for (let i = -8; i <= 8; i++) out.push(+(mid + i * step).toFixed(2));
          for (const L of legs) {
            if (L.strike != null && !out.includes(L.strike)) out.push(L.strike);
          }
          return out.sort((a, b) => a - b);
        }
        return market.strikes(sym);
      }
      function atmStrike2() {
        const S2 = spot();
        const strikes = strikeList();
        return strikes.reduce((a, b) => Math.abs(b - S2) < Math.abs(a - S2) ? b : a);
      }
      function strikeAt(off) {
        const strikes = strikeList();
        const atm = atmStrike2();
        const i = strikes.indexOf(atm);
        return strikes[Math.max(0, Math.min(strikes.length - 1, i + off))];
      }
      function expiry() {
        if (realCtx) return { day: realCtx.dte, label: realCtx.expDate || `${realCtx.dte}d`, dte: realCtx.dte };
        const e = market.expiries(sym);
        return e[Math.min(expIdx, e.length - 1)];
      }
      function posDays() {
        if (realCtx) return Math.max(0, realCtx.dte);
        const exp = expiry();
        return Math.max(0, (exp.day ?? 0) - market.day - market.minute / 390);
      }
      function posIv() {
        if (realCtx) return realCtx.iv || 0.2;
        const t = market.tickers[sym];
        return t?.vol || 0.25;
      }
      function legMid(L) {
        if (L.kind === "stock") return spot();
        if (realCtx || !market.tickers[sym]) return L.entry;
        try {
          return market.optQuote(sym, L.strike, L.expDay, L.kind).mid;
        } catch {
          return L.entry;
        }
      }
      function applyPreset(p) {
        const exp = expiry();
        legs = p.legs().map((L) => {
          if (L.kind === "stock") return { kind: "stock", side: Math.sign(L.side), qty: Math.abs(L.qty), entry: spot() };
          const strike = strikeAt(L.k);
          let entry = 1;
          if (!realCtx && market.tickers[sym]) {
            entry = market.optQuote(sym, strike, exp.day, L.kind).mid;
          } else {
            const iv = posIv();
            const dte = Math.max(0.01, posDays());
            entry = price({ S: spot(), K: strike, T: dte / 252, v: iv, r: 0.04, type: L.kind });
          }
          return { kind: L.kind, side: Math.sign(L.side), qty: Math.abs(L.side) * (L.qty ?? 1), strike, expDay: exp.day, entry };
        });
        drawAll();
      }
      function clearRealCtx() {
        realCtx = null;
        realBanner.innerHTML = "";
        tradeBtn.disabled = false;
        tradeBtn.title = "";
        fillSymOptions();
        fillExp();
        drawAll();
      }
      const symSel = el("select", {});
      function fillSymOptions() {
        symSel.innerHTML = "";
        for (const t of market.list()) {
          symSel.appendChild(el("option", { value: t.sym, selected: t.sym === sym }, `${t.sym} \u2014 ${t.name} (${F.usd(t.S)})`));
        }
        if (realCtx && ![...symSel.options].some((o) => o.value === sym)) {
          symSel.appendChild(el("option", { value: sym, selected: true }, `${sym} \u2014 real (delayed)`));
        }
      }
      fillSymOptions();
      symSel.addEventListener("change", () => {
        sym = symSel.value;
        viewState.sym = sym;
        if (realCtx && sym !== realCtx._sym) clearRealCtx();
        legs = [];
        drawAll();
      });
      const expSel = el("select", {});
      function fillExp() {
        expSel.innerHTML = "";
        if (realCtx) {
          expSel.appendChild(el("option", { value: 0, selected: true }, realCtx.expDate || `${realCtx.dte} DTE`));
          expSel.disabled = true;
          return;
        }
        expSel.disabled = false;
        if (!market.tickers[sym]) return;
        market.expiries(sym).forEach((e, i) => expSel.appendChild(el("option", { value: i, selected: i === expIdx }, e.label)));
      }
      fillExp();
      expSel.addEventListener("change", () => {
        expIdx = +expSel.value;
        legs = [];
        drawAll();
      });
      const presetSel = el("select", {});
      presetSel.appendChild(el("option", { value: "" }, "Choose a strategy\u2026"));
      PRESETS.forEach((p) => presetSel.appendChild(el("option", { value: p.id }, p.name)));
      presetSel.addEventListener("change", () => {
        const p = PRESETS.find((x) => x.id === presetSel.value);
        if (p) applyPreset(p);
      });
      const legsBox = el("div", { class: "mt2" });
      const addLegBtn = el("button", { class: "btn sm", onclick: () => {
        const exp = expiry();
        const strike = atmStrike2();
        let entry = 1;
        if (!realCtx && market.tickers[sym]) entry = market.optQuote(sym, strike, exp.day, "call").mid;
        else {
          const dte = Math.max(0.01, posDays());
          entry = price({ S: spot(), K: strike, T: dte / 252, v: posIv(), r: 0.04, type: "call" });
        }
        legs.push({ kind: "call", side: 1, qty: 1, strike, expDay: exp.day, entry });
        drawAll();
      } }, "+ Add leg");
      const clearBtn = el("button", { class: "btn sm", onclick: () => {
        legs = [];
        presetSel.value = "";
        if (realCtx) clearRealCtx();
        else drawAll();
      } }, "Clear");
      const tradeBtn = el("button", { class: "btn primary", onclick: () => {
        if (!legs.length || realCtx) return;
        if (!market.tickers[sym]) {
          toast("Switch to a sim symbol to paper-trade.", "loss");
          return;
        }
        const label = presetSel.value ? PRESETS.find((p) => p.id === presetSel.value).name : "Custom strategy";
        const fillLegs = legs.map((L) => {
          if (L.kind === "stock") return { ...L, entry: market.quote(sym).S };
          const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
          return { ...L, entry: L.side > 0 ? q.ask : q.bid };
        });
        const res = openPosition(sym, fillLegs, label);
        if (res.err) {
          toast(res.err, "loss");
          return;
        }
        toast(`Opened ${label} on ${sym}. Watch it in the Live Market.`, "gain");
        addXP(15, "strategy deployed");
      } }, "Send to Live Market");
      controls.appendChild(el(
        "div",
        { class: "row" },
        el("div", { class: "field", style: "flex:2 1 220px" }, el("label", {}, "Underlying"), symSel),
        el("div", { class: "field", style: "flex:1 1 150px" }, el("label", {}, "Expiration"), expSel),
        el("div", { class: "field", style: "flex:1 1 180px" }, el("label", {}, "Preset strategy"), presetSel)
      ));
      controls.appendChild(legsBox);
      controls.appendChild(el("div", { class: "btn-row mt1" }, addLegBtn, clearBtn, tradeBtn));
      function renderLegs() {
        legsBox.innerHTML = "";
        if (!legs.length) {
          legsBox.appendChild(el("p", { class: "small muted" }, "No legs yet \u2014 pick a preset or add legs manually."));
          return;
        }
        const strikes = strikeList();
        const tbl = el("table", { class: "oa" });
        tbl.appendChild(el("thead", {}, el(
          "tr",
          {},
          el("th", {}, "Side"),
          el("th", {}, "Qty"),
          el("th", {}, "Type"),
          el("th", {}, "Strike"),
          el("th", {}, "Mid now"),
          el("th", {}, "")
        )));
        const tb = el("tbody", {});
        legs.forEach((L, i) => {
          const sideSel = el(
            "select",
            {},
            el("option", { value: "1", selected: L.side > 0 }, "Buy"),
            el("option", { value: "-1", selected: L.side < 0 }, "Sell")
          );
          sideSel.addEventListener("change", () => {
            L.side = +sideSel.value;
            drawAll();
          });
          const qtyIn = el("input", { type: "number", min: "1", value: L.qty, style: "width:64px" });
          qtyIn.addEventListener("change", () => {
            L.qty = Math.max(1, +qtyIn.value || 1);
            drawAll();
          });
          const kindSel = el(
            "select",
            {},
            el("option", { value: "call", selected: L.kind === "call" }, "Call"),
            el("option", { value: "put", selected: L.kind === "put" }, "Put"),
            el("option", { value: "stock", selected: L.kind === "stock" }, "Stock")
          );
          kindSel.addEventListener("change", () => {
            L.kind = kindSel.value;
            if (L.kind === "stock") {
              L.qty = Math.max(1, Math.round(L.qty / 1) * 100);
              delete L.strike;
              L.entry = spot();
            } else if (!L.strike) {
              L.strike = strikes[Math.floor(strikes.length / 2)];
              L.expDay = expiry().day;
            }
            drawAll();
          });
          let strikeSel = el("span", { class: "muted" }, "\u2014");
          if (L.kind !== "stock") {
            strikeSel = el("select", {});
            const opts = strikes.slice();
            if (L.strike != null && !opts.includes(L.strike)) opts.push(L.strike);
            opts.sort((a, b) => a - b).forEach((k) => strikeSel.appendChild(el("option", { value: k, selected: k === L.strike }, F.usd(k, 2))));
            strikeSel.addEventListener("change", () => {
              L.strike = +strikeSel.value;
              drawAll();
            });
          }
          const mid = legMid(L);
          const rm = el("button", { class: "btn sm", onclick: () => {
            legs.splice(i, 1);
            drawAll();
          } }, "\u2715");
          tb.appendChild(el(
            "tr",
            {},
            el("td", {}, sideSel),
            el("td", {}, qtyIn),
            el("td", {}, kindSel),
            el("td", {}, strikeSel),
            el("td", { class: "num" }, F.usd(mid)),
            el("td", {}, rm)
          ));
        });
        tbl.appendChild(tb);
        legsBox.appendChild(el("div", { class: "tbl-wrap" }, tbl));
      }
      const mult4 = (L) => L.kind === "stock" ? 1 : 100;
      function entryCost2() {
        return legs.reduce((s2, L) => s2 + L.side * L.qty * mult4(L) * L.entry, 0);
      }
      function valueAtExpiry2(x) {
        return legs.reduce((s2, L) => {
          const v = L.kind === "stock" ? x : L.kind === "call" ? Math.max(0, x - L.strike) : Math.max(0, L.strike - x);
          return s2 + L.side * L.qty * mult4(L) * v;
        }, 0);
      }
      function valueT0(x) {
        const exp = expiry();
        const days = Math.max(0.01, posDays());
        const flatIv = posIv();
        return legs.reduce((s2, L) => {
          if (L.kind === "stock") return s2 + L.side * L.qty * x;
          if (realCtx || !market.tickers[sym]) {
            const px2 = price({ S: x, K: L.strike, T: days / 252, v: flatIv, r: 0.04, type: L.kind });
            return s2 + L.side * L.qty * 100 * px2;
          }
          const t = market.tickers[sym];
          const dte = Math.max(0.01, (L.expDay ?? exp.day) - market.day - market.minute / 390);
          const iv = market.smileIV({ ...t, S: x }, L.strike, dte);
          const px = price({ S: x, K: L.strike, T: dte / 252, v: iv, r: 0.04, type: L.kind });
          return s2 + L.side * L.qty * 100 * px;
        }, 0);
      }
      function drawAll() {
        fillExp();
        renderLegs();
        statsRow.innerHTML = "";
        greeksRow.innerHTML = "";
        if (!legs.length) {
          chartBox.innerHTML = "";
          chart = null;
          return;
        }
        const S2 = spot();
        const cost = entryCost2();
        const lo = S2 * 0.7, hi = S2 * 1.3, N = 120;
        const expPts = [], t0Pts = [];
        for (let i = 0; i <= N; i++) {
          const x = lo + (hi - lo) * i / N;
          expPts.push({ x, y: valueAtExpiry2(x) - cost });
          t0Pts.push({ x, y: valueT0(x) - cost });
        }
        const bes = [];
        for (let i = 1; i < expPts.length; i++) {
          const a = expPts[i - 1], b = expPts[i];
          if (a.y <= 0 && b.y > 0 || a.y >= 0 && b.y < 0) {
            bes.push(a.x + (0 - a.y) / (b.y - a.y) * (b.x - a.x));
          }
        }
        const maxP = Math.max(...expPts.map((p) => p.y)), minP = Math.min(...expPts.map((p) => p.y));
        const slopeR = expPts[N].y - expPts[N - 1].y, slopeL = expPts[0].y - expPts[1].y;
        const maxLabel = slopeR > 0.5 ? "Unlimited \u2197" : F.usd(maxP, 0);
        const minLabel = slopeR < -0.5 || slopeL < -0.5 ? minP < 0 ? F.usd(minP, 0) + " (and falling)" : F.usd(minP, 0) : F.usd(minP, 0);
        const days = posDays();
        const iv = posIv();
        let vbands = [];
        try {
          const cone = coneBands(S2, iv, [Math.max(0, days)], [1, 2]);
          const bands = cone?.[0]?.bands || [];
          const b2 = bands.find((b) => b.sigma === 2);
          const b1 = bands.find((b) => b.sigma === 1);
          if (b2) vbands.push({ lo: b2.lo, hi: b2.hi, color: "--brass-soft", opacity: 0.55 });
          if (b1) vbands.push({ lo: b1.lo, hi: b1.hi, color: "--brass-ring", opacity: 0.4 });
        } catch {
          vbands = [];
        }
        const opts = {
          height: 300,
          series: [
            { name: "At expiration", color: "--s1", points: expPts, width: 2.4, area: "pnl" },
            { name: "Today (T+0)", color: "--s6", points: t0Pts, dash: true }
          ],
          zeroLine: true,
          fmtX: (x) => F.usd(x, 0),
          fmtY: (y) => F.usd(y, 0),
          vlines: [
            { x: S2, label: "now " + F.usd(S2), color: "--ink-3" },
            ...bes.map((b) => ({ x: b, label: "BE " + F.usd(b), color: "--s4" }))
          ],
          vbands,
          tipLabel: sym + " @ "
        };
        if (!chart) chart = line(chartBox, opts);
        else chart.update(opts);
        const stat = (k, v, cls = "") => el("div", { class: "stat" }, el("div", { class: "k" }, k), el("div", { class: "v " + cls }, v));
        statsRow.appendChild(stat(cost >= 0 ? "Net debit" : "Net credit", F.usd(Math.abs(cost))));
        statsRow.appendChild(stat("Max profit", maxLabel, "up"));
        statsRow.appendChild(stat("Max loss", minLabel, "down"));
        statsRow.appendChild(stat("Breakeven" + (bes.length > 1 ? "s" : ""), bes.length ? bes.map((b) => F.usd(b, 2)).join(" \xB7 ") : "\u2014"));
        const pop = modelWinOdds(S2, iv, days, valueAtExpiry2, cost);
        statsRow.appendChild(el(
          "div",
          { class: "stat pop-stat" },
          el("div", { class: "k" }, "Model-implied win odds"),
          el("div", { class: "v num" }, pop == null ? "\u2014" : F.pct(pop, 0)),
          el("div", { class: "small muted", style: "margin-top:4px" }, "Not a forecast \u2014 risk-neutral model only.")
        ));
        let g = { delta: 0, gamma: 0, theta: 0, vega: 0 };
        for (const L of legs) {
          if (L.kind === "stock") {
            g.delta += L.side * L.qty;
            continue;
          }
          if (realCtx || !market.tickers[sym]) {
            const dte = Math.max(0.01, posDays());
            const gk = greeks({ S: S2, K: L.strike, T: dte / 252, v: iv, r: 0.04, type: L.kind });
            g.delta += L.side * L.qty * 100 * gk.delta;
            g.gamma += L.side * L.qty * 100 * gk.gamma;
            g.theta += L.side * L.qty * 100 * gk.theta;
            g.vega += L.side * L.qty * 100 * gk.vega;
            continue;
          }
          const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
          g.delta += L.side * L.qty * 100 * q.delta;
          g.gamma += L.side * L.qty * 100 * q.gamma;
          g.theta += L.side * L.qty * 100 * q.theta;
          g.vega += L.side * L.qty * 100 * q.vega;
        }
        greeksRow.appendChild(el("h3", {}, realCtx ? "Position Greeks (model)" : "Position Greeks (live)"));
        greeksRow.appendChild(el(
          "div",
          { class: "pos-greeks" },
          el("span", {}, `\u0394 Delta ${F.num(g.delta, 1)} sh`),
          el("span", {}, `\u0393 Gamma ${F.num(g.gamma, 2)}`),
          el("span", {}, `\u0398 Theta ${F.usdSigned(g.theta)}/day`),
          el("span", {}, `\u03BD Vega ${F.usdSigned(g.vega)}/vol pt`)
        ));
        greeksRow.appendChild(el(
          "p",
          { class: "small muted", style: "margin-bottom:0" },
          "Delta: share-equivalent direction. Theta: what a day of time costs (or pays) you. Vega: P&L for a 1-point implied-vol move."
        ));
      }
      const stash = takeAnalyzeStash();
      if (stash && stash.legs?.length) {
        sym = stash.sym;
        viewState.sym = sym;
        realCtx = {
          S: stash.S,
          iv: stash.iv || 0.2,
          dte: stash.dte || 21,
          expDate: stash.expDate,
          label: stash.label,
          _sym: stash.sym
        };
        legs = stash.legs.map((L) => ({ ...L }));
        tradeBtn.disabled = true;
        tradeBtn.title = "Paper fills stay on Sim feed";
        realBanner.appendChild(el(
          "div",
          { class: "oa-banner info mt1" },
          el("div", { style: "font-weight:700" }, `Prefill from Real Market \xB7 ${sym}`),
          el(
            "p",
            { class: "sub", style: "margin:4px 0 0" },
            stash.label || "Legs loaded with delayed mids. Math is educational \u2014 not a trade ticket."
          ),
          el("button", { class: "btn sm mt1", type: "button", onclick: clearRealCtx }, "Clear real prefill")
        ));
        fillSymOptions();
      }
      drawAll();
      let n = 0;
      const unTick = market.on("tick", () => {
        if (++n % 3 === 0 && legs.length && !realCtx) drawAll();
      });
      return () => {
        unTick();
        chart && chart.destroy();
      };
    }
  };

  // src/ui/views/greeks.js
  var TABS = [
    {
      id: "delta",
      name: "\u0394 Delta",
      blurb: 'Delta is how much the option price moves per $1 move in the stock \u2014 and your share-equivalent exposure. Calls: 0 to 1. Puts: 0 to \u22121. It also works as a rough "probability of finishing in-the-money."',
      tryIt: 'Drag days-to-expiry down to 2. Watch delta turn into a cliff near the strike \u2014 tiny stock moves now flip the option between "worthless" and "stock-like."'
    },
    {
      id: "gamma",
      name: "\u0393 Gamma",
      blurb: "Gamma is how fast delta itself changes. It peaks at-the-money and explodes as expiration nears. Long options = long gamma (deltas move your way). Short options = short gamma (deltas move against you).",
      tryIt: "Compare the three curves: same strike, different expirations. Near expiry, gamma concentrates into a spike at the strike \u2014 this is why the last week feels wild."
    },
    {
      id: "theta",
      name: "\u0398 Theta",
      blurb: "Theta is the rent: how much value an option loses per day just from time passing. It is the price you pay for gamma. Decay is slow far from expiry and accelerates into the end \u2014 especially at-the-money.",
      tryIt: "Watch the at-the-money curve vs. the out-of-the-money curve. The ATM option holds value longer, then melts fastest in the final weeks."
    },
    {
      id: "vega",
      name: "\u03BD Vega",
      blurb: "Vega is your P&L per 1-point change in implied volatility. Longer-dated and at-the-money options have the most vega. Buying options = long vega (vol rising helps you); selling = short vega.",
      tryIt: "Note how the 60-day curve towers over the 5-day curve: if you want to trade a volatility opinion, you trade time. If you want pure gamma, you trade the short end."
    }
  ];
  var view9 = {
    render(root) {
      let tab = "delta";
      const P2 = { K: 100, dte: 30, iv: 0.3 };
      let chart = null;
      root.appendChild(el("div", { class: "eyebrow" }, "Greeks Lab"));
      root.appendChild(el("h1", {}, "The dashboard dials of every option"));
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:70ch" },
        "Model stock XYZ trades at $100. Move the sliders and watch each Greek respond \u2014 this is the intuition your brothers price risk with."
      ));
      const tabRow = el("div", { class: "seg mt2", role: "tablist" });
      const blurbEl = el("p", { class: "sub mt2", style: "max-width:70ch" });
      const card = el("div", { class: "card mt2" });
      const chartBox = el("div", {});
      const legendBox = el("div", {});
      const sliders = el("div", { class: "mt2", style: "max-width:560px" });
      const tiles = el("div", { class: "stats mt2" });
      const tryEl = el("div", { class: "apply-card mt2", style: "max-width:70ch" });
      card.appendChild(chartBox);
      card.appendChild(legendBox);
      root.appendChild(tabRow);
      root.appendChild(blurbEl);
      root.appendChild(card);
      root.appendChild(sliders);
      root.appendChild(tiles);
      root.appendChild(tryEl);
      const btns = {};
      for (const t of TABS) {
        btns[t.id] = el("button", { class: t.id === tab ? "on" : "", role: "tab", onclick: () => {
          tab = t.id;
          update();
        } }, t.name);
        tabRow.appendChild(btns[t.id]);
      }
      function slider(label, min, max, step, get2, set, fmt) {
        const input = el("input", { type: "range", min, max, step, value: get2() });
        const val = el("span", { class: "val" }, fmt(get2()));
        input.addEventListener("input", () => {
          set(+input.value);
          val.textContent = fmt(get2());
          update(false);
        });
        return el("div", { class: "slider-row" }, el("label", {}, label), input, val);
      }
      sliders.appendChild(slider("Strike K", 70, 130, 1, () => P2.K, (v) => P2.K = v, (v) => F.usd(v, 0)));
      sliders.appendChild(slider("Days to expiry", 1, 90, 1, () => P2.dte, (v) => P2.dte = v, (v) => v + "d"));
      sliders.appendChild(slider("Implied vol", 0.08, 0.8, 0.01, () => P2.iv, (v) => P2.iv = v, (v) => F.pct(v, 0)));
      const xs = [];
      for (let s2 = 60; s2 <= 140; s2 += 1) xs.push(s2);
      const T = (d) => d / 365;
      function seriesFor() {
        const base = { S: 100, K: P2.K, r: 0.04 };
        if (tab === "delta") return {
          series: [
            { name: "Call delta", color: "--s1", points: xs.map((x) => ({ x, y: greeks({ ...base, S: x, T: T(P2.dte), v: P2.iv, type: "call" }).delta })) },
            { name: "Put delta", color: "--s2", points: xs.map((x) => ({ x, y: greeks({ ...base, S: x, T: T(P2.dte), v: P2.iv, type: "put" }).delta })) }
          ],
          fmtY: (y) => y.toFixed(2),
          zeroLine: true,
          yLabel: "delta"
        };
        if (tab === "gamma") return {
          series: [30, 10, 2].map((d, i) => ({
            name: `${d}-day gamma`,
            color: ["--s1", "--s2", "--s3"][i],
            points: xs.map((x) => ({ x, y: greeks({ ...base, S: x, T: T(d), v: P2.iv, type: "call" }).gamma }))
          })),
          fmtY: (y) => y.toFixed(3),
          zeroLine: false
        };
        if (tab === "theta") {
          const days = [];
          for (let d = Math.max(60, P2.dte); d >= 1; d--) days.push(d);
          return {
            series: [
              { name: "At-the-money ($100 strike)", color: "--s1", points: days.map((d) => ({ x: -d, y: price({ S: 100, K: 100, T: T(d), v: P2.iv, r: 0.04, type: "call" }) })) },
              { name: `Out-of-the-money ($${Math.round(110)} strike)`, color: "--s2", points: days.map((d) => ({ x: -d, y: price({ S: 100, K: 110, T: T(d), v: P2.iv, r: 0.04, type: "call" }) })) }
            ],
            fmtX: (x) => Math.round(-x) + "d",
            fmtY: (y) => F.usd(y),
            zeroLine: true,
            tip: "days to expiry"
          };
        }
        return {
          series: [60, 20, 5].map((d, i) => ({
            name: `${d}-day vega`,
            color: ["--s1", "--s2", "--s3"][i],
            points: xs.map((x) => ({ x, y: greeks({ ...base, S: x, T: T(d), v: P2.iv, type: "call" }).vega }))
          })),
          fmtY: (y) => F.usd(y),
          zeroLine: false
        };
      }
      function update(retab = true) {
        if (retab) for (const t2 of TABS) btns[t2.id].classList.toggle("on", t2.id === tab);
        const t = TABS.find((x) => x.id === tab);
        blurbEl.textContent = t.blurb;
        tryEl.innerHTML = "";
        tryEl.appendChild(icon("search", { cls: "ic" }));
        tryEl.appendChild(el("div", {}, el("div", { style: "font-weight:700" }, "Try this"), el("div", { class: "sub" }, t.tryIt)));
        const cfg = seriesFor();
        const opts = {
          height: 300,
          series: cfg.series,
          zeroLine: cfg.zeroLine,
          fmtX: cfg.fmtX || ((x) => F.usd(x, 0)),
          fmtY: cfg.fmtY,
          vlines: tab === "theta" ? [] : [{ x: P2.K, label: "strike", color: "--s4" }, { x: 100, label: "spot $100", color: "--ink-3" }],
          tipLabel: tab === "theta" ? "T\u2212" : "XYZ @ "
        };
        if (!chart) chart = line(chartBox, opts);
        else chart.update(opts);
        legend(legendBox, cfg.series.map((s2) => ({ name: s2.name, color: s2.color })));
        const g = greeks({ S: 100, K: P2.K, T: T(P2.dte), v: P2.iv, r: 0.04, type: "call" });
        tiles.innerHTML = "";
        const tile = (k, v, d) => el("div", { class: "stat" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v), el("div", { class: "d muted" }, d));
        tiles.appendChild(tile("Call price", F.usd(g.price), `K=${F.usd(P2.K, 0)}, ${P2.dte}d, ${F.pct(P2.iv, 0)} IV`));
        tiles.appendChild(tile("Delta", g.delta.toFixed(2), "per $1 stock move"));
        tiles.appendChild(tile("Gamma", g.gamma.toFixed(4), "delta gained per $1"));
        tiles.appendChild(tile("Theta", F.usd(g.theta), "per day (\xD7100/contract)"));
        tiles.appendChild(tile("Vega", F.usd(g.vega), "per 1 vol pt (\xD7100)"));
      }
      update();
      return () => {
        chart && chart.destroy();
      };
    }
  };

  // src/ui/views/vol.js
  var randn = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  function runScalp(ivPaid, rv, days, hedgeEvery) {
    const K = 100, r = 0.04;
    let S2 = 100;
    const T0 = days / 365;
    const px = (type, s2, t2) => price({ S: s2, K, T: Math.max(t2, 1e-4), v: ivPaid, r, type });
    const del = (type, s2, t2) => greeks({ S: s2, K, T: Math.max(t2, 1e-4), v: ivPaid, r, type }).delta;
    const straddle0 = px("call", S2, T0) + px("put", S2, T0);
    let shares = -(del("call", S2, T0) + del("put", S2, T0)) * 100;
    let cash = -shares * S2;
    const path = [{ x: 0, y: 0 }], spot = [{ x: 0, y: S2 }];
    for (let d = 1; d <= days; d++) {
      const dt = 1 / 365;
      S2 *= Math.exp(-0.5 * rv * rv * dt + rv * Math.sqrt(dt) * randn());
      const t2 = T0 - d / 365;
      if (d % hedgeEvery === 0 || d === days) {
        const target = -(del("call", S2, t2) + del("put", S2, t2)) * 100;
        cash -= (target - shares) * S2;
        shares = target;
      }
      const optVal = (px("call", S2, t2) + px("put", S2, t2)) * 100;
      const pnl = optVal + shares * S2 + cash - straddle0 * 100;
      path.push({ x: d, y: pnl });
      spot.push({ x: d, y: S2 });
    }
    const t = 1e-4;
    const optEnd = (px("call", S2, t) + px("put", S2, t)) * 100;
    return {
      path,
      spot,
      total: path[path.length - 1].y,
      optionPnl: optEnd - straddle0 * 100,
      hedgePnl: shares * S2 + cash,
      cost: straddle0 * 100
    };
  }
  var view10 = {
    render(root) {
      root.appendChild(el("div", { class: "eyebrow" }, "Volatility Lab"));
      root.appendChild(el("h1", {}, "Trade movement itself"));
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:70ch" },
        "When you buy an option you pay a price in **implied volatility**; what you receive is the stock's **realized volatility**. Delta-hedge the direction away, and what remains is a pure bet: did the stock move more or less than the price you paid?".replace(/\*\*(.+?)\*\*/g, "$1")
      ));
      root.appendChild(simDisclaimer());
      const card = el("div", { class: "card mt2" });
      root.appendChild(card);
      card.appendChild(el("h2", {}, "Gamma scalping simulator"));
      card.appendChild(el(
        "p",
        { class: "sub", style: "max-width:70ch" },
        "You buy a 30-day at-the-money straddle on a $100 stock and keep it delta-neutral. The solid line is your running P&L. Set realized vol above the implied vol you paid and watch hedging grind out profits; set it below and watch theta eat you."
      ));
      const P2 = { iv: 0.25, rv: 0.4, hedge: 1 };
      const sliderBox = el("div", { style: "max-width:560px" });
      card.appendChild(sliderBox);
      function slider(label, min, max, step, get2, set, fmt) {
        const input = el("input", { type: "range", min, max, step, value: get2() });
        const val = el("span", { class: "val" }, fmt(get2()));
        input.addEventListener("input", () => {
          set(+input.value);
          val.textContent = fmt(get2());
          rerun();
        });
        return el("div", { class: "slider-row" }, el("label", {}, label), input, val);
      }
      sliderBox.appendChild(slider("IV you pay", 0.1, 0.6, 0.01, () => P2.iv, (v) => P2.iv = v, (v) => F.pct(v, 0)));
      sliderBox.appendChild(slider("Realized vol", 0.05, 0.8, 0.01, () => P2.rv, (v) => P2.rv = v, (v) => F.pct(v, 0)));
      sliderBox.appendChild(slider("Hedge every", 1, 5, 1, () => P2.hedge, (v) => P2.hedge = v, (v) => v + (v === 1 ? " day" : " days")));
      const edge = el("div", { class: "pill mt1" });
      card.appendChild(edge);
      const chartBox = el("div", { class: "mt2" });
      card.appendChild(el("div", { class: "chart-title mt2" }, "Cumulative P&L of the hedged straddle (one 30-day path)"));
      card.appendChild(chartBox);
      legend(card, [{ name: "Hedged straddle P&L", color: "--s1" }, { name: "Stock price (right-hand feel \u2014 hover for values)", color: "--s6" }]);
      const tiles = el("div", { class: "stats mt2" });
      card.appendChild(tiles);
      const btnRow = el("div", { class: "btn-row mt2" });
      card.appendChild(btnRow);
      let chart = null;
      function rerun() {
        const r = runScalp(P2.iv, P2.rv, 30, P2.hedge);
        const spotNorm = r.spot.map((p) => ({ x: p.x, y: (p.y - 100) * 10 }));
        const opts = {
          height: 280,
          series: [
            { name: "P&L", color: "--s1", points: r.path, width: 2.4, area: "pnl" },
            { name: "Stock (shape)", color: "--s6", points: spotNorm, dash: true, width: 1.5 }
          ],
          zeroLine: true,
          fmtX: (x) => "d" + Math.round(x),
          fmtY: (y) => F.usd(y, 0),
          tipLabel: "day "
        };
        if (!chart) chart = line(chartBox, opts);
        else chart.update(opts);
        tiles.innerHTML = "";
        const tile = (k, v, cls) => el("div", { class: "stat" }, el("div", { class: "k" }, k), el("div", { class: "v" + (cls ? " " + cls : "") }, v));
        tiles.appendChild(tile("Straddle cost", F.usd(r.cost, 0)));
        tiles.appendChild(tile("Option P&L (mostly \u2212theta)", F.usdSigned(r.optionPnl, 0), r.optionPnl >= 0 ? "up" : "down"));
        tiles.appendChild(tile("Hedging P&L (gamma scalps)", F.usdSigned(r.hedgePnl, 0), r.hedgePnl >= 0 ? "up" : "down"));
        tiles.appendChild(tile("Total", F.usdSigned(r.total, 0), r.total >= 0 ? "up" : "down"));
        const diff = P2.rv - P2.iv;
        edge.textContent = diff > 0.02 ? `Edge: realized ${F.pct(P2.rv, 0)} > implied ${F.pct(P2.iv, 0)} \u2014 long gamma should win on average` : diff < -0.02 ? `Edge: realized ${F.pct(P2.rv, 0)} < implied ${F.pct(P2.iv, 0)} \u2014 you overpaid; theta should win` : "Fair fight: realized \u2248 implied \u2014 expect P&L near zero on average";
        edge.className = "pill mt1 " + (diff > 0.02 ? "gain" : diff < -0.02 ? "loss" : "");
      }
      btnRow.appendChild(el("button", { class: "btn primary", onclick: rerun }, "Run another path"));
      const trialBtn = el("button", { class: "btn" }, "Run 60 trials");
      const trialOut = el("span", { class: "small muted num" });
      btnRow.appendChild(trialBtn);
      btnRow.appendChild(trialOut);
      trialBtn.addEventListener("click", () => {
        let sum = 0, wins = 0;
        const N = 60;
        for (let i = 0; i < N; i++) {
          const r = runScalp(P2.iv, P2.rv, 30, P2.hedge);
          sum += r.total;
          if (r.total > 0) wins++;
        }
        trialOut.textContent = ` avg P&L ${F.usdSigned(sum / N, 0)} \xB7 win rate ${Math.round(wins / N * 100)}% over ${N} paths`;
        addXP(10, "volatility experiment");
      });
      rerun();
      const smileCard = el("div", { class: "card mt2" });
      root.appendChild(smileCard);
      smileCard.appendChild(el("h2", {}, "The volatility smile"));
      smileCard.appendChild(el(
        "p",
        { class: "sub", style: "max-width:70ch" },
        'In real markets, not every strike trades at the same implied vol. Downside puts usually cost extra vol \u2014 they are crash insurance, and insurance against disasters carries a premium. The slope is "skew"; the curvature is the "smile."'
      ));
      const SP = { atm: 0.22, skew: 0.15, curv: 0.5 };
      const smileSliders = el("div", { style: "max-width:560px" });
      smileCard.appendChild(smileSliders);
      const smileBox = el("div", { class: "mt2" });
      smileCard.appendChild(smileBox);
      let smileChart = null;
      function drawSmile() {
        const pts = [];
        for (let k = 60; k <= 140; k += 2) {
          const m = Math.log(k / 100);
          pts.push({ x: k, y: Math.max(0.05, SP.atm - SP.skew * m * 2 + SP.curv * m * m * 3) });
        }
        const opts = {
          height: 240,
          series: [{ name: "Implied vol by strike", color: "--s1", points: pts, width: 2.4 }],
          fmtX: (x) => F.usd(x, 0),
          fmtY: (y) => F.pct(y, 0),
          vlines: [{ x: 100, label: "spot $100", color: "--ink-3" }],
          tipLabel: "strike "
        };
        if (!smileChart) smileChart = line(smileBox, opts);
        else smileChart.update(opts);
      }
      function sslider(label, min, max, step, get2, set, fmt) {
        const input = el("input", { type: "range", min, max, step, value: get2() });
        const val = el("span", { class: "val" }, fmt(get2()));
        input.addEventListener("input", () => {
          set(+input.value);
          val.textContent = fmt(get2());
          drawSmile();
        });
        return el("div", { class: "slider-row" }, el("label", {}, label), input, val);
      }
      smileSliders.appendChild(sslider("ATM vol", 0.1, 0.5, 0.01, () => SP.atm, (v) => SP.atm = v, (v) => F.pct(v, 0)));
      smileSliders.appendChild(sslider("Skew (fear)", 0, 0.4, 0.01, () => SP.skew, (v) => SP.skew = v, (v) => v.toFixed(2)));
      smileSliders.appendChild(sslider("Smile (tails)", 0, 1.5, 0.05, () => SP.curv, (v) => SP.curv = v, (v) => v.toFixed(2)));
      drawSmile();
      smileCard.appendChild(el(
        "div",
        { class: "apply-card mt2", style: "max-width:70ch" },
        icon("search", { cls: "ic" }),
        el(
          "div",
          {},
          el("div", { style: "font-weight:700" }, "Try this"),
          el("div", { class: "sub" }, 'Crank "Skew (fear)" to the max \u2014 that is what markets look like after a crash scare: puts bid, calls cheap. Then open the Live Market and compare IVs across the option chain of FAM500 vs. RCKT.')
        )
      ));
      return () => {
        chart && chart.destroy();
        smileChart && smileChart.destroy();
      };
    }
  };

  // src/engine/tradier.js
  var BASE = "https://sandbox.tradier.com/v1";
  var DAY_MS = 864e5;
  var TradierError = class extends Error {
    /** @param {ErrorKind} kind @param {string} message */
    constructor(kind, message) {
      super(message);
      this.name = "TradierError";
      this.kind = kind;
    }
  };
  function numeric(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  var num = (value) => numeric(value) ?? 0;
  var rows = (value) => value == null || value === "null" ? [] : Array.isArray(value) ? value : [value];
  function optionQuote(option) {
    const bid = numeric(option.bid), ask = numeric(option.ask);
    const g = option.greeks || {};
    return {
      bid: bid ?? 0,
      ask: ask ?? 0,
      mid: num(bid !== null && ask !== null ? bid / 2 + ask / 2 : num(option.last)),
      iv: num(g.mid_iv),
      delta: num(g.delta),
      gamma: num(g.gamma),
      // Tradier theta is per calendar day; the sim uses per trading day (252/year).
      theta: num(g.theta),
      vega: num(g.vega),
      oi: num(option.open_interest),
      volume: num(option.volume)
    };
  }
  function createTradier({ key, fetchImpl = fetch, now = () => (/* @__PURE__ */ new Date()).getTime() }) {
    const pending = /* @__PURE__ */ new Map();
    let ready = Promise.resolve();
    function request(path, params) {
      const url = `${BASE}/markets/${path}?${new URLSearchParams(params)}`;
      const existing = pending.get(url);
      if (existing) return existing;
      const turn = ready;
      ready = turn.then(() => new Promise((resolve2) => setTimeout(resolve2, 250)));
      const result = turn.then(async () => {
        if (!key?.trim()) throw new TradierError("auth", "Enter a Tradier sandbox API key.");
        try {
          const response = await fetchImpl(url, {
            headers: { Authorization: `Bearer ${key.trim()}`, Accept: "application/json" }
          });
          if (response.status === 401 || response.status === 403) {
            throw new TradierError("auth", "Check your Tradier sandbox API key.");
          }
          if (response.status === 429) throw new TradierError("rate", "Tradier rate limit reached. Try again shortly.");
          if (!response.ok) throw new TradierError("network", "Tradier request failed. Check your connection; corporate networks may block Tradier.");
          const data = await response.json();
          if (data?.fault || data?.errors) throw new TradierError("network", "Tradier could not return data. Check your connection; corporate networks may block Tradier.");
          return data;
        } catch (error) {
          if (error instanceof TradierError) throw error;
          throw new TradierError("network", "Unable to read Tradier data. Check your connection; corporate networks or browser CORS restrictions may block Tradier.");
        }
      });
      pending.set(url, result);
      void result.then(() => pending.delete(url), () => pending.delete(url));
      return result;
    }
    return {
      /** @param {string} sym */
      async quote(sym) {
        const symbol = sym.trim().toUpperCase();
        const data = await request("quotes", { symbols: symbol });
        const q = rows(data?.quotes?.quote).find((q2) => q2?.symbol === symbol);
        if (!q) throw new TradierError("symbol", `No Tradier quote found for ${symbol}.`);
        const S2 = num(q.last), prevClose = num(q.prevclose);
        const chg = num(S2 - prevClose);
        return { sym: symbol, S: S2, prevClose, chg, chgPct: prevClose > 0 ? num(chg / prevClose) : 0, name: q.description || symbol };
      },
      /** @param {string} sym */
      async expirations(sym) {
        const data = await request("options/expirations", { symbol: sym.trim().toUpperCase(), includeAllRoots: "true", strikes: "false" });
        const today = Math.floor(now() / DAY_MS);
        return [...new Set(rows(data?.expirations?.date))].filter((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))).sort().map((date) => {
          const dte = Math.max(0, num(Math.floor(Date.parse(date) / DAY_MS) - today));
          return { date, label: `${date} (${dte}d)`, dte };
        });
      },
      /** @param {string} sym @param {string} date */
      async chain(sym, date) {
        const data = await request("options/chains", { symbol: sym.trim().toUpperCase(), expiration: date, greeks: "true" });
        const strikes = /* @__PURE__ */ new Map();
        for (const option of rows(data?.options?.option)) {
          const strike = numeric(option?.strike), type = option?.option_type;
          if (strike === null || strike <= 0 || type !== "call" && type !== "put") continue;
          const row = strikes.get(strike) || { strike, call: null, put: null };
          row[type] = optionQuote(option);
          strikes.set(strike, row);
        }
        return [...strikes.values()].sort((a, b) => a.strike - b.strike);
      },
      /** Returns the latest `days` valid daily closes, oldest first.
       * @param {string} sym @param {number} [days]
       */
      async history(sym, days = 60) {
        const count = Math.max(0, Math.floor(num(days)));
        if (!count) return [];
        const data = await request("history", { symbol: sym.trim().toUpperCase(), interval: "daily" });
        return rows(data?.history?.day).filter((row) => typeof row?.date === "string" && Number.isFinite(Date.parse(row.date)) && numeric(row.close) !== null).map((row) => ({ day: row.date, p: num(row.close) })).sort((a, b) => a.day.localeCompare(b.day)).slice(-count);
      }
    };
  }

  // src/ui/real-watch.js
  var KEY4 = "oa.realwatch";
  var DEFAULTS = ["SPY", "QQQ", "AAPL", "MSFT", "IWM"];
  function loadRealWatch() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY4));
      if (Array.isArray(raw) && raw.length) {
        return raw.map((s2) => String(s2 || "").trim().toUpperCase()).filter(Boolean).slice(0, 24);
      }
    } catch {
    }
    return DEFAULTS.slice();
  }
  function saveRealWatch(syms) {
    const clean = [...new Set(syms.map((s2) => String(s2 || "").trim().toUpperCase()).filter(Boolean))].slice(0, 24);
    try {
      localStorage.setItem(KEY4, JSON.stringify(clean.length ? clean : DEFAULTS));
    } catch {
    }
    return clean.length ? clean : DEFAULTS.slice();
  }

  // src/ui/real-market.js
  var isMobile2 = () => !!(window.matchMedia && matchMedia("(max-width: 640px)").matches);
  function errBanner(err) {
    const kind = err instanceof TradierError ? err.kind : "network";
    const map = {
      auth: { title: "API key rejected", body: "Fix or re-paste your Tradier sandbox key in Settings.", href: "#/settings" },
      cors: { title: "Connection blocked", body: "Browser or network blocked Tradier (corporate proxies often do). Try another network." },
      network: { title: "Network error", body: "Could not reach Tradier. Check your connection and try again." },
      symbol: { title: "Unknown symbol", body: "That ticker returned no quotes. Check the symbol and try again." },
      rate: { title: "Rate limited", body: "Tradier sandbox asked us to slow down. Wait a moment and refresh." }
    };
    const m = map[kind] || map.network;
    const box = el(
      "div",
      { class: "oa-banner warn", role: "alert" },
      el("div", { style: "font-weight:700" }, m.title),
      el("p", { class: "sub", style: "margin:4px 0 0" }, m.body)
    );
    if (m.href) {
      box.appendChild(el("a", { class: "btn sm mt1", href: m.href }, "Open Settings"));
    }
    return box;
  }
  function atmStrike(strikes, S2) {
    return strikes.reduce((a, b) => Math.abs(b - S2) < Math.abs(a - S2) ? b : a, strikes[0]);
  }
  function midOf(o) {
    if (!o) return 0;
    if (o.mid != null && isFinite(o.mid)) return o.mid;
    if (o.bid != null && o.ask != null) return (o.bid + o.ask) / 2;
    return o.ask ?? o.bid ?? 0;
  }
  function renderRealMarket(root, params) {
    const client = createTradier({ key: tradierKey() });
    let watch = loadRealWatch();
    let sym = (params[0] || watch[0] || "SPY").toUpperCase();
    if (!watch.includes(sym)) watch = saveRealWatch([sym, ...watch]);
    let expIdx = 0;
    let quote = null;
    let exps = [];
    let chain = [];
    let hist = [];
    let ivRankVal = (
      /** @type {number|null} */
      null
    );
    let sideEmphasis = "both";
    let priceChart = null;
    let range = "3mo";
    let loadGen = 0;
    let bannerHost = null;
    root.appendChild(el("div", { class: "eyebrow" }, "Live Market \u2014 Real (delayed)"));
    const head = el("div", { class: "flex-between", style: "flex-wrap:wrap;gap:8px" });
    head.appendChild(el("h1", {}, "Watch & analyze"));
    head.appendChild(el("span", { class: "pill real-delayed-badge" }, "REAL \xB7 DELAYED 15 MIN"));
    root.appendChild(head);
    root.appendChild(el(
      "p",
      { class: "sub", style: "max-width:72ch" },
      "Delayed sandbox quotes for study \u2014 no paper fills in Real mode. Tap Analyze on a strike to open it in the Strategy Lab with live mids."
    ));
    root.appendChild(simDisclaimer());
    root.appendChild(el(
      "div",
      { class: "btn-row mt1" },
      el("a", { class: "btn sm", href: "#/settings" }, "Feed settings"),
      el("button", { class: "btn sm", type: "button", onclick: () => {
        setFeedMode("sim");
        location.hash = "#/market/" + (sym || "");
        location.reload();
      } }, "Switch to Sim")
    ));
    bannerHost = el("div", { class: "mt1" });
    root.appendChild(bannerHost);
    const topRow = el("div", { class: "row mt2" });
    const watchCard = el("div", { class: "card w33" });
    const detailCard = el("div", { class: "card w66" });
    topRow.appendChild(watchCard);
    topRow.appendChild(detailCard);
    root.appendChild(topRow);
    const chainCard = el("div", { class: "card mt2" });
    root.appendChild(chainCard);
    chainCard.appendChild(el(
      "div",
      { class: "flex-between" },
      el("h3", {}, "Option chain"),
      el("span", { class: "small muted" }, "analyze only \xB7 no ticket")
    ));
    const expRow = el("div", { class: "btn-row mb1" });
    chainCard.appendChild(expRow);
    const chainBox = el("div", { class: "tbl-wrap" });
    chainCard.appendChild(chainBox);
    const analyzeNote = el(
      "p",
      { class: "small muted mt1", style: "margin-bottom:0" },
      "Paper trading stays on Sim feed. Analyze sends legs to Strategy Lab with real entry mids."
    );
    chainCard.appendChild(analyzeNote);
    watchCard.appendChild(el("h3", {}, "Watchlist"));
    const chipBox = el("div", { class: "watch-chips" });
    watchCard.appendChild(chipBox);
    const addIn = el("input", {
      type: "text",
      class: "chip-input",
      placeholder: "Add SYM",
      "aria-label": "Add symbol",
      maxlength: "8"
    });
    addIn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const s2 = addIn.value.trim().toUpperCase();
      addIn.value = "";
      if (!s2) return;
      watch = saveRealWatch([...watch, s2]);
      sym = s2;
      renderWatch();
      refreshSymbol();
    });
    watchCard.appendChild(el("div", { class: "field mt1" }, addIn));
    watchCard.appendChild(el(
      "p",
      { class: "small muted", style: "margin-bottom:0" },
      "Saved on this device (oa.realwatch)."
    ));
    function renderWatch() {
      chipBox.innerHTML = "";
      for (const s2 of watch) {
        const chip = el("button", {
          type: "button",
          class: "watch-chip" + (s2 === sym ? " on" : ""),
          onclick: () => {
            sym = s2;
            renderWatch();
            refreshSymbol();
          }
        }, s2);
        const rm = el("button", {
          type: "button",
          class: "watch-chip-x",
          "aria-label": "Remove " + s2,
          onclick: (e) => {
            e.stopPropagation();
            watch = saveRealWatch(watch.filter((x) => x !== s2));
            if (sym === s2) sym = watch[0] || "SPY";
            renderWatch();
            refreshSymbol();
          }
        }, "\xD7");
        chip.appendChild(rm);
        chipBox.appendChild(chip);
      }
    }
    const detailHead = el("div", { class: "flex-between", style: "flex-wrap:wrap;gap:8px" });
    const detailTitle = el("h2", {});
    const ivChip = el("span", { class: "pill brass num", style: "display:none" });
    detailHead.appendChild(el("div", { class: "btn-row", style: "align-items:center" }, detailTitle, ivChip));
    const rangeSeg = el("div", { class: "seg" });
    const b3m = el("button", { class: "on", type: "button", onclick: () => {
      range = "3mo";
      b3m.classList.add("on");
      drawPrice();
    } }, "History");
    rangeSeg.appendChild(b3m);
    detailHead.appendChild(rangeSeg);
    detailCard.appendChild(detailHead);
    const detailStats = el("div", { class: "pos-greeks mb1" });
    detailCard.appendChild(detailStats);
    const priceBox = el("div", {});
    detailCard.appendChild(priceBox);
    const loadingEl = el("p", { class: "small muted" }, "Loading\u2026");
    detailCard.appendChild(loadingEl);
    function setBanner(node) {
      bannerHost.innerHTML = "";
      if (node) bannerHost.appendChild(node);
    }
    function drawPrice() {
      if (!quote) return;
      const up = (quote.chg || 0) >= 0;
      detailTitle.textContent = `${quote.sym} \u2014 ${F.usd(quote.S)}`;
      detailStats.innerHTML = "";
      detailStats.appendChild(el(
        "span",
        { class: up ? "up" : "down" },
        `${up ? "\u25B2" : "\u25BC"} ${F.usdSigned(quote.chg || 0)} (${F.pctSigned(quote.chgPct || 0)})`
      ));
      if (quote.name) detailStats.appendChild(el("span", { class: "muted" }, quote.name));
      detailStats.appendChild(el("span", { class: "muted" }, "Delayed ~15 min"));
      if (ivRankVal != null) {
        ivChip.style.display = "";
        ivChip.textContent = `IV rank ${Math.round(ivRankVal * 100)}`;
        ivChip.title = "IV vs 60-day realized range (HV proxy) \u2014 model context, not a forecast";
      } else {
        ivChip.style.display = "none";
      }
      const pts = (hist || []).map((c, i) => ({ x: i, y: c.p }));
      if (quote.S != null && pts.length) pts.push({ x: pts.length, y: quote.S });
      if (!pts.length) {
        priceBox.innerHTML = "";
        priceBox.appendChild(el("p", { class: "small muted" }, "No history yet."));
        priceChart = null;
        return;
      }
      const opts = {
        height: isMobile2() ? 180 : 230,
        series: [{ name: quote.sym, color: up ? "--gain-mark" : "--loss", points: pts, width: 2, area: true }],
        fmtX: (i) => {
          const row = hist[Math.round(i)];
          return row ? String(row.day).slice(5) : "";
        },
        fmtY: (y) => F.usd(y, 2),
        tipLabel: "",
        yPad: 0.15
      };
      if (!priceChart || !priceBox.querySelector("canvas")) {
        priceBox.innerHTML = "";
        priceChart = line(priceBox, opts);
      } else priceChart.update(opts);
    }
    function sendAnalyze(kind, strike, exp, row) {
      const opt = kind === "call" ? row.call : row.put;
      const entry = midOf(opt);
      const dte = exp.dte != null ? exp.dte : 21;
      const atmIv = row.call?.iv ?? row.put?.iv ?? 0.2;
      const iv = opt && opt.iv != null ? opt.iv : atmIv;
      writeAnalyzeStash({
        sym,
        S: quote?.S ?? strike,
        iv: iv || 0.2,
        dte,
        expDate: exp.date,
        label: `Long ${kind} ${F.usd(strike, 0)}`,
        source: "tradier",
        legs: [{
          kind,
          side: 1,
          qty: 1,
          strike,
          expDay: dte,
          // Strategy Lab treats as relative DTE marker in realCtx
          entry
        }]
      });
      toast(`Analyze \u2192 ${sym} ${F.usd(strike, 0)} ${kind} @ ${F.usd(entry)}`, "gain");
      location.hash = "#/strategy";
    }
    function renderChain() {
      expRow.innerHTML = "";
      if (!exps.length) {
        chainBox.innerHTML = "";
        chainBox.appendChild(el("p", { class: "small muted" }, "No expirations loaded."));
        return;
      }
      if (expIdx >= exps.length) expIdx = 0;
      exps.forEach((e, i) => {
        expRow.appendChild(el("button", {
          class: "btn sm" + (i === expIdx ? " primary" : ""),
          type: "button",
          onclick: () => {
            expIdx = i;
            loadChain();
          }
        }, e.label || e.date));
      });
      const exp = exps[expIdx];
      const S2 = quote?.S || 0;
      const strikes = chain.map((r) => r.strike).filter((k) => k != null);
      const atm = strikes.length ? atmStrike(strikes, S2) : null;
      if (isMobile2()) {
        const wrap = el("div", { class: "mobile-only" });
        const toolbar = el("div", { class: "ladder-toolbar" });
        toolbar.appendChild(el("button", {
          class: "btn sm" + (sideEmphasis === "both" ? " primary" : ""),
          type: "button",
          onclick: () => {
            sideEmphasis = "both";
            renderChain();
          }
        }, "Both"));
        toolbar.appendChild(el("button", {
          class: "btn sm" + (sideEmphasis === "calls" ? " primary" : ""),
          type: "button",
          onclick: () => {
            sideEmphasis = "calls";
            renderChain();
          }
        }, "Calls"));
        toolbar.appendChild(el("button", {
          class: "btn sm" + (sideEmphasis === "puts" ? " primary" : ""),
          type: "button",
          onclick: () => {
            sideEmphasis = "puts";
            renderChain();
          }
        }, "Puts"));
        wrap.appendChild(toolbar);
        const ladder = el("div", {
          class: "chain-ladder" + (sideEmphasis === "calls" ? " ladder-emphasize-calls" : "") + (sideEmphasis === "puts" ? " ladder-emphasize-puts" : "")
        });
        let atmRow = null;
        for (const row of chain) {
          const k = row.strike;
          const c = row.call || {};
          const p = row.put || {};
          const isAtm = k === atm;
          const rEl = el(
            "div",
            { class: "ladder-row" + (isAtm ? " atm" : "") },
            el(
              "div",
              { class: "ladder-side calls" },
              el("div", { class: "num small" }, F.usd(midOf(c))),
              el("button", {
                type: "button",
                class: "btn sm analyze-btn",
                onclick: () => sendAnalyze("call", k, exp, row)
              }, "Analyze \u2192")
            ),
            el(
              "div",
              { class: "ladder-mid" },
              el("div", { class: "k num" }, F.usd(k, 2)),
              el("div", { class: "iv" }, "IV " + F.pct(((c.iv || 0) + (p.iv || 0)) / 2 || 0, 0))
            ),
            el(
              "div",
              { class: "ladder-side puts" },
              el("div", { class: "num small" }, F.usd(midOf(p))),
              el("button", {
                type: "button",
                class: "btn sm analyze-btn",
                onclick: () => sendAnalyze("put", k, exp, row)
              }, "Analyze \u2192")
            )
          );
          if (isAtm) atmRow = rEl;
          ladder.appendChild(rEl);
        }
        wrap.appendChild(ladder);
        chainBox.innerHTML = "";
        chainBox.appendChild(wrap);
        if (atmRow) {
          requestAnimationFrame(() => {
            try {
              atmRow.scrollIntoView({ block: "center", behavior: "smooth" });
            } catch {
              atmRow.scrollIntoView();
            }
          });
        }
      } else {
        const tbl = el("table", { class: "oa desktop-chain" });
        tbl.appendChild(el("thead", {}, el(
          "tr",
          {},
          el("th", {}, "\u0394"),
          el("th", {}, "IV"),
          el("th", {}, "Mid"),
          el("th", {}, ""),
          el("th", { class: "center", style: "text-align:center" }, "Strike"),
          el("th", {}, ""),
          el("th", {}, "Mid"),
          el("th", {}, "IV"),
          el("th", {}, "\u0394")
        )));
        const tb = el("tbody", {});
        for (const row of chain) {
          const k = row.strike;
          const c = row.call || {};
          const p = row.put || {};
          const tr = el("tr", {});
          const cell = (txt, cls) => el("td", { class: cls || "" }, txt);
          tr.appendChild(cell(c.delta != null ? Number(c.delta).toFixed(2) : "\u2014"));
          tr.appendChild(cell(c.iv != null ? F.pct(c.iv, 0) : "\u2014"));
          tr.appendChild(cell(F.usd(midOf(c)), k < S2 ? "chain-itm" : ""));
          tr.appendChild(el(
            "td",
            {},
            el("button", {
              type: "button",
              class: "btn sm analyze-btn",
              onclick: () => sendAnalyze("call", k, exp, row)
            }, "Analyze \u2192")
          ));
          tr.appendChild(cell(F.usd(k, 2), "chain-strike"));
          tr.appendChild(el(
            "td",
            {},
            el("button", {
              type: "button",
              class: "btn sm analyze-btn",
              onclick: () => sendAnalyze("put", k, exp, row)
            }, "Analyze \u2192")
          ));
          tr.appendChild(cell(F.usd(midOf(p)), k > S2 ? "chain-itm" : ""));
          tr.appendChild(cell(p.iv != null ? F.pct(p.iv, 0) : "\u2014"));
          tr.appendChild(cell(p.delta != null ? Number(p.delta).toFixed(2) : "\u2014"));
          tb.appendChild(tr);
        }
        tbl.appendChild(tb);
        chainBox.innerHTML = "";
        chainBox.appendChild(tbl);
      }
    }
    async function loadChain() {
      const exp = exps[expIdx];
      if (!exp) return;
      const gen = loadGen;
      try {
        chain = await client.chain(sym, exp.date);
        if (gen !== loadGen) return;
        renderChain();
        try {
          const S2 = quote?.S;
          const strikes = chain.map((r) => r.strike);
          if (S2 && strikes.length && hist.length >= 2) {
            const atm = atmStrike(strikes, S2);
            const row = chain.find((r) => r.strike === atm) || chain[Math.floor(chain.length / 2)];
            const atmIv = ((row?.call?.iv || 0) + (row?.put?.iv || 0)) / 2 || row?.call?.iv || row?.put?.iv;
            const series = hvSeries(hist, 20);
            const ivHist = series.map((r) => r.hv).filter((v) => v != null && isFinite(v));
            ivRankVal = atmIv != null ? ivRank(atmIv, ivHist) : null;
            drawPrice();
          }
        } catch {
        }
      } catch (err) {
        if (gen !== loadGen) return;
        setBanner(errBanner(err));
        chain = [];
        renderChain();
      }
    }
    async function refreshSymbol() {
      const gen = ++loadGen;
      loadingEl.style.display = "";
      loadingEl.textContent = `Loading ${sym}\u2026`;
      setBanner(null);
      quote = null;
      exps = [];
      chain = [];
      hist = [];
      ivRankVal = null;
      try {
        const [q, e, h] = await Promise.all([
          client.quote(sym),
          client.expirations(sym),
          client.history(sym, 60).catch(() => [])
        ]);
        if (gen !== loadGen) return;
        quote = q;
        exps = e || [];
        hist = h || [];
        expIdx = 0;
        loadingEl.style.display = "none";
        drawPrice();
        await loadChain();
      } catch (err) {
        if (gen !== loadGen) return;
        loadingEl.style.display = "none";
        setBanner(errBanner(err));
        detailTitle.textContent = sym;
        detailStats.innerHTML = "";
        chainBox.innerHTML = "";
      }
    }
    renderWatch();
    refreshSymbol();
    const onResize = () => {
      if (chain.length) renderChain();
    };
    window.addEventListener("resize", onResize);
    return () => {
      loadGen++;
      window.removeEventListener("resize", onResize);
      priceChart && priceChart.destroy();
    };
  }

  // src/ui/views/market.js
  var viewState2 = {};
  var THESIS_DIRS = [
    ["up", "Up"],
    ["down", "Down"],
    ["vol-up", "Vol \u2191"],
    ["vol-down", "Vol \u2193"],
    ["income", "Income"]
  ];
  var isMobile3 = () => !!(window.matchMedia && matchMedia("(max-width: 640px)").matches);
  var showFreemium = () => !isFamilyBuild() && tier() === "free";
  var freeSym = (sym) => FREE_LIMITS.symbols.includes(sym);
  function riskCard(checks) {
    const sizeMark = !checks.definedRisk ? "\u2717 unbounded" : checks.sizeOk ? "\u2713 \u22642% of equity" : checks.sizeWarn ? "\u26A0 \u22645% of equity" : "\u2717 above 5% of equity";
    return el(
      "div",
      { class: "risk-card" },
      el("div", { class: "small muted", style: "font-weight:600;letter-spacing:0.05em;text-transform:uppercase" }, "Live risk check"),
      el(
        "div",
        { class: "pos-greeks mt1" },
        el("span", {}, checks.definedRisk ? "Defined risk \u2713" : "Defined risk \u2717"),
        el(
          "span",
          { class: "num" },
          checks.riskAmount != null ? `Max loss ${F.usd(checks.riskAmount, 0)}` : "Max loss unbounded"
        ),
        el(
          "span",
          { class: "num" },
          checks.riskPct != null ? F.pct(checks.riskPct, 1) + " of equity" : "\u2014"
        ),
        el("span", {}, sizeMark)
      )
    );
  }
  function attributionEl(pos) {
    const a = attribution(pos);
    const keys = [
      ["delta", "Delta"],
      ["gamma", "Gamma"],
      ["theta", "Theta"],
      ["vega", "Vega"],
      ["slippage", "Slippage"],
      ["residual", "Residual"]
    ];
    const maxAbs = Math.max(1, ...keys.map(([k]) => Math.abs(a[k] || 0)), Math.abs(a.total || 0));
    const wrap = el("div", { class: "attr-wrap" });
    for (const [k, label] of keys) {
      const v = a[k] || 0;
      const w = Math.max(2, Math.round(Math.abs(v) / maxAbs * 100));
      wrap.appendChild(el(
        "div",
        { class: "attr-row" },
        el("span", {}, label),
        el("div", {}, el("div", {
          class: "attr-bar",
          style: `width:${w}%;background:${v >= 0 ? "var(--gain-mark)" : "var(--loss)"}`
        })),
        el("span", { class: "num " + (v >= 0 ? "up" : "down"), style: "text-align:right" }, F.usdSigned(v, 0))
      ));
    }
    wrap.appendChild(el(
      "div",
      { class: "attr-row total" },
      el("span", {}, "Total"),
      el("div", {}),
      el("span", { class: "num " + (a.total >= 0 ? "up" : "down"), style: "text-align:right" }, F.usdSigned(a.total, 0))
    ));
    return wrap;
  }
  function ticketNet(sym, ticket) {
    let cost = 0;
    const fillLegs = ticket.map((L) => {
      const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
      const entry = L.side > 0 ? q.ask : q.bid;
      cost += L.side * L.qty * 100 * entry;
      return { ...L, entry };
    });
    return { cost, fillLegs };
  }
  function maxPlSummary(legs, Sref) {
    const ml = maxLossAtExpiry(legs, Sref);
    let best = -Infinity;
    const lo = 0, hi = Math.max(Sref * 3, ...legs.filter((l) => l.strike).map((l) => l.strike * 2), 1);
    for (let i = 0; i <= 80; i++) {
      const y = pnlAtExpiry(legs, lo + (hi - lo) * i / 80);
      if (y > best) best = y;
    }
    const { up } = (() => {
      let upSlope = 0;
      for (const l of legs) {
        const m = l.side * l.qty * (l.kind === "stock" ? 1 : 100);
        if (l.kind === "stock" || l.kind === "call") upSlope += m;
      }
      return { up: upSlope };
    })();
    return {
      maxLoss: ml.bounded ? ml.amount : null,
      maxGain: up > 0 ? null : best
    };
  }
  function openThesisModal({ sym, legs, label, onPlace }) {
    let direction = "up";
    let confidence = 3;
    const reasonIn = el("textarea", { "aria-label": "Thesis reason", placeholder: "Why this trade? (be specific \u2014 \u226520 chars scores better)" });
    const exitIn = el("input", { type: "text", "aria-label": "Exit plan", placeholder: "Exit plan (target, stop, or time)" });
    const dirSeg = el("div", { class: "seg", role: "group", "aria-label": "Direction" });
    const dirBtns = THESIS_DIRS.map(([id, lbl]) => {
      const b = el("button", { type: "button", class: id === direction ? "on" : "", onclick: () => {
        direction = id;
        dirBtns.forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      } }, lbl);
      dirSeg.appendChild(b);
      return b;
    });
    const confSeg = el("div", { class: "seg", role: "group", "aria-label": "Confidence" });
    const confBtns = [1, 2, 3, 4, 5].map((n) => {
      const b = el("button", { type: "button", class: n === confidence ? "on" : "", onclick: () => {
        confidence = n;
        confBtns.forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      } }, String(n));
      confSeg.appendChild(b);
      return b;
    });
    const checks = computeChecks(sym, legs);
    const wrap = el(
      "div",
      {},
      el("h2", {}, "Pre-trade thesis"),
      el("p", { class: "sub" }, `${label} on ${sym} \u2014 write the decision before the fill.`),
      el("div", { class: "field mt2" }, el("label", {}, "Direction"), dirSeg),
      el("div", { class: "field mt1" }, el("label", {}, "Reason"), reasonIn),
      el("div", { class: "field mt1" }, el("label", {}, "Exit plan"), exitIn),
      el("div", { class: "field mt1" }, el("label", {}, "Confidence"), confSeg),
      riskCard(checks),
      el(
        "div",
        { class: "btn-row mt2" },
        el("button", { class: "btn primary", onclick: () => {
          m.close();
          onPlace({
            thesis: {
              direction,
              reason: reasonIn.value.trim(),
              exitPlan: exitIn.value.trim(),
              confidence
            }
          });
        } }, "Trade with thesis"),
        el("button", { class: "btn", onclick: () => {
          m.close();
          onPlace({ thesis: null });
        } }, "Trade anyway")
      )
    );
    const m = modal(wrap);
    reasonIn.focus();
  }
  function openDebriefModal(entry, pnl, onDone) {
    let followedPlan = "yes";
    const lessonIn = el("input", { type: "text", "aria-label": "Lesson learned", placeholder: "What did you learn?" });
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Followed plan" });
    const opts = [["yes", "Yes"], ["partial", "Partial"], ["no", "No"]];
    const btns = opts.map(([id, lbl]) => {
      const b = el("button", { type: "button", class: id === followedPlan ? "on" : "", onclick: () => {
        followedPlan = id;
        btns.forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      } }, lbl);
      seg.appendChild(b);
      return b;
    });
    const wrap = el(
      "div",
      {},
      el("h2", {}, "Trade debrief"),
      el(
        "p",
        { class: "sub" },
        `${entry.sym} \xB7 ${entry.label} \xB7 P&L `,
        el("span", { class: "num " + (pnl >= 0 ? "up" : "down") }, F.usdSigned(pnl, 0))
      ),
      el("div", { class: "field mt2" }, el("label", {}, "Followed your exit plan?"), seg),
      el("div", { class: "field mt1" }, el("label", {}, "Lesson"), lessonIn),
      el(
        "div",
        { class: "btn-row mt2" },
        el("button", { class: "btn primary", onclick: () => {
          closeDebrief(entry.id, { followedPlan, lesson: lessonIn.value.trim() }, pnl);
          m.close();
          toast("Trade journaled \u2014 Process Score updated.", "gain");
          onDone && onDone();
        } }, "Save debrief")
      )
    );
    const m = modal(wrap, { onClose: false });
    lessonIn.focus();
  }
  var view11 = {
    render(root, params) {
      if (feedMode() === "tradier") {
        return renderRealMarket(root, params);
      }
      let sym = params[0] && market.tickers[params[0]] ? params[0] : viewState2.sym || "LMND";
      viewState2.sym = sym;
      let expIdx = 0;
      let range = "day";
      let ticket = [];
      let priceChart = null, eqChart = null;
      let sideEmphasis = "both";
      let sheetOpen = false;
      let chipEl = null;
      let sheetEl = null;
      let sheetBg = null;
      let coachEl = null;
      const hdr = viewHeader("Live Market \u2014 Academy Exchange", "Paper-trade the tape");
      const head = el("div", { class: "flex-between" });
      const clockBig = el("span", { class: "num muted" });
      const speedSeg = el("div", { class: "seg", role: "group", "aria-label": "Simulation speed" });
      const speeds = [["\u23F8", 0], ["1\xD7", 1], ["6\xD7", 6], ["30\xD7", 30]];
      const speedBtns = speeds.map(([lbl, sp]) => {
        const b = el("button", { onclick: () => {
          if (sp === 0) market.pause();
          else {
            market.setSpeed(sp);
            market.start();
          }
          refreshSpeed();
        } }, lbl);
        speedSeg.appendChild(b);
        return { b, sp };
      });
      head.appendChild(hdr);
      function refreshSpeed() {
        speedBtns.forEach(({ b, sp }) => b.classList.toggle(
          "on",
          sp === 0 ? !market.running : market.running && market.speed === sp
        ));
      }
      const nextDayBtn = el("button", { class: "btn sm", onclick: () => {
        market.advanceDay();
        toast("\u23ED Jumped to the next trading day.");
      } }, "\u23ED Next day");
      head.appendChild(el("div", { class: "btn-row" }, clockBig, speedSeg, nextDayBtn));
      root.appendChild(head);
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:72ch" },
        "Every profile trades a $100,000 paper account on a simulated exchange \u2014 prices tick live, implied vol breathes, earnings land, options expire. Speed it up to feel theta; slow it down to think."
      ));
      root.appendChild(simDisclaimer());
      refreshSpeed();
      const topRow = el("div", { class: "row mt2" });
      const watchCard = el("div", { class: "card w33" });
      const detailCard = el("div", { class: "card w66" });
      topRow.appendChild(watchCard);
      topRow.appendChild(detailCard);
      root.appendChild(topRow);
      const chainCard = el("div", { class: "card mt2" });
      root.appendChild(chainCard);
      const botRow = el("div", { class: "row mt2" });
      const posCard = el("div", { class: "card w66" });
      const acctCard = el("div", { class: "card w33" });
      botRow.appendChild(posCard);
      botRow.appendChild(acctCard);
      root.appendChild(botRow);
      watchCard.appendChild(el("h3", {}, "Watchlist"));
      const watchBox = el("div", {});
      watchCard.appendChild(watchBox);
      const sparkRefs = {};
      function renderWatch() {
        watchBox.innerHTML = "";
        for (const t of market.list()) {
          const q = market.quote(t.sym);
          const up = q.chg >= 0;
          const locked = showFreemium() && !freeSym(t.sym);
          const cv = el("canvas", { style: "width:70px" });
          sparkRefs[t.sym] = cv;
          watchBox.appendChild(el(
            "div",
            {
              class: "watch-row" + (t.sym === sym ? " sel" : "") + (locked ? " sym-locked" : ""),
              role: "button",
              tabindex: "0",
              onclick: () => {
                sym = t.sym;
                viewState2.sym = sym;
                expIdx = 0;
                renderAll();
              },
              onkeydown: (e) => {
                if (e.key === "Enter") {
                  sym = t.sym;
                  renderAll();
                }
              }
            },
            el(
              "div",
              {},
              el(
                "div",
                { style: "font-weight:700", class: "mono" },
                t.sym,
                locked ? el("span", { class: "pill brass lock-chip", style: "margin-left:4px" }, icon("lock")) : null
              ),
              el("div", { class: "small muted" }, (isFamilyBuild() ? t.emoji + " " : "") + t.sector)
            ),
            cv,
            el("div", { class: "num", style: "text-align:right" }, F.usd(q.S)),
            el("div", { class: "num " + (up ? "up" : "down"), style: "text-align:right" }, F.pctSigned(q.chgPct)),
            el("div", { class: "num muted small", style: "text-align:right" }, F.pct(t.vol, 0))
          ));
        }
        drawSparks();
      }
      function drawSparks() {
        for (const t of market.list()) {
          const cv = sparkRefs[t.sym];
          if (!cv || !cv.isConnected) continue;
          const pts = t.closes.slice(-30).map((c) => c.p).concat([t.S]);
          spark(cv, pts, { color: t.S >= pts[0] ? "--gain-mark" : "--loss", baseline: pts[0] });
        }
      }
      const detailHead = el("div", { class: "flex-between" });
      const detailTitle = el("h2", {});
      const rangeSeg = el("div", { class: "seg" });
      const bDay = el("button", { class: "on", onclick: () => {
        range = "day";
        bDay.classList.add("on");
        b3m.classList.remove("on");
        drawPrice();
      } }, "Today");
      const b3m = el("button", { onclick: () => {
        range = "3mo";
        b3m.classList.add("on");
        bDay.classList.remove("on");
        drawPrice();
      } }, "3 months");
      rangeSeg.appendChild(bDay);
      rangeSeg.appendChild(b3m);
      detailHead.appendChild(detailTitle);
      detailHead.appendChild(rangeSeg);
      detailCard.appendChild(detailHead);
      const detailStats = el("div", { class: "pos-greeks mb1" });
      detailCard.appendChild(detailStats);
      const priceBox = el("div", {});
      detailCard.appendChild(priceBox);
      const stockBtns = el("div", { class: "btn-row mt1" });
      detailCard.appendChild(stockBtns);
      function drawPrice() {
        const t = market.tickers[sym];
        const q = market.quote(sym);
        detailTitle.textContent = `${isFamilyBuild() ? t.emoji + " " : ""}${t.sym} \u2014 ${F.usd(q.S)}`;
        detailStats.innerHTML = "";
        const up = q.chg >= 0;
        detailStats.appendChild(el("span", { class: up ? "up" : "down" }, `${up ? "\u25B2" : "\u25BC"} ${F.usdSigned(q.chg)} (${F.pctSigned(q.chgPct)}) today`));
        detailStats.appendChild(el("span", {}, `IV ${F.pct(t.vol, 0)}`));
        if (t.nextEarnings) detailStats.appendChild(el("span", {}, `Earnings: Day ${t.nextEarnings} (${t.nextEarnings - market.day}d)`));
        detailStats.appendChild(el("span", { class: "muted" }, t.name));
        if (showFreemium() && !freeSym(sym)) {
          detailStats.appendChild(el("a", { class: "pill brass", href: "#/upgrade", style: "text-decoration:none" }, icon("lock"), " Upgrade to trade"));
        }
        let pts;
        if (range === "day") pts = t.intraday.map((p) => ({ x: p.m, y: p.p }));
        else pts = t.closes.slice(-63).map((c) => ({ x: c.day, y: c.p })).concat([{ x: market.day, y: t.S }]);
        const opts = {
          height: isMobile3() ? 180 : 230,
          series: [{ name: sym, color: up ? "--gain-mark" : "--loss", points: pts, width: 2, area: true }],
          fmtX: range === "day" ? (m) => {
            const mm = 9 * 60 + 30 + m;
            return Math.floor(mm / 60) + ":" + String(Math.round(mm % 60)).padStart(2, "0");
          } : (d) => "D" + Math.round(d),
          fmtY: (y) => F.usd(y, 2),
          hlines: range === "day" ? [{ y: t.prevClose, label: "prev close", color: "--ink-3" }] : [],
          tipLabel: "",
          yPad: 0.15
        };
        if (!priceChart) priceChart = line(priceBox, opts);
        else priceChart.update(opts);
        stockBtns.innerHTML = "";
        for (const n2 of [10, 100]) {
          stockBtns.appendChild(el("button", { class: "btn sm buy", onclick: () => {
            const res = openPosition(sym, [{ kind: "stock", side: 1, qty: n2, entry: market.quote(sym).S }], `${n2} shares`);
            if (res.err) gateToast(res.err);
            else {
              toast(`Bought ${n2} ${sym} @ ${F.usd(market.quote(sym).S)}`, "gain");
              completeStep(2);
            }
            renderPositions();
            renderAcct();
          } }, `Buy ${n2} sh`));
        }
        stockBtns.appendChild(el(
          "span",
          { class: "small muted" },
          isMobile3() ? "Tap bid/ask in the ladder to add legs." : "Options trade from the chain below \u2014 click a bid (sell) or ask (buy)."
        ));
      }
      chainCard.appendChild(el(
        "div",
        { class: "flex-between" },
        el("h3", {}, "Option chain"),
        el("span", { class: "small muted" }, "per-contract prices \xB7 \xD7100 multiplier")
      ));
      const expRow = el("div", { class: "btn-row mb1" });
      chainCard.appendChild(expRow);
      const chainBox = el("div", { class: "tbl-wrap" });
      chainCard.appendChild(chainBox);
      const ticketCard = el("div", { class: "card mt2 desktop-ticket", style: "border-color:var(--brass-ring)" });
      chainCard.appendChild(ticketCard);
      function atmStrike2(strikes, S2) {
        return strikes.reduce((a, b) => Math.abs(b - S2) < Math.abs(a - S2) ? b : a);
      }
      function renderChain() {
        const exps = market.expiries(sym);
        if (expIdx >= exps.length) expIdx = 0;
        expRow.innerHTML = "";
        exps.forEach((e, i) => {
          expRow.appendChild(el("button", { class: "btn sm" + (i === expIdx ? " primary" : ""), onclick: () => {
            expIdx = i;
            renderChain();
          } }, e.label));
        });
        const exp = exps[expIdx];
        const S2 = market.quote(sym).S;
        const strikes = market.strikes(sym);
        const atm = atmStrike2(strikes, S2);
        if (isMobile3()) {
          const wrap = el("div", { class: "mobile-only" });
          const toolbar = el("div", { class: "ladder-toolbar" });
          const bothBtn = el("button", { class: "btn sm" + (sideEmphasis === "both" ? " primary" : ""), onclick: () => {
            sideEmphasis = "both";
            renderChain();
          } }, "Both");
          const callBtn = el("button", { class: "btn sm" + (sideEmphasis === "calls" ? " primary" : ""), onclick: () => {
            sideEmphasis = "calls";
            renderChain();
          } }, "Calls");
          const putBtn = el("button", { class: "btn sm" + (sideEmphasis === "puts" ? " primary" : ""), onclick: () => {
            sideEmphasis = "puts";
            renderChain();
          } }, "Puts");
          toolbar.appendChild(bothBtn);
          toolbar.appendChild(callBtn);
          toolbar.appendChild(putBtn);
          wrap.appendChild(toolbar);
          const ladder = el("div", {
            class: "chain-ladder" + (sideEmphasis === "calls" ? " ladder-emphasize-calls" : "") + (sideEmphasis === "puts" ? " ladder-emphasize-puts" : "")
          });
          let atmRow = null;
          for (const k of strikes) {
            const c = market.optQuote(sym, k, exp.day, "call");
            const p = market.optQuote(sym, k, exp.day, "put");
            const isAtm = k === atm;
            const row = el(
              "div",
              { class: "ladder-row" + (isAtm ? " atm" : "") },
              el(
                "div",
                { class: "ladder-side calls" },
                el("button", {
                  type: "button",
                  class: "bid num",
                  title: "Sell call at bid",
                  onclick: () => addTicket("call", -1, k, exp.day)
                }, F.usd(c.bid)),
                el("button", {
                  type: "button",
                  class: "ask num",
                  title: "Buy call at ask",
                  onclick: () => addTicket("call", 1, k, exp.day)
                }, F.usd(c.ask))
              ),
              el(
                "div",
                { class: "ladder-mid" },
                el("div", { class: "k num" }, F.usd(k, 2)),
                el("div", { class: "iv" }, "IV " + F.pct((c.iv + p.iv) / 2, 0))
              ),
              el(
                "div",
                { class: "ladder-side puts" },
                el("button", {
                  type: "button",
                  class: "bid num",
                  title: "Sell put at bid",
                  onclick: () => addTicket("put", -1, k, exp.day)
                }, F.usd(p.bid)),
                el("button", {
                  type: "button",
                  class: "ask num",
                  title: "Buy put at ask",
                  onclick: () => addTicket("put", 1, k, exp.day)
                }, F.usd(p.ask))
              )
            );
            if (isAtm) atmRow = row;
            ladder.appendChild(row);
          }
          wrap.appendChild(ladder);
          chainBox.innerHTML = "";
          chainBox.appendChild(wrap);
          ticketCard.style.display = "none";
          if (atmRow) {
            requestAnimationFrame(() => {
              try {
                atmRow.scrollIntoView({ block: "center", behavior: "smooth" });
              } catch {
                atmRow.scrollIntoView();
              }
            });
          }
        } else {
          ticketCard.style.display = "";
          const tbl = el("table", { class: "oa desktop-chain" });
          tbl.appendChild(el("thead", {}, el(
            "tr",
            {},
            el("th", {}, "\u0394"),
            el("th", {}, "IV"),
            el("th", {}, "Bid"),
            el("th", {}, "Ask"),
            el("th", { class: "center", style: "text-align:center" }, "Strike"),
            el("th", {}, "Bid"),
            el("th", {}, "Ask"),
            el("th", {}, "IV"),
            el("th", {}, "\u0394")
          )));
          const tb = el("tbody", {});
          for (const k of strikes) {
            const c = market.optQuote(sym, k, exp.day, "call");
            const p = market.optQuote(sym, k, exp.day, "put");
            const tr = el("tr", {});
            const cell = (txt, cls, onclick, title) => {
              const td = el("td", { class: cls || "" }, txt);
              if (onclick) {
                td.classList.add("clickable");
                td.title = title;
                td.addEventListener("click", onclick);
              }
              return td;
            };
            tr.appendChild(cell(c.delta.toFixed(2)));
            tr.appendChild(cell(F.pct(c.iv, 0)));
            tr.appendChild(cell(F.usd(c.bid), k < S2 ? "chain-itm" : "", () => addTicket("call", -1, k, exp.day), "Sell this call at the bid"));
            tr.appendChild(cell(F.usd(c.ask), k < S2 ? "chain-itm" : "", () => addTicket("call", 1, k, exp.day), "Buy this call at the ask"));
            tr.appendChild(cell(F.usd(k, 2), "chain-strike", null));
            tr.appendChild(cell(F.usd(p.bid), k > S2 ? "chain-itm" : "", () => addTicket("put", -1, k, exp.day), "Sell this put at the bid"));
            tr.appendChild(cell(F.usd(p.ask), k > S2 ? "chain-itm" : "", () => addTicket("put", 1, k, exp.day), "Buy this put at the ask"));
            tr.appendChild(cell(F.pct(p.iv, 0)));
            tr.appendChild(cell(p.delta.toFixed(2)));
            tb.appendChild(tr);
          }
          tbl.appendChild(tb);
          chainBox.innerHTML = "";
          chainBox.appendChild(tbl);
        }
        renderTicket();
      }
      function ensureMobileTicketUi() {
        if (chipEl || !isMobile3()) return;
        chipEl = el("button", {
          type: "button",
          class: "oa-ticket-chip",
          style: "display:none",
          onclick: () => {
            sheetOpen = true;
            renderTicket();
          }
        });
        sheetBg = el("div", {
          class: "ticket-sheet-bg",
          style: "display:none",
          onclick: () => {
            sheetOpen = false;
            renderTicket();
          }
        });
        sheetEl = el("div", { class: "oa-ticket-sheet", role: "dialog", "aria-label": "Order ticket" });
        document.body.appendChild(chipEl);
        document.body.appendChild(sheetBg);
        document.body.appendChild(sheetEl);
      }
      function destroyMobileTicketUi() {
        chipEl?.remove();
        sheetBg?.remove();
        sheetEl?.remove();
        chipEl = sheetBg = sheetEl = null;
        sheetOpen = false;
      }
      function addTicket(kind, side, strike, expDay) {
        const existing = ticket.find((L) => L.kind === kind && L.strike === strike && L.expDay === expDay && L.side === side);
        if (existing) existing.qty++;
        else ticket.push({ kind, side, qty: 1, strike, expDay });
        if (isMobile3()) sheetOpen = true;
        renderTicket();
      }
      function ticketBody(into, { compact } = {}) {
        into.innerHTML = "";
        if (!compact) {
          into.appendChild(el("div", { class: "oa-sheet-handle", "aria-hidden": "true" }));
          into.appendChild(el("h3", {}, "Order ticket"));
        }
        if (!ticket.length) {
          into.appendChild(el(
            "p",
            { class: "small muted", style: "margin-bottom:0" },
            isMobile3() ? "Tap bids/asks in the ladder to build an order." : "Click bids/asks in the chain to build an order \u2014 combine legs for spreads."
          ));
          return;
        }
        const { cost, fillLegs } = ticketNet(sym, ticket);
        const pl = maxPlSummary(fillLegs, market.quote(sym).S);
        const list2 = el("div", {});
        ticket.forEach((L, i) => {
          const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
          const px = L.side > 0 ? q.ask : q.bid;
          const qtyIn = el("input", { type: "number", min: 1, value: L.qty, style: "width:60px", "aria-label": "Quantity" });
          qtyIn.addEventListener("change", () => {
            L.qty = Math.max(1, +qtyIn.value || 1);
            renderTicket();
          });
          const steppers = el(
            "div",
            { class: "btn-row", style: "margin:4px 0" },
            el("span", { class: "pill " + (L.side > 0 ? "gain" : "loss") }, L.side > 0 ? "BUY" : "SELL"),
            el("button", { class: "btn sm", type: "button", onclick: () => {
              L.qty = Math.max(1, L.qty - 1);
              renderTicket();
            } }, "\u2212"),
            qtyIn,
            el("button", { class: "btn sm", type: "button", onclick: () => {
              L.qty++;
              renderTicket();
            } }, "+"),
            el("span", { class: "mono small" }, `${sym} ${F.usd(L.strike, 2)} ${L.kind.toUpperCase()} @ ${F.usd(px)}`),
            el("button", { class: "btn sm", onclick: () => {
              ticket.splice(i, 1);
              renderTicket();
            } }, "\u2715")
          );
          list2.appendChild(steppers);
        });
        into.appendChild(list2);
        into.appendChild(el(
          "div",
          { class: "pos-greeks mt1" },
          el("span", { class: "num", style: "font-weight:700" }, (cost >= 0 ? "Debit " : "Credit ") + F.usd(Math.abs(cost))),
          el("span", { class: "small muted" }, `+ ${F.usd(0.65 * ticket.reduce((s2, L) => s2 + L.qty, 0))} fees`),
          el(
            "span",
            { class: "num" },
            pl.maxLoss != null ? `Max loss ${F.usd(Math.abs(pl.maxLoss), 0)}` : "Max loss unbounded"
          ),
          el(
            "span",
            { class: "num" },
            pl.maxGain != null ? `Max gain ${F.usd(pl.maxGain, 0)}` : "Max gain unbounded"
          )
        ));
        into.appendChild(el(
          "div",
          { class: "btn-row mt1" },
          el("button", { class: "btn primary", onclick: placeOrder }, "Place order"),
          el("button", { class: "btn", onclick: () => {
            ticket = [];
            sheetOpen = false;
            renderTicket();
          } }, "Clear")
        ));
      }
      function fillDesktopTicket() {
        ticketCard.innerHTML = "";
        ticketCard.appendChild(el("h3", {}, "Order ticket"));
        if (!ticket.length) {
          ticketCard.appendChild(el(
            "p",
            { class: "small muted", style: "margin-bottom:0" },
            "Click bids/asks in the chain to build an order \u2014 combine legs for spreads."
          ));
          return;
        }
        const { cost, fillLegs } = ticketNet(sym, ticket);
        const pl = maxPlSummary(fillLegs, market.quote(sym).S);
        ticket.forEach((L, i) => {
          const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
          const px = L.side > 0 ? q.ask : q.bid;
          const qtyIn = el("input", { type: "number", min: 1, value: L.qty, style: "width:60px" });
          qtyIn.addEventListener("change", () => {
            L.qty = Math.max(1, +qtyIn.value || 1);
            renderTicket();
          });
          ticketCard.appendChild(el(
            "div",
            { class: "btn-row", style: "margin:4px 0" },
            el("span", { class: "pill " + (L.side > 0 ? "gain" : "loss") }, L.side > 0 ? "BUY" : "SELL"),
            qtyIn,
            el("span", { class: "mono small" }, `${sym} ${F.usd(L.strike, 2)} ${L.kind.toUpperCase()} (Day ${L.expDay}) @ ${F.usd(px)}`),
            el("button", { class: "btn sm", onclick: () => {
              ticket.splice(i, 1);
              renderTicket();
            } }, "\u2715")
          ));
        });
        ticketCard.appendChild(el(
          "div",
          { class: "btn-row mt1" },
          el("span", { class: "num", style: "font-weight:700" }, (cost >= 0 ? "Debit " : "Credit ") + F.usd(Math.abs(cost))),
          el("span", { class: "small muted" }, `+ ${F.usd(0.65 * ticket.reduce((s2, L) => s2 + L.qty, 0))} fees`),
          el(
            "span",
            { class: "num small" },
            pl.maxLoss != null ? `Max loss ${F.usd(Math.abs(pl.maxLoss), 0)}` : "Max loss unbounded"
          ),
          el("button", { class: "btn primary", onclick: placeOrder }, "Place order"),
          el("button", { class: "btn", onclick: () => {
            ticket = [];
            renderTicket();
          } }, "Clear")
        ));
      }
      function renderTicket() {
        if (isMobile3()) {
          ensureMobileTicketUi();
          ticketCard.style.display = "none";
          if (!ticket.length) {
            if (chipEl) chipEl.style.display = "none";
            if (sheetEl) {
              sheetEl.classList.remove("open");
              sheetEl.style.display = "none";
            }
            if (sheetBg) sheetBg.style.display = "none";
            sheetOpen = false;
            return;
          }
          const { cost } = ticketNet(sym, ticket);
          if (chipEl) {
            chipEl.style.display = sheetOpen ? "none" : "flex";
            chipEl.textContent = `${ticket.length} leg${ticket.length === 1 ? "" : "s"} \xB7 net ${cost >= 0 ? "" : "\u2212"}${F.usd(Math.abs(cost))}`;
          }
          if (sheetBg) sheetBg.style.display = sheetOpen ? "block" : "none";
          if (sheetEl) {
            sheetEl.style.display = "block";
            sheetEl.classList.toggle("open", sheetOpen);
            if (sheetOpen) ticketBody(sheetEl);
          }
          return;
        }
        destroyMobileTicketUi();
        ticketCard.style.display = "";
        fillDesktopTicket();
      }
      function placeOrder() {
        const legs = ticket.map((L) => {
          const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
          return { ...L, entry: L.side > 0 ? q.ask : q.bid };
        });
        const label = legs.length === 1 ? `${legs[0].side > 0 ? "Long" : "Short"} ${legs[0].kind}` : `${legs.length}-leg combo`;
        openThesisModal({
          sym,
          legs,
          label,
          onPlace: ({ thesis }) => {
            const res = openPosition(sym, legs, label);
            if (res.err) {
              gateToast(res.err);
              return;
            }
            if (thesis && res.pos) {
              const j = attachThesis(res.pos.id, sym, legs, label, thesis);
              if (!j && showFreemium()) {
              }
              toast(`Order filled with thesis: ${label} on ${sym}`, "gain");
            } else {
              toast(`Order filled (no thesis): ${label} on ${sym}`, "gain");
            }
            completeStep(2);
            ticket = [];
            sheetOpen = false;
            renderTicket();
            renderPositions();
            renderAcct();
            maybeClearCoach();
          }
        });
      }
      posCard.appendChild(el("h3", {}, "Open positions"));
      const posBox = el("div", { class: "tbl-wrap" });
      posCard.appendChild(posBox);
      const explainOpen = /* @__PURE__ */ new Set();
      function legLabel(L) {
        if (L.kind === "stock") return `${L.side > 0 ? "+" : "\u2212"}${L.qty} sh`;
        return `${L.side > 0 ? "+" : "\u2212"}${L.qty} ${F.usd(L.strike, 0)}${L.kind === "call" ? "C" : "P"} D${L.expDay}`;
      }
      function renderPositions() {
        const p = active();
        posBox.innerHTML = "";
        if (!p || !p.positions.length) {
          posBox.appendChild(el("p", { class: "small muted" }, "No open positions. Fill your first order from the chain above \u2014 it is paper money, built for learning."));
          return;
        }
        const liveIds = new Set(p.positions.map((x) => x.id));
        for (const id of [...explainOpen]) if (!liveIds.has(id)) explainOpen.delete(id);
        if (isMobile3()) {
          const cards = el("div", { class: "pos-cards mobile-only" });
          for (const pos of p.positions) {
            const val = posValue(pos), cost = posCost(pos), pnl = val - cost;
            const isOpen = explainOpen.has(pos.id);
            const card = el(
              "div",
              { class: "pos-card" },
              el(
                "div",
                { class: "pos-head" },
                el(
                  "div",
                  {},
                  el("div", { style: "font-weight:700" }, `${pos.sym} \xB7 ${pos.label}`),
                  el("div", { class: "small muted" }, pos.legs.map(legLabel).join(" \xB7 "))
                ),
                el("span", { class: "pill num " + (pnl >= 0 ? "gain" : "loss") }, F.usdSigned(pnl, 0))
              ),
              el(
                "div",
                { class: "btn-row mt1" },
                el("button", { class: "btn sm", onclick: () => {
                  if (explainOpen.has(pos.id)) explainOpen.delete(pos.id);
                  else explainOpen.add(pos.id);
                  renderPositions();
                } }, isOpen ? "Hide" : "Explain"),
                el("button", { class: "btn sm", onclick: () => {
                  const entry = entryForPosition(pos.id);
                  const got = closePosition(pos.id);
                  if (got == null) return;
                  toast(`Closed ${pos.label}: ${F.usdSigned(got, 0)}`, got >= 0 ? "gain" : "loss");
                  if (entry) openDebriefModal(entry, got, () => {
                    renderPositions();
                    renderAcct();
                  });
                  renderPositions();
                  renderAcct();
                } }, "Close")
              ),
              isOpen ? attributionEl(pos) : null
            );
            cards.appendChild(card);
          }
          posBox.appendChild(cards);
          return;
        }
        const tbl = el("table", { class: "oa" });
        tbl.appendChild(el("thead", {}, el(
          "tr",
          {},
          el("th", {}, "Position"),
          el("th", {}, "Legs"),
          el("th", {}, "Cost"),
          el("th", {}, "Value"),
          el("th", {}, "P&L"),
          el("th", {}, "\u0394"),
          el("th", {}, "\u0398/day"),
          el("th", {}, "")
        )));
        const tb = el("tbody", {});
        for (const pos of p.positions) {
          const val = posValue(pos), cost = posCost(pos), pnl = val - cost;
          let delta = 0, theta = 0;
          for (const L of pos.legs) {
            if (L.kind === "stock") {
              delta += L.side * L.qty;
              continue;
            }
            const q = market.optQuote(pos.sym, L.strike, L.expDay, L.kind);
            delta += L.side * L.qty * 100 * q.delta;
            theta += L.side * L.qty * 100 * q.theta;
          }
          const closeBtn = el("button", { class: "btn sm", onclick: () => {
            const entry = entryForPosition(pos.id);
            const got = closePosition(pos.id);
            if (got == null) return;
            toast(`Closed ${pos.label}: ${F.usdSigned(got, 0)}`, got >= 0 ? "gain" : "loss");
            if (entry) {
              openDebriefModal(entry, got, () => {
                renderPositions();
                renderAcct();
              });
            }
            renderPositions();
            renderAcct();
          } }, "Close");
          const isOpen = explainOpen.has(pos.id);
          const explainBtn = el("button", { class: "btn sm", onclick: () => {
            if (explainOpen.has(pos.id)) explainOpen.delete(pos.id);
            else explainOpen.add(pos.id);
            renderPositions();
          } }, isOpen ? "Hide" : "Explain");
          const attrCell = el("td", { colspan: "8" }, attributionEl(pos));
          const attrRow = el("tr", { style: isOpen ? "" : "display:none" }, attrCell);
          tb.appendChild(el(
            "tr",
            {},
            el("td", {}, `${pos.sym} \xB7 ${pos.label}`),
            el("td", { class: "small" }, pos.legs.map(legLabel).join("  ")),
            el("td", { class: "num" }, F.usd(cost, 0)),
            el("td", { class: "num" }, F.usd(val, 0)),
            el("td", { class: "num " + (pnl >= 0 ? "up" : "down") }, F.usdSigned(pnl, 0)),
            el("td", { class: "num" }, delta.toFixed(0)),
            el("td", { class: "num " + (theta >= 0 ? "up" : "down") }, F.usdSigned(theta, 0)),
            el("td", {}, el("div", { class: "btn-row" }, explainBtn, closeBtn))
          ));
          tb.appendChild(attrRow);
        }
        tbl.appendChild(tb);
        posBox.appendChild(tbl);
      }
      function renderAcct() {
        const p = active();
        acctCard.innerHTML = "";
        acctCard.appendChild(el("h3", {}, "Account"));
        if (!p) return;
        const eq = equity();
        acctCard.appendChild(el(
          "div",
          { class: "stats" },
          el("div", { class: "stat" }, el("div", { class: "k" }, "Equity"), el("div", { class: "v" }, F.usd(eq, 0))),
          el("div", { class: "stat" }, el("div", { class: "k" }, "Cash"), el("div", { class: "v" }, F.usd(p.cash, 0)))
        ));
        if (p.marks.length > 1) {
          const eqBox = el("div", { class: "mt1" });
          acctCard.appendChild(el("div", { class: "chart-title mt1" }, "Equity by day"));
          acctCard.appendChild(eqBox);
          const opts = {
            height: 120,
            series: [{ name: "Equity", color: "--s1", points: p.marks.map((m) => ({ x: m.day, y: m.eq })), area: true }],
            fmtX: (d) => "D" + Math.round(d),
            fmtY: (y) => F.usd(y / 1e3, 0) + "k",
            hlines: [{ y: 1e5, label: "start", color: "--ink-3" }]
          };
          if (!eqChart || !eqBox.querySelector("canvas")) eqChart = line(eqBox, opts);
          else eqChart.update(opts);
        }
        acctCard.appendChild(el("h3", { class: "mt2" }, "Market wire"));
        const feed2 = el("div", { class: "event-feed" });
        for (const e of market.snapshot().events.slice(0, 20)) {
          feed2.appendChild(el(
            "div",
            { class: "event-item" },
            el("span", { class: "et" }, `Day ${e.day}`),
            el("span", { class: "ev-row" }, iconFor(e.icon, "news", { cls: "ev-ic" }), " " + e.text)
          ));
        }
        acctCard.appendChild(feed2);
        if (p.trades.length) {
          acctCard.appendChild(el("h3", { class: "mt2" }, "Trade log"));
          const log2 = el("div", { class: "event-feed" });
          for (const t of p.trades.slice(0, 12)) {
            log2.appendChild(el(
              "div",
              { class: "event-item" },
              el("span", { class: "et" }, `Day ${t.day}`),
              el("span", {}, t.text)
            ));
          }
          acctCard.appendChild(log2);
        }
      }
      function maybeClearCoach() {
        const st = get();
        if (st.step >= 2 && coachEl) {
          coachEl.remove();
          coachEl = null;
        }
      }
      function maybeShowCoach() {
        const st = get();
        const wantsCoach = params.includes("coach") || st.step === 1 && !st.coachDismissed && !st.done;
        if (!wantsCoach || st.step >= 2) return;
        if (coachEl) return;
        coachEl = el(
          "div",
          { class: "coach-overlay", style: "display:block" },
          el(
            "div",
            { class: "coach-card", style: "top:auto;bottom:calc(130px + env(safe-area-inset-bottom,0px))" },
            el("div", { style: "font-weight:700" }, "Guided first trade"),
            el(
              "p",
              { class: "sub", style: "margin:6px 0 10px" },
              "Tap an ASK on the call side to buy a call on LMND \u2014 paper money, no real risk."
            ),
            el(
              "div",
              { class: "btn-row" },
              el("button", { class: "btn sm", onclick: () => {
                dismissCoach();
                coachEl?.remove();
                coachEl = null;
              } }, "Dismiss")
            )
          )
        );
        document.body.appendChild(coachEl);
      }
      function renderAll() {
        renderWatch();
        drawPrice();
        renderChain();
        renderPositions();
        renderAcct();
      }
      renderAll();
      maybeShowCoach();
      let n = 0;
      const unTick = market.on("tick", () => {
        clockBig.textContent = market.clockLabel();
        drawPrice();
        drawSparks();
        if (++n % 2 === 0) {
          renderChain();
          renderPositions();
        }
        if (n % 6 === 0) {
          renderWatch();
          renderAcct();
        }
      });
      const unState = market.on("state", refreshSpeed);
      const unNews = market.on("news", renderAcct);
      clockBig.textContent = market.clockLabel();
      const onResize = () => {
        renderChain();
        renderPositions();
        renderTicket();
      };
      window.addEventListener("resize", onResize);
      return () => {
        unTick();
        unState();
        unNews();
        window.removeEventListener("resize", onResize);
        priceChart && priceChart.destroy();
        eqChart && eqChart.destroy();
        destroyMobileTicketUi();
        coachEl?.remove();
      };
    }
  };

  // src/ui/views/risk.js
  var SPOT_SHOCKS = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15];
  var IV_SHOCKS = [0.2, 0.1, 0, -0.1];
  var DAY_OPTS = [0, 1, 3, 5];
  function buildBook(positions) {
    const book = [];
    for (const pos of positions) {
      const S0 = market.quote(pos.sym).S;
      for (const l of pos.legs) {
        if (l.kind === "stock") {
          book.push({ pos, kind: "stock", side: l.side, qty: l.qty, S0 });
          continue;
        }
        const q = market.optQuote(pos.sym, l.strike, l.expDay, l.kind);
        book.push({
          pos,
          kind: l.kind,
          side: l.side,
          qty: l.qty,
          S0,
          strike: l.strike,
          iv: q.iv,
          dte: q.dte,
          basePx: price({ S: S0, K: l.strike, T: q.dte / TRADING_YEAR, v: q.iv, type: l.kind })
        });
      }
    }
    return book;
  }
  function legStress(leg, dS, dIv, dDays) {
    if (leg.kind === "stock") return leg.side * leg.qty * leg.S0 * dS;
    const newPx = price({
      S: leg.S0 * (1 + dS),
      K: leg.strike,
      T: Math.max(0, leg.dte - dDays) / TRADING_YEAR,
      v: Math.max(0.01, leg.iv + dIv),
      type: leg.kind
    });
    return leg.side * leg.qty * 100 * (newPx - leg.basePx);
  }
  function cellStyle(v, maxAbs) {
    if (Math.abs(v) < 1) return "";
    const a = Math.min(1, Math.abs(v) / Math.max(1, maxAbs));
    const tint = 0.06 + a * 0.22;
    return v > 0 ? `background:color-mix(in srgb, var(--gain-mark) ${Math.round(tint * 100)}%, transparent)` : `background:color-mix(in srgb, var(--loss) ${Math.round(tint * 100)}%, transparent)`;
  }
  var view12 = {
    render(root) {
      root.appendChild(el("div", { class: "eyebrow" }, "Risk Desk"));
      root.appendChild(el("h1", {}, "Portfolio stress test"));
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:70ch" },
        "Every open position repriced across simultaneous spot and implied-volatility shocks \u2014 the question a desk asks before the move happens, not after."
      ));
      let dDays = 0;
      const dayBtns = DAY_OPTS.map((d) => el("button", {
        type: "button",
        class: d === dDays ? "on" : "",
        onclick: () => {
          dDays = d;
          dayBtns.forEach((b, i) => b.classList.toggle("on", DAY_OPTS[i] === d));
          paint();
        }
      }, d === 0 ? "Today" : `+${d}d`));
      const daySeg = el("div", { class: "seg", role: "group", "aria-label": "Days forward" });
      dayBtns.forEach((b) => daySeg.appendChild(b));
      const controls = el("div", { class: "field mt2" }, el("label", {}, "Time decay"), daySeg);
      const body = el("div", {});
      root.appendChild(controls);
      root.appendChild(body);
      function paintEmpty() {
        controls.style.display = "none";
        body.innerHTML = "";
        body.appendChild(el(
          "div",
          { class: "card mt1" },
          el("h3", {}, "No open positions to stress"),
          el(
            "p",
            { class: "sub" },
            "Open a position on the Live Market or build a spread in the Strategy Lab, then come back to see how it holds up when spot gaps and vol spikes at the same time."
          ),
          el(
            "div",
            { class: "btn-row mt1" },
            el("a", { class: "btn primary", href: "#/market" }, "Open the Live Market"),
            el("a", { class: "btn", href: "#/strategy" }, "Strategy Lab")
          )
        ));
      }
      function paint() {
        const p = active();
        const positions = p?.positions || [];
        if (!positions.length) {
          paintEmpty();
          return;
        }
        controls.style.display = "";
        body.innerHTML = "";
        const book = buildBook(positions);
        const grid = IV_SHOCKS.map((dIv) => SPOT_SHOCKS.map((dS) => book.reduce((s2, leg) => s2 + legStress(leg, dS, dIv, dDays), 0)));
        const flat = grid.flat();
        const maxAbs = Math.max(...flat.map(Math.abs), 1);
        let worst = { v: Infinity, dS: 0, dIv: 0 };
        IV_SHOCKS.forEach((dIv, r) => SPOT_SHOCKS.forEach((dS, c) => {
          if (grid[r][c] < worst.v) worst = { v: grid[r][c], dS, dIv };
        }));
        const card = el("div", { class: "card mt1" });
        card.appendChild(el(
          "div",
          { class: "flex-between" },
          el("h3", {}, `Spot \xD7 IV shock matrix${dDays ? ` \xB7 ${dDays} trading day${dDays > 1 ? "s" : ""} forward` : ""}`),
          el("span", { class: "small muted num" }, `${positions.length} position${positions.length === 1 ? "" : "s"}`)
        ));
        const tbl = el("table", { class: "oa risk-matrix" });
        const head = el("tr", {}, el("th", { class: "rm-corner" }, "IV \\ Spot"));
        for (const dS of SPOT_SHOCKS) {
          head.appendChild(el(
            "th",
            { class: "num" + (dS === 0 ? " rm-base" : "") },
            (dS > 0 ? "+" : "") + Math.round(dS * 100) + "%"
          ));
        }
        tbl.appendChild(head);
        IV_SHOCKS.forEach((dIv, r) => {
          const tr = el(
            "tr",
            {},
            el(
              "th",
              { class: "num" + (dIv === 0 ? " rm-base" : "") },
              (dIv > 0 ? "+" : "") + Math.round(dIv * 100) + " pts"
            )
          );
          SPOT_SHOCKS.forEach((dS, c) => {
            const v = grid[r][c];
            const isWorst = v === worst.v && worst.v < 0;
            tr.appendChild(el("td", {
              class: "num" + (isWorst ? " rm-worst" : ""),
              style: cellStyle(v, maxAbs),
              title: `Spot ${(dS > 0 ? "+" : "") + Math.round(dS * 100)}% \xB7 IV ${(dIv > 0 ? "+" : "") + Math.round(dIv * 100)} pts`
            }, F.usdSigned(v, 0)));
          });
          tbl.appendChild(tr);
        });
        card.appendChild(el("div", { class: "risk-matrix-scroll" }, tbl));
        card.appendChild(el(
          "p",
          { class: "small muted mt1", style: "margin-bottom:0" },
          "Cells are P&L change from today's theoretical mark if spot and implied vol move together. Forward cells hold today's vol surface flat apart from your shock. Deep red corner = the scenario that hurts most."
        ));
        body.appendChild(card);
        const eq = equity(p);
        const bp = buyingPower(p);
        const worstLoss = Math.min(0, worst.v);
        const worstPct = eq > 0 ? worstLoss / eq : 0;
        const stats = el(
          "div",
          { class: "stats mt2" },
          el(
            "div",
            { class: "stat" },
            el("div", { class: "k" }, "Worst scenario"),
            el("div", { class: "v num down" }, F.usdSigned(worstLoss, 0))
          ),
          el(
            "div",
            { class: "stat" },
            el("div", { class: "k" }, "Where it hits"),
            el("div", { class: "v num" }, worstLoss < 0 ? `${worst.dS > 0 ? "+" : ""}${Math.round(worst.dS * 100)}% / ${worst.dIv > 0 ? "+" : ""}${Math.round(worst.dIv * 100)}pts` : "\u2014")
          ),
          el(
            "div",
            { class: "stat" },
            el("div", { class: "k" }, "Of equity"),
            el("div", { class: "v num" }, F.pct(Math.abs(worstPct), 1))
          ),
          el(
            "div",
            { class: "stat" },
            el("div", { class: "k" }, "Buying power after"),
            el("div", { class: "v num" }, F.usd(Math.max(0, bp + worstLoss), 0))
          )
        );
        body.appendChild(stats);
        if (worstPct <= -0.1) {
          body.appendChild(el(
            "p",
            { class: "small mt1", style: "color:var(--loss)" },
            "\u26A0 The worst cell costs more than 10% of equity \u2014 the sizing discipline the journal grades starts right here."
          ));
        }
        if (worstLoss < 0) {
          const byPos = /* @__PURE__ */ new Map();
          for (const leg of book) {
            const v = legStress(leg, worst.dS, worst.dIv, dDays);
            byPos.set(leg.pos, (byPos.get(leg.pos) || 0) + v);
          }
          const contribs = [...byPos.entries()].sort((a, b) => a[1] - b[1]);
          const cCard = el("div", { class: "card mt2" });
          cCard.appendChild(el("h3", {}, "Who hurts in the worst scenario"));
          for (const [pos, v] of contribs.slice(0, 5)) {
            cCard.appendChild(el(
              "div",
              { class: "pos-greeks mt1" },
              el("span", {}, `${pos.sym} \xB7 ${pos.label}`),
              el("span", { class: "num " + (v >= 0 ? "up" : "down") }, F.usdSigned(v, 0))
            ));
          }
          body.appendChild(cCard);
        }
      }
      paint();
      let tickN = 0;
      const unTick = market.on("tick", () => {
        if (++tickN % 3 === 0) paint();
      });
      const unDay = market.on("day", paint);
      root.appendChild(simDisclaimer());
      return () => {
        unTick();
        unDay();
      };
    }
  };

  // src/ui/views/progress.js
  var view13 = {
    render(root) {
      const p = active();
      if (!p) {
        root.appendChild(el("p", {}, "Create a profile to track progress."));
        return;
      }
      const lv = levelOf(p.xp);
      const cleanups = [];
      root.appendChild(el("div", { class: "eyebrow" }, "Progress"));
      root.appendChild(el(
        "div",
        { class: "profile-hero" },
        isFamilyBuild() ? el("span", { class: "big" }, p.emoji) : el("span", { class: "big monogram" }, (p.name || "?").trim().charAt(0).toUpperCase()),
        el(
          "div",
          { style: "flex:1" },
          el("h1", {}, p.name),
          el("p", { class: "sub", style: "margin:0" }, `Level ${lv.n} \u2014 ${lv.name}`)
        )
      ));
      const toNext = lv.next ? `${p.xp - lv.floor} / ${lv.next - lv.floor} XP to level ${lv.n + 1}` : "Max level!";
      const pct = lv.next ? Math.min(100, Math.round((p.xp - lv.floor) / (lv.next - lv.floor) * 100)) : 100;
      const xpCard = el("div", { class: "card mt2" });
      xpCard.appendChild(el(
        "div",
        { class: "flex-between" },
        el("h3", {}, `${p.xp} XP`),
        el("span", { class: "small muted num" }, toNext)
      ));
      xpCard.appendChild(el("div", { class: "prog-bar mt1" }, el("div", { style: "width:" + pct + "%" })));
      root.appendChild(xpCard);
      cleanups.push(mountAccountSection(root));
      const lessonsDone = Object.keys(p.lessons).length;
      const totalLessons = curriculum?.tracks?.flatMap((t) => t.modules.flatMap((m) => m.lessons)).length || 0;
      const quizzes = Object.keys(p.quizzes).length;
      const days = Object.keys(p.days).length;
      root.appendChild(el(
        "div",
        { class: "stats mt2" },
        el("div", { class: "stat" }, el("div", { class: "k" }, "Lessons"), el("div", { class: "v" }, `${lessonsDone}/${totalLessons}`)),
        el("div", { class: "stat" }, el("div", { class: "k" }, "Quizzes taken"), el("div", { class: "v" }, String(quizzes))),
        el("div", { class: "stat" }, el("div", { class: "k" }, "Learning days"), el("div", { class: "v" }, String(days))),
        el("div", { class: "stat" }, el("div", { class: "k" }, "Paper equity"), el("div", { class: "v" }, F.usd(equity(), 0)))
      ));
      if (curriculum?.tracks?.length) {
        const tr = el("div", { class: "card mt2" });
        tr.appendChild(el("h3", {}, "Tracks"));
        for (const t of curriculum.tracks) {
          const ids = t.modules.flatMap((m) => m.lessons.map((l) => l.id));
          const done = ids.filter((id) => p.lessons[id]).length;
          const tp = ids.length ? Math.round(done / ids.length * 100) : 0;
          tr.appendChild(el(
            "div",
            { class: "flex-between mt1" },
            el("span", { style: "font-weight:600" }, t.title),
            el("span", { class: "small muted num" }, `${done}/${ids.length}`)
          ));
          tr.appendChild(el("div", { class: "prog-bar" + (tp === 100 ? " green" : "") }, el("div", { style: "width:" + tp + "%" })));
        }
        root.appendChild(tr);
      }
      const bCard = el("div", { class: "card mt2" });
      bCard.appendChild(el("h3", {}, `Badges (${BADGES.filter((b) => p.badges[b.id]).length}/${BADGES.length})`));
      const grid = el("div", { class: "badge-grid mt1" });
      for (const b of BADGES) {
        const got = p.badges[b.id];
        grid.appendChild(el(
          "div",
          { class: "badge-tile" + (got ? "" : " locked"), title: b.desc },
          el("div", { class: "bi" }, iconFor(b.icon, "star")),
          el("div", { class: "bn" }, b.name),
          el("div", { class: "bd" }, b.desc)
        ));
      }
      bCard.appendChild(grid);
      root.appendChild(bCard);
      root.appendChild(el(
        "div",
        { class: "btn-row mt2" },
        el("a", { class: "btn", href: "#/settings" }, icon("gear"), " Settings"),
        el(
          "button",
          { class: "btn", onclick: () => bus.emit("profile-picker") },
          icon("user"),
          " Switch profile"
        )
      ));
      return () => {
        cleanups.forEach((c) => {
          try {
            c();
          } catch {
          }
        });
      };
    }
  };

  // src/ui/views/journal.js
  var DIR_LABEL = {
    up: "Bullish",
    down: "Bearish",
    "vol-up": "Vol up",
    "vol-down": "Vol down",
    income: "Income"
  };
  function scoreChip(score) {
    if (score == null) return el("span", { class: "pill" }, "\u2014");
    return el("span", { class: "pill brass num" }, String(score) + "/100");
  }
  function breakdownBars(entry) {
    const wrap = el("div", { class: "score-bars mt1" });
    for (const row of scoreBreakdown(entry)) {
      const pct = Math.round(row.v / row.max * 100);
      wrap.appendChild(el(
        "div",
        { class: "score-bar-row" },
        el("span", { class: "score-bar-k" }, row.k),
        el("div", { class: "score-bar-track" }, el("div", { class: "score-bar-fill", style: `width:${pct}%` })),
        el("span", { class: "num small muted" }, `${row.v}/${row.max}`)
      ));
    }
    return wrap;
  }
  var view14 = {
    render(root) {
      root.appendChild(viewHeader("Trade Journal", "Process Score"));
      if (!isFamilyBuild() && tier() === "free") {
        const used = entries().length;
        const cap = FREE_LIMITS.journalEntries;
        const pct = Math.min(100, Math.round(used / cap * 100));
        root.appendChild(el(
          "div",
          { class: "upgrade-meter" },
          el(
            "div",
            { class: "flex-between" },
            el(
              "span",
              { class: "small", style: "font-weight:600" },
              `${used} of ${cap} free entries used`
            ),
            el("a", { class: "pill brass", href: "#/upgrade", style: "text-decoration:none" }, "Upgrade")
          ),
          el("div", { class: "prog-bar mt1" }, el("div", { style: `width:${pct}%` }))
        ));
      }
      const avg = avgScore(10);
      const scoreSeries = entries().filter((e) => e.status === "closed" && e.score != null).slice(0, 10).map((e) => e.score).reverse();
      const sparkCv = el("canvas", { class: "score-spark", style: "width:120px;max-width:40vw", "aria-hidden": "true" });
      const hero = el(
        "div",
        { class: "card mt2 process-hero" },
        el(
          "div",
          { class: "process-hero-score" },
          el("div", { class: "k" }, "Avg (last 10)"),
          el("div", { class: "v num" }, avg == null ? "\u2014" : String(avg)),
          scoreSeries.length >= 2 ? el(
            "div",
            { class: "score-spark-wrap mt1" },
            el("div", { class: "small muted" }, "Score trend"),
            sparkCv
          ) : null
        ),
        el(
          "p",
          { class: "sub", style: "margin:0;max-width:42ch" },
          "Grades your decisions, not your luck \u2014 thesis, defined risk, sizing, and exit discipline."
        )
      );
      root.appendChild(hero);
      if (scoreSeries.length >= 2) {
        requestAnimationFrame(() => {
          spark(sparkCv, scoreSeries, { color: "--brass", height: 36, baseline: 50 });
        });
      }
      const list2 = entries();
      if (!list2.length) {
        root.appendChild(el(
          "div",
          { class: "card mt2" },
          el("h3", {}, "No journal entries yet"),
          el(
            "p",
            { class: "sub" },
            "When you place a trade on the Live Market, attach a thesis. When you close, debrief. That loop builds a Process Score that tracks skill \u2014 not coin-flips."
          ),
          el("a", { class: "btn primary", href: "#/market" }, "Open Live Market \u2192")
        ));
        return;
      }
      const box = el("div", { class: "mt2" });
      root.appendChild(box);
      for (const e of list2) {
        const open = e.status === "open";
        const pnl = e.pnl;
        const head = el("div", { class: "flex-between", style: "cursor:pointer" });
        const left = el(
          "div",
          {},
          el("div", { style: "font-weight:700" }, `${e.sym} \xB7 ${e.label}`),
          el(
            "div",
            { class: "small muted num" },
            open ? `Opened Day ${e.openDay} \xB7 awaiting debrief` : `Day ${e.openDay} \u2192 ${e.closeDay}`
          )
        );
        const right = el(
          "div",
          { class: "btn-row" },
          open ? el("span", { class: "pill brass" }, "awaiting debrief") : el("span", { class: "num " + (pnl >= 0 ? "up" : "down") }, F.usdSigned(pnl, 0)),
          open ? null : scoreChip(e.score)
        );
        head.appendChild(left);
        head.appendChild(right);
        const detail = el("div", { class: "journal-detail", style: "display:none" });
        if (e.thesis) {
          detail.appendChild(el("div", { class: "small muted mt1" }, "Thesis"));
          detail.appendChild(el(
            "div",
            { class: "btn-row mt1" },
            el("span", { class: "pill brass" }, DIR_LABEL[e.thesis.direction] || e.thesis.direction || "\u2014"),
            el("span", { class: "small muted" }, `Confidence ${e.thesis.confidence ?? "\u2014"}/5`)
          ));
          detail.appendChild(el("p", { class: "sub mt1", html: mdInline(e.thesis.reason || "") }));
          detail.appendChild(el(
            "div",
            { class: "small" },
            el("span", { class: "muted" }, "Exit plan: "),
            e.thesis.exitPlan || "\u2014"
          ));
        }
        if (e.checks) {
          const sizeMark = e.checks.sizeOk ? "\u2713 \u22642%" : e.checks.sizeWarn ? "\u26A0 \u22645%" : "\u2717 >5%";
          detail.appendChild(el(
            "div",
            { class: "pos-greeks mt1" },
            el("span", {}, e.checks.definedRisk ? "Defined risk \u2713" : "Undefined risk \u2717"),
            el("span", { class: "num" }, e.checks.riskAmount != null ? `Max loss ${F.usd(e.checks.riskAmount, 0)}` : "Max loss unbounded"),
            el("span", {}, sizeMark)
          ));
        }
        if (!open) {
          detail.appendChild(breakdownBars(e));
          if (e.debrief) {
            detail.appendChild(el(
              "div",
              { class: "small muted mt1" },
              `Followed plan: ${e.debrief.followedPlan}`
            ));
            if (e.debrief.lesson) {
              detail.appendChild(el("p", { class: "sub mt1", html: mdInline(e.debrief.lesson) }));
            }
          }
        }
        const card = el("div", { class: "card mb1 journal-entry" }, head, detail);
        let expanded = false;
        head.addEventListener("click", () => {
          expanded = !expanded;
          detail.style.display = expanded ? "" : "none";
        });
        head.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            head.click();
          }
        });
        head.tabIndex = 0;
        head.setAttribute("role", "button");
        head.setAttribute("aria-expanded", "false");
        head.addEventListener("click", () => head.setAttribute("aria-expanded", expanded ? "true" : "false"));
        box.appendChild(card);
      }
    }
  };

  // src/ui/views/missions.js
  var PRESETS2 = [
    { id: "long-call", name: "Long Call", legs: () => [{ kind: "call", side: 1, qty: 1, k: 0 }] },
    { id: "long-put", name: "Long Put", legs: () => [{ kind: "put", side: 1, qty: 1, k: 0 }] },
    { id: "covered-call", name: "Covered Call", legs: () => [{ kind: "stock", side: 1, qty: 100 }, { kind: "call", side: -1, qty: 1, k: 1 }] },
    { id: "protective-put", name: "Protective Put", legs: () => [{ kind: "stock", side: 1, qty: 100 }, { kind: "put", side: 1, qty: 1, k: -1 }] },
    { id: "csp", name: "Cash-Secured Put", legs: () => [{ kind: "put", side: -1, qty: 1, k: -1 }] },
    { id: "bull-call", name: "Bull Call Spread", legs: () => [{ kind: "call", side: 1, qty: 1, k: 0 }, { kind: "call", side: -1, qty: 1, k: 2 }] },
    { id: "bear-put", name: "Bear Put Spread", legs: () => [{ kind: "put", side: 1, qty: 1, k: 0 }, { kind: "put", side: -1, qty: 1, k: -2 }] },
    { id: "straddle", name: "Long Straddle", legs: () => [{ kind: "call", side: 1, qty: 1, k: 0 }, { kind: "put", side: 1, qty: 1, k: 0 }] }
  ];
  function briefFirstLine(brief) {
    const line2 = String(brief || "").split(/\n/)[0] || "";
    return line2.replace(/\*\*/g, "").slice(0, 140);
  }
  function renderHub(root) {
    root.appendChild(viewHeader("Missions", "Guided trading drills"));
    root.appendChild(el(
      "p",
      { class: "sub", style: "max-width:68ch" },
      "Sandboxed markets with clear objectives. Defined-risk only \u2014 practice the playbook before you freestyle on the Live Market."
    ));
    root.appendChild(simDisclaimer());
    const free = !isFamilyBuild() && tier() === "free";
    const all = list();
    const week1 = all.filter((m) => !String(m.id).startsWith("w2-")).slice(0, 10);
    const week2 = all.filter((m) => String(m.id).startsWith("w2-"));
    const rest = all.filter((m) => !week1.includes(m) && !week2.includes(m));
    function missionCard(m) {
      const locked = free && !FREE_LIMITS.missions.includes(m.id);
      const statusPill = m.done ? el("span", { class: "pill gain" }, "\u2713 Done") : locked ? el("a", { class: "pill brass lock-chip", href: "#/upgrade", style: "text-decoration:none" }, icon("lock"), " Upgrade") : el("span", { class: "pill brass" }, m.skill || "mission");
      return el(
        "div",
        { class: "card mission-card" },
        el(
          "div",
          { class: "flex-between" },
          iconFor(m.icon, "compass", { cls: "mi" }),
          statusPill
        ),
        el("h3", { style: "margin:0" }, m.title),
        el("p", { class: "sub", style: "margin:0" }, briefFirstLine(m.brief)),
        el(
          "div",
          { class: "btn-row mt1" },
          el("button", { class: "btn primary", onclick: () => {
            const res = start2(m.id);
            if (res.err) {
              gateToast(res.err);
              return;
            }
            location.hash = "#/missions/" + m.id;
          } }, m.done ? "Replay \u2192" : locked ? "Preview \u2192" : "Start \u2192")
        )
      );
    }
    function section(title, list2) {
      if (!list2.length) return;
      root.appendChild(el("h3", { class: "mission-week-head mt2" }, title));
      const grid = el("div", { class: "grid2 mt1" });
      for (const m of list2) grid.appendChild(missionCard(m));
      root.appendChild(grid);
    }
    section("Week 1", week1);
    section("Week 2", week2);
    section("More missions", rest);
  }
  function confirmLeave(onYes) {
    const wrap = el(
      "div",
      {},
      el("h2", {}, "Leave mission?"),
      el("p", { class: "sub" }, "Leaving abandons the current session. Progress on this run is not saved."),
      el(
        "div",
        { class: "btn-row mt2" },
        el("button", { class: "btn", onclick: () => m.close() }, "Stay"),
        el("button", { class: "btn primary", onclick: () => {
          m.close();
          onYes();
        } }, "Abandon")
      )
    );
    const m = modal(wrap);
  }
  function renderRunner(root, id) {
    let S2 = session();
    if (!S2 || S2.def.id !== id) {
      const res = start2(id);
      if (res.err) {
        gateToast(res.err);
        root.appendChild(el("p", {}, res.err.includes("upgrade") || res.err.includes("Academy") ? "This mission is locked on the free tier." : "Mission not found."));
        root.appendChild(el(
          "div",
          { class: "btn-row mt1" },
          el("a", { class: "btn", href: "#/missions" }, "\u2190 Back to missions"),
          !isFamilyBuild() ? el("a", { class: "btn primary", href: "#/upgrade" }, "Upgrade") : null
        ));
        return;
      }
      S2 = res.session;
    }
    let priceChart = null, eqChart = null;
    let sym = S2.market.list()[0]?.sym || "BRGR";
    let expIdx = 0;
    let presetId = "";
    let legsSpec = [];
    let abandoned = false;
    const shell = el("div", { class: "mission-runner" });
    root.appendChild(shell);
    function leave() {
      confirmLeave(() => {
        abandoned = true;
        abandon();
        location.hash = "#/missions";
      });
    }
    function atmStrike2(mkt, s2) {
      const q = mkt.quote(s2);
      const strikes = mkt.strikes(s2);
      return strikes.reduce((a, b) => Math.abs(b - q.S) < Math.abs(a - q.S) ? b : a);
    }
    function strikeAt(mkt, s2, off) {
      const strikes = mkt.strikes(s2);
      const atm = atmStrike2(mkt, s2);
      const i = strikes.indexOf(atm);
      return strikes[Math.max(0, Math.min(strikes.length - 1, i + off))];
    }
    function applyPreset(p) {
      const mkt = S2.market;
      const exps = mkt.expiries(sym);
      const exp = exps[Math.min(expIdx, exps.length - 1)];
      legsSpec = p.legs().map((L) => {
        if (L.kind === "stock") return { kind: "stock", side: Math.sign(L.side), qty: Math.abs(L.qty) };
        const strike = strikeAt(mkt, sym, L.k);
        return {
          kind: L.kind,
          side: Math.sign(L.side),
          qty: Math.abs(L.side) * (L.qty ?? 1),
          strike,
          expDay: exp.day
        };
      });
    }
    function previewCost() {
      if (!legsSpec.length) return 0;
      return legsSpec.reduce((s2, L) => {
        if (L.kind === "stock") return s2 + L.side * L.qty * S2.market.quote(sym).S;
        const q = S2.market.optQuote(sym, L.strike, L.expDay, L.kind);
        const px = L.side > 0 ? q.ask : q.bid;
        return s2 + L.side * L.qty * 100 * px;
      }, 0);
    }
    function paint() {
      S2 = session();
      if (!S2) return;
      shell.innerHTML = "";
      priceChart = null;
      eqChart = null;
      if (S2.status === "passed" || S2.status === "failed") {
        const pass2 = S2.status === "passed";
        if (pass2 && S2.def.id === "first-covered-call") completeStep(4);
        if (pass2) maybeBackupNudge();
        shell.appendChild(el(
          "div",
          { class: "mission-banner" + (pass2 ? "" : " fail") },
          el("div", {}, icon(pass2 ? "trophy" : "burst", { size: 34 })),
          el("h2", { style: "margin:8px 0 4px" }, pass2 ? "Mission passed" : "Mission failed"),
          pass2 ? el("p", { class: "sub", html: md(S2.def.debriefPass || "") }) : el(
            "div",
            {},
            el("p", { class: "sub" }, S2.failReason || ""),
            el("div", { class: "mt1", html: md(S2.def.debriefFail || "") })
          ),
          pass2 ? el("p", { class: "small muted num" }, "+75 XP") : null,
          el(
            "div",
            { class: "btn-row mt2", style: "justify-content:center" },
            el("a", { class: "btn", href: "#/missions", onclick: () => {
              abandoned = true;
              abandon();
            } }, "Back to missions"),
            pass2 && S2.def.id === "first-covered-call" ? el("a", { class: "btn primary", href: "#/welcome" }, "Continue setup \u2192") : null,
            !pass2 ? el("button", { class: "btn primary", onclick: () => {
              abandoned = true;
              start2(id);
              abandoned = false;
              paint();
            } }, "Retry") : null
          )
        ));
        return;
      }
      const head = el("div", { class: "flex-between" });
      head.appendChild(el(
        "div",
        {},
        el(
          "div",
          { class: "crumb" },
          el("a", { href: "#/missions", onclick: (e) => {
            e.preventDefault();
            leave();
          } }, "\u2190 Missions")
        ),
        el("div", { class: "eyebrow" }, "Mission"),
        el("h1", {}, S2.def.title)
      ));
      head.appendChild(el("button", { class: "btn sm", onclick: leave }, "Abandon"));
      shell.appendChild(head);
      const top = el("div", { class: "row mt2" });
      const briefCard = el("div", { class: "card w50" });
      const mktCard = el("div", { class: "card w50" });
      top.appendChild(briefCard);
      top.appendChild(mktCard);
      shell.appendChild(top);
      briefCard.appendChild(el("h3", {}, "Brief"));
      briefCard.appendChild(el("div", { class: "lesson-prose", html: md(S2.def.brief) }));
      if (S2.def.hints?.length) {
        const hintsBox = el(
          "details",
          { class: "mt1" },
          el("summary", { style: "cursor:pointer;font-weight:600;font-size:13px" }, "Hints"),
          el("ul", {}, ...S2.def.hints.map((h) => el("li", { class: "small" }, h)))
        );
        briefCard.appendChild(hintsBox);
      }
      briefCard.appendChild(el("h3", { class: "mt2" }, "Objectives"));
      const ol = el("ul", { class: "mission-objectives" });
      for (const o of S2.objectives) {
        ol.appendChild(el(
          "li",
          {},
          el("span", { class: "num", style: "flex:0 0 1.2em" }, o.met ? "\u2713" : "\u25CB"),
          el("span", {}, o.label || o.type)
        ));
      }
      briefCard.appendChild(ol);
      const mainSym = S2.def.objectives.find((o) => o.sym)?.sym || sym;
      if (S2.market.tickers[mainSym]) sym = mainSym;
      const t = S2.market.tickers[sym];
      const q = S2.market.quote(sym);
      mktCard.appendChild(el(
        "div",
        { class: "flex-between" },
        el("h3", {}, sym),
        el("span", { class: "pill brass num" }, `Day ${S2.market.day} / ${S2.def.endDay}`)
      ));
      mktCard.appendChild(el(
        "div",
        { class: "pos-greeks mb1" },
        el("span", { class: "num" }, F.usd(q.S)),
        el("span", { class: "num" }, F.usd(equity2(), 0) + " equity")
      ));
      const priceBox = el("div", {});
      mktCard.appendChild(priceBox);
      const closes = (t?.closes || []).map((c) => ({ x: c.day, y: c.p }));
      const intra = (t?.intraday || []).map((p) => ({ x: S2.market.day + p.m / 390, y: p.p }));
      const pts = closes.concat(intra.length ? [{ x: S2.market.day, y: t.S }] : []);
      if (pts.length >= 2) {
        priceChart = line(priceBox, {
          height: 160,
          series: [{ name: sym, color: "--s1", points: pts, width: 2, area: true }],
          fmtX: (d) => "D" + Math.round(d),
          fmtY: (y) => F.usd(y, 0),
          tipLabel: ""
        });
      }
      const eqBox = el("div", { class: "mt1" });
      mktCard.appendChild(el("div", { class: "chart-title mt1" }, "Equity"));
      mktCard.appendChild(eqBox);
      if (S2.marks.length >= 2) {
        eqChart = line(eqBox, {
          height: 90,
          series: [{ name: "Eq", color: "--s2", points: S2.marks.map((m) => ({ x: m.day, y: m.eq })), area: true }],
          fmtX: (d) => "D" + Math.round(d),
          fmtY: (y) => F.usd(y / 1e3, 0) + "k",
          tipLabel: ""
        });
      } else {
        eqBox.appendChild(el("div", { class: "small muted num" }, F.usd(equity2(), 0)));
      }
      mktCard.appendChild(el(
        "div",
        { class: "btn-row mt1" },
        el("button", { class: "btn primary", onclick: () => advanceDay() }, "\u23ED Next day")
      ));
      const bot = el("div", { class: "row mt2" });
      const tradeCard = el("div", { class: "card w50" });
      const posCard = el("div", { class: "card w50" });
      bot.appendChild(tradeCard);
      bot.appendChild(posCard);
      shell.appendChild(bot);
      tradeCard.appendChild(el("h3", {}, "Trade"));
      const symSel = el("select", {});
      for (const tk of S2.market.list()) {
        symSel.appendChild(el("option", { value: tk.sym, selected: tk.sym === sym }, tk.sym));
      }
      symSel.addEventListener("change", () => {
        sym = symSel.value;
        legsSpec = [];
        presetId = "";
        paint();
      });
      const expSel = el("select", {});
      S2.market.expiries(sym).forEach((e, i) => {
        expSel.appendChild(el("option", { value: i, selected: i === expIdx }, e.label));
      });
      expSel.addEventListener("change", () => {
        expIdx = +expSel.value;
        if (presetId) {
          const p = PRESETS2.find((x) => x.id === presetId);
          if (p) applyPreset(p);
        }
        paint();
      });
      const presetSel = el("select", {});
      presetSel.appendChild(el("option", { value: "" }, "Choose a strategy\u2026"));
      PRESETS2.forEach((p) => presetSel.appendChild(el("option", { value: p.id, selected: p.id === presetId }, p.name)));
      presetSel.addEventListener("change", () => {
        presetId = presetSel.value;
        const p = PRESETS2.find((x) => x.id === presetId);
        if (p) applyPreset(p);
        else legsSpec = [];
        paint();
      });
      tradeCard.appendChild(el(
        "div",
        { class: "row" },
        el("div", { class: "field", style: "flex:1" }, el("label", {}, "Symbol"), symSel),
        el("div", { class: "field", style: "flex:1" }, el("label", {}, "Expiry"), expSel),
        el("div", { class: "field", style: "flex:1" }, el("label", {}, "Strategy"), presetSel)
      ));
      if (legsSpec.length) {
        const cost = previewCost();
        tradeCard.appendChild(el(
          "div",
          { class: "small muted mt1" },
          legsSpec.map((L) => {
            if (L.kind === "stock") return `${L.side > 0 ? "+" : "\u2212"}${L.qty} sh`;
            return `${L.side > 0 ? "+" : "\u2212"}${L.qty} ${F.usd(L.strike, 0)}${L.kind === "call" ? "C" : "P"}`;
          }).join(" \xB7 ")
        ));
        tradeCard.appendChild(el(
          "div",
          { class: "btn-row mt1" },
          el(
            "span",
            { class: "num", style: "font-weight:700" },
            (cost >= 0 ? "Debit " : "Credit ") + F.usd(Math.abs(cost))
          ),
          el("button", { class: "btn primary", onclick: () => {
            const label = PRESETS2.find((p) => p.id === presetId)?.name || "Mission trade";
            const res = trade(sym, legsSpec, label);
            if (res.err) gateToast(res.err);
            else toast(`${label} opened`, "gain");
          } }, "Trade")
        ));
      } else {
        tradeCard.appendChild(el("p", { class: "small muted mt1" }, "Pick a preset to preview cost and trade."));
      }
      posCard.appendChild(el("h3", {}, "Positions"));
      if (!S2.positions.length) {
        posCard.appendChild(el("p", { class: "small muted" }, "No open positions."));
      } else {
        for (const pos of S2.positions) {
          const val = positionValue(pos);
          posCard.appendChild(el(
            "div",
            { class: "flex-between mb1" },
            el(
              "div",
              {},
              el("div", { style: "font-weight:600" }, `${pos.sym} \xB7 ${pos.label}`),
              el("div", { class: "small num muted" }, F.usd(val, 0))
            ),
            el("button", { class: "btn sm", onclick: () => {
              const res = closePos(pos.id);
              if (res?.err) toast(res.err, "loss");
            } }, "Close")
          ));
        }
      }
      posCard.appendChild(el("h3", { class: "mt2" }, "Mission log"));
      const feed2 = el("div", { class: "event-feed" });
      for (const row of S2.log.slice(0, 16)) {
        feed2.appendChild(el(
          "div",
          { class: "event-item" },
          el("span", { class: "et" }, `Day ${row.day}`),
          el("span", { class: "ev-row" }, iconFor(row.icon, "news", { cls: "ev-ic" }), " " + row.text)
        ));
      }
      posCard.appendChild(feed2);
    }
    paint();
    const unMission = bus.on("mission", () => paint());
    return () => {
      unMission();
      priceChart && priceChart.destroy();
      eqChart && eqChart.destroy();
      if (!abandoned) {
        const cur = session();
        if (cur && cur.status === "active") abandon();
      }
    };
  }
  var view15 = {
    render(root, params) {
      if (params[0]) return renderRunner(root, params[0]);
      renderHub(root);
    }
  };

  // src/main.js
  function start4() {
    boot({ home: view6, learn: view7, strategy: view8, greeks: view9, vol: view10, market: view11, risk: view12, progress: view13, journal: view14, missions: view15, legal: view4 });
    start3();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start4);
  else start4();
})();
