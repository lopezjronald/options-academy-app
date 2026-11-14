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
    if (opt === 2 && calls.length === 1 && puts.length === 1) {
      const c = calls[0], p = puts[0];
      if (p.side === 1 && c.side === -1 && p.qty === c.qty && p.strike < c.strike && longStock >= c.qty * 100) return "collar";
    }
    if (opt === 0 && longStock > 0) return "long-stock";
    if (legs.length === 3 && (calls.length === 3 || puts.length === 3)) {
      const [low, middle, high] = [...legs].sort((a, b) => a.strike - b.strike);
      if (low.strike < middle.strike && middle.strike < high.strike && middle.strike - low.strike === high.strike - middle.strike && low.expDay === middle.expDay && middle.expDay === high.expDay && low.side === 1 && middle.side === -1 && high.side === 1 && low.qty > 0 && middle.qty === 2 * low.qty && high.qty === low.qty) return "butterfly";
    }
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
    if (legs.length === 2 && (calls.length === 2 || puts.length === 2)) {
      const [a, b] = legs;
      if (a.strike === b.strike && a.side === -b.side && a.qty === b.qty && a.expDay != null && b.expDay != null && a.expDay !== b.expDay) return "calendar";
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
      label: "Get paid from shares I already own",
      tip: "Maria owns 100 shares. She gets paid cash today \u2014 say $200 \u2014 for promising them at a higher price. The tradeoff: her shares can still fall (the $200 only softens that), and gains above her promised price go to the buyer. Open Missions and start First Covered Call."
    },
    protect: {
      label: "Put a floor under shares I own",
      tip: "Sam owns shares and pays a fee so a fall can only go so far. A collar sells a ceiling to help pay for that floor. Try Crash Insurance after this paper trade."
    },
    direction: {
      label: "Bet on a move, and name my worst loss",
      tip: "A cheaper upside bet and a cheaper downside bet both cap the win and the loss. In Strategy Lab, pick Bull Call Spread or Bear Put Spread, then paper-trade Lumend Brands."
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
      brief: "Burgess Restaurant Group (BRGR, ~$67) is drifting sideways in a quiet week. Maria can get paid cash today by selling a call option against 100 shares she owns\u2014remembering that the upfront cash only softens a stock drop and caps her gains above the strike.\n\n**Buy 100 shares of BRGR and sell 1 call above today's price on the same ticket**, then hold your covered call through Day 10 while keeping your account drop under 15%.",
      hints: [
        "A covered call pairs +100 shares of BRGR with \u22121 call on the same order ticket.",
        "Pick a call strike price a step or two above today's ~$67 share price so you collect upfront cash while leaving a little room for the shares to rise.",
        "Hold the position through Day 10\u2014each quiet day that passes makes the call you sold cheaper."
      ],
      objectives: [
        { type: "open", strategy: "covered-call", sym: "BRGR", label: "Open a covered call on BRGR" },
        { type: "holdThrough", day: 10, sym: "BRGR", label: "Hold the BRGR position through Day 10" },
        { type: "maxDrawdown", pct: 0.15, label: "Keep drawdown under 15%" }
      ],
      debriefPass: "You got paid upfront cash while Burgess Restaurant Group drifted through ten quiet days. That cash payment lowered your breakeven price and cushioned the mild dip, though you still carried the downside risk of the 100 shares.",
      debriefFail: "Make sure you bought 100 shares of BRGR and sold 1 call above today's price on the same ticket, then held through Day 10. Selling a call against 100 shares pays you cash in a flat week, as long as you size the trade within the 15% loss limit."
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
      brief: "PowerSun Energy (PWRS, ~$95) looks calm on Day 1, but waiting until a crash starts means paying storm-season prices for protection. Maria can lock in a hard dollar floor right now by pairing 100 shares with 1 put option.\n\n**Open a protective put on PWRS** (buy 100 shares plus 1 put on the same ticket) on Day 1 and hold through Day 5 while keeping your account drop under 12%.",
      hints: [
        "A protective put combines +100 shares of PWRS and +1 put on the same order ticket.",
        "Buy your put on Day 1 while the market is still calm, before the Day 2 selloff makes protection much more expensive.",
        "Pick a put strike right at or just below today's ~$95 price to put a tight dollar floor under your 100 shares."
      ],
      objectives: [
        { type: "open", strategy: "protective-put", sym: "PWRS", label: "Open stock + protective put on PWRS" },
        { type: "maxDrawdown", pct: 0.12, label: "Keep max drawdown under 12%" },
        { type: "holdThrough", day: 5, sym: "PWRS", label: "Hold protection through Day 5" }
      ],
      debriefPass: "When the Day 2 selloff and Days 3\u20134 drops hit PowerSun Energy, your put climbed in dollar value right as your 100 shares fell. Paying a small upfront fee and accepting a small deductible locked in a hard dollar floor before the storm arrived.",
      debriefFail: "Holding 100 shares without a put\u2014or buying too many shares\u2014breaks the 12% loss limit when the Day 2 selloff hits. Pair 100 shares of PWRS with 1 put on Day 1 while protection is still cheap, and hold through Day 5."
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
      brief: "Sam thinks Rocket Robotics (RCKT, ~$182) could rally, but buying a call option means paying daily time decay on a strict deadline\u2014if the stock drifts sideways, the option melts a little every afternoon.\n\n**Open a long call on RCKT**, watch how the quiet week treats your time value, and **close all positions by Day 6** while keeping your account drop under 8%.",
      hints: [
        "Buy 1 call option (+1 call) near or slightly below today's ~$182 RCKT price so you do not overspend on a far-away strike.",
        "Watch the option price as each quiet day passes\u2014without a fast rally, daily time decay (theta) shrinks the call's value.",
        "Sell your RCKT call to close before Day 6 so you rescue your remaining cash before decay speeds up."
      ],
      objectives: [
        { type: "open", strategy: "long-call", sym: "RCKT", label: "Open a long call on RCKT" },
        { type: "flatBy", day: 6, label: "Close all positions by Day 6" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "You saw firsthand why call buyers need the stock to move both far enough and fast enough. When Rocket Robotics drifted quietly instead of rallying, closing by Day 6 saved what was left of your time value before the final days drained it.",
      debriefFail: "Make sure you bought 1 call on RCKT without oversizing and closed it completely before Day 6. When an expected rally does not show up on time, closing a melting call early saves cash for the next trade."
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
      brief: "Maria would gladly own 100 shares of Burgess Restaurant Group (BRGR, ~$67) at a lower price, and she can get paid cash upfront to wait by selling a cash-secured put\u2014knowing she must buy the shares if BRGR drops below her strike.\n\n**Open a cash-secured put on BRGR** and hold it through Day 9 while keeping your account drop under 10% and finishing with at least +$10 in net profit.",
      hints: [
        "Sell 1 put (\u22121 put) on BRGR; the broker automatically sets aside the cash needed to buy 100 shares at the strike.",
        "Pick an out-of-the-money put strike below today's ~$67 price so a mild dip stays comfortably above your breakeven price.",
        "Hold through Day 9 so daily time decay shrinks the put you sold and turns the upfront cash into profit."
      ],
      objectives: [
        { type: "open", strategy: "cash-secured-put", sym: "BRGR", label: "Open a cash-secured put on BRGR" },
        { type: "holdThrough", day: 9, sym: "BRGR", label: "Hold the short put through Day 9" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" },
        { type: "profit", min: 10, label: "Finish with at least +$10 net profit" }
      ],
      debriefPass: "While Burgess Restaurant Group drifted gently, the stock stayed calmer than the fear priced into the option. You kept the upfront cash as time decay worked in your favor, while standing ready to buy 100 shares at a discount.",
      debriefFail: "Check that you sold an out-of-the-money put below BRGR's ~$67 price and held it through Day 9 without closing early at a loss. Selling a put strike too high above the stock exposes you to immediate share-drop losses."
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
      brief: "Rocket Robotics (RCKT, ~$182) reports earnings on Day 6, and pre-earnings fear has pushed option prices sky-high. Instead of overpaying for a single call, Sam can sell a higher-strike call against it to cut both his upfront cost and his exposure to the post-earnings volatility crush\u2014in exchange for capping his upside.\n\n**Open a call vertical on RCKT** and **close all positions by Day 6** with a max drawdown under 8%.",
      hints: [
        "Build a call vertical on one ticket by buying 1 lower-strike call (+1 call) and selling 1 higher-strike call (\u22121 call) in the same expiration.",
        "Selling the higher-strike call collects inflated pre-earnings cash, lowering both your net debit and your vega risk.",
        "Close both legs of the spread on or before Day 6 so you have zero open positions at the deadline."
      ],
      objectives: [
        { type: "open", strategy: "call-vertical", sym: "RCKT", label: "Open a call vertical on RCKT" },
        { type: "flatBy", day: 6, label: "Be flat by Day 6" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "By selling a higher-strike call against your long call, you avoided overpaying for pre-earnings fear. When Rocket Robotics barely moved on Day 6 and implied volatility collapsed, the short call dropped in value too and cushioned your spread.",
      debriefFail: "Make sure you opened a two-leg call vertical (+1 lower-strike call and \u22121 higher-strike call) on RCKT and closed it by Day 6. Holding a single unhedged call into earnings leaves you fully exposed when implied volatility drops."
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
      brief: 'New traders often buy a straddle right before earnings thinking "the stock has to move"\u2014forgetting that the option price already charges for a big expected jump. If the actual move is smaller than the priced-in jump, implied volatility collapses and both options lose value at once.\n\nSee it in action: **open a 1-contract long straddle on RCKT** (~$182) before Day 6 earnings, then **close it by Day 7** while keeping your account drop under 20%.',
      hints: [
        "A long straddle buys 1 call (+1 call) and 1 put (+1 put) at the exact same strike and expiration.",
        "Hold the straddle into Day 6 to watch the post-earnings implied-volatility crush happen, then close both legs before Day 7.",
        "Buy only 1 straddle (1 call and 1 put) so the Day 6 volatility drop stays well inside your 20% drawdown limit."
      ],
      objectives: [
        { type: "open", strategy: "long-straddle", sym: "RCKT", label: "Open a long straddle on RCKT" },
        { type: "flatBy", day: 7, label: "Close the straddle and be flat by Day 7" },
        { type: "maxDrawdown", pct: 0.2, label: "Keep max drawdown under 20%" }
      ],
      debriefPass: "You watched the classic earnings trap safely inside the simulator. When Rocket Robotics moved less than 1% on Day 6, implied volatility fell by nearly a third and deflated both your call and your put at the same time.",
      debriefFail: "If you broke the 20% loss limit, you bought too many contracts at expensive pre-earnings prices; if you missed the deadline, you forgot to close by Day 7. Buying a straddle before big news only wins if the real move beats the move already priced in."
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
      brief: "Four sleepy days have pushed implied volatility on Lumend Brands (LMND, ~$42) down to bargain levels\u2014the exact moment when downside protection is cheapest to buy.\n\n**Open a protective put on LMND** (100 shares plus 1 put on the same ticket) while volatility is quiet and **hold it through Day 5** when the sudden selloff hits, keeping your drawdown under 10%.",
      hints: [
        "Combine +100 shares of LMND (~$4,200) and +1 put on one order ticket during the calm Days 1\u20134 window.",
        "Buy your put while implied volatility is still low on Days 1\u20134 so you pay sunny-day prices before Day 5.",
        "Hold both the shares and the put through the Day 5 selloff so the put floors your downside."
      ],
      objectives: [
        { type: "open", strategy: "protective-put", sym: "LMND", label: "Open a protective put on LMND" },
        { type: "holdThrough", day: 5, sym: "LMND", label: "Hold through the Day 5 vol blowup" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" }
      ],
      debriefPass: "Maria bought protection during a four-day calm spell and held it straight through the Day 5 market drop. Because implied volatility was low when you entered, the put cost very little upfront and jumped in value when both fear and share losses hit.",
      debriefFail: "Make sure you opened +100 shares of LMND paired with +1 put before the Day 5 drop and held through Day 5. Calm, low-volatility days are the most affordable time to put a floor under your shares."
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
      brief: "Heavy trading at the $42 strike is pulling Lumend Brands (LMND, ~$42) back toward that price as Friday expiration approaches, turning last-day gamma and assignment into a coin toss.\n\n**Open a put vertical on LMND** early in the week, **hold it through Day 3**, and **close all positions by Day 5** while keeping your drawdown under 10%.",
      hints: [
        "Build a put vertical on LMND by pairing +1 put and \u22121 put at two different strikes in the same expiration.",
        "Keep the spread open through Day 3 while hedging flows pull LMND back and forth around the strike.",
        "Close both legs before Day 5 so you are completely out of the trade before Friday's pin risk begins."
      ],
      objectives: [
        { type: "open", strategy: "put-vertical", sym: "LMND", label: "Open a put vertical on LMND" },
        { type: "holdThrough", day: 3, sym: "LMND", label: "Hold the spread through Day 3" },
        { type: "flatBy", day: 5, label: "Be flat by Day 5 (pin day)" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" }
      ],
      debriefPass: "You traded the mid-week swings and stepped aside before Friday's pin at the strike. When heavy open interest glues a stock to a strike on expiration afternoon, closing early avoids wild last-hour gamma swings and surprise weekend share assignments.",
      debriefFail: "Check your timing: you need to hold the LMND put vertical through Day 3 and close it completely before Day 5. Holding a spread into a pinned Friday close turns a controlled trade into a last-minute assignment gamble."
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
      brief: "Sam buys an out-of-the-money strangle on Galaxy Media (GLXY, ~$23.50) hoping for a big move in either direction, but the stock settles into a sleepy ten-day drift where both options slowly bleed time value.\n\n**Open a long strangle on GLXY**, see how quiet days drain both wings, and **close the trade by Day 5** with a drawdown under 5% and a net loss no worse than \u2212$150.",
      hints: [
        "A long strangle buys 1 out-of-the-money call (+1 call above spot) and 1 out-of-the-money put (+1 put below spot) on GLXY.",
        "Do not wait around hoping for a miracle in a dead-quiet week\u2014every calm afternoon drains cash from both options.",
        "Close both legs within a day or two (and before Day 5) so your total time-decay loss stays well inside \u2212$150."
      ],
      objectives: [
        { type: "open", strategy: "long-strangle", sym: "GLXY", label: "Open a long strangle on GLXY" },
        { type: "flatBy", day: 5, label: "Cut the trade and be flat by Day 5" },
        { type: "maxDrawdown", pct: 0.05, label: "Keep max drawdown under 5%" },
        { type: "profit", min: -150, label: "Keep net P&L above \u2212$150" }
      ],
      debriefPass: "Taking a tiny, controlled exit is a win when the big move you expected does not happen. Because Galaxy Media barely budged, closing by Day 5 rescued most of your premium before daily time decay ate both wings.",
      debriefFail: "Holding a long strangle through a quiet week lets time decay eat both the call and the put every afternoon. Buy just 1 strangle on GLXY and close it before Day 5 so the loss stays smaller than \u2212$150."
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
      brief: "Welcome to your Week 1 checkup: Maria has $25,000 in cash, six stocks and index choices on the board, and a rough five-day market storm ahead.\n\n**Open any capped-risk position**, hold an active trade through Day 4, keep your max drawdown at or below 10%, and **finish Day 6 with P&L of \u2212$250 or better**.",
      hints: [
        "Crash Week brings a sharp drop on Day 2 plus two days of aftershocks\u2014a put vertical, a protective put, or a small capped spread handles the drop best.",
        "Keep your contract count small (1 contract or 1 spread) so the Day 2\u20134 selloff never pushes your $25,000 account past the 10% loss limit.",
        "Keep at least one position open through Day 4 so the hold-through goal turns green."
      ],
      objectives: [
        { type: "open", label: "Open a defined-risk position" },
        { type: "holdThrough", day: 4, label: "Hold exposure through Day 4" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" },
        { type: "profit", min: -250, label: "Finish with P&L of \u2212$250 or better" }
      ],
      debriefPass: "You made it through a sharp Day 2 drop and two days of rough aftershocks without breaking your risk limits. Picking a capped-loss trade and sizing it modestly before the storm hits is what keeps an account alive.",
      debriefFail: "Crash Week punishes oversized bullish bets and unhedged short options when Day 2 hits. Try a small capped-risk trade\u2014such as a 1-lot put vertical, a protective put, or a small iron condor\u2014and hold it through Day 4."
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
      brief: "Earlier you saw how a quiet week drains a long strangle. Now see when a long strangle shines: Maria buys cheap out-of-the-money wings on PowerSun Energy (PWRS, ~$95) during a four-day calm spell right before a big Day 5 shock hits.\n\n**Open a long strangle on PWRS** during the calm days, **hold it through the Day 5 shock**, and **close it by Day 6** while keeping your drawdown under 10%.",
      hints: [
        "Build a long strangle on PWRS by buying 1 out-of-the-money call (+1 call above ~$95) and 1 out-of-the-money put (+1 put below ~$95) in the same expiration.",
        "Keep your size small (1 strangle) during Days 1\u20134 so four quiet days of time decay stay easily inside your 10% drawdown limit.",
        "Hold through Day 5 when the sharp selloff and volatility jump lift your put wing, then close both legs before Day 6."
      ],
      objectives: [
        { type: "open", strategy: "long-strangle", sym: "PWRS", label: "Open a long strangle on PWRS" },
        { type: "holdThrough", day: 5, sym: "PWRS", label: "Hold the strangle through Day 5" },
        { type: "flatBy", day: 6, label: "Harvest the spike and be flat by Day 6" },
        { type: "maxDrawdown", pct: 0.1, label: "Keep max drawdown under 10%" }
      ],
      debriefPass: "That is the upside of a well-timed strangle: you bought both wings while implied volatility was cheap, sized small enough to handle four days of time decay, and cashed out after the Day 5 drop and volatility spike.",
      debriefFail: "Make sure you opened +1 out-of-the-money call and +1 out-of-the-money put on PWRS, held through the Day 5 shock, and closed both legs before Day 6 without breaking the 10% drawdown cap."
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
      brief: "When Burgess Restaurant Group (BRGR, ~$67) drifts inside a quiet range for ten days, Sam can collect upfront cash from both above and below the stock with an iron condor\u2014while buying outer wings so his worst-case loss is strictly capped.\n\n**Open an iron condor on BRGR**, **hold it through Day 8** as time decay shrinks both spreads, keep your drawdown under 8%, and **finish with at least +$15 net profit**.",
      hints: [
        "An iron condor combines a bull put credit spread below ~$67 (\u22121 higher OTM put, +1 lower OTM put) and a bear call credit spread above ~$67 (\u22121 lower OTM call, +1 higher OTM call) in the same expiration.",
        "Pick short strikes with enough breathing room around $67 so BRGR stays between your inner strikes through Day 8.",
        "Trade just 1 iron condor so your maximum possible loss uses only a tiny slice of your $25,000 cash."
      ],
      objectives: [
        { type: "open", strategy: "iron-condor", sym: "BRGR", label: "Open an iron condor on BRGR" },
        { type: "holdThrough", day: 8, sym: "BRGR", label: "Hold the condor through Day 8" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" },
        { type: "profit", min: 15, label: "Finish with at least +$15 net profit" }
      ],
      debriefPass: "By setting your short strikes outside Burgess Restaurant Group's quiet drift and buying outer wings to cap your risk, you collected steady time decay from both sides without taking uncapped crash risk.",
      debriefFail: "Check that all four legs of your BRGR iron condor share the same expiration and that your short strikes sit wide enough around ~$67 to stay profitable through Day 8 with at least +$15 net gain."
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
      brief: "Buying a single put on Galaxy Media (GLXY, ~$23.50) costs full upfront cash, whereas a bear put spread sells a lower-strike put to cut the entry cost in exchange for capping the gain below that lower strike.\n\n**Open a put vertical on GLXY**, **hold it through Day 4** across the Crash Week selloff, and **close all positions by Day 5** with a drawdown under 8%.",
      hints: [
        "Build a bear put vertical on GLXY by buying 1 higher-strike put near ~$23.50 (+1 put) and selling 1 lower-strike put (\u22121 put) in the same expiration.",
        "Open the spread on Day 1 before the Day 2 selloff pushes GLXY down toward your lower strike.",
        "Hold through the Day 3\u20134 drops, then close both legs before Day 5 so you finish completely flat."
      ],
      objectives: [
        { type: "open", strategy: "put-vertical", sym: "GLXY", label: "Open a put vertical on GLXY" },
        { type: "holdThrough", day: 4, sym: "GLXY", label: "Hold the spread through Day 4" },
        { type: "flatBy", day: 5, label: "Close the spread and be flat by Day 5" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "Your long put gained value as Galaxy Media slid across Days 2\u20134, while the short lower-strike put chipped in upfront cash to reduce your entry cost and cushioned the spread once volatility leveled off.",
      debriefFail: "Check that you opened a two-leg put vertical (+1 higher-strike put, \u22121 lower-strike put) on GLXY, held it through Day 4, and closed both legs before Day 5."
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
      brief: "Individual company stocks can jump on surprise company news, while the Academy 500 Index (FAM500, ~$500) tracks the broad market as a whole\u2014and because each index point is worth $100 per contract, sizing takes extra care.\n\nTrade **FAM500 only**: **open any capped-risk position on FAM500**, **hold it through Day 4** during Crash Week, and **close all positions by Day 6** with a max drawdown under 8%.",
      hints: [
        "Trade only on the FAM500 option chain\u2014a bear put spread (+1 higher put, \u22121 lower put) handles the Day 2 market drop and Days 3\u20134 aftershocks cleanly.",
        "Keep your size small (1 spread) because a $500 index option moves more dollars per 1% swing than a $42 stock option.",
        "Hold your FAM500 trade through Day 4 and close every leg before Day 6."
      ],
      objectives: [
        { type: "open", sym: "FAM500", label: "Open a defined-risk position on FAM500" },
        { type: "holdThrough", day: 4, sym: "FAM500", label: "Hold FAM500 exposure through Day 4" },
        { type: "flatBy", day: 6, label: "Close all positions and be flat by Day 6" },
        { type: "maxDrawdown", pct: 0.08, label: "Keep max drawdown under 8%" }
      ],
      debriefPass: "You sized cleanly for the $500 Academy 500 Index, carried your capped-risk trade through three days of market-wide selling, and closed on schedule inside the 8% loss limit.",
      debriefFail: "Make sure your trade is opened on FAM500, sized small enough for a $500 index so your drawdown stays under 8%, held through Day 4, and closed completely before Day 6."
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
    if (S && S.status === "active" && S.purpose) S = null;
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
  function startDemo(def, purpose = "watch") {
    if (!def || !Array.isArray(def.steps)) return { err: "Unknown demo" };
    if (S && S.status === "active" && !S.purpose) {
      return { err: "A mission is in progress \u2014 finish or abandon it before starting a demo." };
    }
    const market2 = createMarket({ seed: def.seed, scenarioId: def.scenarioId });
    S = {
      def,
      purpose,
      market: market2,
      cash: def.startCash ?? 25e3,
      positions: [],
      log: [],
      marks: [{ day: market2.day, eq: def.startCash ?? 25e3 }],
      objectives: [],
      status: "active",
      failReason: null
    };
    log("\u{1F680}", `Demo: ${def.title}`);
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
    if (S.purpose) return;
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
          "You opened this because you want one thing from the market. Pick that outcome. You can change it later."
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
          tip || "Watch Maria buy 100 shares, then sell a call above today's price. It is paper money only."
        ));
        host.appendChild(el(
          "div",
          { class: "card mt2" },
          el("h3", {}, "Maria's covered call"),
          el(
            "p",
            { class: "sub" },
            "Maria buys 100 shares, then sells a call above today's price. Watch the clicks, replay them, then try them yourself."
          ),
          el(
            "div",
            { class: "btn-row mt1" },
            el("a", { class: "btn primary", href: "#/demo/covered-call/watch" }, "Watch the covered call \u2192")
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
          "You buy a call and go to sleep. Two quiet forces work overnight: time passing and excitement fading."
        ));
        const box = el("div", { class: "card mt2" });
        host.appendChild(box);
        box.appendChild(el("div", { class: "chart-title" }, "A call's fee as the days run out"));
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
            { name: "Time passing", color: "--s1", points: ptsTheta, width: 2 },
            { name: "Excitement faded", color: "--s6", points: ptsIv, width: 2, dash: true }
          ],
          fmtX: (d) => Math.round(d) + "d",
          fmtY: (y) => "$" + y.toFixed(2),
          tipLabel: "Days left "
        });
        legend(chartBox, [
          { name: "Time passing", color: "--s1" },
          { name: "Excitement faded", color: "--s6" }
        ]);
        box.appendChild(el(
          "p",
          { class: "small muted mt1" },
          "Same stock, same promise. Fewer days left, and the fee shrinks. A calmer crowd shrinks it again. The lessons will name these two forces."
        ));
        host.appendChild(el(
          "div",
          { class: "btn-row mt2" },
          el("button", { class: "btn primary", onclick: () => {
            setStep(3);
            paint();
          } }, "Got it \u2014 continue \u2192"),
          el("a", { class: "btn", href: "#/greeks" }, "Optional: the curves lab")
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
          "Mission 1 is Maria's drill. She owns shares and gets paid to promise them higher. The sandbox shows the clicks and when you are done."
        ));
        host.appendChild(el(
          "div",
          { class: "card mt2" },
          el("div", {}, icon("compass", { size: 30 })),
          el("h3", {}, "First Covered Call"),
          el(
            "p",
            { class: "sub" },
            done ? "You finished the drill. Next we grade the decision, not the luck." : "You hold the shares. Sell one call above today's price. The shares cap what the call can cost you. Paper money only."
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
          "We grade the decision, not the luck. Four equal parts, 25 points each:"
        ));
        const rubric = [
          ["Your written plan", "Name the direction, give a real reason (at least 20 characters), and say how you get out \u2014 before you click Place. The journal calls this the thesis."],
          ["A loss you can name", "Write the most you can lose when the option expires, before you click Place. The journal calls this defined risk."],
          ["A small slice", "Risk about 2% of the account per trade \u2014 on your $100,000 of paper money, that is $2,000 at most on one idea. The journal flags anything bigger than 5% ($5,000)."],
          ["Sticking to the plan", "After you close, say whether you followed the plan you wrote."]
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
              "Academy is $29 a month. You get every mission, an unlimited journal, and every practice name. This is a simulation, not investment advice."
            ),
            el("a", { class: "btn primary", href: "#/upgrade" }, "See plans \u2192")
          ));
        }
        host.appendChild(el(
          "div",
          { class: "btn-row mt2" },
          el("button", { class: "btn primary", onclick: () => {
            finish();
            toast("Setup complete. Your paper account is ready.", "gain");
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

  // src/ui/demo-player.js
  var AUTO_MS = 4e3;
  var activeDestroy = null;
  function mountCoach(opts) {
    if (activeDestroy) {
      const prev = activeDestroy;
      activeDestroy = null;
      prev();
    }
    const steps = opts.steps || [];
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let manual = !opts.auto || !!(mq && mq.matches);
    let i = 0;
    let paused = false;
    let error = "";
    let anchorMissing = false;
    let timer = null;
    let poll = null;
    const ran = /* @__PURE__ */ new Set();
    const skipped = /* @__PURE__ */ new Set();
    let scrolledFor = "";
    let dead = false;
    const ring = el("div", { class: "oa-coach-ring", "aria-hidden": "true" });
    ring.style.display = "none";
    const say = el("p", { class: "oa-coach-say", "aria-live": "polite" });
    const errEl = el("p", { class: "small muted oa-coach-err" });
    const count = el("div", { class: "eyebrow num" }, "");
    const backBtn = el("button", { type: "button", class: "btn" }, "Back");
    const nextBtn = el("button", { type: "button", class: "btn primary" }, "Next");
    const pauseBtn = el("button", { type: "button", class: "btn" }, "Pause");
    const replayBtn = el("button", { type: "button", class: "btn" }, "Replay");
    const skipBtn = el("button", { type: "button", class: "btn" }, "Skip");
    const bar = el(
      "div",
      {
        class: "oa-coach-bar",
        role: "dialog",
        "aria-label": "Guide"
      },
      count,
      say,
      errEl,
      el("div", { class: "btn-row" }, backBtn, nextBtn, pauseBtn, replayBtn, skipBtn)
    );
    document.body.appendChild(ring);
    document.body.appendChild(bar);
    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    function step() {
      return steps[i] || null;
    }
    function findAnchor(name) {
      if (!name) return null;
      const nodes = document.querySelectorAll('[data-coach="' + CSS.escape(name) + '"]');
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) return n;
      }
      return null;
    }
    function canLeave() {
      if (anchorMissing) return true;
      if (error) return false;
      const s2 = step();
      if (!s2) return false;
      if (opts.ready && !opts.ready(s2)) return false;
      return true;
    }
    function paintBar() {
      const s2 = step();
      const last = i >= steps.length - 1;
      count.textContent = steps.length ? i + 1 + " / " + steps.length : "";
      say.textContent = s2 ? s2.say : "";
      errEl.textContent = error || "";
      errEl.style.display = error ? "" : "none";
      backBtn.disabled = i <= 0;
      const leave = canLeave();
      nextBtn.disabled = !leave && !error;
      nextBtn.textContent = error ? "Retry" : last ? "Finish" : "Next";
      pauseBtn.hidden = manual;
      pauseBtn.textContent = paused ? "Resume" : "Pause";
      skipBtn.hidden = !anchorMissing;
    }
    function place() {
      const s2 = step();
      const node = s2 ? findAnchor(s2.anchor || "") : null;
      anchorMissing = !!(s2 && s2.anchor && !node);
      if (!node) {
        ring.style.display = "none";
        paintBar();
        if (!manual && !paused && !timer && canLeave()) arm(AUTO_MS);
        return;
      }
      if (scrolledFor !== (s2.id || String(i))) {
        scrolledFor = s2.id || String(i);
        try {
          node.scrollIntoView({ block: "nearest", inline: "nearest" });
        } catch {
        }
      }
      const r = node.getBoundingClientRect();
      const pad = 6;
      ring.style.display = "block";
      ring.style.left = r.left - pad + "px";
      ring.style.top = r.top - pad + "px";
      ring.style.width = Math.max(0, r.width + pad * 2) + "px";
      ring.style.height = Math.max(0, r.height + pad * 2) + "px";
      paintBar();
      if (!manual && !paused && !timer && canLeave()) arm(AUTO_MS);
    }
    function arm(ms) {
      clearTimer();
      if (manual || paused || dead) return;
      if (!canLeave()) return;
      timer = setTimeout(() => forward(), ms == null ? AUTO_MS : ms);
    }
    function enter() {
      clearTimer();
      error = "";
      const s2 = step();
      if (!s2) {
        finish2();
        return;
      }
      try {
        s2.prepare?.();
      } catch {
      }
      if (opts.onPerform && s2.id && !ran.has(s2.id)) {
        const res = opts.onPerform(s2);
        if (res && res.err) {
          error = res.err;
          place();
          return;
        }
        ran.add(s2.id);
      }
      place();
      if (!manual && canLeave()) arm(AUTO_MS);
    }
    function forward() {
      if (dead) return;
      if (error) {
        enter();
        return;
      }
      if (!canLeave()) {
        place();
        return;
      }
      if (anchorMissing) {
        const s2 = step();
        if (s2 && opts.ready && !opts.ready(s2)) skipped.add(s2.id || String(i));
      }
      if (i >= steps.length - 1) {
        finish2();
        return;
      }
      i += 1;
      enter();
    }
    function back() {
      if (i <= 0) return;
      clearTimer();
      error = "";
      i -= 1;
      enter();
    }
    function finish2() {
      if (dead) return;
      clearTimer();
      const done = opts.onFinish;
      const skippedCount = skipped.size;
      destroy();
      done?.(skippedCount);
    }
    function exit() {
      if (dead) return;
      clearTimer();
      const go = opts.onExit;
      destroy();
      go?.();
    }
    function restart() {
      if (dead) return;
      clearTimer();
      i = 0;
      paused = false;
      error = "";
      ran.clear();
      skipped.clear();
      scrolledFor = "";
      try {
        opts.onReplay?.();
      } catch {
      }
      enter();
    }
    function onKey(e) {
      if (dead) return;
      const t = (
        /** @type {HTMLElement} */
        e.target
      );
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
        return;
      }
      if (typing) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        forward();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === " " && !manual) {
        e.preventDefault();
        paused = !paused;
        if (paused) clearTimer();
        else arm(AUTO_MS);
        paintBar();
      }
    }
    function onResize() {
      place();
    }
    function onMotion() {
      manual = !opts.auto || !!(mq && mq.matches);
      if (manual) clearTimer();
      else if (!paused) arm(AUTO_MS);
      paintBar();
    }
    backBtn.addEventListener("click", back);
    nextBtn.addEventListener("click", forward);
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      if (paused) clearTimer();
      else arm(AUTO_MS);
      paintBar();
    });
    replayBtn.addEventListener("click", restart);
    skipBtn.addEventListener("click", () => {
      anchorMissing = true;
      if (i >= steps.length - 1) finish2();
      else {
        i += 1;
        enter();
      }
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    if (mq && mq.addEventListener) mq.addEventListener("change", onMotion);
    poll = setInterval(() => {
      if (!dead) place();
    }, 400);
    function destroy() {
      if (dead) return;
      dead = true;
      clearTimer();
      if (poll) clearInterval(poll);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onMotion);
      ring.remove();
      bar.remove();
      if (activeDestroy === destroy) activeDestroy = null;
    }
    activeDestroy = destroy;
    enter();
    return { destroy, refresh: place, restart };
  }

  // src/ui/tour.js
  var KEY3 = "oa.tour";
  function markTour() {
    try {
      localStorage.setItem(KEY3, "1");
    } catch {
    }
  }
  function mobile() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 640px)").matches);
  }
  function prepare(anchor) {
    if (!mobile()) {
      closeSheets();
      return;
    }
    if (anchor === "nav-missions") openPracticeSheet();
    else if (anchor === "nav-journal") openYouSheet();
    else closeSheets();
  }
  var STOPS = [
    {
      id: "next",
      anchor: "next-step",
      say: "This bar names the one next thing to do. One sentence, one button, on every screen."
    },
    {
      id: "lessons",
      anchor: "nav-learn",
      say: "Lessons are where the idea is explained. Read it here, then practice the clicks."
    },
    {
      id: "practice",
      anchor: "nav-practice",
      say: "Practice is the simulated floor \u2014 the Live Market. The money is paper. The decisions are yours."
    },
    {
      id: "missions",
      anchor: "nav-missions",
      say: "Missions are short drills with a clear goal, on a sandbox account that is not your main book."
    },
    {
      id: "journal",
      anchor: "nav-journal",
      say: "Journal is where you review the decision, not the luck. It sits with You, two taps away."
    }
  ];
  var active2 = null;
  function teardown(mark) {
    const a = active2;
    if (!a) return;
    active2 = null;
    window.removeEventListener("hashchange", a.onNav);
    try {
      a.coach.destroy();
    } catch {
    }
    closeSheets();
    if (mark) markTour();
  }
  function startTour() {
    teardown(false);
    const coach = mountCoach({
      steps: STOPS.map((s2) => ({ ...s2, prepare: () => prepare(s2.anchor) })),
      auto: true,
      onExit: () => teardown(true),
      onFinish: () => teardown(true)
    });
    const onNav = () => teardown(true);
    active2 = { coach, onNav };
    window.addEventListener("hashchange", onNav);
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
      "2026-11-14"
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
      const tourCard = el("div", { class: "card mt2 settings-section" });
      tourCard.appendChild(el("h3", {}, "Show me around"));
      tourCard.appendChild(el(
        "p",
        { class: "sub" },
        "Five stops: the next-step bar, Lessons, Practice, Missions, and Journal. Replay it any time."
      ));
      tourCard.appendChild(el("button", { type: "button", class: "btn primary", onclick: () => startTour() }, "Show me around"));
      root.appendChild(tourCard);
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

  // src/content/demos.js
  var DEMOS = [
    {
      id: "covered-call",
      title: "The covered call, step by step",
      lessonId: "c-covered-calls",
      missionId: "first-covered-call",
      symbol: "BRGR",
      seed: 20101,
      scenarioId: "slow-bleed",
      startCash: 25e3,
      intro: "Maria owns 100 shares of Burgess Restaurant Group and thinks the price will drift sideways for a while. She can get paid cash today by promising to sell her shares at a higher price. Watch how she sets that up.",
      steps: [
        {
          id: "setup",
          anchor: "demo-positions",
          say: "Here is the setup. Burgess trades near $67. Maria wants to own 100 shares AND get paid cash today for promising to sell them at a higher price. One order does both.",
          watch: { type: "advanceDays", n: 0 },
          expect: null
        },
        {
          id: "sell-call",
          anchor: "demo-trade",
          say: "Maria buys 100 shares and sells one call above today's price \u2014 one ticket, one position. The call buyer pays her cash right now for the right to take her shares at that strike.",
          watch: { type: "trade", legs: [
            { kind: "stock", side: 1, qty: 100 },
            { kind: "call", side: -1, qty: 1, strikeAbove: 2, expiry: "far" }
          ], label: "Covered call" },
          expect: { classify: "covered-call" }
        },
        {
          id: "decay",
          anchor: "demo-day",
          say: "Time passes and nothing dramatic happens. The call Maria sold gets cheaper every day \u2014 that fade is her payment settling in. Let five quiet days go by.",
          watch: { type: "advanceDays", n: 5 },
          expect: { advancedTo: 6 }
        },
        {
          id: "wrap",
          anchor: "demo-positions",
          say: "In plain words: Maria keeps the cash she was paid no matter what. If Burgess finishes above the strike, her shares sell at that price \u2014 a good price she chose in advance.",
          watch: { type: "advanceDays", n: 2 },
          expect: null
        }
      ],
      outro: "The honest downside: the shares themselves can still fall, and the cash Maria collected only softens that fall \u2014 it does not prevent it. She also gives up any gains above the strike. That is the whole trade."
    },
    {
      id: "long-call",
      title: "Buying a call, step by step",
      lessonId: "c-buying-calls",
      missionId: "theta-tax-conviction",
      symbol: "RCKT",
      seed: 20103,
      scenarioId: "slow-bleed",
      startCash: 25e3,
      intro: "Sam thinks Rocket Robotics ($182) could jump this week, but he does not want to risk $18,200 buying 100 shares. Instead, he pays a capped upfront fee for one call option and sets a strict time limit to get out if the rally does not show up.",
      steps: [
        {
          id: "buy-call",
          anchor: "demo-trade",
          say: "Sam buys 1 call right near today's $182 price with a far deadline. His worst-case loss is strictly capped at the upfront cash he pays for this contract.",
          watch: { type: "trade", legs: [{ kind: "call", side: 1, qty: 1, strikeAbove: 0, expiry: "far" }], label: "Long call" },
          expect: { classify: "long-call" }
        },
        {
          id: "wait-three",
          anchor: "demo-day",
          say: "Rocket climbs over the next three days and Sam's call gains value \u2014 but notice it gains less than 100 shares would have. Time decay charges rent every afternoon, even while you are winning.",
          watch: { type: "advanceDays", n: 3 },
          expect: { advancedTo: 4 }
        },
        {
          id: "wait-one",
          anchor: "demo-day",
          say: "Another up day. Sam set himself a deadline BEFORE buying: if the rally had not shown up by now, he would sell and salvage the remaining value instead of holding and hoping.",
          watch: { type: "advanceDays", n: 1 },
          expect: { advancedTo: 5 }
        },
        {
          id: "exit-early",
          anchor: "demo-positions",
          say: "In plain words: Sam risked a small, known fee; the move came; he cashes out up about $1,600. When the move does not come, this exact exit discipline is what stops the fee from melting to zero.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: buying a call requires getting direction, size of the move, and timing right all at once. If the stock stays flat or climbs too slowly, you lose money even when your direction was right."
    },
    {
      id: "protective-put",
      title: "The protective put, step by step",
      lessonId: "c-puts-protective",
      missionId: "crash-insurance",
      symbol: "PWRS",
      seed: 20102,
      scenarioId: "crash-week",
      startCash: 25e3,
      intro: "Maria wants to hold 100 shares of PowerSun Energy ($95), but she worries a sudden market drop could knock thousands of dollars off her shares. Before storm clouds gather, she pairs her 100 shares with 1 put option to lock in a hard dollar floor.",
      steps: [
        {
          id: "open-hedged",
          anchor: "demo-trade",
          say: "On Day 1, while prices are calm, Maria buys 100 shares of PowerSun and 1 put just below today's price on the same ticket. The put gives her the right to sell all 100 shares at the strike price.",
          watch: { type: "trade", legs: [
            { kind: "stock", side: 1, qty: 100 },
            { kind: "put", side: 1, qty: 1, strikeBelow: 1, expiry: "far" }
          ], label: "Protective put" },
          expect: { classify: "protective-put" }
        },
        {
          id: "shock-day",
          anchor: "demo-day",
          say: "Advance two days into the market selloff. PowerSun drops sharply, hurting the 100 shares, but Maria's put jumps in value at the exact same time.",
          watch: { type: "advanceDays", n: 2 },
          expect: { advancedTo: 3 }
        },
        {
          id: "aftershocks",
          anchor: "demo-day",
          say: "Two more rocky days unfold \u2014 and here is the surprise. In a panic, protection itself gets more valuable: Maria's put is now growing FASTER than her shares are falling.",
          watch: { type: "advanceDays", n: 2 },
          expect: { advancedTo: 5 }
        },
        {
          id: "hold-floor",
          anchor: "demo-positions",
          say: "In plain words: Maria paid a small fee so a crash could not hurt her \u2014 and this week the insurance worked so well that she ended slightly AHEAD while the whole market fell.",
          watch: { type: "advanceDays", n: 1 },
          expect: { advancedTo: 6 }
        }
      ],
      outro: "The honest downside: protection is not free. If PowerSun rallies instead of falling, the put expires at $0 and Maria's profit trails an unhedged shareholder by the upfront fee she paid."
    },
    {
      id: "cash-secured-put",
      title: "The cash-secured put, step by step",
      lessonId: "c-puts-protective",
      missionId: "paid-to-shop",
      symbol: "BRGR",
      seed: 20104,
      scenarioId: "slow-bleed",
      startCash: 25e3,
      intro: "Sam would happily own 100 shares of Burgess Restaurant Group ($67) if he could buy them a few dollars cheaper. Instead of waiting for a dip for free, he gets paid cash today by promising to buy 100 shares at a lower strike price while setting aside the cash to pay for them.",
      steps: [
        {
          id: "sell-put",
          anchor: "demo-trade",
          say: "Sam sells 1 put with a strike price two steps below today's $67 price. He collects cash right now, and the account locks up enough cash to buy 100 shares at that strike if Burgess drops.",
          watch: { type: "trade", legs: [{ kind: "put", side: -1, qty: 1, strikeBelow: 2, expiry: "far" }], label: "Cash-secured put" },
          expect: { classify: "cash-secured-put" }
        },
        {
          id: "quiet-days",
          anchor: "demo-day",
          say: "Five days pass and Burgess drifts DOWN toward Sam's strike. On paper, his promise now marks a little against him. This is the trade working as designed \u2014 not failing.",
          watch: { type: "advanceDays", n: 5 },
          expect: { advancedTo: 6 }
        },
        {
          id: "more-decay",
          anchor: "demo-day",
          say: "Three more soft days. Remember: Sam set the cash aside because he WANTS the shares at that price. The stock falling toward his strike is the deal arriving, not a disaster.",
          watch: { type: "advanceDays", n: 3 },
          expect: { advancedTo: 9 }
        },
        {
          id: "wrap",
          anchor: "demo-positions",
          say: "In plain words: Sam is paid to wait at a price he already liked. Down about $170 on paper at Day 10, he either keeps the full premium if Burgess holds above the strike \u2014 or buys shares he wanted anyway, at a discount.",
          watch: { type: "advanceDays", n: 1 },
          expect: { advancedTo: 10 }
        }
      ],
      outro: "The honest downside: if Burgess crashes far below the strike price, Sam must still buy 100 shares at the strike\u2014so he can lose money almost dollar for dollar on a big drop, cushioned only by the upfront cash he collected."
    },
    {
      id: "call-vertical",
      title: "The call spread, step by step",
      lessonId: "c-vertical-spreads",
      missionId: "defined-conviction-vertical",
      symbol: "RCKT",
      seed: 20105,
      scenarioId: "earnings-crush",
      startCash: 25e3,
      intro: "Maria thinks Rocket Robotics ($182) will climb into its Day 6 earnings report, but options are pricey ahead of the news. She buys a call near today's price and sells a higher-strike call against it to cut her upfront cost and lower her breakeven.",
      steps: [
        {
          id: "open-spread",
          anchor: "demo-trade",
          say: "Maria buys 1 call near $182 and sells 1 call two strikes higher in the same expiration. The cash from the higher call pays for part of the lower call.",
          watch: { type: "trade", legs: [
            { kind: "call", side: 1, qty: 1, strikeAbove: 0, expiry: "near" },
            { kind: "call", side: -1, qty: 1, strikeAbove: 2, expiry: "near" }
          ], label: "Call vertical" },
          expect: { classify: "call-vertical" }
        },
        {
          id: "into-print",
          anchor: "demo-day",
          say: "Four days pass and the rally does not show. The spread marks down \u2014 but because Maria sold the higher call, her worst case was fixed in dollars on day one.",
          watch: { type: "advanceDays", n: 4 },
          expect: { advancedTo: 5 }
        },
        {
          id: "close-spread",
          anchor: "demo-positions",
          say: "In plain words: the move did not come, so Maria exits BEFORE the earnings coin-flip with a small controlled loss \u2014 about $390, not thousands. Defined risk means bad weeks stay small.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: by selling the higher call to cheapen her entry, Maria caps her maximum profit at the upper strike. And if Rocket Robotics drops below the lower strike, she can still lose the net cash she paid up front."
    },
    {
      id: "long-straddle",
      title: "The earnings straddle trap, step by step",
      lessonId: "c-straddles-strangles",
      missionId: "iv-crush-trap",
      symbol: "RCKT",
      seed: 20106,
      scenarioId: "earnings-crush",
      startCash: 25e3,
      intro: "Sam hears Rocket Robotics ($182) reports earnings on Day 6 and figures the stock has to jump one way or the other. He buys both a call and a put at the exact same strike\u2014a straddle\u2014without realizing the option prices already have a huge move baked in.",
      steps: [
        {
          id: "buy-straddle",
          anchor: "demo-trade",
          say: "Sam buys 1 call and 1 put right at today's strike price on the same ticket. Because everyone expects earnings fireworks, he pays an inflated upfront fee on both sides.",
          watch: { type: "trade", legs: [
            { kind: "call", side: 1, qty: 1, strikeAbove: 0, expiry: "far" },
            { kind: "put", side: 1, qty: 1, strikeAbove: 0, expiry: "far" }
          ], label: "Long straddle" },
          expect: { classify: "long-straddle" }
        },
        {
          id: "wait-for-news",
          anchor: "demo-day",
          say: "Advance four days to the afternoon before earnings. Both options are still expensive, and Sam needs a massive stock move just to cover the double fee he paid.",
          watch: { type: "advanceDays", n: 4 },
          expect: { advancedTo: 5 }
        },
        {
          id: "earnings-crush",
          anchor: "demo-day",
          say: "Advance through Day 6 earnings. The report lands with a modest move instead of a shock\u2014and once the suspense is over, the extra storm pricing collapses out of both the call and the put at once.",
          watch: { type: "advanceDays", n: 1 },
          expect: { advancedTo: 6 }
        },
        {
          id: "close-loser",
          anchor: "demo-positions",
          say: "In plain words: when you buy both sides before headline news, you lose unless the real move beats the huge move already priced in. Sam closes the trade to cap the damage.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: buying a straddle before big news means paying peak prices for two melting contracts at once. Watching this trade lose in paper money is the cheapest tuition in options\u2014it saves you from paying double fees right before a post-news price crush."
    },
    {
      id: "long-put",
      title: "Buying a put, step by step",
      lessonId: "c-calls-puts-defined",
      symbol: "PWRS",
      seed: 20107,
      scenarioId: "crash-week",
      startCash: 25e3,
      intro: "Maria does not own PowerSun Energy ($95), but she is convinced trouble is coming. Instead of borrowing shares to bet against it, she pays a small capped fee for one put option \u2014 the right to sell at today's level even after a crash.",
      steps: [
        {
          id: "buy-put",
          anchor: "demo-trade",
          say: "Maria buys 1 put near today's price with a far deadline. Her worst case is fixed: she can only lose the fee she pays right now.",
          watch: { type: "trade", legs: [{ kind: "put", side: 1, qty: 1, strikeAbove: 0, expiry: "far" }], label: "Long put" },
          expect: { classify: "long-put" }
        },
        {
          id: "crash",
          anchor: "demo-day",
          say: "Two days later the selloff hits. PowerSun drops hard \u2014 and Maria's put gains value as the stock falls.",
          watch: { type: "advanceDays", n: 2 },
          expect: { advancedTo: 3 }
        },
        {
          id: "aftershock",
          anchor: "demo-day",
          say: "The market chops as it falls, and Maria's gain breathes with it. What never moves is her floor: the most she can ever lose is the fee she paid.",
          watch: { type: "advanceDays", n: 2 },
          expect: { advancedTo: 5 }
        },
        {
          id: "cash-out",
          anchor: "demo-positions",
          say: "In plain words: Maria was bearish, risked a small known fee, and the fall paid her. She sells the put to lock the gain.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: if PowerSun had drifted up or sideways instead, the put would have melted toward zero and Maria would have lost the entire fee \u2014 being right about direction AND timing is the whole price of admission."
    },
    {
      id: "put-vertical",
      title: "The put spread, step by step",
      lessonId: "c-vertical-spreads",
      missionId: "w2-crash-put-vertical",
      symbol: "FAM500",
      seed: 20108,
      scenarioId: "crash-week",
      startCash: 25e3,
      intro: "Sam expects the whole market to fall this week, but single puts on the Academy 500 Index ($500) are expensive. He buys a put near today's level and sells a lower-strike put against it \u2014 cutting his cost in exchange for capping his win.",
      steps: [
        {
          id: "open-spread",
          anchor: "demo-trade",
          say: "Sam buys 1 put near $500 and sells 1 put two strikes lower in the same expiration. The cash from the lower put pays part of his bill.",
          watch: { type: "trade", legs: [
            { kind: "put", side: 1, qty: 1, strikeAbove: 0, expiry: "far" },
            { kind: "put", side: -1, qty: 1, strikeBelow: 2, expiry: "far" }
          ], label: "Put vertical" },
          expect: { classify: "put-vertical" }
        },
        {
          id: "selloff",
          anchor: "demo-day",
          say: "The index gaps down and keeps sliding. The spread gains as the market falls toward Sam's lower strike.",
          watch: { type: "advanceDays", n: 3 },
          expect: { advancedTo: 4 }
        },
        {
          id: "take-profit",
          anchor: "demo-positions",
          say: "In plain words: Sam paid less to be bearish, and the drop handed back his whole fee plus a profit bigger than the fee itself. He closes rather than being greedy for the last dollar.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: the sold put caps the win \u2014 in a true collapse Sam makes no more than the distance between his strikes. And if the market rises instead, the whole net fee he paid is gone."
    },
    {
      id: "long-strangle",
      title: "The strangle, step by step",
      lessonId: "c-straddles-strangles",
      missionId: "w2-strangle-shock-catcher",
      symbol: "FAM500",
      seed: 20109,
      scenarioId: "crash-week",
      startCash: 25e3,
      intro: "Maria believes the Academy 500 Index ($500) is about to move BIG \u2014 she just does not know which way. A straddle is pricey, so she buys a cheaper pair: a call above the market and a put below it. Either violent move can pay; a quiet week cannot.",
      steps: [
        {
          id: "buy-strangle",
          anchor: "demo-trade",
          say: "Maria buys 1 call two strikes above and 1 put two strikes below today's price. Both are cheaper than at-the-money options \u2014 that is the budget part.",
          watch: { type: "trade", legs: [
            { kind: "call", side: 1, qty: 1, strikeAbove: 2, expiry: "far" },
            { kind: "put", side: 1, qty: 1, strikeBelow: 2, expiry: "far" }
          ], label: "Long strangle" },
          expect: { classify: "long-strangle" }
        },
        {
          id: "shock",
          anchor: "demo-day",
          say: "The crash arrives. The call side dies, but the put side surges past it \u2014 one violent move is all a strangle needs.",
          watch: { type: "advanceDays", n: 3 },
          expect: { advancedTo: 4 }
        },
        {
          id: "ride",
          anchor: "demo-day",
          say: "The slide extends another day. Panic also pumps up option prices across the board, adding fuel to Maria's put.",
          watch: { type: "advanceDays", n: 1 },
          expect: { advancedTo: 5 }
        },
        {
          id: "close-win",
          anchor: "demo-positions",
          say: "In plain words: Maria did not need to predict the direction \u2014 only that SOMETHING big would happen. It did, and she closes both legs to bank it.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: in a quiet week BOTH cheap options melt and the strangle loses its whole cost \u2014 and because the strikes sit away from the market, it needs an even bigger move than a straddle before it pays at expiry."
    },
    {
      id: "iron-condor",
      title: "The iron condor, step by step",
      lessonId: "c-vertical-spreads",
      missionId: "w2-condor-range-harvest",
      symbol: "FAM500",
      seed: 20110,
      scenarioId: null,
      startCash: 25e3,
      intro: "Sam thinks the Academy 500 Index ($500) is going NOWHERE for a while. He gets paid cash today by selling a put spread below the market and a call spread above it \u2014 four legs that profit if the index simply stays inside the range.",
      steps: [
        {
          id: "open-condor",
          anchor: "demo-trade",
          say: "Sam sells a put two strikes below and a call two strikes above, then buys a further put and call as wings. The wings fix his worst case in dollars before he starts.",
          watch: { type: "trade", legs: [
            { kind: "put", side: -1, qty: 1, strikeBelow: 2, expiry: "far" },
            { kind: "put", side: 1, qty: 1, strikeBelow: 4, expiry: "far" },
            { kind: "call", side: -1, qty: 1, strikeAbove: 2, expiry: "far" },
            { kind: "call", side: 1, qty: 1, strikeAbove: 4, expiry: "far" }
          ], label: "Iron condor" },
          expect: { classify: "iron-condor" }
        },
        {
          id: "quiet-week",
          anchor: "demo-day",
          say: "Five quiet days pass with the index drifting inside Sam's range. All four options shed time value \u2014 and he sold more than he bought, so the decay works FOR him.",
          watch: { type: "advanceDays", n: 5 },
          expect: { advancedTo: 6 }
        },
        {
          id: "more-quiet",
          anchor: "demo-day",
          say: "Another five days of nothing much. Boredom is literally the win condition for this trade.",
          watch: { type: "advanceDays", n: 5 },
          expect: { advancedTo: 11 }
        },
        {
          id: "harvest",
          anchor: "demo-positions",
          say: "In plain words: Sam was paid for promising the market would stay in a range, his worst case was capped by the wings on day one, and the calendar did the work.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: the condor's profit is small and capped, while a single violent week can cost the full wing width minus the credit. Selling calm is a real business \u2014 but storms happen, and position size is the only thing that keeps them survivable."
    },
    {
      id: "collar",
      title: "The collar, step by step",
      lessonId: "c-puts-protective",
      missionId: "crash-insurance",
      symbol: "PWRS",
      seed: 20111,
      scenarioId: "crash-week",
      startCash: 25e3,
      intro: "Maria owns 100 shares of PowerSun Energy (trading near $107 this week) and wants a hard floor under her shares before a rough week \u2014 without paying the full price of a protective put out of pocket. She finances the put floor by selling a call ceiling above the stock.",
      steps: [
        {
          id: "open-collar",
          anchor: "demo-trade",
          say: "Maria buys 100 shares, buys 1 put two strikes below today's price as her floor, and sells 1 call two strikes above as her ceiling. The cash from the call helps pay for the put.",
          watch: { type: "trade", legs: [
            { kind: "stock", side: 1, qty: 100 },
            { kind: "put", side: 1, qty: 1, strikeBelow: 2, expiry: "far" },
            { kind: "call", side: -1, qty: 1, strikeAbove: 2, expiry: "far" }
          ], label: "Collar" },
          expect: { classify: "collar" }
        },
        {
          id: "crash-hits",
          anchor: "demo-day",
          say: "The selloff arrives. As PowerSun drops, Maria's long put climbs in value AND the short call she sold gets cheaper \u2014 both option legs cushion the falling shares.",
          watch: { type: "advanceDays", n: 3 },
          expect: { advancedTo: 4 }
        },
        {
          id: "aftershocks",
          anchor: "demo-day",
          say: "Another day of selling pressure passes, and the put floor holds firm. Maria is down a few hundred dollars \u2014 and she knew that was close to the worst case before the week began.",
          watch: { type: "advanceDays", n: 1 },
          expect: { advancedTo: 5 }
        },
        {
          id: "close-collar",
          anchor: "demo-positions",
          say: "In plain words: Maria paid for her downside floor by trading away upside above the call strike, and that floor protected her shares when the drop hit.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: the ceiling is real \u2014 rallies are sold. If PowerSun surges past the call strike instead of falling, Maria's shares get called away at the ceiling and she misses every dollar of the rally above it."
    },
    {
      id: "butterfly",
      title: "The butterfly, step by step",
      lessonId: "c-vertical-spreads",
      missionId: "pin-risk-escape",
      symbol: "LMND",
      seed: 20112,
      scenarioId: "pin-risk-friday",
      startCash: 25e3,
      intro: "Sam thinks Lumend Brands ($42) will finish the week pinned right near today's price. Instead of selling uncovered options, he builds a call butterfly \u2014 a cheap, strictly capped bet on the stock parking at the center strike.",
      steps: [
        {
          id: "open-butterfly",
          anchor: "demo-trade",
          say: "Sam buys 1 call two strikes below, sells 2 calls right at today's price, and buys 1 call two strikes above in the same expiration. The two short center calls make the package very cheap.",
          watch: { type: "trade", legs: [
            { kind: "call", side: 1, qty: 1, strikeBelow: 2, expiry: "far" },
            { kind: "call", side: -1, qty: 2, strikeAbove: 0, expiry: "far" },
            { kind: "call", side: 1, qty: 1, strikeAbove: 2, expiry: "far" }
          ], label: "Call butterfly" },
          expect: { classify: "butterfly" }
        },
        {
          id: "midweek-pin",
          anchor: "demo-day",
          say: "Two days pass and Lumend hovers near the center strike. Here is the truth about butterflies: the profit arrives mostly in the FINAL week \u2014 early on, the needle barely moves.",
          watch: { type: "advanceDays", n: 2 },
          expect: { advancedTo: 3 }
        },
        {
          id: "hold-target",
          anchor: "demo-day",
          say: "One more day parked near the target. Most of a butterfly's payoff only arrives close to its expiry \u2014 an early exit is possible, it just banks pennies.",
          watch: { type: "advanceDays", n: 1 },
          expect: { advancedTo: 4 }
        },
        {
          id: "close-butterfly",
          anchor: "demo-positions",
          say: "In plain words: Sam paid about $25 for a capped bet on a parked stock \u2014 and closing this early, even a good week only wiggled it a few dollars, which fees then ate. The shape was the lesson; the payoff lives near the deadline.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: a butterfly is a narrow target. If the stock wanders far above the upper wing or far below the lower wing, the whole upfront debit is lost \u2014 and the peak profit only materializes if the stock sits right near the middle strike late in the trade."
    },
    {
      id: "calendar",
      title: "The calendar spread, step by step",
      lessonId: "c-calendar-spreads",
      missionId: "first-covered-call",
      symbol: "LMND",
      seed: 20113,
      scenarioId: null,
      startCash: 25e3,
      intro: "Maria expects Lumend Brands ($42) to stay quiet this week before moving later in the month. She opens a calendar spread at today's strike \u2014 selling a fast-melting near-term call while owning a slower-melting longer-term call at the exact same strike.",
      steps: [
        {
          id: "open-calendar",
          anchor: "demo-trade",
          say: "Maria sells 1 near-term call and buys 1 far-term call at today's strike. Because the near-term option is closer to its deadline, its daily time decay is steeper.",
          watch: { type: "trade", legs: [
            { kind: "call", side: -1, qty: 1, strikeAbove: 0, expiry: "near" },
            { kind: "call", side: 1, qty: 1, strikeAbove: 0, expiry: "far" }
          ], label: "Calendar spread" },
          expect: { classify: "calendar" }
        },
        {
          id: "first-days",
          anchor: "demo-day",
          say: "Three quiet days pass near the strike. The short near-term call melts faster than the long far-term call, and the gap ticks up in Maria's favor.",
          watch: { type: "advanceDays", n: 3 },
          expect: { advancedTo: 4 }
        },
        {
          id: "more-decay",
          anchor: "demo-day",
          say: "Two more sessions pass and the near-term deadline ARRIVES: the short call Maria sold expires and settles, and she keeps what it melted away. She is left holding just the far-dated call.",
          watch: { type: "advanceDays", n: 2 },
          expect: { advancedTo: 6 }
        },
        {
          id: "close-calendar",
          anchor: "demo-positions",
          say: "In plain words: Maria rented out fast-melting time, kept the rent when the deadline hit, and now owns the far-dated call outright. She sells it to wrap up roughly flat this week \u2014 the mechanics were the lesson.",
          watch: { type: "close" },
          expect: { flat: true }
        }
      ],
      outro: "The honest downside: a big move either way hurts it. If the stock rockets far above the strike or crashes far below it, both options lose their time-value advantage and the calendar spread can lose the net debit paid."
    }
  ];
  var demoById = (id) => DEMOS.find((d) => d.id === id) || null;

  // src/ui/next-step.js
  var KEY4 = "oa.demos";
  function readDemos() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY4) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }
  function markDemo(id, mode) {
    const all = readDemos();
    const now = Date.now();
    if (typeof all[id] !== "number") all[id] = now;
    if (mode === "do") all[id + ":do"] = now;
    try {
      localStorage.setItem(KEY4, JSON.stringify(all));
    } catch {
    }
  }
  function flatten(curriculum2) {
    const out = [];
    for (const t of curriculum2?.tracks || []) {
      for (const m of t.modules || []) {
        for (const l of m.lessons || []) out.push(l);
      }
    }
    return out;
  }
  function seasoned(profile) {
    if (!profile) return false;
    const n = Object.keys(profile.lessons || {}).length;
    return profile.xp >= 100 || n >= 2 || (profile.trades || []).length > 0;
  }
  function nextStep(profile, curriculum2, demos, onboarding) {
    const lessons = flatten(curriculum2);
    const first = lessons[0];
    const firstHref = first ? "#/learn/lesson/" + first.id : "#/learn";
    if (!profile) {
      return {
        text: first ? `Start with the first lesson: ${first.title}.` : "Open Lessons to begin.",
        href: firstHref
      };
    }
    const setupOpen = onboarding && !onboarding.done && (onboarding.step || 0) < 5 && !seasoned(profile);
    const anyDone = lessons.some((l) => profile.lessons && profile.lessons[l.id]);
    if (setupOpen && !anyDone) {
      return { text: "Finish the short setup so the next lesson fits you.", href: "#/welcome" };
    }
    const book = demos || {};
    for (const lesson of lessons) {
      const done = !!(profile.lessons && profile.lessons[lesson.id]);
      if (!done) {
        return { text: `Next lesson: ${lesson.title}.`, href: "#/learn/lesson/" + lesson.id };
      }
      for (const demo of DEMOS.filter((d) => d.lessonId === lesson.id)) {
        const watched = typeof book[demo.id] === "number";
        const did = typeof book[demo.id + ":do"] === "number";
        if (!watched) return { text: `Watch the demo: ${demo.title}.`, href: "#/demo/" + demo.id + "/watch" };
        if (!did) return { text: `Do it guided: ${demo.title}.`, href: "#/demo/" + demo.id + "/do" };
        if (demo.missionId && !profile.missions?.[demo.missionId]?.passed) {
          return { text: `Start the mission that follows ${demo.title}.`, href: "#/missions/" + demo.missionId };
        }
      }
    }
    return { text: "Practice on the floor \u2014 the Live Market is ready when you are.", href: "#/market" };
  }

  // src/content/strategies.js
  var STRATEGIES = [
    {
      id: "long-call",
      name: "Long Call",
      plain: "Pay a small fee for upside; lose at most the fee.",
      legs: [{ kind: "call", side: 1, qty: 1, k: 0 }]
    },
    {
      id: "long-put",
      name: "Long Put",
      plain: "Pay a small fee to profit from a fall; lose at most the fee.",
      legs: [{ kind: "put", side: 1, qty: 1, k: 0 }]
    },
    {
      id: "covered-call",
      name: "Covered Call",
      plain: "Own 100 shares, get paid cash for promising them higher.",
      legs: [{ kind: "stock", side: 1, qty: 100 }, { kind: "call", side: -1, qty: 1, k: 1 }]
    },
    {
      id: "protective-put",
      name: "Protective Put",
      plain: "Own 100 shares with a hard floor under them.",
      legs: [{ kind: "stock", side: 1, qty: 100 }, { kind: "put", side: 1, qty: 1, k: -1 }]
    },
    {
      id: "cash-secured-put",
      name: "Cash-Secured Put",
      plain: "Get paid to promise buying 100 shares at a lower price.",
      legs: [{ kind: "put", side: -1, qty: 1, k: -1 }]
    },
    {
      id: "call-vertical",
      name: "Bull Call Spread",
      plain: "Cheaper upside bet; win and loss both capped.",
      legs: [{ kind: "call", side: 1, qty: 1, k: 0 }, { kind: "call", side: -1, qty: 1, k: 2 }]
    },
    {
      id: "put-vertical",
      name: "Bear Put Spread",
      plain: "Cheaper downside bet; win and loss both capped.",
      legs: [{ kind: "put", side: 1, qty: 1, k: 0 }, { kind: "put", side: -1, qty: 1, k: -2 }]
    },
    {
      id: "long-straddle",
      name: "Long Straddle",
      plain: "Bet on a BIG move either way; quiet weeks melt it.",
      legs: [{ kind: "call", side: 1, qty: 1, k: 0 }, { kind: "put", side: 1, qty: 1, k: 0 }]
    },
    {
      id: "long-strangle",
      name: "Long Strangle",
      plain: "The budget straddle: cheaper, needs an even bigger move.",
      legs: [{ kind: "call", side: 1, qty: 1, k: 2 }, { kind: "put", side: 1, qty: 1, k: -2 }]
    },
    {
      id: "iron-condor",
      name: "Iron Condor",
      plain: "Get paid for a range holding; wings cap the storm damage.",
      legs: [
        { kind: "put", side: -1, qty: 1, k: -2 },
        { kind: "put", side: 1, qty: 1, k: -4 },
        { kind: "call", side: -1, qty: 1, k: 2 },
        { kind: "call", side: 1, qty: 1, k: 4 }
      ]
    },
    {
      id: "collar",
      name: "Collar",
      plain: "Shares with a floor below, paid for by a ceiling above.",
      legs: [
        { kind: "stock", side: 1, qty: 100 },
        { kind: "put", side: 1, qty: 1, k: -2 },
        { kind: "call", side: -1, qty: 1, k: 2 }
      ]
    },
    {
      id: "butterfly",
      name: "Call Butterfly",
      plain: "A cheap bet the price finishes right AT a level.",
      legs: [
        { kind: "call", side: 1, qty: 1, k: -2 },
        { kind: "call", side: -1, qty: 2, k: 0 },
        { kind: "call", side: 1, qty: 1, k: 2 }
      ]
    },
    {
      id: "calendar",
      name: "Calendar Spread",
      plain: "Sell fast-melting near time, own slow-melting far time.",
      legs: [
        { kind: "call", side: -1, qty: 1, k: 0, exp: "near" },
        { kind: "call", side: 1, qty: 1, k: 0, exp: "far" }
      ]
    }
  ];

  // src/ui/views/missions.js
  function resolveDemoLeg(session3, sym, leg) {
    if (leg.kind === "stock") return { kind: "stock", side: leg.side, qty: leg.qty };
    const strikes = session3.market.strikes(sym);
    const spot = session3.market.quote(sym).S;
    let atm = strikes[0];
    for (const k of strikes) if (Math.abs(k - spot) < Math.abs(atm - spot)) atm = k;
    const at = Math.max(0, strikes.indexOf(atm));
    let off = 0;
    if (leg.strikeAbove != null) off = leg.strikeAbove;
    else if (leg.strikeBelow != null) off = -leg.strikeBelow;
    const strike = strikes[Math.max(0, Math.min(strikes.length - 1, at + off))];
    const exps = session3.market.expiries(sym);
    const exp = leg.expiry === "far" ? exps[exps.length - 1] : exps[0];
    return { kind: leg.kind, side: leg.side, qty: leg.qty, strike, expDay: exp.day };
  }
  function runWatch(demo, step) {
    const S2 = session();
    if (!S2) return { err: "No demo session" };
    const w = step.watch;
    if (!w) return { ok: true };
    if (w.type === "trade") {
      const legs = (w.legs || []).map((l) => resolveDemoLeg(S2, demo.symbol, l));
      return trade(demo.symbol, legs, w.label || demo.title);
    }
    if (w.type === "advanceDays") {
      const n = w.n || 1;
      for (let k = 0; k < n; k++) advanceDay();
      return { ok: true };
    }
    if (w.type === "close") {
      const id = session()?.positions[0]?.id;
      if (!id) return { err: "No open position to close" };
      return closePos(id);
    }
    return { err: "Unknown demo step" };
  }
  function demoExpectMet(session3, step, baseline) {
    if (!session3) return false;
    const e = step.expect;
    if (e && e.classify) {
      return session3.positions.some((p) => p.label === e.classify || classify(p.legs) === e.classify);
    }
    if (e && e.advancedTo != null) return session3.market.day >= e.advancedTo;
    if (e && e.flat) return session3.positions.length === 0;
    const w = step.watch;
    if (!w) return true;
    if (w.type === "trade") return session3.positions.length > (baseline?.positions ?? 0);
    if (w.type === "advanceDays") return session3.market.day >= (baseline?.day ?? 0) + (w.n || 1);
    if (w.type === "close") return session3.positions.length < (baseline?.positions ?? 1);
    return true;
  }
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
    const demosDone = readDemos();
    root.appendChild(el("h3", { class: "mission-week-head mt2" }, "Strategy demos"));
    root.appendChild(el(
      "p",
      { class: "sub", style: "max-width:68ch;margin-top:4px" },
      "Watch the app place each strategy step by step with plain-English captions \u2014 then do it yourself with a guide. Free for everyone."
    ));
    const dgrid = el("div", { class: "grid2 mt1" });
    for (const d of DEMOS) {
      const watched = typeof demosDone[d.id] === "number";
      const did = typeof demosDone[d.id + ":do"] === "number";
      dgrid.appendChild(el(
        "div",
        { class: "card pad-s" },
        el(
          "div",
          { class: "flex-between" },
          el("h3", { style: "margin:0;font-size:15px" }, d.title.replace(/, step by step$/, "")),
          watched || did ? el("span", { class: "pill gain" }, did ? "\u2713 Done" : "\u2713 Watched") : el("span", { class: "pill brass" }, "Free")
        ),
        el(
          "div",
          { class: "btn-row mt1" },
          el("a", { class: "btn sm" + (watched ? "" : " primary"), href: "#/demo/" + d.id + "/watch" }, "Watch"),
          el("a", { class: "btn sm" + (watched && !did ? " primary" : ""), href: "#/demo/" + d.id + "/do" }, "Do it guided")
        )
      ));
    }
    root.appendChild(dgrid);
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
  function renderRunner(root, id, demo, demoMode, hooks) {
    let S2 = session();
    if (demo) {
      if (!S2 || !S2.purpose || S2.def.id !== demo.id) {
        root.appendChild(el("p", {}, "This demo is not running."));
        root.appendChild(el("a", { class: "btn mt1", href: "#/learn" }, "\u2190 Lessons"));
        return;
      }
    } else if (!S2 || S2.def.id !== id || S2.purpose) {
      if (S2 && S2.purpose) abandon();
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
    let sym = demo?.symbol || S2.market.list()[0]?.sym || "BRGR";
    let expIdx = 0;
    let presetId = "";
    let legsSpec = [];
    let abandoned = false;
    let coach = null;
    const baselines = /* @__PURE__ */ new Map();
    const shell = el("div", { class: "mission-runner" });
    root.appendChild(shell);
    function leave() {
      confirmLeave(() => {
        abandoned = true;
        abandon();
        location.hash = demo ? "#/learn/lesson/" + demo.lessonId : "#/missions";
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
    function pinnedExpiry(mkt, leg) {
      const exps = mkt.expiries(sym);
      if (!exps.length) return { day: 0, label: "" };
      if (leg.exp === "far") return exps[exps.length - 1];
      if (leg.exp === "near") return exps[0];
      return exps[Math.min(expIdx, exps.length - 1)];
    }
    function applyPreset(p) {
      const mkt = S2.market;
      legsSpec = p.legs.map((L) => {
        if (L.kind === "stock") return { kind: "stock", side: Math.sign(L.side) || 1, qty: Math.abs(L.qty) };
        const strike = strikeAt(mkt, sym, L.k);
        const exp = pinnedExpiry(mkt, L);
        return {
          kind: L.kind,
          side: Math.sign(L.side) || 1,
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
          el(
            "a",
            { href: demo ? "#/learn/lesson/" + demo.lessonId : "#/missions", onclick: (e) => {
              e.preventDefault();
              leave();
            } },
            demo ? "\u2190 Lesson" : "\u2190 Missions"
          )
        ),
        el("div", { class: "eyebrow" }, demo ? demoMode === "do" ? "Do it guided" : "Watch" : "Mission"),
        el("h1", {}, demo ? demo.title : S2.def.title)
      ));
      head.appendChild(el("button", { class: "btn sm", type: "button", onclick: leave }, "Abandon"));
      shell.appendChild(head);
      const top = el("div", { class: "row mt2" });
      const briefCard = el("div", { class: "card w50" });
      const mktCard = el("div", { class: "card w50" });
      top.appendChild(briefCard);
      top.appendChild(mktCard);
      shell.appendChild(top);
      if (demo) {
        briefCard.appendChild(el("h3", {}, demoMode === "do" ? "Your turn" : "What you are watching"));
        briefCard.appendChild(el("p", { class: "sub", style: "margin-bottom:0" }, demo.intro));
      } else {
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
      }
      const mainSym = (S2.def.objectives || []).find((o) => o.sym)?.sym || sym;
      if (S2.market.tickers[mainSym]) sym = mainSym;
      const t = S2.market.tickers[sym];
      const q = S2.market.quote(sym);
      mktCard.appendChild(el(
        "div",
        { class: "flex-between" },
        el("h3", {}, sym),
        el("span", { class: "pill brass num" }, demo ? `Day ${S2.market.day}` : `Day ${S2.market.day} / ${S2.def.endDay}`)
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
        el("button", {
          type: "button",
          class: "btn primary",
          "data-coach": demo ? "demo-day" : void 0,
          onclick: () => advanceDay()
        }, "\u23ED Next day")
      ));
      const bot = el("div", { class: "row mt2" });
      const tradeCard = el("div", { class: "card w50", "data-coach": demo ? "demo-trade" : void 0 });
      const posCard = el("div", { class: "card w50", "data-coach": demo ? "demo-positions" : void 0 });
      bot.appendChild(tradeCard);
      bot.appendChild(posCard);
      shell.appendChild(bot);
      tradeCard.appendChild(el("h3", {}, "Trade"));
      if (demo) {
        tradeCard.appendChild(el(
          "div",
          { class: "btn-row mb1" },
          el("button", { type: "button", class: "btn", onclick: () => {
            const res = trade(sym, [{ kind: "stock", side: 1, qty: 100 }], "Buy 100 shares");
            if (res.err) toast(res.err, "loss");
            else toast("Bought 100 shares", "gain");
          } }, "Buy 100 shares")
        ));
      }
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
          const p = STRATEGIES.find((x) => x.id === presetId);
          if (p) applyPreset(p);
        }
        paint();
      });
      const chips = el("div", { class: "preset-chips", role: "group", "aria-label": "Strategy" });
      for (const p of STRATEGIES) {
        chips.appendChild(el("button", {
          type: "button",
          class: "preset-chip" + (p.id === presetId ? " on" : ""),
          title: p.plain,
          "aria-pressed": p.id === presetId ? "true" : "false",
          onclick: () => {
            if (presetId === p.id) {
              presetId = "";
              legsSpec = [];
            } else {
              presetId = p.id;
              applyPreset(p);
            }
            paint();
          }
        }, p.name));
      }
      tradeCard.appendChild(el(
        "div",
        { class: "row" },
        el("div", { class: "field", style: "flex:1" }, el("label", {}, "Symbol"), symSel),
        el("div", { class: "field", style: "flex:1" }, el("label", {}, "Expiry"), expSel)
      ));
      tradeCard.appendChild(el("div", { class: "field mt1" }, el("label", {}, "Strategy"), chips));
      if (legsSpec.length) {
        const cost = previewCost();
        const expDays = new Set(legsSpec.filter((L) => L.expDay != null).map((L) => L.expDay));
        const showExp = expDays.size > 1;
        const exps = S2.market.expiries(sym);
        tradeCard.appendChild(el(
          "div",
          { class: "small muted mt1" },
          legsSpec.map((L) => {
            if (L.kind === "stock") return `${L.side > 0 ? "+" : "\u2212"}${L.qty} sh`;
            const tag = showExp ? exps.find((e) => e.day === L.expDay)?.label || "" : "";
            return `${L.side > 0 ? "+" : "\u2212"}${L.qty} ${F.usd(L.strike, 0)}${L.kind === "call" ? "C" : "P"}${tag ? " " + tag : ""}`;
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
            const label = STRATEGIES.find((p) => p.id === presetId)?.name || "Mission trade";
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
      coach?.refresh();
    }
    paint();
    const unMission = bus.on("mission", () => paint());
    if (demo) {
      const mode = demoMode === "do" ? "do" : "watch";
      coach = mountCoach({
        steps: demo.steps,
        auto: mode === "watch",
        onPerform: mode === "watch" ? (step) => runWatch(demo, step) : void 0,
        ready: mode === "do" ? (step) => {
          const sess = session();
          if (!sess) return false;
          if (step.id && !baselines.has(step.id)) {
            baselines.set(step.id, { day: sess.market.day, positions: sess.positions.length });
          }
          return demoExpectMet(sess, step, step.id ? baselines.get(step.id) : null);
        } : void 0,
        onExit: () => {
          abandoned = true;
          abandon();
          location.hash = "#/learn/lesson/" + demo.lessonId;
        },
        onFinish: (skippedCount) => {
          abandoned = true;
          if (mode === "watch" || !skippedCount) markDemo(demo.id, mode);
          else toast("Finished with skipped steps \u2014 this run was not recorded. Replay it when the controls are available.", "loss");
          abandon();
          hooks?.onFinish?.(skippedCount);
        },
        onReplay: () => {
          baselines.clear();
          abandon();
          const res = startDemo(demo, mode);
          if (res?.err) toast(res.err, "loss");
        }
      });
    }
    return () => {
      unMission();
      if (coach) {
        coach.destroy();
        coach = null;
      }
      priceChart && priceChart.destroy();
      eqChart && eqChart.destroy();
      if (!abandoned) {
        const cur = session();
        if (cur && cur.status === "active" && cur.purpose) abandon();
      }
    };
  }
  function renderDemo(root, params) {
    const id = params[0];
    const mode = params[1] === "do" ? "do" : "watch";
    const def = demoById(id);
    if (!def) {
      root.appendChild(el("p", {}, "Demo not found."));
      root.appendChild(el("a", { class: "btn mt1", href: "#/learn" }, "\u2190 Lessons"));
      return;
    }
    let phase = "intro";
    let note = "";
    let runCleanup = null;
    function paint() {
      if (runCleanup) {
        runCleanup();
        runCleanup = null;
      }
      root.innerHTML = "";
      if (phase === "intro") renderIntro();
      else if (phase === "play") {
        runCleanup = renderRunner(root, def.id, def, mode, {
          onFinish: () => {
            phase = "outro";
            paint();
          }
        }) || null;
        root.appendChild(simDisclaimer());
      } else renderOutro();
    }
    function begin() {
      const res = startDemo(def, mode);
      if (res.err) {
        note = res.err;
        paint();
        return;
      }
      note = "";
      phase = "play";
      paint();
    }
    function renderIntro() {
      root.appendChild(viewHeader(mode === "do" ? "Do it guided" : "Watch", def.title));
      root.appendChild(simDisclaimer());
      root.appendChild(el("p", { class: "sub mt2", style: "max-width:68ch" }, def.intro));
      if (note) {
        root.appendChild(el("p", { class: "mt1" }, note));
        const cur = session();
        if (cur && cur.status === "active" && !cur.purpose) {
          root.appendChild(el(
            "div",
            { class: "btn-row mt1" },
            el("button", { type: "button", class: "btn", onclick: () => {
              confirmLeave(() => {
                abandon();
                note = "";
                begin();
              });
            } }, "Abandon mission")
          ));
        }
      }
      root.appendChild(el(
        "div",
        { class: "btn-row mt2" },
        el("button", { type: "button", class: "btn primary", onclick: begin }, mode === "do" ? "Start guided" : "Play"),
        el("a", { class: "btn", href: "#/learn/lesson/" + def.lessonId }, "Back to lesson")
      ));
    }
    function renderOutro() {
      root.appendChild(viewHeader("Done", def.title));
      root.appendChild(simDisclaimer());
      root.appendChild(el("p", { class: "sub mt2", style: "max-width:68ch" }, def.outro));
      const row = el("div", { class: "btn-row mt2" });
      if (mode === "watch") {
        row.appendChild(el("a", { class: "btn primary", href: "#/demo/" + def.id + "/do" }, "Do it guided"));
      }
      if (def.missionId) {
        row.appendChild(el("a", {
          class: "btn" + (mode === "do" ? "" : ""),
          href: "#/missions/" + def.missionId
        }, "Start the real mission"));
      }
      if (mode === "do") {
        row.appendChild(el("a", { class: "btn primary", href: "#/market/" + def.symbol }, "Place it for real on Practice \u2192"));
      }
      row.appendChild(el("a", { class: "btn", href: "#/learn/lesson/" + def.lessonId }, "Back to lesson"));
      root.appendChild(row);
    }
    paint();
    return () => {
      if (runCleanup) {
        runCleanup();
        runCleanup = null;
      }
    };
  }
  var view6 = {
    render(root, params) {
      if (params[0]) return renderRunner(root, params[0]);
      renderHub(root);
    }
  };
  var demoView = {
    render(root, params) {
      return renderDemo(root, params || []);
    }
  };

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
                "title": "What a 25% Chance Really Means",
                "objective": "Read a percentage chance as how often something happens over many tries, and see why losing streaks happen even when the odds are fair.",
                "body": "You have flipped a coin at a kitchen table to settle who buys dinner. Even on a fair 50% coin, or 1 in 2, tails can land four times in a row before heads shows up. In markets, that starting how-often number is called a **base rate**, such as a 25% chance, or 1 in 4, that Lumend Brands ($42) finishes above $45. The coin analogy stops there: a coin never changes its shape, while a company's business shifts every quarter.\n\nSuppose Maria pays $50 for a trade on Lumend Brands ($42) that wins 25% of the time, or about 1 in 4 tries. Across a tiny **sample size** of just 4 trades, Maria can easily lose all 4 and be down $200 without the odds being broken. Only across 100 separate tries do her wins settle near 25 out of 100. In plain words: a 25% chance describes what happens across 100 tries, never what happens on Friday.\n\nLosing 4 times in a row tempts Sam into a costly mistake. After losing $50 four times for $200 total on Burgess Restaurant Group ($67), Sam assumes a win is due and bets $500 on trade five. The market does not remember Sam's past $200 loss, so trade five still carries the exact same 25% chance, or 1 in 4. Betting bigger to chase a streak is how a normal rough patch empties an account.\n\nThe flip side is quitting too soon. If Maria risks $40 per trade on a setup that wins 60% of the time, or 3 in 5, she will still hit three losses in a row for $120. She keeps each bet at $40 so a normal losing streak never knocks her out. In plain words: size every trade small enough that an unlucky week never ends your ability to keep playing.",
                "key_takeaways": [
                  "A 25% chance, or 1 in 4, tells you how often a setup wins across 100 tries, never what happens next.",
                  "Over 4 or 5 trades, lucky and unlucky streaks are completely normal.",
                  "Separate trades have no memory\u2014four losses in a row never make the fifth trade due to win.",
                  "Keep every bet small enough in dollars that a routine losing streak cannot wipe you out."
                ],
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click LMND in the Watchlist, and click Buy 10 sh, then Place order. Click \u23ED Next day five times and watch how daily gains and losses streak even in a calm week.",
                "quiz": [
                  {
                    "q": "Maria sees a trade on Lumend Brands ($42) with a 30% chance, or 3 in 10, of paying off at the deadline. What does that 30% number mean?",
                    "choices": [
                      "The trade is guaranteed to gain 30% in price today",
                      "Across 100 similar setups, roughly 30 pay off and 70 do not",
                      "Exactly 3 out of every 10 trades will win on a strict schedule",
                      "No one can estimate the odds until the trade ends"
                    ],
                    "answer": 1,
                    "explain": "A 30% chance, or 3 in 10, describes how often the trade pays off across a large batch of tries, not a promise for the next 10 trades."
                  },
                  {
                    "q": "Sam takes four separate trades that each have a 50% chance, or 1 in 2, of winning $100, and he loses all four. What is his chance of winning on a fifth separate trade with the same setup?",
                    "choices": [
                      "Higher than 50%, because a winner is overdue",
                      "Lower than 50%, because the setup is on a cold streak",
                      "Still 50%, or 1 in 2",
                      "Zero, because four losses prove the trade never works"
                    ],
                    "answer": 2,
                    "explain": "Separate trades have no memory of your past losses. Thinking a win is due pushes people to bet too much at the worst possible moment."
                  },
                  {
                    "q": "A forecast gives the Academy 500 ($500) an 80% chance, or 4 in 5, of staying above $490 this week. How should Maria use that number?",
                    "choices": [
                      "Expect the index to spend 80% of the week above $490",
                      "Expect it to hold in about 8 out of 10 similar weeks, and drop below $490 in about 2 out of 10",
                      "Treat $490 as a guaranteed floor that cannot break",
                      "Put her whole account into the trade because 80% cannot lose"
                    ],
                    "answer": 1,
                    "explain": "An 80% chance, or 4 in 5, means the floor still breaks about 1 time in 5, so Maria must size her trade to survive that 20% outcome."
                  }
                ]
              },
              {
                "id": "f-expected-value",
                "title": "How to Tell if a Bet Is Worth Taking",
                "objective": "Weigh a trade's payout against its price and odds to see if it makes or loses money on average over time.",
                "body": "You have probably bought a $10 charity raffle ticket for a chance at a $500 grill. If 100 tickets are sold, your 1% chance, or 1 in 100, makes that ticket worth $5 on average ($500 \xD7 1% is $5), which is its **expected value**. Paying $10 for $5 of average value means you lose $5 per ticket over the long run. The raffle analogy stops there: raffle prizes are fixed in advance, while market prices change every second as people trade.\n\nNow apply that same math to Burgess Restaurant Group ($67). Sam pays $200 for a trade with a 20% chance, or 1 in 5, of paying $750 and an 80% chance, or 4 in 5, of paying $0. The average payout is $150 ($750 \xD7 20% is $150), so paying $200 leaves Sam $50 behind per trade. When the average payout beats the cost\u2014say Maria pays only $110 for that same $150 average payout\u2014that +$40 gap is her **edge**. In plain words: multiply what you can win by how often you win, then subtract what you paid.\n\nWhy do people keep buying Sam's $200 trade if it loses $50 on average? Because 1 time in 5 it still pays $750, and a $550 profit feels like genius in the moment. Over 100 repeats, though, paying $200 for $150 of value drains about $5,000 from Sam's account ($50 \xD7 100 trades is $5,000). A single loud winner never proves a trade was priced fairly.\n\nEven Maria's +$40 trade still loses 80% of the time, or 4 times in 5. Five losses in a row at $110 each will cost her $550 before the next winner lands. If Maria bets half her cash on every try, a normal losing week will wipe her out before her +$40 average shows up. In plain words: judge a trade by its average math before you enter, not by whether the last try won or lost.",
                "key_takeaways": [
                  "Expected value is the average payout per try: multiply the prize by the odds, then subtract your entry cost.",
                  "Paying $200 for a 20% chance, or 1 in 5, at $750 ($150 average) loses $50 per trade over time.",
                  "Bad bets still produce occasional big winners; good bets still run into normal losing streaks.",
                  "Keep each trade small in dollars so five normal losses in a row never empty your account."
                ],
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click BRGR in the Watchlist, and look at the Option chain. Compare the Ask price on a call near $67 with a call far above $67, then click Ask on the near-$67 call and click Place order to paper-trade one contract.",
                "quiz": [
                  {
                    "q": "Maria pays $200 for a trade on Burgess Restaurant Group ($67). It has a 25% chance, or 1 in 4, of paying $600 and a 75% chance, or 3 in 4, of paying $0. What is her average profit or loss per trade?",
                    "choices": [
                      "+$150 per trade",
                      "\u2212$50 per trade",
                      "$0 (breaks even)",
                      "+$400 per trade"
                    ],
                    "answer": 1,
                    "explain": "A 25% chance at $600 is worth $150 on average ($600 \xD7 25% is $150). Paying $200 for $150 of average value leaves \u2212$50 per trade."
                  },
                  {
                    "q": "Sam pays $80 for a cheap long-shot weekly trade on Lumend Brands ($42), triples his money to $240 on surprise news, and calls it a sure money-maker. What is wrong with his claim?",
                    "choices": [
                      "Nothing\u2014making a profit proves the math was in his favor",
                      "One lucky win does not prove a positive average; overpriced bets still win once in a while",
                      "Weekly trades only work on Fridays",
                      "He should double his bet to $160 on the next try while he is hot"
                    ],
                    "answer": 1,
                    "explain": "Even a bad bet has to pay off once in a while or nobody would buy it. Over 100 tries, overpaying for long shots drains your cash."
                  },
                  {
                    "q": "Maria has a trade that makes +$30 on average across 100 tries, but her first three tries each lose $100. What should she do next?",
                    "choices": [
                      "Throw the strategy away right now",
                      "Expect normal losing streaks and keep her bet size small enough to survive them",
                      "Bet $600 on try four to win back all $300 at once",
                      "Assume the math was wrong, because three losses in a row cannot happen"
                    ],
                    "answer": 1,
                    "explain": "A positive average works over dozens of tries, not three. Doubling up after losses turns a survivable $300 dip into an account-ending loss."
                  }
                ]
              },
              {
                "id": "f-risk-vs-reward",
                "title": "Surviving the Worst Case Comes First",
                "objective": "Ask what the worst-case dollar loss is before chasing a profit, and see why a 90% win rate can still lose money.",
                "body": "You would never drive a 15-ton truck across a wooden bridge rated for 10 tons just because it holds up 9 times out of 10. In trading, the drop from your account peak to its bottom during a losing stretch is called a **drawdown**, such as a $10,000 account dropping $2,000 to $8,000. Before Maria looks at what she might make on Rocket Robotics ($182), she asks whether her account can survive the worst-case dollar loss. The bridge analogy stops there: a collapsed bridge ends the trip forever, while a small cash loss can be recovered if you protect your core savings.\n\nBeginners often brag about their **win rate**, which is the share of trades that make money, such as winning 90 out of 100 tries (90%, or 9 in 10). Suppose Sam collects $100 on 90 trades (+$9,000 total) by making promises on PowerSun Energy ($95), but loses $2,000 on the other 10 trades (\u2212$20,000 total). Despite winning 9 times out of 10, Sam finishes down $11,000 across those 100 trades ($9,000 minus $20,000 is \u2212$11,000). In plain words: winning often means nothing if one bad day wipes out two years of small wins.\n\nEven a good average payout is not the whole story if you need cash on a deadline. Suppose Maria has $10,000 and needs $500 for tuition next month: a safe government bill pays a sure $500, while shares of Lumend Brands ($42) have a 50% chance, or 1 in 2, of gaining $1,250 and a 50% chance of gaining $0. The shares average $625 ($1,250 \xD7 50% is $625), but Maria picks the sure $500 because a $0 month means missing tuition.\n\nHigher potential returns exist in markets because someone has to stomach the bumpy ride. When a stranger online promises Maria an 8% monthly return ($800 a month on $10,000) with zero chance of losing money, she walks away. That pitch is either lying or hiding a rare $5,000 crash that has not hit yet. In plain words: always check the worst-case dollar loss first, and make sure you can afford it on your worst day.",
                "key_takeaways": [
                  "Higher potential returns always come with real downside swings.",
                  "Ask two questions before every trade: what is the worst-case dollar loss, and can my account survive it?",
                  "A 90% win rate, or 9 in 10, still loses money if the 10% losses are huge ($9,000 won vs. $20,000 lost).",
                  "Anyone promising high, steady returns with zero risk is either lying or hiding a rare crash loss."
                ],
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click GLXY in the Watchlist, and click Buy 100 sh (~$2,350), then Place order. Then click RCKT, click Buy 10 sh (~$1,820), then Place order, and click \u23ED Next day five times to compare how much each stock swings in dollars.",
                "quiz": [
                  {
                    "q": "Sam runs a strategy that wins $100 on 90% of trades (9 in 10) and loses $2,000 on the other 10% (1 in 10). Across 100 trades, what is his net result?",
                    "choices": [
                      "A solid profit, because a 90% win rate guarantees success",
                      "\u2212$11,000 across the 100 trades",
                      "Breakeven if he stops after a winning week",
                      "Impossible to know without the stock ticker"
                    ],
                    "answer": 1,
                    "explain": "Ninety wins at $100 bring in +$9,000, while ten losses at $2,000 cost \u2212$20,000, leaving \u2212$11,000 net. Win rate without loss size is a trap."
                  },
                  {
                    "q": "Maria needs $500 next month to pay a bill. Why might she pick a guaranteed $500 return over a stock trade that averages $625 but has a 50% chance, or 1 in 2, of paying $0?",
                    "choices": [
                      "She forgot how to multiply probabilities",
                      "Missing the $500 bill causes real harm, so avoiding the $0 outcome matters more than the extra $125 average",
                      "Guaranteed returns always have a higher average payout",
                      "Stock trades never pay out in real life"
                    ],
                    "answer": 1,
                    "explain": "When coming up short breaks a real-life obligation, locking in the sure $500 is smarter than chasing an extra $125 on average."
                  },
                  {
                    "q": "An ad promises Sam a 'guaranteed 8% monthly options income with zero downside risk.' What should Sam conclude right away?",
                    "choices": [
                      "He found a rare loophole worth testing with half his savings",
                      "It is either a scam or hiding a huge crash loss, because real returns require taking real risk",
                      "He should put 5% of his cash in to see if the payouts arrive",
                      "Making 8% every month with no risk is normal for options"
                    ],
                    "answer": 1,
                    "explain": "No real market pays nearly 100% a year without risk. Pitches like this either fake their numbers or hide a rare crash that wipes out the account."
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
                "title": "What Owning a Share of Stock Really Means",
                "objective": "See how a share of stock gives you a slice of a real business, and how buyers and sellers set its price every second.",
                "body": "You have split the cost of a yard-sale table with friends so everyone gets a share of the cash. When Burgess Restaurant Group ($67) wants $670,000 for new kitchens, it sells 10,000 ownership slices called **common stock** at $67 each. Buying 10 shares for $670 ($67 \xD7 10 shares is $670) gives Maria a real slice of future profits. The yard-sale analogy stops there: Maria can sell her shares in seconds without asking the other owners.\n\nWhen Maria sells her 10 shares, she does not ask Burgess Restaurant Group for her $670 back. On the exchange, buyers post a top offer of $66.95 and sellers ask $67.05, leaving a $0.10 gap called the **bid-ask spread**. Sam pays $67.05 per share ($670.50 for 10 shares) to buy now, or gets $66.95 ($669.50 total) when selling. In plain words: a share is worth what a buyer will pay today, and crossing the gap between buyers and sellers costs a small fee.\n\nWhy does Lumend Brands trade at $42 in the morning and $40 by lunch? All day long, people update what they think the company will earn next year. If a surprise report says shipping costs jumped, buyers lower their offers from $42 to $40, cutting the value of Maria's 100 shares from $4,200 to $4,000 ($2 \xD7 100 shares is $200). Nobody at the exchange sets an official price\u2014the last trade between a buyer and a seller is the price.\n\nBefore buying 100 shares of Lumend Brands at $42 for $4,200, Sam checks his worst-case dollar loss. Unlike a bank loan, a company makes no promise to pay Sam back his $4,200 if sales collapse. If Lumend Brands goes out of business and the share price hits $0, Sam loses the entire $4,200 he paid, though he can never lose more than that $4,200. In plain words: buying shares gives you open-ended upside if the business grows, and your worst case in dollars is the full amount you paid.",
                "key_takeaways": [
                  "A share of common stock is a real slice of a business, its assets, and its future profits.",
                  "You sell shares to other people on the exchange, where the gap between buyer and seller prices is the bid-ask spread.",
                  "Stock prices move all day as news changes what people think future profits are worth.",
                  "If you pay $4,200 for 100 shares at $42, your upside is uncapped and your worst-case loss is the full $4,200."
                ],
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click BRGR in the Watchlist, and click Buy 10 sh, then Place order. Check the Bid and Ask columns in the Option chain below, then click \u23ED Next day three times to watch news move your 10 shares in dollars.",
                "quiz": [
                  {
                    "q": "Maria pays $6,700 for 100 shares of Burgess Restaurant Group at $67 a share. What does she own?",
                    "choices": [
                      "A loan that the company must pay back with interest next year",
                      "A real ownership slice of the company's kitchens, assets, and future profits",
                      "A gift card that only works at Burgess Restaurant locations",
                      "A side bet with the exchange that has nothing to do with the business"
                    ],
                    "answer": 1,
                    "explain": "Common stock is real ownership. Maria shares in future profits and growth, with no promise that the company will pay back her $6,700."
                  },
                  {
                    "q": "Why does Burgess Restaurant Group move from $67.00 at the open to $65.50 by the afternoon?",
                    "choices": [
                      "The stock exchange resets official company prices once an hour",
                      "Buyers and sellers change what they are willing to pay as new news comes out",
                      "A random number machine inside the exchange picks the afternoon price",
                      "The company changes its own stock price whenever it needs extra cash"
                    ],
                    "answer": 1,
                    "explain": "Stock prices move whenever news or orders change where buyers and sellers agree to trade."
                  },
                  {
                    "q": "Sam bought 100 shares of Lumend Brands at $38 ($3,800 total) last month. Today, after strong sales news, the top buyer offer is $42 ($4,200 total). What are Sam's shares worth right now?",
                    "choices": [
                      "Still $3,800, because what Sam paid sets the value",
                      "$4,200, because shares are worth what a buyer will pay for them today",
                      "$0 until the company sells its buildings",
                      "Only the value of the boxes sitting in the company warehouse"
                    ],
                    "answer": 1,
                    "explain": "Past purchase prices do not matter to the market. Sam's 100 shares are worth the $42 per share ($4,200 total) that a buyer will pay right now."
                  }
                ]
              },
              {
                "id": "f-diversification",
                "title": "Why Owning Different Businesses Smooths the Ride",
                "objective": "Spread your cash across businesses that react differently to the same news, and see when that protection can fail.",
                "body": "You have packed both an umbrella and sunglasses for a trip so neither forecast ruins your day. Splitting $9,500 across businesses that react differently to the same news\u2014like $4,750 in PowerSun Energy ($95) and $4,750 in Burgess Restaurant Group ($67)\u2014is called **diversification**. When fuel prices jump, a $400 gain on PowerSun can offset a $300 dip on Burgess. The trip analogy stops there: weather gear never fails at once, while all stocks can drop together in a panic.\n\nHow closely two stocks move together on the same day is called **correlation**, measured on a scale from \u22121 to +1 where +1 means they move in lockstep. Suppose Sam puts $9,100 across five fast-growing robotics companies, including 10 shares of Rocket Robotics ($182) for $1,820. Because all five share a correlation near +1, a single jump in interest rates can knock 10% off every one of them, costing Sam $910 in one afternoon. In plain words: owning five stocks in the same industry is just one big bet wearing five different shirts.\n\nNow compare Maria's mix of Lumend Brands ($42), PowerSun Energy ($95), and Burgess Restaurant Group ($67). Suppose each stock has a 60% chance, or 3 in 5, of gaining $300 this year and a 40% chance, or 2 in 5, of losing $150, for an average gain of $120 per stock. By holding $3,000 in each instead of $9,000 in just one, Maria keeps the same $360 combined average gain while cutting her daily dollar swings nearly in half. One company's rough quarter gets cushioned by a steady quarter at the other two.\n\nThere is one catch every stock owner must respect. During a sudden market-wide scare, nervous traders sell everything at once to raise cash, pushing correlations across almost all stocks toward +1. In a 20% market drop, even Maria's $9,000 three-stock mix can lose $1,800 in a single week. In plain words: spreading cash across different industries protects you from one company blowing up, but only true insurance\u2014like the option contracts you will meet next\u2014puts a hard floor under a market-wide crash.",
                "key_takeaways": [
                  "Diversification spreads your cash across businesses that react differently to the same news.",
                  "Owning five companies in the same tech sector is one big bet in disguise because their correlation sits near +1.",
                  "Mixing unrelated businesses cuts your daily dollar swings without lowering your average expected gain.",
                  "In a market-wide panic, almost all stocks fall together\u2014only direct insurance puts a hard dollar floor under a crash."
                ],
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click PWRS in the Watchlist, and click Buy 10 sh (~$950), then Place order. Then click BRGR, click Buy 10 sh (~$670), then Place order. Click \u23ED Next day five times and compare how the two positions offset each other in Open positions.",
                "quiz": [
                  {
                    "q": "Maria has $9,000 to invest. Which mix gives her the strongest protection against a single industry slump?",
                    "choices": [
                      "Five high-growth robotics and AI hardware companies",
                      "$3,000 each in PowerSun Energy ($95), Lumend Brands ($42), and Burgess Restaurant Group ($67)",
                      "Two different share classes of the same media company",
                      "All $9,000 in 50 shares of Rocket Robotics ($182)"
                    ],
                    "answer": 1,
                    "explain": "Energy, household goods, and restaurants react differently to fuel costs and shopper habits. Five robotics stocks get hit by the exact same news at the same time."
                  },
                  {
                    "q": "What kind of loss does spreading your money across different industries do the best job of preventing?",
                    "choices": [
                      "Every possible drop in your account during a market-wide crash",
                      "A bad earnings report or scandal at one company or sector wiping out your savings",
                      "The $0.65 per-contract trading fee",
                      "Taxes on profitable trades at the end of the year"
                    ],
                    "answer": 1,
                    "explain": "Spreading your cash across industries keeps a single company blowup from wrecking your whole account, though a broad market panic can still pull most stocks down together."
                  },
                  {
                    "q": "Why does combining unrelated stocks give Maria a smoother ride without lowering her average expected gain?",
                    "choices": [
                      "The exchange waives trading fees when you hold three tickers",
                      "Good days in one business cancel out rough days in another, while the average expected dollar gain of the parts stays the same",
                      "A three-stock mix is guaranteed to make money every single week",
                      "Unrelated stocks always pay larger cash dividends"
                    ],
                    "answer": 1,
                    "explain": "When stocks do not move in lockstep, their daily ups and downs partly cancel out, shrinking your account swings while keeping your combined average return intact."
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
                "title": "How Insurance Works for Both Sides",
                "objective": "See how paying a small, known fee up front caps a painful loss, while the seller profits on average across many policies.",
                "body": "You have paid $25 at a rental-car counter so a bumper dent does not stick you with a $1,500 repair bill. That $25 upfront fee\u2014paid whether or not you dent the car\u2014is called the **premium**. You give up a sure $25 today so the rental company promises to cover a $1,500 loss. The rental-car analogy stops there: you cannot resell a car waiver mid-trip, while market protection contracts trade all day.\n\nNow watch Maria protect 100 shares of PowerSun Energy ($95) worth $9,500. She pays Sam $300 up front for his promise to buy her 100 shares at $90 ($9,000 total) if the stock drops. The $5 per-share gap between $95 and $90 ($500 on 100 shares) is her **deductible**\u2014the first $500 dip she absorbs herself. In plain words: Maria pays $300 and takes the first $500 dip so her worst-case loss is capped at $800, even if PowerSun crashes.\n\nWhy would Sam take the other side and promise to cover a crash for just $300? Suppose a bad drop to $75 (costing Sam $1,500 to buy $75 shares at $90) happens only 10% of the time, or 1 in 10 tries. Across 10 separate deals, Sam collects $300 ten times for $3,000 total and pays out $1,500 once, leaving him $1,500 ahead on average ($150 per trade). Sam wins over many tries by spreading his promises across dozens of small trades, while Maria sleeps soundly knowing one crash cannot sink her.\n\nThe honest cost for Maria shows up when the weather stays calm. If PowerSun climbs from $95 to $105, her 100 shares grow by $1,000 to $10,500, and the $300 protection contract expires unused, leaving her with a $700 net gain ($1,000 minus $300 is $700). Paying $300 for protection she did not end up needing was not a mistake\u2014it was the price of capping her worst day at $800. In plain words: buying protection trims a slice off your best-case gain so you can put a hard dollar floor under your worst-case loss.",
                "key_takeaways": [
                  "A premium is the fixed cash fee you pay up front\u2014and never get back\u2014to hand off a painful loss.",
                  "A deductible is the first slice of a drop you absorb yourself before the seller's promise kicks in.",
                  "The seller makes money on average across many quiet tries, while the buyer gladly pays to cap a worst-case crash.",
                  "When the stock rises and protection goes unused, the fee you paid was still worth the floor it gave you."
                ],
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click PWRS in the Watchlist (~$95), and scroll to the Option chain. Look at the Put side on the right and compare the Ask price on the $90 strike versus the $85 strike to see how a bigger deductible lowers your upfront fee.",
                "quiz": [
                  {
                    "q": "Maria pays Sam $300 up front for a contract that protects her 100 shares of PowerSun Energy ($95). What is that $300 fee called?",
                    "choices": [
                      "The payout she receives after a crash",
                      "The premium\u2014the fixed upfront price Maria pays whether or not the stock falls",
                      "The profit Maria earns in a calm month",
                      "The deductible Maria absorbs before protection starts"
                    ],
                    "answer": 1,
                    "explain": "The premium is the known upfront cash Maria pays to Sam. Sam keeps that $300 whether PowerSun crashes or rallies."
                  },
                  {
                    "q": "If Sam prices his protection contracts so that he makes $150 on average per trade across 100 tries, why does Maria still buy one from him?",
                    "choices": [
                      "She should not\u2014no rational person ever pays for protection that loses money on average",
                      "Paying a survivable $300 fee to block a painful $3,000 crash loss makes sense when one big drop would hurt her",
                      "Sellers almost always miscalculate the odds in the buyer's favor",
                      "Buying protection guarantees Maria will make money every month"
                    ],
                    "answer": 1,
                    "explain": "When a big drop would derail your plans, paying a small, known $300 fee to cap your worst-case loss is smart even though the seller profits on average."
                  },
                  {
                    "q": "How does paying $300 to protect 100 shares of PowerSun Energy ($95) change Maria's best-case and worst-case outcomes?",
                    "choices": [
                      "Both her best-case gain and her worst-case loss get better",
                      "Her best-case gain is trimmed by the $300 fee, while her worst-case loss gets a hard dollar floor",
                      "Both her best-case gain and her worst-case loss get worse",
                      "Her outcomes stay the exact same as holding the shares alone"
                    ],
                    "answer": 1,
                    "explain": "In a rally Maria trails an unprotected shareholder by the $300 fee she paid, but in a crash Sam's promise puts a hard floor under her loss."
                  }
                ]
              },
              {
                "id": "f-bridge-to-options",
                "title": "How a Put Option Insures 100 Shares",
                "objective": "Match the parts of an insurance policy to a put option: the 100-share bundle, the strike price floor, the deadline, and the upfront fee.",
                "body": "You have read a home policy page that lists your coverage floor, your deductible, and your renewal date. On the stock exchange, that same protection contract for 100 shares is called a **put option**, such as paying $200 to insure 100 shares of Lumend Brands ($42). One contract always covers 100 shares, so a $2.00 quote costs $200 ($2 \xD7 100 shares is $200). The home-policy analogy stops there: anyone can trade a put option in seconds without an adjuster.\n\nMaria owns 100 shares of Lumend Brands at $42 ($4,200 total) and buys one 60-day $40 put for $2.00 a share ($200 total). That locked-in $40 exit price is the **strike price**, giving Maria the right to sell her 100 shares at $40 ($4,000 total) before the 60-day deadline. If Lumend crashes to $28, she still sells at $40, capping her total loss at $400 ($200 share dip plus $200 fee). In plain words: the strike price is your guaranteed floor, and the gap between today's price and the strike is your deductible.\n\nWho makes that promise on the other side of Maria's trade? Sam, the option seller, collects Maria's $200 cash today and must buy her 100 shares at $40 ($4,000 total) if Lumend drops below $40 by the deadline. Just like coastal insurance ahead of a storm, Sam charges more when big news is coming. In a quiet week Sam might charge $1.50 ($150 total) for that $40 put, while before big earnings news he charges $3.50 ($350 total).\n\nWhat if good news lands instead and Lumend climbs from $42 to $50? Maria's 100 shares grow by $800 to $5,000, her $40 put expires at $0, and she walks away up $600 net ($800 stock gain minus $200 fee is $600). Sam keeps the $200 fee as his payment for standing ready to take the crash that never happened. In plain words: every option contract is a simple trade between someone paying cash to reshape risk and someone getting paid cash to take that risk on.",
                "key_takeaways": [
                  "A put option gives its buyer the right to sell 100 shares at the strike price on or before the deadline.",
                  "One standard option covers 100 shares, so a $2.00 per-share price costs $200 in real cash ($2 \xD7 100 shares is $200).",
                  "The option seller collects the buyer's cash up front and promises to buy the 100 shares at the strike price if the stock drops.",
                  "Option prices rise before big news or stormy markets because sellers demand higher fees to take on bigger jump risk."
                ],
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click LMND in the Watchlist (~$42), and click Buy 100 sh. In the Option chain, click the Ask price on the Put side at the $40 strike, then click Place order and Trade anyway. Click \u23ED Next day five times and watch how the put cushions down days.",
                "quiz": [
                  {
                    "q": "Maria owns 100 shares of Lumend Brands at $42 and buys one 60-day $40 put option for $200. What is this trade doing for her?",
                    "choices": [
                      "Buying a lottery ticket that only pays if the company doubles",
                      "Buying a 60-day insurance policy with a $40 per-share floor, a $2 per-share deductible ($200), and a $200 upfront fee",
                      "Borrowing $4,000 from her broker to buy more shares",
                      "Selling her 100 shares immediately at $40"
                    ],
                    "answer": 1,
                    "explain": "Buying a put against 100 shares you own works just like an insurance policy: you pay $200 up front so your shares cannot be worth less than $40 each ($4,000 total) before the deadline."
                  },
                  {
                    "q": "Sam pays $300 for a 60-day $90 put to protect his 100 shares of PowerSun Energy ($95). PowerSun rallies to $110 (+$1,500 on the shares) and the put expires at $0. Was buying the put a mistake?",
                    "choices": [
                      "Yes\u2014any contract that finishes at $0 was a wasted trade",
                      "No\u2014paying $300 to cap his worst-case loss during a risky 60-day window did its job even though the storm missed",
                      "Yes\u2014you should only buy puts when you know for sure a crash will happen",
                      "Only if the company did not pay a cash dividend"
                    ],
                    "answer": 1,
                    "explain": "You judge protection before the news hits, not after. Just like you do not regret a crash-free year on car insurance, the $300 bought a hard dollar floor while Sam held through uncertainty."
                  },
                  {
                    "q": "When does the price of a $40 put on Lumend Brands ($42) jump from $1.50 ($150) to $3.50 ($350) even before the stock price moves?",
                    "choices": [
                      "When the market is dead calm and nobody expects news",
                      "When big news or rocky markets make large price swings more likely, so sellers charge more for protection",
                      "Never\u2014the exchange locks the price of a $40 put at $1.50 all year",
                      "Only on the last trading day of December"
                    ],
                    "answer": 1,
                    "explain": "Just like coastal insurance ahead of storm season, option sellers charge higher upfront fees when big news or jumpy markets raise the chance of a sharp drop."
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
        "description": "What options are, what they cost, and the first strategies real people use \u2014 every one of them built and tried on the practice market before you risk a dollar.",
        "modules": [
          {
            "id": "c-language",
            "title": "The Language of Options",
            "lessons": [
              {
                "id": "c-calls-puts-defined",
                "title": "Calls, Puts, and How One Contract Covers 100 Shares",
                "objective": "Tell a call option from a put option, multiply per-share quotes by 100, and see who gets a choice versus who makes a promise.",
                "body": "You have paid a $20 fee to hold a $300 flight price for 48 hours while checking your schedule. On the exchange, paying $200 for the right to buy 100 shares of Lumend Brands ($42) at $45 within 60 days is called a **call option**. If Lumend jumps to $52, Maria buys at $45; if not, she loses only her $200 fee. The flight-hold analogy stops there: airline holds cannot be resold, while options trade all day.\n\nWhile a call gives Maria the right to buy 100 shares at a locked-in strike price, a put gives her the right to sell 100 shares at that price. Every standard US stock option covers 100 shares\u2014a fixed 100-share bundle called the **multiplier**\u2014so an option quoted at $1.45 per share costs $145 in cash ($1.45 \xD7 100 shares is $145). If Sam buys one 60-day $65 put on Burgess Restaurant Group ($67) quoted at $2.00, he pays $200 up front for the right to sell 100 shares at $65 ($6,500 total). In plain words: calls lock in a buying ceiling, puts lock in a selling floor, and you always multiply the screen price by 100.\n\nEvery option trade has a buyer who gets a choice and a seller who makes a binding promise. When Maria buys that $45 call on Lumend Brands ($42) for $200, her worst-case loss is strictly capped at $200. Sam, who collected that $200, must deliver 100 shares at $45\u2014if Lumend hits $80, buying at $80 to sell at $45 costs him $3,300 net. Never sell an option without checking the worst-case dollar cost of keeping your promise.\n\nFinally, always compare the option's strike price to today's share price. With Lumend Brands at $42, a $40 call already sits $2 per share ($200 for 100 shares) below today's price, so using it right now would save Maria $200. A $45 call sits $3 above today's $42 price, so it pays nothing unless Lumend climbs past $45 before the deadline. In plain words: the buyer pays a capped fee for a choice, the seller gets paid for a promise, and the strike sets the finish line.",
                "key_takeaways": [
                  "A call option gives its buyer the right to buy 100 shares at the strike price on or before the deadline.",
                  "A put option gives its buyer the right to sell 100 shares at the strike price on or before the deadline.",
                  "The multiplier is 100 shares per contract, so a $2.00 quoted price costs $200 in real cash ($2 \xD7 100 shares is $200).",
                  "Buyers pay cash for a choice with a capped dollar loss; sellers collect cash and take on a binding obligation."
                ],
                "source": "Options Core \xB7 Contract Basics",
                "sim": "strategy",
                "sim_task": "Open Strategy Lab, select LMND in Underlying, and choose Long Call in Preset strategy. Change the Strike dropdown to a strike just above today's price, read the Net debit, Max loss, and Breakeven tiles, and hover across the At expiration line on the chart.",
                "quiz": [
                  {
                    "q": "Maria buys one $40 put on Lumend Brands ($42) for $3.00 per share ($300 total). What is the most money she can possibly lose on this trade?",
                    "choices": [
                      "Unlimited dollars if Lumend rallies",
                      "$300\u2014the upfront cash she paid for the contract",
                      "$4,000\u2014the full value of 100 shares at the $40 strike",
                      "$40 per share"
                    ],
                    "answer": 1,
                    "explain": "An option buyer can never lose more than the upfront cash paid. In the worst case the put finishes at $0 and Maria loses $300 ($3.00 \xD7 100 shares is $300)."
                  },
                  {
                    "q": "In an option trade between Maria (the buyer) and Sam (the seller), who takes on a binding obligation after the trade is placed?",
                    "choices": [
                      "Maria, the option buyer",
                      "Sam, the option seller",
                      "Both Maria and Sam equally",
                      "Neither\u2014options give choices to both sides"
                    ],
                    "answer": 1,
                    "explain": "Sam collects Maria's upfront cash in exchange for a binding promise to buy or sell 100 shares at the strike price if Maria chooses to use her contract."
                  },
                  {
                    "q": "Lumend Brands trades at $42 today. Which of these contracts already has a strike price that would pay off if Maria used her right immediately?",
                    "choices": [
                      "The $45 call (right to buy at $45)",
                      "The $40 call (right to buy at $40)",
                      "The $40 put (right to sell at $40)",
                      "The $45 call and $40 put together"
                    ],
                    "answer": 1,
                    "explain": "With the stock at $42, the right to buy shares at $40 is already worth $2 per share ($200 total). Buying at $45 or selling at $40 would not pay off at a $42 stock price."
                  },
                  {
                    "q": "Sam sees an option on Burgess Restaurant Group ($67) quoted at $1.45 on the chain. How much cash does it cost to buy one standard contract (before the $0.65 fee)?",
                    "choices": [
                      "$1.45",
                      "$14.50",
                      "$145",
                      "$1,450"
                    ],
                    "answer": 2,
                    "explain": "One standard US stock option covers 100 shares: $1.45 \xD7 100 shares is $145. Forgetting to multiply the screen quote by 100 is an expensive beginner mistake."
                  }
                ]
              },
              {
                "id": "c-pricing-intuition",
                "title": "What You Are Paying For: Real Value Now vs. Time Left",
                "objective": "Split any option price into what it is worth right now and what you are paying for time and possible movement.",
                "body": "You have bought a $15 bakery box that holds $10 of cookies inside a $5 tin. Option prices split into two pieces the same way. With Burgess Restaurant Group at $67, a $65 call lets Maria buy $67 shares for $65, giving it $2 per share ($200 for 100 shares) of right-now worth called **intrinsic value**. The bakery analogy stops there: a tin lasts forever, while an option's extra price melts away by the deadline.\n\nIf that $65 call on Burgess Restaurant Group ($67) trades for $3.40 ($340 total), and $2.00 ($200) is intrinsic value, what is the other $1.40 ($140)? That extra $1.40 per share ($140 total) is **time value**\u2014the cash Maria pays Sam for the chance that Burgess climbs even higher before the deadline. Time value is biggest when the strike price sits right at today's $67 stock price, where the outcome is a 50% coin flip, or 1 in 2. In plain words: every option price equals what the contract is worth right this second plus the extra fee for what might still happen.\n\nTwo forces make time value more expensive: more days on the clock and a jumpier stock. A 60-day call on Lumend Brands ($42) costs about $2.80 ($280) while a 30-day call costs $2.00 ($200)\u2014not double, because price swings grow with the square root of time. When news makes Lumend swing wider, Sam charges more for both calls and puts because big moves in either direction become more likely. More days or wilder swings always mean a bigger upfront fee.\n\nTime value is not a gift; it is a melting ice cube. Every quiet day that Burgess stays stuck at $67, a few dollars of Maria's $140 time value vanish into Sam's pocket until $0 of time value remains at the deadline. Before Maria buys any option, she splits the quote in her head: '$340 total is $200 of real value now plus $140 of melting time.' In plain words: always check how many dollars of an option's price will melt to $0 if the stock goes nowhere.",
                "key_takeaways": [
                  "Every option price splits into intrinsic value (what it is worth right now) plus time value (the price of what might happen).",
                  "Time value is highest when the strike sits right at today's stock price, where the finish is most uncertain.",
                  "When a stock becomes jumpier, both calls and puts get more expensive because big swings in either direction are more likely.",
                  "Time value melts to $0 by the deadline, so buyers pay for time every quiet day while sellers collect it."
                ],
                "source": "Options Core \xB7 Pricing Intuition",
                "sim": "greeks",
                "sim_task": "Open Greeks Lab and look at the Call price tile for the $100 model stock. Drag Strike K to $95 so the call has $5 of right-now value, then drag Days to expiry from 60 down to 1 to watch the extra time value melt away, and drag the third slider from 20% to 40% to watch the price swell.",
                "quiz": [
                  {
                    "q": "Burgess Restaurant Group trades at $68 today, and Maria sees the $65 call priced at $5.10 per share ($510 total). How does that $5.10 price split?",
                    "choices": [
                      "$5.10 intrinsic value, $0 time value",
                      "$3.00 intrinsic value ($300), $2.10 time value ($210)",
                      "$0 intrinsic value, $5.10 time value",
                      "$2.10 intrinsic value ($210), $3.00 time value ($300)"
                    ],
                    "answer": 1,
                    "explain": "Buying a $68 stock for $65 is worth $3.00 per share ($300) right now ($68 minus $65 is $3). The remaining $2.10 ($210) is time value."
                  },
                  {
                    "q": "Lumend Brands trades at $42 today. Which 30-day call option carries the most time value in its price?",
                    "choices": [
                      "A $30 call sitting far below today's $42 price",
                      "A $42 call sitting right at today's $42 price",
                      "A $55 call sitting far above today's $42 price",
                      "All three calls carry the exact same dollar amount of time value"
                    ],
                    "answer": 1,
                    "explain": "Time value peaks right at today's stock price ($42), where whether the option pays off is most uncertain."
                  },
                  {
                    "q": "Surprise news makes expected price swings on Lumend Brands ($42) double overnight while the share price stays at $42. What happens to option prices?",
                    "choices": [
                      "Calls go up in price and puts go down",
                      "Puts go up in price and calls go down",
                      "Both calls and puts go up in price",
                      "Nothing changes until the share price moves off $42"
                    ],
                    "answer": 2,
                    "explain": "Bigger expected swings raise the chance of a large payout in both directions, so sellers charge more for calls and puts alike."
                  },
                  {
                    "q": "Why does a 60-day option on Burgess Restaurant Group ($67) cost about 1.4 times as much as a 30-day option instead of twice as much?",
                    "choices": [
                      "Exchanges offer a bulk discount on 60-day contracts",
                      "The range of likely stock moves grows with the square root of time, not in a straight line",
                      "Nobody likes trading 60-day options",
                      "It actually does cost twice as much on every stock"
                    ],
                    "answer": 1,
                    "explain": "Doubling the time from 30 days to 60 days widens the stock's likely trading range by about 1.41 times (the square root of 2), not 2 times."
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
                "title": "Buying a Call: Big Upside, Strict Deadline",
                "objective": "Calculate the exact stock price a call needs to make money at the deadline, and see why being right too slowly still loses.",
                "body": "You have bought a $50 discount card that only pays for itself after you spend enough to cover the $50 fee. If Maria pays $2.00 a share ($200 total) for a 60-day $45 call on Lumend Brands ($42), the stock must reach $47 ($45 strike plus $2 fee)\u2014her **breakeven price**\u2014just to get her $200 back at the deadline. Above $47, she gains $100 for every $1 Lumend rises. The card analogy stops there: Maria can resell her call anytime before the deadline.\n\nNow look at the catch that trips up beginners. If Lumend climbs from $42 to $46 by day 60, Maria was right that the stock would rise, yet her $45 call is worth only $1.00 ($100) and she still loses $100 of her $200 fee. Every calm day that passes without a big rally, her option loses a few dollars of time value\u2014a daily fade called **time decay**, such as losing $3 a day on a $200 call. In plain words: a call buyer must be right about direction, the dollar size of the move, and the deadline all at once.\n\nPicking a strike price changes the odds of the trade. On Burgess Restaurant Group ($67), a 60-day $67 call might cost $3.50 ($350 total), needing a rally to $70.50 ($67 plus $3.50) to break even. A cheap $80 call might cost just $0.40 ($40 total), tempting Sam because $40 feels harmless, but Burgess must surge past $80.40 in 60 days\u2014a long shot that wins less than 10% of the time, or 1 in 10. Buying $40 long shots ten times in a row quietly drains $400 just as surely as one big loss.\n\nBefore Maria buys any call, she follows two survival rules. First, she assumes losing the entire $200 fee is a normal outcome and never puts more cash into a call than she can afford to lose 100% of. Second, she picks a calendar day\u2014such as 15 days before the deadline\u2014to sell and salvage what is left if the rally has not arrived on schedule. In plain words: size every call purchase assuming the full fee can go to $0, and close early when the clock is running out on a flat stock.",
                "key_takeaways": [
                  "A call buyer's breakeven price at the deadline is the strike price plus the per-share fee paid ($45 + $2 = $47).",
                  "Your worst-case loss is capped at the upfront cash you paid, while your upside above breakeven is open-ended.",
                  "You can be right that the stock goes up and still lose money if it does not pass your breakeven price before the deadline.",
                  "Cheap calls far above today's stock price expire at $0 most of the time; always size assuming you can lose the full fee."
                ],
                "source": "Options Core \xB7 Buying Calls",
                "sim": "strategy",
                "sim_task": "Open Strategy Lab, select LMND in Underlying (~$42), and choose Long Call in Preset strategy. Compare the Max loss, Breakeven, and Model-implied win odds tiles for a strike near $42 versus a strike $5 higher by changing the Strike dropdown.",
                "quiz": [
                  {
                    "q": "Maria buys one $45 call on Lumend Brands ($42) for $2.00 per share ($200 total). At the deadline, Lumend finishes at $46. What is Maria's net profit or loss?",
                    "choices": [
                      "+$100",
                      "\u2212$100",
                      "+$400",
                      "$0 (breaks even)"
                    ],
                    "answer": 1,
                    "explain": "At $46, the $45 call is worth $1.00 per share ($100), but Maria paid $2.00 ($200). She loses $100 even though the stock rose $4, because her breakeven price was $47."
                  },
                  {
                    "q": "Sam sees a 30-day $80 call on Burgess Restaurant Group ($67) for just $0.35 ($35 total). Why is habitually buying very cheap calls far above today's price usually a losing habit?",
                    "choices": [
                      "Brokers charge higher fees on $35 contracts",
                      "A $35 price means tiny risk, so it is actually a great habit",
                      "The chance of the stock jumping past $80.35 before the deadline is tiny, so almost all of them finish at $0",
                      "The exchange does not allow you to sell a $0.35 call before the deadline"
                    ],
                    "answer": 2,
                    "explain": "A $35 price tag is cheap for a reason: the odds of a huge jump before the deadline are tiny, so repeating that bet drains your cash over time."
                  },
                  {
                    "q": "Besides getting the direction and the dollar size of the move right, what third thing must a call buyer get right to make money?",
                    "choices": [
                      "The company's dividend date",
                      "Timing\u2014the stock must move past the breakeven price before the expiration deadline",
                      "The next interest-rate announcement",
                      "The stock's ticker symbol"
                    ],
                    "answer": 1,
                    "explain": "Options have a strict deadline. A stock rally that shows up two weeks after your call expires pays you $0 while time decay eats your upfront fee."
                  }
                ]
              },
              {
                "id": "c-puts-protective",
                "title": "Buying Puts: Profiting from a Drop or Insuring Your Shares",
                "objective": "Use a put option two ways: alone to profit when a stock falls, or paired with 100 shares to put a hard dollar floor under a crash.",
                "body": "You have paid $15 extra for a refundable hotel room so a canceled trip costs $15 instead of $300. Buying a put by itself\u2014a **long put**, like paying $250 for a 60-day $90 put on PowerSun Energy ($95)\u2014lets Sam profit from a drop with his worst loss capped at $250. His breakeven price at the deadline is $87.50 ($90 strike minus $2.50 fee). The hotel analogy stops there: a long put gains $100 for every $1 PowerSun drops below $87.50.\n\nNow pair that same put with 100 shares you already own. When Maria owns 100 shares of PowerSun Energy at $95 ($9,500) and buys one $90 put for $2.50 ($250), that stock-plus-put bundle is called a **protective put**. If PowerSun crashes to $70, her 100 shares drop by $2,500, but her put lets her sell at $90, capping her total worst-case loss at $750 ($500 share drop to $90 plus $250 fee is $750). In plain words: a protective put leaves your upside open if the stock rallies and locks in a hard dollar floor if the stock crashes.\n\nIf a protective put works so well in a crash, why doesn't Maria keep one on her 100 shares of PowerSun ($95) every single month of the year? Because paying $250 every two months six times a year costs $1,500 a year ($250 \xD7 6 is $1,500), eating roughly 16% of her $9,500 stock position even when nothing bad happens. Over five calm years, spending $1,500 a year drains $7,500 in fees. Smart stock owners buy put protection only around clear danger windows\u2014like an earnings report or a rocky month\u2014rather than paying for storm coverage on sunny days.\n\nNotice what pairing 100 shares with a put does to your risk. Holding 100 shares of PowerSun at $95 alone carries $9,500 of downside if the business fails, while holding those 100 shares plus the $90 put caps Maria's 60-day loss at $750. Used this way, an option does not make Maria's life riskier\u2014it takes $8,750 of crash risk off the table for a $250 fee. In plain words: buying a put alone is a capped-loss bet on a drop, and pairing a put with 100 shares makes owning stock safer than holding the shares by themselves.",
                "key_takeaways": [
                  "A long put profits when a stock falls below (strike minus fee), with your worst-case loss capped at the fee you paid.",
                  "A protective put pairs 100 shares with 1 put, capping your worst-case dollar loss while keeping your upside open.",
                  "Buying puts all year long eats too much cash in fees ($250 \xD7 6 is $1,500 a year), so insure specific risky windows.",
                  "Owning 100 shares plus a put is strictly less risky than owning the 100 shares alone."
                ],
                "source": "Options Core \xB7 Protective Puts",
                "sim": "strategy",
                "sim_task": "Open Strategy Lab, select PWRS in Underlying (~$95), and choose Protective Put in Preset strategy. Read the Max loss and Max profit tiles, then compare that curve to choosing Long Put in Preset strategy.",
                "quiz": [
                  {
                    "q": "Maria owns 100 shares of PowerSun Energy at $95 ($9,500) and buys one $90 put for $2.50 per share ($250 total). PowerSun crashes to $70 by the deadline. What is Maria's total dollar loss?",
                    "choices": [
                      "$2,500",
                      "$750",
                      "$250",
                      "$500"
                    ],
                    "answer": 1,
                    "explain": "The $90 put lets Maria sell her 100 shares at $90: she loses $500 on the shares ($95 down to $90) plus the $250 fee she paid, for $750 total instead of $2,500."
                  },
                  {
                    "q": "Sam thinks Lumend Brands ($42) is about to fall. Compared to borrowing shares to sell them short, what is the big advantage of buying a put option?",
                    "choices": [
                      "A put is guaranteed to make money even if the stock stays flat",
                      "Unlimited profit even if the stock rallies",
                      "A known, strictly capped worst-case dollar loss equal to the upfront fee",
                      "A put option never expires"
                    ],
                    "answer": 2,
                    "explain": "When Sam buys a put for $200, the most he can ever lose is $200. Shorting shares directly has uncapped dollar losses if the stock rockets higher."
                  },
                  {
                    "q": "Why don't stock owners keep protective puts on all of their shares every single month of the year?",
                    "choices": [
                      "Put options are not allowed on stocks above $50",
                      "Paying $200 to $300 every few weeks adds up to a huge yearly drag on your returns, so protection is bought for specific risky windows",
                      "A protective put caps how much you can make if the stock rallies",
                      "Exchanges only sell puts during earnings week"
                    ],
                    "answer": 1,
                    "explain": "Spending 2% to 3% of a stock's value every quarter eats roughly 10% a year in fees. Buying protection selectively for risky windows keeps the cost under control."
                  }
                ]
              },
              {
                "id": "c-covered-calls",
                "title": "Covered Calls: Getting Paid Cash to Cap Your Upside",
                "objective": "Pair 100 shares with a call you sell, calculate your breakeven and profit cap, and weigh the upfront cash against the downside you still keep.",
                "body": "You have taken a buyer's $40 non-refundable deposit to hold your $400 bicycle for them until Saturday. Owning 100 shares of Burgess Restaurant Group at $67 ($6,700) and selling Sam a 60-day $70 call for $2.00 a share ($200 paid to you today) is called a **covered call**. Maria keeps that $200 cash no matter what. The deposit analogy stops there: while Maria waits, her 100 shares can still fall in price and lose far more than $200.\n\nWalk through what happens to Maria's 100 shares of Burgess ($67) and her $200 cash at the deadline. If Burgess stays at $67, the $70 call expires at $0 and Maria keeps $200. If Burgess jumps to $75, Sam buys her 100 shares at $70\u2014a required handover called **assignment** that caps Maria's total profit at $500 ($300 share gain plus $200 cash). In plain words: selling a call against 100 shares pays you cash today in exchange for capping your upside above the strike.\n\nWhat about the downside when Burgess drops instead of rising? That $200 upfront payment lowers Maria's breakeven price by $2 a share from $67 down to $65 ($67 minus $2 is $65), which only cushions a small dip. If bad news knocks Burgess down to $57, Maria loses $1,000 on her shares and the $200 fee only trims the loss to \u2212$800. Never treat call cash as risk-free income, because you still carry the downside of owning 100 shares.\n\nWhy is it called 'covered'? Because Maria already owns the 100 shares she promised to deliver at $70, unlike an uncovered seller who owns 0 shares and faces unlimited dollar losses if the stock rockets to $120. Before Maria sells a $70 call, she asks herself one question: 'Will I be happy parting with my 100 shares at $70?' In plain words: only sell a covered call at a strike price where you would gladly sell your shares, and remember the shares themselves can still fall.",
                "key_takeaways": [
                  "A covered call pairs 100 shares you own with 1 call you sell; you keep the upfront cash in every outcome.",
                  "Your breakeven price is your share cost minus the call fee ($67 \u2212 $2 = $65); your max profit is capped at the strike plus the fee.",
                  "A covered call beats holding stock alone in flat or gently drifting markets, trails in big rallies, and only cushions a crash.",
                  "Only sell a call at a strike price where you are genuinely happy to hand over your 100 shares."
                ],
                "source": "Options Core \xB7 Covered Calls",
                "sim": "strategy",
                "sim_task": "Open Strategy Lab, select BRGR in Underlying (~$67), and choose Covered Call in Preset strategy. Check the Net credit, Max profit, Max loss, and Breakeven tiles, then click Send to Live Market to place the paper trade.",
                "quiz": [
                  {
                    "q": "Maria buys 100 shares of Burgess Restaurant Group at $67 ($6,700) and sells one $70 call for $2.00 per share ($200 cash). At the deadline, Burgess finishes at $80. What is Maria's total dollar profit?",
                    "choices": [
                      "$1,500",
                      "$500",
                      "$300",
                      "$1,300"
                    ],
                    "answer": 1,
                    "explain": "Maria's 100 shares are called away at the $70 strike for a $300 stock gain ($70 minus $67 \xD7 100 shares), plus the $200 cash she kept up front, for $500 total."
                  },
                  {
                    "q": "In that same trade (100 shares of Burgess bought at $67, plus one $70 call sold for $2.00), what is Maria's breakeven stock price at the deadline?",
                    "choices": [
                      "$70",
                      "$69",
                      "$65",
                      "$67"
                    ],
                    "answer": 2,
                    "explain": "The $2.00 per-share cash Maria collected up front lowers her breakeven price from $67 to $65 ($67 minus $2 is $65). Below $65, her share losses exceed the $200 cash."
                  },
                  {
                    "q": "In which market outcome does a covered call make LESS money than simply holding the 100 shares by themselves?",
                    "choices": [
                      "A big rally far above the strike price",
                      "A flat month where the stock goes nowhere",
                      "A small $1 dip in the stock price",
                      "A sharp drop in the stock price"
                    ],
                    "answer": 0,
                    "explain": "In flat, slightly up, or down markets, the upfront cash makes the covered call finish ahead of stock alone. Only when the stock surges past the strike plus the fee does uncapped stock win."
                  },
                  {
                    "q": "Why is selling a covered call so much safer than selling an uncovered (naked) call without owning the 100 shares?",
                    "choices": [
                      "It is not safer\u2014both trades have the exact same risk",
                      "Because you already own the 100 shares to hand over at the strike, so a huge rally caps your gain instead of causing an unlimited cash loss",
                      "Buyers are not allowed to use a covered call at the deadline",
                      "Uncovered calls do not pay any upfront cash"
                    ],
                    "answer": 1,
                    "explain": "An uncovered seller who owns 0 shares must buy 100 shares at any runaway price to fulfill the promise. Owning the 100 shares up front means you simply hand over shares you already hold."
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
                "title": "Vertical Spreads: Cutting Your Cost by Capping Your Gain",
                "objective": "Pair an option you buy with an option you sell at a different strike price, calculate your max profit, max loss, and breakeven, and see why capping your upside can lower your risk.",
                "body": "You have bought a $300 festival pass and sold the Sunday wristband you cannot use for $100 to cut your cost. Pairing an option you buy with one you sell at a different strike is a **vertical spread**, like buying a $42 call and selling a $47 call. On Lumend Brands ($42), Maria pays $300 for the $42 call and collects $100 for the $47 call, capping her net loss at $200. The wristband analogy stops there: paper tickets have fixed prices, while both option legs trade up and down until expiration.\n\nWhy does Maria gladly cap her profit at the $47 strike on Lumend ($42)? She expects Lumend to grind toward $46 over 60 days, with only a 10% chance, or 1 in 10, of passing $47. Selling the $47 call lowers her breakeven to $44 ($42 plus $2 net cost) and caps her max profit at $300 ($500 gap minus $200). In plain words: selling a higher call gives up long-shot upside you do not expect so you pay less up front.\n\nSam flips that math around when he expects Burgess Restaurant Group ($67) to slide toward $62. Buying a $67 put for $320 and selling a $62 put for $120 builds a **bear put spread** for a $200 net cost. Sam caps his worst-case loss at $200, lowers his breakeven to $65 ($67 minus $2), and caps his profit at $300 ($500 minus $200). Whether you build a spread with calls or puts, the option you sell helps pay for the one you buy.\n\nOne timing quirk surprises almost every first-time spread trader. If Lumend hits $49 with 10 days left, Maria's $42/$47 call spread trades near $460 instead of $500 because the $47 call holds $40 of time value. Her spread is not broken\u2014that final $40 of profit arrives only when the $47 call's time value melts at expiration. In plain words: a winning spread reaches its full cap slowly, so closing early to bank $260 of a $300 max gain is smart.",
                "key_takeaways": [
                  "In a bull call spread, your worst-case loss is the net cash paid ($200), your breakeven is the lower strike plus net cost ($42 + $2 = $44), and your max profit is the strike gap minus net cost ($500 \u2212 $200 = $300).",
                  "Selling the further-away strike helps pay for the option you bought by giving up long-shot gains you do not expect.",
                  "A bear put spread works the same way for a drop: buy a higher-strike put and sell a lower-strike put in the same expiration.",
                  "Spreads reach their maximum dollar value only at the deadline because the option you sold holds onto a little time value until the end."
                ],
                "source": "OASI 5e ch. 7 (Bull Spreads) and ch. 8 (Bear Spreads)",
                "sim": "strategy",
                "sim_task": "Open Strategy Lab, select LMND in Underlying (~$42), and choose Bull Call Spread in Preset strategy. Read the Net debit, Max profit, Max loss, and Breakeven tiles, then switch Preset strategy to Bear Put Spread to compare the mirror-image payoff.",
                "quiz": [
                  {
                    "q": "Maria buys a $40 call and sells a $50 call on Lumend Brands ($42) in the same expiration for a net cost of $3.00 per share ($300 total). At the deadline, Lumend finishes at $48. What is Maria's net profit or loss?",
                    "choices": [
                      "+$500",
                      "+$800",
                      "\u2212$300",
                      "+$700"
                    ],
                    "answer": 0,
                    "explain": "At $48, the $40 call Maria bought is worth $8.00 ($800) and the $50 call she sold expires at $0. Subtracting her $300 upfront cost from $800 leaves +$500."
                  },
                  {
                    "q": "Why would Sam prefer a $67/$72 bull call spread on Burgess Restaurant Group ($67) for $200 net over buying the $67 call alone for $320?",
                    "choices": [
                      "Vertical spreads are guaranteed to make more money in a huge rally",
                      "The $120 collected from the $72 call lowers his upfront cost and breakeven price while giving up only gains above $72 that he does not expect",
                      "Vertical spreads never lose time value on quiet days",
                      "Exchanges require beginners to trade two legs at once"
                    ],
                    "answer": 1,
                    "explain": "Collecting $120 from the $72 call cuts Sam's upfront risk from $320 to $200 and lowers his breakeven from $70.20 to $69.00, in exchange for capping his gains above $72."
                  },
                  {
                    "q": "Maria holds a $40/$50 call spread ($1,000 strike gap), and Lumend Brands trades at $55 with one week left before the deadline. Why is her spread trading at $9.55 ($955) instead of the full $10.00 ($1,000)?",
                    "choices": [
                      "The exchange is mispricing the spread",
                      "The $50 call she sold still holds $0.45 ($45) of time value, which only melts to $0 at the expiration deadline",
                      "Her broker is taking a $45 hidden fee",
                      "Vertical spreads can never reach their full strike gap"
                    ],
                    "answer": 1,
                    "explain": "As long as days remain on the clock, the $50 call Maria sold still carries a small slice of time value. That last $45 fades to $0 only as the deadline arrives."
                  }
                ]
              },
              {
                "id": "c-straddles-strangles",
                "title": "Straddles and Strangles: Betting on a Big Move Either Way",
                "objective": "Build a long straddle and a long strangle, calculate both breakeven prices, and see why a big stock move after earnings can still lose money.",
                "body": "You have packed both a $15 poncho and $15 sunblock for an all-day stadium show when forecasts conflict. Buying a call and a put at the same strike and deadline is a **long straddle**, such as paying $480 on Burgess Restaurant Group ($67). Maria pays $250 for the $67 call and $230 for the $67 put, winning below $62.20 or above $71.80 while capping her loss at $480. The stadium analogy stops there: weather gear cannot be resold, while one option in a big swing can triple in value.\n\nWhen $480 feels too steep, Sam builds a **long strangle** by buying a $70 call ($110) and a $64 put ($100) for $210 total. Because both strikes start $3 away from Burgess's $67 price, Sam now needs a move below $61.90 or above $72.10 to profit. His worst-case loss shrinks from $480 down to the $210 upfront fee he paid. In plain words: a strangle cuts your upfront dollar cost by more than half, in exchange for needing a bigger move.\n\nA classic trap catches traders right before a major news event. Before Rocket Robotics ($182) reports earnings, Sam pays $1,200 ($12 per share) for a $182 straddle because he expects a big jump. That $1,200 price tag already prices in a $12 move, so when Rocket jumps $8 to $190, Sam's straddle is worth $800 and loses $400. You only profit when the actual dollar move beats the move already baked into the upfront fee you paid.\n\nWhat if Maria sells both the $67 call and $67 put on Burgess ($67) to collect $480 up front? She wins in about 75% of quiet months, or 3 in 4, inside $62.20 to $71.80, but a jump to $95 loses $2,320 net. Because uncovered short calls carry unlimited risk, our practice floor blocks them unless you add protective wings to cap losses. In plain words: buying a straddle caps your loss and needs a surprise move, while selling one uncovered risks a huge shock loss.",
                "key_takeaways": [
                  "A long straddle buys a call and a put at the same strike and deadline; its breakevens are the strike minus the total fee and the strike plus the total fee.",
                  "A long strangle buys a higher-strike call and a lower-strike put, cutting your upfront dollar cost while widening the move you need to win.",
                  "The combined fee is the market's priced-in move\u2014if you pay $1,200 ($12 per share) before earnings and the stock only jumps $8, you still lose $400.",
                  "Selling straddles or strangles without protective wings trades small upfront fees for uncapped crash or rally losses."
                ],
                "source": "OASI 5e straddle and strangle (combination) buying chapters",
                "sim": "strategy",
                "sim_task": "Open Strategy Lab, select BRGR in Underlying (~$67), and choose Long Straddle in Preset strategy. Read the Net debit, Max loss, and Breakevens tiles, then switch Preset strategy to Long Strangle to see how the upfront cost shrinks while the breakeven gap widens.",
                "quiz": [
                  {
                    "q": "Maria buys a $67 straddle ($67 call + $67 put) on Burgess Restaurant Group ($67) for $8.50 per share ($850 total). At the deadline, Burgess finishes at $74. What is Maria's net profit or loss?",
                    "choices": [
                      "+$700",
                      "\u2212$150",
                      "\u2212$850",
                      "+$150"
                    ],
                    "answer": 1,
                    "explain": "At $74, the $67 call is worth $7.00 ($700) and the $67 put expires at $0. Because Maria paid $850 up front, a $7 stock rally still leaves her down \u2212$150 ($700 minus $850 is \u2212$150)."
                  },
                  {
                    "q": "Why does buying a straddle on Rocket Robotics ($182) the afternoon before earnings often lose money even when the stock jumps $8 the next morning?",
                    "choices": [
                      "Exchanges freeze option trading on earnings day",
                      "The expected move was already priced into the expensive upfront fee, and once the news is out the remaining time value collapses",
                      "Straddles only make money when a stock stays completely flat",
                      "The call and put always cancel each other out at the deadline"
                    ],
                    "answer": 1,
                    "explain": "Before a known news event, option sellers charge a huge upfront fee to cover the expected jump. Unless the real move beats that dollar forecast, the collapsing time value leaves the buyer with a loss."
                  },
                  {
                    "q": "Compared to buying a $67 straddle on Burgess Restaurant Group ($67), buying a $64/$70 strangle in the same expiration has:",
                    "choices": [
                      "A lower upfront dollar cost and wider breakeven prices",
                      "A higher upfront dollar cost and narrower breakeven prices",
                      "The exact same dollar cost and a different expiration date",
                      "Unlimited worst-case dollar losses"
                    ],
                    "answer": 0,
                    "explain": "Picking a call above today's price and a put below today's price cuts your upfront fee (and max loss) in dollars, but the stock must travel further before either option pays off."
                  }
                ]
              },
              {
                "id": "c-calendar-spreads",
                "title": "Calendar Spreads: Selling Fast Time While Owning Slow Time",
                "objective": "Pair a short near-deadline option with a long far-deadline option at the same strike price, see how they profit from different decay speeds, and spot the two ways a calendar spread loses.",
                "body": "You have leased a summer cabin for $1,500 and sublet one busy holiday week for $800 to cut your cost. Selling a near-deadline option and buying a far-deadline option at the same strike is a **calendar spread**, like trading the $42 call on Lumend Brands ($42). Maria sells the 30-day $42 call for $150 and buys the 60-day $42 call for $230, capping her upfront cost at $80. The cabin analogy stops there: a cabin never moves, while a big stock swing shrinks the gap between your two options.\n\nWhy does Maria pair a 30-day call she sold with a 60-day call she bought? Right at the $42 stock price, a 30-day call loses about $5 a day in time value, while a 60-day call loses $2.50. If Lumend sits at $42 on day 30, the short call expires at $0 while her far call is worth $150, netting a $70 profit. In plain words: a calendar spread collects fast-melting time on the near option while holding slow-melting time on the far option.\n\nWhat happens if Lumend rockets from $42 to $55, or drops to $30, before day 30? At $55, both $42 calls trade almost like stock, their time-value gap shrinks toward $0, and Maria loses most of her $80 fee. At $30, both $42 calls sit far above the stock price and fall toward $0 together. A calendar spread's payoff looks like a tent centered on the strike\u2014it wins in calm weeks and loses on big moves.\n\nCalendar spreads also carry a risk that single-deadline vertical spreads never face. Because the two calls expire in different months, their swing forecasts across the calendar\u2014called the **term structure**\u2014can move separately. Surprise news inside the next 20 days can pump the 30-day call Maria sold from $150 to $240 while her 60-day call barely moves. In plain words: verticals trade direction, straddles trade movement size, and calendars trade a quiet month where near time melts faster.",
                "key_takeaways": [
                  "A calendar spread sells a near-deadline option and buys a far-deadline option at the same strike, profiting because near-term time value melts faster.",
                  "It makes the most money when the stock finishes right at the strike price at the near deadline; big moves up or down crush the time-value gap.",
                  "Because the two legs live in different months, a surprise news event inside the near deadline can inflate the short option faster than the long one.",
                  "Verticals trade direction, straddles trade movement size, and calendars trade time\u2014the three building blocks of every multi-leg strategy."
                ],
                "source": "OASI 5e ch. 9 (Calendar Spreads)",
                "sim": "strategy",
                "sim_task": "Open Strategy Lab, select LMND in Underlying (~$42), and choose Long Call in Preset strategy with a near Expiration. Note the Mid now price and \u0398 Theta in Position Greeks, then switch Expiration to the farthest date to see how the longer call costs more up front but loses fewer dollars per day.",
                "quiz": [
                  {
                    "q": "Maria opens a $42 call calendar spread on Lumend Brands ($42) by selling the 30-day $42 call and buying the 60-day $42 call. Where does she want Lumend's share price to sit when the 30-day deadline arrives?",
                    "choices": [
                      "Far above $42, such as $60",
                      "Far below $42, such as $25",
                      "Right at the $42 strike price",
                      "Anywhere\u2014calendar spreads make the same profit at every stock price"
                    ],
                    "answer": 2,
                    "explain": "At $42, the 30-day call Maria sold expires at $0 while the 60-day call she owns keeps the most time value possible. Big moves either way flatten that gap."
                  },
                  {
                    "q": "What extra risk does a calendar spread carry that a single-expiration vertical spread avoids?",
                    "choices": [
                      "The 100-share contract multiplier changing mid-month",
                      "Near-deadline and far-deadline expected swings shifting independently when news lands inside the near window",
                      "Time decay stopping on Wednesdays",
                      "Trading fees being ten times higher"
                    ],
                    "answer": 1,
                    "explain": "A vertical spread's two legs share the exact same deadline. A calendar spans two different deadlines, so surprise news in the next two weeks can pump up the near option you sold faster than the far option you own."
                  },
                  {
                    "q": "When Lumend Brands sits right at $42, why does the 30-day $42 call Maria sold lose more dollars per day than the 60-day $42 call she bought?",
                    "choices": [
                      "It does not\u2014every option loses the exact same dollar amount per day",
                      "Time decay right at the strike price speeds up as the deadline gets closer, so the 30-day option sits on the steeper part of the melt curve",
                      "Options you sell always decay faster than options you buy, even at the same deadline",
                      "The exchange lowers 30-day option prices by hand every Friday"
                    ],
                    "answer": 1,
                    "explain": "Time value melts along a curve that steepens in the final weeks. A 30-day option right at today's stock price sheds more dollars per day than a 60-day option at the same strike."
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
                "title": "Historical vs. Implied Volatility: Past Moves vs. Priced-In Swings",
                "objective": "Tell historical volatility apart from implied volatility, use the divide-by-16 rule to turn an annual IV percentage into a daily dollar move, and see what pushes IV up or down.",
                "body": "You have checked last winter's heating bills before reading the gas company's fixed-rate quote for next winter. Past stock movement is called **historical volatility**, while the future swing forecast baked into today's option prices is called **implied volatility** (IV), like 32% on Burgess ($67). A 32% annual IV means option prices expect Burgess to finish the year within \xB132% (about $21) roughly 68% of the time, or 2 in 3. The heating-bill analogy stops there: weather ignores utility quotes, while nervous put buyers push a stock's IV higher themselves.\n\nHow do you turn an annual number like 32% IV into a typical daily dollar move? Because a trading year has 252 days and the square root of 252 is about 16, you divide annual IV by 16. On PowerSun Energy ($95) at 32% IV, dividing 32% by 16 gives a 2% daily swing, or about $1.90 per share ($190 per contract). In plain words: divide annual IV by 16 to see the daily percentage swing baked into option prices right now.\n\nThree real-world forces push implied volatility away from a stock's recent past. First, big moves cluster together, so a $6 drop on PowerSun today makes traders price in wider swings tomorrow. Second, scheduled news like Rocket Robotics ($182) earnings pumps IV up beforehand and crushes it once the numbers come out. Third, raw demand moves IV even without news: when funds rush to buy $90 puts on PowerSun, their buying lifts IV.\n\nEvery option strategy you know quietly takes a side on whether that daily swing forecast is fair. When Sam buys a call, put, or straddle on Lumend ($42) for $200, he needs real swings to beat the IV forecast. When Maria sells a covered call on Burgess ($67) for $200, she collects that forecast and wins if the stock stays calmer. In plain words: historical volatility is what happened, implied volatility is the price tag inside options, and every trade compares the two.",
                "key_takeaways": [
                  "Historical volatility measures how much the stock actually moved in the past; implied volatility (IV) is the future swing forecast baked into today's option prices.",
                  "Divide annual IV by 16 (the square root of 252 trading days) to find the typical 1-day move options are pricing in: 32% IV \xF7 16 = 2% per day.",
                  "IV rises when recent daily moves widen, when scheduled news like earnings approaches, or when nervous buyers bid up put protection.",
                  "Option buyers need real daily moves to beat the IV forecast they paid for; option sellers collect that forecast and need the stock to stay calmer."
                ],
                "source": "OASI 5e volatility chapters (Part VI, The Basics of Volatility Trading); Volcube Trading Implied Volatility",
                "sim": "vol",
                "sim_task": "Open Volatility Lab and look at the Gamma scalping simulator card. Drag the IV you pay slider to 32% and the Realized vol slider to 18%, then click Run another path and Run 60 trials to see what happens when actual daily swings stay smaller than the IV forecast you paid for.",
                "quiz": [
                  {
                    "q": "Lumend Brands trades at $50 with an annual implied volatility (IV) of 32%. Using the divide-by-16 rule, roughly what typical 1-day dollar move are its options pricing in?",
                    "choices": [
                      "$0.50 per day",
                      "$1.00 per day",
                      "$2.00 per day",
                      "$3.20 per day"
                    ],
                    "answer": 1,
                    "explain": "Dividing 32% annual IV by 16 gives a 2% typical daily move. On a $50 stock, 2% is $1.00 per day ($50 \xD7 2% is $1.00)."
                  },
                  {
                    "q": "What is the difference between historical volatility and implied volatility (IV)?",
                    "choices": [
                      "Historical volatility applies to stocks and implied volatility applies only to bonds",
                      "Historical volatility measures past stock moves, while implied volatility is the future swing forecast baked into today's option prices",
                      "Implied volatility is always twice as high as historical volatility",
                      "They are two different names for the exact same number"
                    ],
                    "answer": 1,
                    "explain": "Historical volatility is calculated from past price changes. Implied volatility is solved from today's option quotes and shows how much future movement buyers and sellers are pricing in."
                  },
                  {
                    "q": "Rocket Robotics ($182) has a major court verdict scheduled for Friday afternoon. How will its front-week option IV typically behave this week versus Monday morning?",
                    "choices": [
                      "Stay completely flat before and after the verdict",
                      "Climb higher ahead of Friday's verdict, then drop sharply on Monday morning once the news is out",
                      "Drop to zero before the verdict, then double on Monday",
                      "IV ignores scheduled court verdicts and earnings dates"
                    ],
                    "answer": 1,
                    "explain": "Scheduled suspense drives option prices and IV up ahead of the news. Once the verdict lands on Friday, the uncertainty is gone and IV drops sharply."
                  }
                ]
              },
              {
                "id": "c-using-iv",
                "title": "Matching Your Strategy to Cheap or Expensive Volatility",
                "objective": "Compare a stock's current IV to its own 1-year history, match low-IV and high-IV environments to the right option strategies, and avoid the pre-earnings selling trap.",
                "body": "You know $5 is pricey for bread but cheap for coffee because you compare each item to its usual price. Traders check **IV rank**, which scores today's IV inside that stock's own 1-year range from 0% (cheapest day all year) to 100% (richest day). Lumend ($42) at 35% IV inside a 20%\u201340% range is expensive, while Rocket ($182) at 55% IV inside a 50%\u2013110% range is cheap. The grocery analogy stops there: expensive bread never warns of danger, while high IV often signals a real news jump.\n\nChecking where IV sits against a stock's own history makes choosing a strategy clearer. When Lumend's IV drops to 20%, a 60-day $40 put costs $140 instead of $280, putting protective puts and long calls on sale. When Burgess ($67) sits near the top of its IV range with no news due, a covered call pays Maria $260 instead of $150. In plain words: low IV puts option buying on sale, while high IV pays option sellers more cash when risk is capped.\n\nWatch out for the trap that hurts impatient option sellers. Before Rocket ($182) reports earnings, IV jumps to 95%, tempting Sam to sell options for the **volatility crush**\u2014when IV drops 30 points after news. IV sits at 95% because Rocket can gap $25 overnight ($2,500 per contract), wiping out the extra cash Sam collected. High IV before a scheduled announcement is a fair price for a jump, never free money.\n\nAlways check the IV environment when you grade your own past trades. A 30-day covered call on Burgess ($67) that paid Maria $200 in a 40%-IV month may pay only $95 at 18% IV. Her strategy did not break\u2014the market price of insurance simply cooled off. In plain words: compare every stock's IV to its own 1-year range, check for scheduled news, and match your strategy to the price.",
                "key_takeaways": [
                  "Always compare a stock's IV to its own 1-year range (IV rank)\u201435% IV can be expensive on a calm stock while 55% IV is cheap on a jumpy one.",
                  "Low IV relative to history makes buying calls, protective puts, and straddles cheaper; high IV pays more upfront cash on covered calls and vertical spreads.",
                  "High IV right before earnings or a major ruling prices in a real jump\u2014selling uncovered options into scheduled news risks a huge overnight loss.",
                  "The same covered call or spread pays more cash in high-IV months and less in quiet months; track the IV level alongside your results."
                ],
                "source": "OASI 5e volatility chapters; Volcube Trading Implied Volatility",
                "sim": "market",
                "sim_task": "Open Practice (Live Market), click LMND in the Watchlist (~$42), and check the IV column in the Option chain. Then click RCKT (~$182) to compare its higher IV numbers, and open Strategy Lab to see how each stock's IV widens its \xB11\u03C3 / \xB12\u03C3 model cone.",
                "quiz": [
                  {
                    "q": "Lumend Brands ($42) has an IV of 35% (1-year range: 20% to 40%). Rocket Robotics ($182) has an IV of 55% (1-year range: 50% to 110%). Whose options are cheap relative to their own normal behavior?",
                    "choices": [
                      "Lumend's options",
                      "Rocket's options",
                      "Both are equally expensive",
                      "Neither\u2014a higher IV percentage always means options are overpriced"
                    ],
                    "answer": 1,
                    "explain": "Lumend's 35% IV sits near the top of its 20%\u201340% range, while Rocket's 55% IV sits near the bottom of its 50%\u2013110% range. Always judge IV against the same stock's own history."
                  },
                  {
                    "q": "Option IV on PowerSun Energy ($95) doubles the day before a major federal pipeline ruling. What is the most honest way to read that jump in IV?",
                    "choices": [
                      "Easy, risk-free cash for anyone who sells options today",
                      "A fair upfront price for a real, scheduled jump in the stock price",
                      "A broken quote feed at the exchange",
                      "A guarantee that buying a straddle will make money tomorrow"
                    ],
                    "answer": 1,
                    "explain": "Option sellers raise their fees ahead of a major ruling because a big overnight gap is genuinely possible. Neither buyers nor sellers get an automatic free lunch when an event is fairly priced."
                  },
                  {
                    "q": "When a stock's IV drops to the very bottom of its 1-year range during a quiet month, which shift makes the most sense?",
                    "choices": [
                      "Sell uncovered options to collect tiny upfront fees",
                      "Favor option-buying setups like protective puts, long calls, or call spreads while time value is on sale",
                      "Stop checking breakeven prices",
                      "Trade 10 times as many contracts to make up for the lower prices"
                    ],
                    "answer": 1,
                    "explain": "When IV sits near its 1-year lows, time value is cheap: protective puts cost less to insure your shares, and long calls or spreads need smaller moves to break even."
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
                "title": "Delta: How Much Your Option Moves When the Stock Moves $1",
                "objective": "Use delta four ways\u2014as a $1 price slope, a rough finish-in-the-money estimate, a share equivalent, and a hedge ratio\u2014without tripping over put signs.",
                "body": "You have ridden a geared bicycle where every 10 inches your feet push moves the bike 5 inches. How much an option's price changes when the stock moves $1 is called **delta**, like a 0.50-delta call on Lumend ($42) gaining $50 on a $1 rise. Calls have positive deltas from 0 to +1.00 (0 to +100 shares per contract), while puts run from \u22121.00 to 0. The bicycle analogy stops there: metal gears stay fixed, while an option's delta shifts as price, time, and IV move.\n\nWatch out for the double-negative trap when selling puts. If Sam sells one \u22120.30 delta put on Burgess ($67) for $150, selling flips the minus sign to +30 deltas, so Sam wants Burgess to rise. Maria reads a 0.25 call delta four ways: a $25 gain per $1 rally, rough 25% (1 in 4) finish odds, 25 shares, and a **hedge ratio**. In plain words: multiply contracts by 100 and by delta to see how many shares your options act like today.\n\nWhat pushes delta toward 0 or 100 before the deadline arrives? Deep in-the-money options act like 100 shares, options right at the stock price sit near a 50-delta coin flip, and far out-of-the-money options sit near 0. Less time left and lower implied volatility both push deltas toward 0 or 100 because a comeback gets less likely. More days left or higher implied volatility pulls deltas back toward 50 because big swings remain possible.\n\nKeep two safety warnings in mind before relying on delta. First, reading a 0.25 delta as a 25% chance, or 1 in 4, is only a rough model snapshot\u2014not a fixed promise. Second, delta only measures a small $1 step: if Lumend jumps $8 to $50, a 50-delta call gains much more than $400. In plain words: delta shows your share exposure for the next $1 move, and selling a put always adds bullish delta.",
                "key_takeaways": [
                  "Delta measures how much an option's price changes for a $1 stock move; calls run 0 to +1.00, puts run \u22121.00 to 0, and selling flips the sign.",
                  "Four readings of one number: price change per $1 move, rough model odds of finishing in the money, share equivalent (contracts \xD7 100 \xD7 delta), and share hedge ratio.",
                  "Less time left or lower IV pushes deltas toward 0 and 100; more time or higher IV pulls deltas toward 50.",
                  "Delta is a local snapshot\u2014never treat it as a fixed probability, and remember that big stock moves change delta itself."
                ],
                "source": "Volcube Option Greeks for Traders Part I (Delta)",
                "sim": "greeks",
                "sim_task": "Open Greeks Lab and click the \u0394 Delta tab. Drag Implied vol from 40% down to 10% and Days to expiry from 60 down to 2 to watch the Call delta and Put delta curves sharpen into a cliff near the $100 strike.",
                "quiz": [
                  {
                    "q": "Maria owns 10 calls on Lumend Brands ($42) at +0.40 delta and has sold 20 puts at \u22120.25 delta (100 shares per contract). What is her combined share-equivalent position?",
                    "choices": [
                      "Long 900 shares",
                      "Short 100 shares",
                      "Long 400 shares",
                      "Long 100 shares"
                    ],
                    "answer": 0,
                    "explain": "The 10 long calls equal +400 shares (10 \xD7 0.40 \xD7 100). Selling 20 puts flips their \u22120.25 sign to positive: \u221220 \xD7 (\u22120.25) \xD7 100 = +500 shares, for +900 shares total."
                  },
                  {
                    "q": "Sam owns long calls on Burgess Restaurant Group ($67) and buys shares of Burgess thinking it hedges his risk\u2014a mistake traders call a 'Texas hedge.' What did Sam actually do?",
                    "choices": [
                      "Hedged his position using energy stocks",
                      "Traded the stock in the exact same bullish direction as his calls, piling MORE downside risk on top instead of cutting it",
                      "Placed a hedge order after the market closed",
                      "Offset half of his time decay"
                    ],
                    "answer": 1,
                    "explain": "Long calls already have positive delta. Buying stock adds even more positive delta\u2014usually because a trader mixed up the plus and minus signs on their options."
                  },
                  {
                    "q": "Implied volatility drops sharply on Lumend Brands ($42) while the stock price stays at $42. What happens to the delta of a $50 call sitting far above today's price?",
                    "choices": [
                      "It rises toward 0.50",
                      "It falls toward 0",
                      "It stays unchanged because volatility never affects delta",
                      "It turns negative"
                    ],
                    "answer": 1,
                    "explain": "Lower implied volatility means a big rally past $50 is less likely before the deadline, so the far-above call's delta drops toward 0."
                  },
                  {
                    "q": "Why is it risky for Sam to treat a 0.25-delta call as a guaranteed 25% chance, or 1 in 4, of making money?",
                    "choices": [
                      "Delta is always off by a factor of two",
                      "Delta is only a rough, right-now model estimate for finishing in the money, and it shifts as the stock price, time, and IV change",
                      "Probabilities never apply to option chains",
                      "The probability reading only works on put options"
                    ],
                    "answer": 1,
                    "explain": "Delta is a model snapshot at this exact second, not a fixed forecast. Even a 0.90-delta call can finish at $0 if the stock reverses before the deadline."
                  }
                ]
              },
              {
                "id": "g-theta",
                "title": "Theta: What Each Passing Day Costs or Pays You",
                "objective": "Measure daily time decay in dollars with theta, see why traders say 'paying' or 'collecting' theta, and trace how decay speeds up near expiration.",
                "body": "You have bought a $20 bag of ice for a cookout where water drips out every hour in the sun. The dollar value an option loses per trading day when the stock sits still is called **theta**, like a $350 Burgess ($67) call losing $5 a day. Only the extra time price\u2014called **extrinsic value**\u2014melts away, while real in-the-money value never decays. The ice-bag analogy stops there: ice melts at one steady speed, while an at-the-money option melts much faster in its final week.\n\nTo avoid sign confusion, traders say Maria is 'paying theta' on long options and Sam is 'collecting theta' on shorts. Remember the risk in the same breath: Sam may collect $8 a day on a short $67 put, yet lose $700 on one $9 drop. Because every option loses one calendar day at the same speed, Maria can add her daily theta dollars across all stocks and months. In plain words: option buyers pay a daily time bill for capped-risk upside, and option sellers collect it for bearing jump risk.\n\nWhere on the option chain does theta bite the hardest? Theta peaks right at today's stock price\u2014where extrinsic value is largest\u2014and grows when higher IV packs more time value onto the clock. Even more important, at-the-money decay speeds up near the end: a 60-day $42 call on Lumend ($42) loses $2 a day, while a 3-day call loses $15. Waiting until the final week to sell a flat long option is expensive.\n\nOptions sitting far away from today's stock price follow a different path. A far out-of-the-money $50 call on Lumend ($42) has almost nothing left in the final week, so its daily theta shrinks toward $0. A deep in-the-money option with $0 of extrinsic value also has $0 of theta unless a move back toward the strike revives it. In plain words: time decay accelerates in the final weeks near the strike price, so close flat long options early.",
                "key_takeaways": [
                  "Theta is the dollar value an option loses per trading day when the stock sits still; only extrinsic (time) value decays.",
                  "Option buyers pay theta every quiet day for capped-risk upside; option sellers collect theta in exchange for bearing move risk.",
                  "Theta adds cleanly across every strike, expiration month, and stock because the calendar ticks at the same speed for all of them.",
                  "Near Today's stock price, daily theta speeds up sharply in the final two weeks; far out-of-the-money theta fades once little value remains."
                ],
                "source": "Volcube Option Greeks for Traders Part I (Theta)",
                "sim": "greeks",
                "sim_task": "Open Greeks Lab and click the \u0398 Theta tab. Compare the At-the-money ($100 strike) curve against the Out-of-the-money ($110 strike) curve as days count down from 60d to 1d, and read the Theta tile below.",
                "quiz": [
                  {
                    "q": "All else equal, which call option on Burgess Restaurant Group ($67) loses the MOST dollars per day to theta?",
                    "choices": [
                      "A $50 call deep in the money with 60 days left",
                      "A $67 call right at today's stock price with 10 days left",
                      "An $85 call far above today's price with 3 days left",
                      "A $67 call right at today's price with 1 year left"
                    ],
                    "answer": 1,
                    "explain": "Theta is largest where extrinsic time value is big and the deadline is close: right at the $67 stock price with 10 days left."
                  },
                  {
                    "q": "Why can Maria add her daily theta dollars across 30-day and 90-day options directly, when she cannot do the same thing with raw vega?",
                    "choices": [
                      "Theta is always a smaller number than vega",
                      "Every option loses exactly one trading day at the same speed, whereas implied volatility in near and far months moves by different amounts",
                      "Vega is always a negative number",
                      "Exchange rules require summing theta"
                    ],
                    "answer": 1,
                    "explain": "There is only one calendar clock, so every contract ages by one day together. Implied volatility, by contrast, swings much harder in near-term options than in far-term options."
                  },
                  {
                    "q": "Sam holds a $42 call on Lumend Brands ($42) worth $1.50 ($150) with 10 trading days left, and its theta today is $0.05 ($5 per day). If Lumend sits at $42 for all 10 days, will the call still be worth $1.00 ($100) at expiration?",
                    "choices": [
                      "Yes\u201410 days times $5 per day equals $50 of decay, leaving $100",
                      "No\u2014at-the-money theta speeds up each day as expiration nears, so all $150 of extrinsic value melts to $0 by the deadline",
                      "No\u2014theta slows down in the final week, leaving $125",
                      "Options right at the strike price never expire at $0"
                    ],
                    "answer": 1,
                    "explain": "If Lumend stays at $42, all $150 of time value must melt to $0 by expiration. Today's $5 theta is the gentlest daily bite of the final 10 days\u2014each remaining day takes a bigger slice."
                  }
                ]
              },
              {
                "id": "g-vega",
                "title": "Vega: How Implied Volatility Swings Change Your Option Price",
                "objective": "Use vega to turn a 1-point IV change into dollars, compare option price changes in vol points instead of cents, and see why raw vega cannot be added across months.",
                "body": "You have seen a beach hotel raise room rates by $15 for every 1-point jump in travel demand. The dollar change in an option's price when implied volatility moves 1 point (say 25% to 26%) is called **vega**, like $12 on a Burgess ($67) call. Every plain option you buy has positive vega because wider swings help it, while every option you sell has negative vega. The hotel analogy stops there: room rates only hit new guests, while an IV jump reprices every open option immediately.\n\nVega lets Maria compare any two options cleanly by dividing each price change by vega into **vol points**. Suppose Option A drops $10 with $5 of vega, while Option B drops $7.50 with $3 of vega while Lumend ($42) sits still. Option A fell more in dollars, but dividing price change by vega shows Option A fell 2.0 vol points while Option B fell 2.5 vol points. In plain words: divide an option's dollar change or bid-ask spread by its vega to see the real volatility move.\n\nWhere is vega largest, and what trap awaits across different expiration months? Vega peaks right at today's stock price and grows with time: a 6-month PowerSun ($95) call carries far more vega than a 5-day call. However, you must never add raw vega across months, because a sudden scare can lift 30-day IV by 9 points and 6-month IV by 3. If Sam is long $100 of raw vega in June and short $100 in March, a front-month shock hits his March short three times harder.\n\nTo compare vega across months honestly, traders weight each month by the square root of time. Remember too that stock shares have zero vega\u2014only other options can hedge vega. Even if Maria balances her vega today on Lumend ($42), a $6 stock move will shift both options and unbalance her vega tomorrow. In plain words: long options gain when IV rises, short options lose, and you never sum raw vega across different expirations.",
                "key_takeaways": [
                  "Vega is the dollar change in an option's price for a 1-point move in implied volatility (such as 25% to 26%); long options are positive vega, short options are negative vega.",
                  "Divide any price change (or bid-ask spread) by vega to read it in vol points\u2014the only unit that compares cleanly across different strikes.",
                  "Vega peaks right at today's stock price and grows with more days to expiration.",
                  "Never add raw vega across different expiration months: near-term IV jumps much harder in a shock, and shares of stock have zero vega."
                ],
                "source": "Volcube Option Greeks for Traders Part I (Vega)",
                "sim": "vol",
                "sim_task": "Open Greeks Lab and click the \u03BD Vega tab to compare the 60-day, 20-day, and 5-day vega curves across strikes. Drag Implied vol from 25% to 30% and check how much the Call price tile rises relative to the Vega tile.",
                "quiz": [
                  {
                    "q": "Sam holds an option portfolio with \u2212$800 of vega per 1-point move in IV. If implied volatility drops by 0.5 percentage points (say from 28.0% to 27.5%) with the stock price flat, what is his approximate P&L?",
                    "choices": [
                      "\u2212$400",
                      "+$400",
                      "+$800",
                      "\u2212$800"
                    ],
                    "answer": 1,
                    "explain": "A negative-vega (short option) book makes money when implied volatility falls: \u2212$800 per point \xD7 (\u22120.5 points) = +$400."
                  },
                  {
                    "q": "With the stock price unchanged, Option A drops $0.10 ($10) and has $0.05 ($5) of vega; Option B drops $0.075 ($7.50) and has $0.03 ($3) of vega. Which option got cheaper by more implied-volatility points?",
                    "choices": [
                      "Option A, because 10 cents is bigger than 7.5 cents",
                      "Option B, which fell 2.5 vol points versus Option A's 2.0 vol points",
                      "Both cheapened by the exact same amount",
                      "Impossible to tell without the strike prices"
                    ],
                    "answer": 1,
                    "explain": "Dividing price change by vega turns dollars into vol points: Option A dropped $10 \xF7 $5 = 2.0 vol points, while Option B dropped $7.50 \xF7 $3 = 2.5 vol points."
                  },
                  {
                    "q": "Why is being 'long $100 of raw vega in March and short $100 of raw vega in June' on Lumend Brands ($42) NOT a flat volatility position?",
                    "choices": [
                      "You are not allowed to sell vega in June",
                      "March and June implied volatilities move at different speeds\u2014near-term March IV swings much harder in a shock",
                      "June options always have zero vega",
                      "It actually is completely flat in every market"
                    ],
                    "answer": 1,
                    "explain": "Each expiration month has its own implied volatility, and front-month IV jumps two or three times as much as back-month IV during a scare."
                  },
                  {
                    "q": "If Maria wants to hedge the vega risk of an option position on PowerSun Energy ($95), what must she trade?",
                    "choices": [
                      "Shares of PowerSun Energy stock",
                      "Futures on the stock index",
                      "Other options (or volatility contracts) whose prices respond to implied volatility",
                      "Short-term government bills"
                    ],
                    "answer": 2,
                    "explain": "Shares of stock and futures have zero vega\u2014they only hedge delta. Only another option (or volatility contract) changes in value when implied volatility moves."
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
                "title": "Gamma: How Fast Your Delta Changes When the Stock Moves",
                "objective": "Measure how much delta changes per $1 stock move with gamma, remember why every option you buy has positive gamma, and use the average-delta rule for bigger moves.",
                "body": "You have pressed a car's gas pedal where the speedometer shows your speed right now, and acceleration shows how fast that speed climbs. In options, how much a contract's delta changes when the stock moves $1 is called **gamma**, like a 50-delta call on Burgess ($67) with 10 gamma climbing to 60 delta at $68. Every option you buy\u2014call or put\u2014has positive gamma, and every option you sell has negative gamma. The car analogy stops there: a driver controls the pedal directly, while an option's gamma changes automatically as the stock price and clock move.\n\nWhy does buying a put also give Maria positive gamma? If Maria owns a \u221230 delta put on Lumend ($42) with 5 gamma and Lumend rises $1 to $43, adding +5 gamma moves her put delta from \u221230 up to \u221225, so she loses fewer dollars on the next $1 rise. If Lumend drops $1 to $41 instead, her put delta moves to \u221235, so she gains more dollars as the fall continues. In plain words: owning any option gives you positive gamma, which makes your delta grow when the stock moves your way and shrink when it moves against you.\n\nThree forces control how much gamma an option carries. First, gamma peaks right at today's stock price, where a $1 move can flip an option between winning and losing, and sits near 0 far away from the strike. Second, fewer days on the clock pack much more gamma into the strike: a 2-day option reacts far more violently to a $1 move than a 90-day option. Third, lower implied volatility increases at-the-money gamma because a $1 move is a big surprise in a quiet market.\n\nGamma also fixes the mistake of using a single starting delta to estimate a bigger stock move. If Sam owns a 50-delta call with 10 gamma on Burgess ($67) and the stock jumps $4 to $71, he uses the **average-delta rule**: the delta starts at 50, ends near 90 (50 plus 4 \xD7 10), and averages 70. Multiplying that 70 average delta by the $4 rally gives a $280 gain per contract instead of the $200 estimate from the starting 50 delta alone. In plain words: average your starting and ending deltas to estimate big moves, and remember that short-dated options near the strike have the sharpest gamma swings.",
                "key_takeaways": [
                  "Gamma measures how much an option's delta changes per $1 stock move; buying any option gives positive gamma, and selling any option gives negative gamma.",
                  "Gamma peaks right at today's stock price and grows sharper when fewer days remain or when implied volatility is low.",
                  "Use the average-delta rule for multi-dollar moves: average the starting delta and ending delta (start + gamma \xD7 move), then multiply by the dollar move.",
                  "Because every expiration on the same stock shares one stock price, you can add gamma across expirations on that stock."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "greeks",
                "sim_task": "Open Greeks Lab and click the \u0393 Gamma tab to compare the 30-day, 10-day, and 2-day gamma curves across strikes. Drag Implied vol from 40% down to 15% and watch the 2-day gamma spike sharpen right at the $100 strike.",
                "quiz": [
                  {
                    "q": "Maria owns a call on Rocket Robotics ($200) with 50 delta and 8 gamma. After the stock rallies $2 to $202, what is the call's new approximate delta?",
                    "choices": [
                      "50",
                      "58",
                      "66",
                      "42"
                    ],
                    "answer": 2,
                    "explain": "Delta increases by gamma times the dollar move: 8 \xD7 $2 = +16 delta, taking the call from 50 delta to roughly 66 delta."
                  },
                  {
                    "q": "Sam has sold both puts and calls on Burgess Restaurant Group ($67). Is his combined gamma positive or negative?",
                    "choices": [
                      "Positive\u2014the short puts and short calls cancel each other out",
                      "Negative\u2014selling any option, call or put, always adds negative gamma",
                      "Zero at every strike price",
                      "It depends on whether the stock rises or falls"
                    ],
                    "answer": 1,
                    "explain": "Every option you sell contributes negative gamma, whether it is a call or a put. Selling both sides doubles up on negative gamma."
                  },
                  {
                    "q": "All else equal, which option on Lumend Brands ($42) has the HIGHEST gamma?",
                    "choices": [
                      "A 1-year $42 option at 40% IV",
                      "A 1-week $42 option at 15% IV",
                      "A 1-week $60 option far above today's price at 15% IV",
                      "A 1-year $60 option far above today's price at 40% IV"
                    ],
                    "answer": 1,
                    "explain": "Gamma concentrates right at today's stock price ($42), with very little time left (1 week) and low implied volatility (15%)."
                  },
                  {
                    "q": "Maria owns a put on Burgess Restaurant Group ($67) with \u221230 delta and 5 gamma. If Burgess rallies $1 to $68, what is the put's new approximate delta?",
                    "choices": [
                      "\u221235",
                      "\u221225",
                      "+5",
                      "\u221230"
                    ],
                    "answer": 1,
                    "explain": "Positive gamma adds +5 to delta on a $1 rally: \u221230 + 5 = \u221225. Moving from \u221230 to \u221225 means Maria's put loses less money if the stock keeps rising."
                  }
                ]
              },
              {
                "id": "g-hedging-stale",
                "title": "Delta Hedging: Turning Stock Swings in Either Direction into Cash",
                "objective": "Build a delta-neutral position, see why gamma makes a share hedge go stale as soon as the stock moves, and lock in movement gains by re-hedging.",
                "body": "You have balanced on a park seesaw where the board stays level only until one person leans back an inch. Offsetting your option deltas with shares so small moves net to $0 is called being **delta-neutral**, like Maria owning +500 call deltas on Burgess ($67) and selling 500 shares. The moment Burgess moves $1, gamma changes her call delta and her 500-share hedge no longer matches. The seesaw analogy stops there: shifting your weight at the park pays nothing, while rebalancing a hedged long-option book locks in cash.\n\nWatch how Maria's hedged position makes money whether Burgess ($67) goes up or down. On a $2 rally to $69 with 100 gamma, her call delta climbs from +500 to +700, gaining $1,200 while her 500 short shares lose $1,000 (+$200 net). On a $2 drop to $65, her call delta shrinks to +300, losing $800 while her 500 short shares gain $1,000 (+$200 net again). In plain words: a delta-hedged long-option book profits from a move in either direction because delta grows when you win and shrinks when you lose.\n\nThere is one catch: if Burgess rallies to $69 and slides right back to $67 before Maria acts, that $200 paper profit vanishes. To lock in the $200, Maria places a **re-hedge** at $69 by selling 200 more shares to bring her net delta back to zero. After a $2 drop to $65, she re-hedges by buying back 200 shares at the lower $65 price. Each re-hedge banks roughly \xBD \xD7 gamma \xD7 (move)\xB2, so \xBD \xD7 100 \xD7 ($2)\xB2 equals $200.\n\nNow flip the seat around to see what happens when Sam sells those 10 calls and hedges with 500 shares. Because Sam has negative gamma, a $2 rally forces him to buy 200 shares higher at $69, and a $2 drop forces him to sell lower at $65. Sam accepts being forced to buy high and sell low only because every quiet day pays him Maria's daily theta bill. In plain words: re-hedging long gamma sells rallies and buys dips to bank cash, while short gamma pays on big swings to collect daily theta.",
                "key_takeaways": [
                  "A delta-neutral hedge is balanced only at the exact stock price where you set it; gamma makes it go stale as soon as the stock moves.",
                  "A delta-hedged long-gamma position makes money on moves in BOTH directions because option delta grows with your winners and shrinks on your losers.",
                  "Re-hedging locks in the gain by selling shares after a rally and buying shares after a dip; each hedged move banks roughly \xBD \xD7 gamma \xD7 (move)\xB2.",
                  "Short-gamma hedgers are forced to buy after rallies and sell after drops\u2014the price they pay for collecting daily theta."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "greeks",
                "sim_task": "Open Volatility Lab and look at the Gamma scalping simulator card. Set IV you pay to 25% and Realized vol to 35%, then drag Hedge every from 1 day to 5 days and click Run another path to see how re-hedging turns stock swings into Hedging P&L.",
                "quiz": [
                  {
                    "q": "Maria holds a delta-neutral option book with +50 combined gamma per $1 move. The stock jumps $2 and she re-hedges back to neutral. Roughly how much profit did she lock in from that move?",
                    "choices": [
                      "$50",
                      "$100",
                      "$200",
                      "$25"
                    ],
                    "answer": 1,
                    "explain": "Using \xBD \xD7 gamma \xD7 (move)\xB2 gives \xBD \xD7 50 \xD7 ($2)\xB2 = \xBD \xD7 50 \xD7 4 = $100. Because the move is squared, a $4 jump would pay $400."
                  },
                  {
                    "q": "Sam is delta-neutral with a SHORT-gamma book (he sold options). After the stock rallies sharply, what must Sam do to get back to delta-neutral?",
                    "choices": [
                      "Sell shares at the higher price, locking in a profit",
                      "Buy shares at the higher price, locking in a loss",
                      "Do nothing, because short gamma re-balances itself",
                      "Sell more puts"
                    ],
                    "answer": 1,
                    "explain": "Short gamma makes Sam's position shorter delta as the stock rises, forcing him to buy shares at the higher price to get flat\u2014the classic buy-high, sell-low cost of shorting options."
                  },
                  {
                    "q": "Maria's delta-hedged long-gamma book shows +$800 of paper profit after a morning rally on PowerSun Energy ($95), but she does not re-hedge and the stock drops right back to $95 by the close. What happens to that $800 gain?",
                    "choices": [
                      "She keeps all $800 automatically",
                      "It drops back near $0 (minus a day of theta), because unhedged gamma gains vanish when the stock round-trips",
                      "It doubles to $1,600 because the stock moved twice",
                      "It turns into vega profit"
                    ],
                    "answer": 1,
                    "explain": "You only bank gamma profits when you trade shares against the move \u2014 and what you bank is GROSS: the day's theta bill and trading costs still come out of it. If the stock returns to its starting price before you re-hedge, even the paper gain disappears."
                  },
                  {
                    "q": "Why does a delta-hedged long call position make money even when the stock FALLS $3?",
                    "choices": [
                      "The exchange automatically converts calls into puts during a drop",
                      "Positive gamma shrinks the call's delta on the way down, so the call loses less money than the short-stock hedge gains",
                      "It cannot\u2014long calls only make money when the stock rises",
                      "Trading fees are refunded on down days"
                    ],
                    "answer": 1,
                    "explain": "As the stock falls, the call's delta drops toward 0, slowing its losses, while the short-stock hedge keeps earning at the full starting share count."
                  }
                ]
              },
              {
                "id": "g-gamma-theta-tradeoff",
                "title": "Gamma vs. Theta: The Daily Move Needed to Pay Your Time Bill",
                "objective": "Calculate the daily breakeven stock move from your theta and gamma, compare it to the market's implied daily swing, and weigh long-gamma bleed against short-gamma shock risk.",
                "body": "You have paid $75 to rent a weekend market booth where you only profit on days when sales beat your $75 rent. Trading a delta-hedged long-option book against its daily time bill is called **gamma scalping**, and it works the same way. Maria earns \xBD \xD7 gamma \xD7 (move)\xB2 on swings and pays theta daily, so her daily **breakeven move** is \u221A(2 \xD7 daily theta \xF7 gamma). The booth analogy stops there: craft sales grow one item at a time, while gamma profits grow with the square of the move.\n\nWalk through Maria's numbers on PowerSun Energy ($100) when she pays $75 a day in theta and holds 50 gamma. Her daily breakeven move is the square root of (2 \xD7 $75 \xF7 50), which is \u221A3, or **$1.73**. At 25% implied volatility, the divide-by-16 rule prices in typical daily swings of $100 \xD7 25% \xF7 16, or about **$1.56** a day. In plain words: gamma trading pits realized volatility (actual swings that pay you gamma) against implied volatility (the daily theta bill you pay).\n\nBecause gamma profit grows with the square of the move, how often Maria re-hedges changes her payout. Waiting for a full $2.00 move on 50 gamma lets one re-hedge bank $100 (\xBD \xD7 50 \xD7 $4 is $100). Re-hedging at a $1.00 move\u2014half the distance\u2014banks only $25 (\xBD \xD7 50 \xD7 $1 is $25), or one-quarter as much. Tight hedging banks small crumbs often, while wider triggers wait for big moves that pay four times faster.\n\nCompare the worst-case risks of the two seats before you size a position \u2014 using the local approximation, which holds gamma and IV fixed and ignores fees. On that simplified math, when Maria is long gamma her worst quiet day costs about her $75 theta bill, while a $10 crash pays roughly $2,500. When Sam is short gamma, his best quiet day collects about $75, while that same $10 crash costs him roughly $2,500 \u2014 and in a real crash it is usually WORSE, because gamma itself grows and IV spikes against him on the way down. In plain words: long gamma bleeds slowly in calm weeks and wins big in storms, while short gamma collects small daily cash until a shock hits \u2014 and the shock math above is the friendly version.",
                "key_takeaways": [
                  "Your daily breakeven move is \u221A(2 \xD7 daily theta \xF7 gamma); compare it to the implied daily move (spot \xD7 IV \xF7 16) to judge the price tag.",
                  "Gamma trading is realized volatility versus implied volatility: theta is priced off the market's forecast, while re-hedging profits come from actual moves.",
                  "Because gamma P&L is squared, halving your hedge distance cuts each hedge's profit to one-quarter ($25 instead of $100).",
                  "Long gamma has a capped daily loss (theta) and open-ended storm gains; short gamma has a capped daily gain (theta) and sudden storm losses."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "vol",
                "sim_task": "Open Volatility Lab and look at the Gamma scalping simulator card. Drag IV you pay to 25% and Realized vol to 40%, check the Option P&L (mostly \u2212theta) and Hedging P&L (gamma scalps) tiles, and click Run 60 trials to see the average profit.",
                "quiz": [
                  {
                    "q": "Maria's delta-hedged option book on PowerSun Energy ($95) pays $100 per day in theta and holds 50 gamma. What single daily dollar move breaks even on her overnight theta bill?",
                    "choices": [
                      "$1.00",
                      "$2.00",
                      "$4.00",
                      "$1.41"
                    ],
                    "answer": 1,
                    "explain": "Using \u221A(2 \xD7 daily theta \xF7 gamma) gives \u221A(2 \xD7 $100 \xF7 50) = \u221A4 = $2.00. One re-hedge after a $2.00 move earns \xBD \xD7 50 \xD7 ($2)\xB2 = $100, matching the $100 theta bill."
                  },
                  {
                    "q": "On that same book (50 gamma), if Maria re-hedges after a $1.00 move instead of waiting for a $2.00 move, how much does that single $1.00 re-hedge earn?",
                    "choices": [
                      "$50\u2014half as much",
                      "$25\u2014one-quarter as much",
                      "$100\u2014the exact same amount",
                      "$12.50"
                    ],
                    "answer": 1,
                    "explain": "Because the move is squared in \xBD \xD7 50 \xD7 ($1)\xB2 = $25, hedging at half the distance earns one-quarter the profit\u2014Maria would need four $1 swings to match one $2 swing."
                  },
                  {
                    "q": "A stock trades at $100 with 25% annual implied volatility. Using the divide-by-16 rule (\u221A252 \u2248 15.8), roughly what typical 1-day move are options pricing in?",
                    "choices": [
                      "$2.50",
                      "$1.58",
                      "$0.63",
                      "$25.00"
                    ],
                    "answer": 1,
                    "explain": "Dividing $100 \xD7 25% ($25) by 15.8 gives about $1.58 per trading day\u2014the daily yardstick baked into the option's theta bill."
                  },
                  {
                    "q": "Ignoring changes in implied volatility, what is the MOST money a delta-hedged short-gamma trader can make in a single day?",
                    "choices": [
                      "Unlimited dollars if the market crashes",
                      "The daily theta collected overnight when the stock sits completely still",
                      "\xBD \xD7 gamma \xD7 (move)\xB2",
                      "Twice the daily theta"
                    ],
                    "answer": 1,
                    "explain": "A short-gamma trader's best possible day is a flat stock where no re-hedging is needed and they keep 100% of the daily theta collected."
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
                "title": "Implied vs. Realized Volatility: How Option Prices Become a Forecast",
                "objective": "See how option prices map one-to-one to implied volatility, separate order-flow bumps from real news, and understand why implied and realized volatility stay tethered.",
                "body": "You have figured out a driver's 60-mile-per-hour speed by seeing they covered 180 miles in 3 hours. Pricing models work in reverse: plug in stock price, strike, days left, and option price to solve for one implied volatility (IV). Because wider swings always add value, a $2.40 call on Lumend ($42) maps to one exact IV, such as 28%. The highway analogy stops there: road trips measure past miles, while IV measures the future swings traders are paying for.\n\nWhy is a 10-day option's IV quoted as an annual percentage like 60%? Quoting every option on the same 252-day scale lets Maria compare a 10-day Rocket ($182) option against a 90-day Burgess ($67) option. Dividing 60% by 16 says traders expect 3.75% daily swings (about $6.80 a day on Rocket) over the next 10 days. In plain words: every option price corresponds to one implied volatility, quoted on an annual scale so any two contracts compare cleanly.\n\nWhen Maria sees PowerSun ($95) jump from 24% IV to 31% IV on Tuesday, she asks what pushed it. Recent actual movement\u2014called **realized volatility**\u2014anchors IV because wild days tend to cluster together. Scheduled news lifts IV in the specific week holding the event, while heavy **order flow** lifts IV even without news. If a fund buys 5,000 PowerSun puts, that buying creates a temporary IV bump that often fades once the order finishes.\n\nWhy can't implied volatility sit 15 points below realized volatility forever? If PowerSun moved $2.50 a day (42% realized vol) while options sat at 20% IV, Maria would buy straddles and gamma-scalp for steady profits. On broad indexes like the Academy 500 ($500), IV usually runs 2 to 4 points above realized volatility as an insurance cushion. In plain words: hedging profits keep implied volatility tethered to actual stock swings over time, while order-flow bumps create short-term trading setups.",
                "key_takeaways": [
                  "Every option price maps one-to-one to a single implied volatility (IV) solved backwards from the pricing model.",
                  "Annualizing IV is a comparison yardstick\u2014a 2-week option at 60% IV prices in 3.75% daily swings (60% \xF7 16) for those 2 weeks only.",
                  "IV moves on recent realized swings, scheduled news, and heavy insurance order flow; check whether a jump is news or flow before trading.",
                  "Gamma-scalping economics keep IV tethered to realized volatility, though index IV typically trades a few points higher as an insurance cushion."
                ],
                "source": "Volcube Trading Implied Volatility",
                "sim": "vol",
                "sim_task": "Open Volatility Lab and look at the Gamma scalping simulator card. Set IV you pay to 25% and Realized vol to 25%, click Run 60 trials to see the near-$0 average, then drag Realized vol down to 18% and click Run 60 trials again.",
                "quiz": [
                  {
                    "q": "Why does an option's market price on Lumend Brands ($42) correspond to one exact implied volatility number?",
                    "choices": [
                      "The exchange sets an official IV once every morning",
                      "Option value rises strictly as expected volatility rises, so each dollar price maps to one unique IV",
                      "Every trader agrees on the exact same future stock price",
                      "IV is always equal to 20% minus the option price"
                    ],
                    "answer": 1,
                    "explain": "More expected movement always adds value to both calls and puts, so running the pricing model backwards from any market price yields one exact IV."
                  },
                  {
                    "q": "A two-week option on Rocket Robotics ($182) shows 60% implied volatility. What does that 60% number mean?",
                    "choices": [
                      "The stock is guaranteed to move \xB160% over the next 12 months",
                      "Traders are pricing in annualized swings of 60% over the next two weeks\u2014about 3.75% per trading day",
                      "The option quote is broken",
                      "The stock moved 60% last year"
                    ],
                    "answer": 1,
                    "explain": "IV describes only the option's remaining two-week life, scaled to an annual percentage for easy comparison. Dividing 60% by 16 gives about 3.75% per day."
                  },
                  {
                    "q": "A pension fund buys protective puts on PowerSun Energy ($95) all week with no company news on the calendar, pushing IV up 5 points. How should Maria read that move?",
                    "choices": [
                      "Secret inside information\u2014never touch the stock",
                      "Order-flow pressure from heavy insurance buying that may settle back down once the fund finishes buying",
                      "Proof that past realized volatility already doubled",
                      "A display bug in the option chain"
                    ],
                    "answer": 1,
                    "explain": "Heavy one-way buying lifts option prices and IV even without news. Telling temporary order-flow bumps apart from scheduled news is a core volatility skill."
                  },
                  {
                    "q": "Why can't implied volatility sit far below a stock's actual realized volatility for months on end?",
                    "choices": [
                      "Exchange regulators reset IV every Friday",
                      "Traders would buy the cheap options, lock in profits by gamma-scalping the big daily moves, and their buying would push IV back up",
                      "Realized volatility always drops to match implied volatility overnight",
                      "It actually sits 20 points below realized volatility most of the time"
                    ],
                    "answer": 1,
                    "explain": "When options are priced far below actual daily stock swings, delta-hedged option buyers make steady money, and their demand bids option prices\u2014and IV\u2014higher."
                  }
                ]
              },
              {
                "id": "g-iv-as-price",
                "title": "Why Implied Volatility Is the True Price of Any Option",
                "objective": "Separate stock-driven delta moves from real changes in option expensiveness, use vega to convert dollar discounts into vol points, and see why a resting dollar bid is a floating vol quote.",
                "body": "You have judged whether a jeweler raised their crafting fee on a gold ring by subtracting raw gold's price from the tag. If Lumend ($42) rises $0.40 and a 50-delta call climbs $20 from $200 to $220, that entire $20 rise came from delta. The option's implied volatility did not budge, so to Maria its real price tag is unchanged. The ring analogy stops there: a ring's gold weight stays fixed, while an option's delta shifts as the stock moves.\n\nA rule called **put-call parity** says a call and a put at the same strike hold identical extrinsic time value once delta-hedged. Because the in-the-money side just bundles stock value, traders focus on out-of-the-money puts below the stock price and out-of-the-money calls above it. All trading disagreement lives in extrinsic time value, and implied volatility measures that time value cleanly across every strike. In plain words: dollar option prices mix stock movement with time value, while implied volatility strips out the stock move.\n\nVega lets Sam translate between dollars and vol points in two seconds. Suppose a Burgess ($67) call is worth $150 at 25% IV with $5 of vega per point, and Sam buys it for $135. Dividing his $15 discount by $5 vega means he bought at **22% IV**\u20143 vol points below the market. Works in reverse too: holding +$12 of vega on Lumend ($42) when IV rises 3 points earns +$36 per contract.\n\nThis mindset reveals a costly trap in resting dollar limit orders. Sam leaves a resting bid at $140 when fair value at 25% IV is $150, aiming to buy at 23% IV. If Burgess drops $0.40 or market IV slides to 22%, Sam's untouched $140 bid becomes a **floating vol quote** offering to overpay. In plain words: a resting dollar order silently changes its implied-volatility price whenever the stock or the market's IV moves.",
                "key_takeaways": [
                  "When an option's dollar price changes by (delta \xD7 stock move), its implied volatility\u2014and its true expensiveness\u2014has not changed at all.",
                  "Put-call parity means the call and put at the same strike share the same time value and IV; out-of-the-money options isolate that pure time value.",
                  "Convert dollars to vol points with vega: vol discount = dollar discount \xF7 vega ($15 \xF7 $5 = 3 vol points).",
                  "A resting dollar limit order is a floating vol quote whose real IV price changes whenever the stock price or market IV moves."
                ],
                "source": "Volcube Trading Implied Volatility; Option Market Making",
                "sim": "vol",
                "sim_task": "Open Greeks Lab and click the \u03BD Vega tab. At Strike K = $100 and Implied vol = 25%, read the Call price and Vega tiles, then drag Implied vol down to 22% to see how a 3-point IV drop changes the dollar price.",
                "quiz": [
                  {
                    "q": "Lumend Brands ($42) rallies $0.40, and a 50-delta call rises from $2.00 ($200) to $2.20 ($220). In implied-volatility terms, how did the option's price change?",
                    "choices": [
                      "It got 20 cents more expensive in volatility terms",
                      "It did not change at all\u2014the entire $0.20 ($20) rise is explained by its 0.50 delta across the $0.40 stock move",
                      "It got cheaper",
                      "Impossible to tell from those numbers"
                    ],
                    "answer": 1,
                    "explain": "A 50-delta call gains 0.50 \xD7 $0.40 = $0.20 from the stock move alone. Its extrinsic value and implied volatility stayed completely flat."
                  },
                  {
                    "q": "An option on Burgess Restaurant Group ($67) has a fair value of $1.50 ($150) at 25% IV and carries $0.05 ($5) of vega per vol point. If Maria buys it at $1.35 ($135), what implied volatility did she pay?",
                    "choices": [
                      "25% IV",
                      "22% IV",
                      "28% IV",
                      "23.5% IV"
                    ],
                    "answer": 1,
                    "explain": "Maria bought the option $0.15 ($15) below fair value. Dividing $15 by $5 of vega per point equals 3 vol points below 25%, or 22% IV."
                  },
                  {
                    "q": "Why do volatility traders focus on out-of-the-money puts below today's stock price and out-of-the-money calls above it?",
                    "choices": [
                      "Exchange rules ban trading in-the-money options",
                      "Once delta-hedged, the call and put at the same strike are equivalent, and the out-of-the-money contract is 100% pure extrinsic time value",
                      "Puts do not exist above today's stock price",
                      "Out-of-the-money contracts have zero trading fees"
                    ],
                    "answer": 1,
                    "explain": "Put-call parity makes a delta-hedged call and put at the same strike interchangeable, and the out-of-the-money option strips out mechanical intrinsic value."
                  }
                ]
              },
              {
                "id": "g-skew-smile",
                "title": "Why the Smile Exists: Put Skew and Curve Shape",
                "objective": "See why downside puts trade at higher IV than upside calls, separate a parallel level shift from a curve twist, and watch how a big stock move changes your exposure.",
                "body": "You have seen flood insurers charge $1,200 a year for a ground-floor apartment and $300 for a fourth-floor unit upstairs. On Burgess ($67), the $67 strike might trade at 25% IV while the $60 put trades at 31% and the $75 call trades at 23%. That slope from pricier downside puts to cheaper upside calls is called **skew**, and when both far wings lift it forms a smile. The apartment analogy stops there: building floors never move, while a $7 stock drop makes the $60 strike the new ground floor.\n\nThree real forces keep downside put IV higher than upside call IV on stocks and indexes. First, stockholders steadily buy downside puts for crash protection while selling upside covered calls, pushing put prices up. Second, market crashes happen faster and drop further than normal rallies, so sellers demand higher fees for downside risk. In plain words: downside puts cost more IV than upside calls because crash demand is heavy and fear spikes when stocks fall.\n\nMaria splits any move in the curve into a level shift (all strikes move 2 points together) and a shape twist (put skew steepens). A delta-hedged $67 straddle on Burgess ($67) sits in the middle and feels level shifts almost exclusively. A delta-hedged **risk reversal**\u2014selling the $62 put at 29% IV and buying the $72 call at 23% IV\u2014cancels center vega and trades the 6-point skew slope. Matching the structure to your view keeps level noise out of a shape trade.\n\nNever forget that a big stock move changes which part of the curve you are holding. Suppose Sam sells a wide $60/$75 strangle on Burgess ($67), and bad news knocks Burgess down from $67 to $60. His $60 short put now sits right at the $60 stock price with peak gamma and peak level vega at the worst moment. In plain words: straddles trade overall IV level, risk reversals trade skew shape, and a big stock move turns wing positions into center-strike risk.",
                "key_takeaways": [
                  "Each strike in the same expiration has its own IV; on stocks and indexes, downside puts usually trade at higher IV than upside calls (put skew).",
                  "Put skew exists because investors buy crash protection, market drops are sharper than rallies, and IV spikes when stocks fall.",
                  "Curve moves split into level shifts (all strikes rise or fall together, felt by straddles) and shape twists (put-vs-call slope changes, felt by risk reversals).",
                  "When the stock makes a big move toward a wing strike, a wing position turns into an at-the-money position with heavy gamma and level vega."
                ],
                "source": "Volcube Option Volatility Trading: Strategies and Risk",
                "sim": "vol",
                "sim_task": "Open Volatility Lab and scroll down to The volatility smile card. Drag ATM vol from 22% to 30% to watch the whole curve shift up, then drag Skew (fear) to 0.40 and Smile (tails) to 1.20 to watch the downside put wing steepen.",
                "quiz": [
                  {
                    "q": "In stock and index option markets, which strikes almost always trade at the highest implied volatility?",
                    "choices": [
                      "Strikes right at today's stock price",
                      "Downside put strikes below today's stock price",
                      "Upside call strikes far above today's stock price",
                      "Every strike trades at the exact same IV"
                    ],
                    "answer": 1,
                    "explain": "Downside put strikes carry the highest IV because of steady demand for crash insurance, sharper market drops, and the jump in IV during selloffs."
                  },
                  {
                    "q": "Maria builds a delta-hedged 25-delta risk reversal (buying the 25-delta call wing and selling the 25-delta put wing). What is her position mainly betting on?",
                    "choices": [
                      "A parallel shift in the overall level of implied volatility",
                      "A change in the SHAPE (skew slope) between the put wing and the call wing",
                      "Changes in overnight interest rates",
                      "Pure at-the-money time decay"
                    ],
                    "answer": 1,
                    "explain": "Buying one 25-delta wing and selling the other cancels out most overall vega, isolating the IV gap (skew) between puts and calls."
                  },
                  {
                    "q": "Every strike on Lumend Brands ($42) drops by 2 vol points while the slope between puts and calls stays the exact same. Which delta-hedged position feels this parallel drop the most?",
                    "choices": [
                      "An at-the-money $42 straddle",
                      "A vega-balanced 25-delta risk reversal",
                      "A flat cash account",
                      "100 shares of Lumend stock"
                    ],
                    "answer": 0,
                    "explain": "An at-the-money straddle holds concentrated positive vega right at the center strike, so a 2-point parallel drop hits both legs directly."
                  },
                  {
                    "q": "Sam sells a wide $60/$75 strangle on Burgess Restaurant Group ($67), and the stock crashes from $67 down to $60. What happened to his volatility exposure?",
                    "choices": [
                      "His volatility risk disappeared",
                      "His short $60 put is now right at the stock price, turning his wing trade into a high-gamma, high-vega center-strike risk",
                      "His skew risk stayed tiny and unchanged",
                      "The trade converted into an interest-rate hedge"
                    ],
                    "answer": 1,
                    "explain": "When the stock drops to $60, the $60 put is now at-the-money with maximum gamma and level vega\u2014re-read your risks after every big stock move."
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
                "objective": "Turn gamma-hedging mechanics into a calm daily routine using resting limit orders, partial hedges, and clean exits.",
                "body": "If you have ever set a home thermostat before going to sleep, you know automatic rules beat getting up at 3 a.m. to tweak the dial. In gamma scalping, a **resting limit order** is an order placed in the book ahead of time\u2014like offering to sell 30 shares of Lumend Brands (LMND) at $43.50. Because a long-gamma position always sells rallies and buys dips, Maria can place both orders over breakfast instead of chasing fast midday spikes. The thermostat analogy stops there: stock prices can blow right past your first target or reverse a penny short of your order.\n\nSuppose Maria owns an at-the-money $42 LMND straddle with +0.30 gamma and leaves a resting order to sell 30 shares at $43.00 and buy 30 shares at $41.00. At 11:14 a.m., LMND spikes to $43.05 for ninety seconds and drops back to $42.00. Maria's resting order sells 30 shares at $43.00 and buys them back at $42.00 for $30 of cash, while Sam, watching manually, misses the ninety-second spike completely. In plain words: pre-placed orders catch brief price spikes that human fingers miss.\n\nMaria does not have to flatten every single share of delta on the first move. A **partial hedge** trims only part of your accumulated delta\u2014say selling 15 shares of LMND when your straddle picks up +30 delta on a $1 rally. Selling 15 shares banks $15 if LMND falls back by $1, while keeping +15 delta working if the rally continues to $44. Splitting orders across several prices\u2014selling 10 shares at $42.75, 10 at $43.00, and 10 at $43.25\u2014also keeps an all-or-nothing order from missing by one cent.\n\nTwo bookkeeping mistakes ruin good scalping weeks. First, if Maria sells her LMND straddle after a volatility pop, she must close her leftover stock hedge at the same time. Without the straddle's gamma, 30 leftover short shares are just an unhedged bet against the stock. In plain words: when the option trade is over, close the stock hedge too so leftover shares never turn into an accidental bet.",
                "key_takeaways": [
                  "Set your hedging rules before the market opens; improvising in the middle of a fast move leads to late, emotional trades.",
                  "Place resting limit orders ahead of time at your target prices so brief spikes get captured automatically.",
                  "Partial hedging\u2014selling or buying back only half your accumulated delta\u2014banks some pullback profit while keeping some trend upside.",
                  "When you close your options, close the stock hedge too; leftover shares without gamma are an unhedged directional bet."
                ],
                "source": "Volcube Option Gamma Trading",
                "sim": "vol",
                "sim_task": "Open the Volatility Lab and find the Gamma scalping simulator card. Set IV you pay to 25% and Realized vol to 28%, then drag the Hedge every slider from 1 day to 5 days and click Run 60 trials at each setting to compare Hedging P&L (gamma scalps) and Total.",
                "quiz": [
                  {
                    "q": "Why do resting limit orders beat manual reactions when managing a long-gamma straddle?",
                    "choices": [
                      "Exchanges waive fees on resting orders",
                      "Quick spike-and-reverse moves only get captured if your order was already waiting at that price",
                      "Resting orders stop theta decay",
                      "Manual reactions are always faster than limit orders"
                    ],
                    "answer": 1,
                    "explain": "A long-gamma trader knows in advance where she wants to sell rallies and buy dips. Having the limit order already resting in the book catches brief spikes before they reverse."
                  },
                  {
                    "q": "After a profitable move, Sam sells his long LMND straddle at a high implied volatility but forgets to buy back his short 30 shares of LMND stock. His position is now:",
                    "choices": [
                      "Flat and risk-free",
                      "An unhedged short-stock bet with no option gamma to protect him if LMND rallies",
                      "Still long gamma from the shares",
                      "Protected by his earlier option profit"
                    ],
                    "answer": 1,
                    "explain": "Stock has zero gamma. Once the options are sold, any leftover hedge shares become a plain directional bet that loses dollar-for-dollar if LMND rallies."
                  },
                  {
                    "q": "LMND rallies $1 and Maria's straddle picks up +30 delta; she sells 15 shares instead of all 30. What is the main reason for this partial hedge?",
                    "choices": [
                      "It cuts her daily theta bill in half",
                      "It locks in some cash if LMND pulls back while keeping half the delta working if the rally keeps going",
                      "Brokers forbid hedging 100% of delta",
                      "It increases the straddle's vega"
                    ],
                    "answer": 1,
                    "explain": "Nobody knows whether a $1 move will reverse or turn into a $3 trend. Hedging half banks a partial scalp while keeping +15 delta on for a continuation."
                  },
                  {
                    "q": "Why does hedging a June-expiration option with a September futures contract add hidden risk to a book?",
                    "choices": [
                      "It doubles the position's gamma",
                      "June and September prices do not move identically, leaving a calendar spread that can lose money on its own",
                      "It eliminates interest-rate exposure",
                      "Different contract months always trade at the exact same price"
                    ],
                    "answer": 1,
                    "explain": "Hedging one expiration month with another quietly builds a spread between the two months that must eventually be closed."
                  }
                ]
              },
              {
                "id": "p-quadratic-frequency",
                "title": "Path Dependency: Same Vol, Different P&L",
                "objective": "See why gamma scalping P&L depends on the exact price path and hedging schedule\u2014and how buyer and seller can both win on the same stock.",
                "body": "Two weeks can both drop two inches of rain, yet a gentle five-day drizzle soaks a garden while a twenty-minute flash flood washes the soil away. In options, **path dependency** means two months with the exact same 24% realized volatility can produce opposite profits depending on how the daily moves arrive. A $42 LMND straddle with 0.30 gamma earns about $15 on a $1 move (0.5 \xD7 0.30 \xD7 1\xB2 \xD7 100), but $240 on a single $4 move. The rain analogy stops there: in options, your own hedging schedule decides whether you harvest the drizzle or the flood.\n\nWatch how both sides of the same trade can win in the same week. Sam sells the $42 LMND straddle at 25% IV and hedges once a day at the 4 p.m. close, while Maria buys it and hedges every $1.50 intraday swing. If LMND swings $2 up and down inside each day but closes near $42 every afternoon, Sam rarely trades and keeps his theta, while Maria scalps the intraday swings. In plain words: your hedging schedule chooses which swings you actually capture.\n\nYour **hedge spacing** is the move size or time gap that triggers a rebalance\u2014such as hedging every $1 move versus waiting for a $3 move. If Maria hedges tightly after every $1 move, she thrives in a choppy back-and-forth week. However, if LMND marches straight from $42 to $46 in four $1 steps, tight hedging sells shares too early and earns $60 instead of $240. Loose hedging starves during small chop, but captures the squared payoff when a big trend or gap finally hits.\n\nBecause of path dependency, saying 'implied volatility was 25% and realized was 22%, so sellers won' is only half a sentence. A seller who hedged every noisy intraday swing could still lose money in a 22% month. Match your trigger spacing to the kind of market you expect\u2014tight triggers for range-bound chop, wider triggers when waiting for a breakout. In plain words: you do not earn a single headline volatility number\u2014you earn the specific swings your hedge rule trades.",
                "key_takeaways": [
                  "Realized volatility has no single profit outcome until you specify how often and at what intervals you hedged.",
                  "An option buyer hedging intraday swings and an option seller hedging only at the daily close can both profit on the same stock path.",
                  "Because gamma P&L scales with the move squared, one $4 move pays sixteen times as much as one $1 move.",
                  "Use tighter hedge triggers when you expect back-and-forth chop, and wider triggers when you expect a multi-day trend or gap."
                ],
                "source": "Volcube Trading Implied Volatility; Option Gamma Trading",
                "sim": "vol",
                "sim_task": "Open the Volatility Lab and go to the Gamma scalping simulator card. Keep IV you pay at 25% and Realized vol at 25%, click Run another path several times while switching Hedge every between 1 day and 5 days, and watch how Total P&L flips from positive to negative across different paths.",
                "quiz": [
                  {
                    "q": "How can Maria (who bought the $42 LMND straddle) and Sam (who sold her that exact straddle) both finish the week with a profit?",
                    "choices": [
                      "One of them miscalculated their cash balance",
                      "Maria hedged large intraday swings while Sam hedged only at the flat 4 p.m. closes, so each sampled a different volatility from the same path",
                      "The broker paid both sides a bonus",
                      "Theta decay was positive for both traders"
                    ],
                    "answer": 1,
                    "explain": "Your hedging frequency chooses which price swings you trade. Wild midday reversals with flat 4 p.m. closes let the intraday scalper harvest movement while the close-to-close seller keeps his theta."
                  },
                  {
                    "q": "LMND stays completely flat for four days and then gaps up $4 on Friday. Which long-gamma trader captures the bigger payoff?",
                    "choices": [
                      "A trader who flattened delta on every tiny 25-cent wiggle all week",
                      "A trader with wider hedge triggers whose deltas were still untouched when the $4 jump arrived",
                      "Both make the exact same dollar profit",
                      "Neither trader profits from a $4 jump"
                    ],
                    "answer": 1,
                    "explain": "Because gamma profit grows with the square of the move, letting delta ride across a big jump earns far more than flattening after every small step."
                  },
                  {
                    "q": "Why is the statement 'implied volatility was 25% and close-to-close realized volatility was 22%, so option sellers won' incomplete?",
                    "choices": [
                      "A 3-point volatility difference is too small to measure",
                      "A seller's actual profit or loss depends on the price path and how she hedged\u2014violent intraday whipsaws can still hurt a seller even if 4 p.m. closes look quiet",
                      "Option sellers win in every market",
                      "Realized volatility cannot be calculated"
                    ],
                    "answer": 1,
                    "explain": "Close-to-close volatility ignores intraday whipsaws and specific hedge rules. Actual P&L always depends on the path and the hedging schedule."
                  }
                ]
              },
              {
                "id": "p-expiry-vega-shocks",
                "title": "The Edges of the Map: Expiration, Pin Risk, and Vega Shocks",
                "objective": "Spot the three places where textbook gamma scalping breaks down: expiration-week gamma explosions, strike pinning, and correlated vega shocks.",
                "body": "Steering a car at 25 miles per hour feels routine on dry pavement, but on black ice a tiny turn of the wheel spins the car across the road. In expiration week, an at-the-money option behaves like black ice because its delta must snap to either 0 or 1.00 before Friday's closing bell. With hours left on a $42 LMND call, a 25-cent wiggle from $41.90 to $42.15 can whip delta from +0.25 to +0.75, creating enormous gamma. The black-ice analogy stops there: in options, you can simply sell or roll the position on Monday of expiration week and skip the skid.\n\nWhen thousands of contracts sit open at the $42 strike on expiration Friday, **pin risk** appears\u2014the danger that the stock closes at $42.01 or $41.99 and leaves assignment uncertain. Traders who own the $42 strike all sell shares at $42.30 and buy shares at $41.70 to hedge their gamma, which pushes LMND right back toward $42.00. If Maria still owns the $42 straddle on Friday afternoon, that magnet traps LMND still while her steepest theta bill drains what is left of the premium. In plain words: heavy open interest can glue a stock to a strike on Friday, starving option buyers while leaving option sellers guessing about weekend shares.\n\nAway from expiration, the biggest surprise comes when stock prices and implied volatility move at the same time. Suppose Sam is short a $67 Burgess Restaurant Group (BRGR) straddle\u2014short gamma and short $12 of vega\u2014when bad news drops BRGR from $67 to $61. Sam loses twice at once: his short gamma forces him to sell shares low after the drop, and a 6-point IV spike adds another $72 of vega loss. The only time vega cushions a short-gamma loss is after a scheduled event like earnings, when the post-announcement IV crush can offset part of the price gap.\n\nTo keep your book healthy across strikes, check the **gamma-theta ratio**\u2014how much gamma you get for each dollar of daily theta rent, such as 0.10 gamma per $10 theta. Because out-of-the-money puts trade at high IV on the skew, buying overpriced wing puts while selling cheaper at-the-money options can leave you short gamma AND paying net theta. That combination loses if the stock sits still and loses if the stock jumps. In plain words: never build a multi-leg book that pays daily time rent while also losing on big price moves.",
                "key_takeaways": [
                  "At-the-money gamma explodes in expiration week as delta snaps between 0 and 1.00; many traders close or roll before the final week.",
                  "Heavy open interest at a strike can pin the stock near that price on Friday as long-gamma hedgers sell above and buy below.",
                  "Stock drops and IV spikes usually arrive together, hitting a short-gamma, short-vega book from both sides at once.",
                  "Check your gamma-per-theta-dollar across legs so you never end up simultaneously short gamma and paying daily net theta."
                ],
                "source": "Volcube Option Gamma Trading; Option Volatility Trading: Strategies and Risk",
                "sim": "vol",
                "sim_task": "Open the Volatility Lab and compare both cards: in Gamma scalping simulator, set IV you pay to 35% and Realized vol to 20% to see what happens when implied volatility is overpriced, then scroll to The volatility smile and raise Skew (fear) to see how downside wings become expensive relative to ATM vol.",
                "quiz": [
                  {
                    "q": "Why does an at-the-money option's gamma become huge in the final hours before Friday expiration?",
                    "choices": [
                      "Theta turns into gamma at 3 p.m.",
                      "With almost no time left, delta must snap to 0 or 1.00, so tiny stock moves cause huge delta swings",
                      "Brokers manually double the gamma",
                      "Implied volatility always drops to zero"
                    ],
                    "answer": 1,
                    "explain": "Just before the closing bell, a few cents across the strike separates an option that finishes worth 100 shares from one that finishes worthless, making delta flip rapidly."
                  },
                  {
                    "q": "Why does a strike with huge open interest often act like a magnet ('pinning' the stock) on expiration afternoon?",
                    "choices": [
                      "The exchange halts trading at that strike",
                      "Traders who are long that strike sell shares just above it and buy shares just below it to hedge, pushing the stock back toward the strike",
                      "Company insiders buy shares at the strike",
                      "Dividends are paid at the strike price"
                    ],
                    "answer": 1,
                    "explain": "Long-gamma holders mechanically sell rallies above the strike and buy dips below it. When open interest is huge, that hedging flow pulls the stock back toward the strike."
                  },
                  {
                    "q": "Sam is short a BRGR straddle (short gamma, short vega) when a surprise sell-off drops the stock and spikes implied volatility. What two losses hit him at once?",
                    "choices": [
                      "Dividend loss and interest-rate loss",
                      "Losing gamma re-hedges on the big price drop AND mark-to-market losses on his short vega as IV jumps",
                      "Positive theta and positive vega",
                      "Broker commissions only"
                    ],
                    "answer": 1,
                    "explain": "A sharp drop hurts short gamma through the price move itself while panic buying pushes implied volatility up against his short-vega position."
                  },
                  {
                    "q": "If a trader buys expensive high-IV wing options and finances them by selling cheaper at-the-money options, what dangerous book can result?",
                    "choices": [
                      "Long gamma while collecting positive theta",
                      "Short net gamma AND paying net daily theta\u2014losing both on big moves and on quiet days",
                      "A risk-free arbitrage",
                      "Pure stock ownership"
                    ],
                    "answer": 1,
                    "explain": "At-the-money options carry the most raw gamma, while high-IV wings carry expensive theta bills. Selling the center to buy pricey wings can leave you short gamma while still paying daily rent."
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
                "objective": "Structure trades around cheap or expensive implied volatility while defending against theta drag and vega slippage.",
                "body": "Buying bags of rock salt in October is smart when an icy winter is coming, unless storage fees eat your profit before the first January snowstorm arrives. In volatility trading, **theta drag** is that daily storage bill\u2014paying $7 a day in time decay while waiting for Lumend Brands (LMND) implied volatility to rise from 18% to 25%. If Maria buys a 30-day $42 LMND straddle for $310 and the volatility jump takes six weeks instead of two, daily decay can eat more than the IV bounce pays. The rock-salt analogy stops there: options also lose sensitivity to volatility if the stock price wanders away from your strike while you wait.\n\nThat second hazard is **vega slippage**\u2014losing your vega exposure because the stock drifted away from your strike before implied volatility finally jumped. Suppose Maria buys the $42 LMND straddle with $11 of vega per 1-point IV move, and LMND grinds quietly from $42 to $49 over three weeks. At $49, the $42 call is deep in the money and the $42 put is far out of the money, so the straddle's vega has shriveled from $11 to $3. In plain words: if the stock wanders far from your strike before volatility pops, your straddle is no longer in position to get paid.\n\nMaria has three practical ways to defend a long-volatility trade against those twin leaks. First, she can buy a 60-day or 90-day straddle instead of a 20-day straddle, which gives her more vega per dollar of daily theta rent. Second, she can gamma-scalp the daily stock swings so realized movement helps pay the theta bill while she waits. Third, she can buy a wider strangle\u2014such as the $39 put and $45 call\u2014or roll her straddle to the new stock price so her vega stays active.\n\nBefore buying 'cheap' implied volatility or selling 'rich' implied volatility, always check whether the market knows something you missed. Low IV in Galaxy Media (GLXY) at $23.50 might reflect a buyout agreement that locked the share price in place. High IV in Rocket Robotics (RCKT) at $182 might sit right ahead of a major clinical or product ruling. In plain words: pick an expiration long enough to survive the wait, keep your strikes near the stock, and check the news calendar first.",
                "key_takeaways": [
                  "Long-volatility trades fail from theta drag (waiting too long) and vega slippage (the stock drifting off your strike) as often as from wrong IV forecasts.",
                  "Strangles spread vega across a wider price range than a single-strike straddle, and rolling keeps an older straddle centered near the stock.",
                  "Longer-dated options give you more vega for each dollar of daily theta decay when you are unsure how soon IV will move.",
                  "Always check whether unusually low or high implied volatility is pricing a real news event or buyout before betting on mean reversion."
                ],
                "source": "Volcube Trading Implied Volatility",
                "sim": "greeks",
                "sim_task": "Open the Greeks Lab and select the \u03BD Vega tab. Set Strike K to 100 and Days to expiry to 45, note the Vega tile when spot S is $100 on the chart, then read the curve at $85 and $115 to see how vega slips away when the stock drifts off the strike.",
                "quiz": [
                  {
                    "q": "Maria bought a $42 LMND straddle for its vega, and LMND slowly drifted up to $49 over three weeks. When implied volatility finally jumps, why is her vega profit much smaller than she expected?",
                    "choices": [
                      "Straddles never benefit from rising implied volatility",
                      "Vega slippage\u2014as LMND drifted far above $42, the straddle moved away from the money and lost most of its vega",
                      "Theta decay turned positive at $49",
                      "The $42 call expired early"
                    ],
                    "answer": 1,
                    "explain": "Vega peaks when the strike is near the current stock price. Once LMND drifted to $49, the $42 straddle had far less vega left to catch the IV spike."
                  },
                  {
                    "q": "Why might a long-volatility trader choose an out-of-the-money strangle instead of an at-the-money straddle?",
                    "choices": [
                      "Strangles pay higher daily theta decay",
                      "Strangles spread vega across a wider range of stock prices, and wing vega grows as implied volatility rises",
                      "Strangles have zero gamma",
                      "Strangles never expire"
                    ],
                    "answer": 1,
                    "explain": "A strangle keeps active vega between its two strikes and gains extra vega when implied volatility climbs."
                  },
                  {
                    "q": "If spot volatility spikes today, why might a volatility-index futures contract move much less than the spot index?",
                    "choices": [
                      "Futures exchanges halt trading during volatility spikes",
                      "A futures contract prices where volatility is expected to be at its future expiration date, which may already have priced in higher volatility",
                      "Futures contracts have no relationship to volatility",
                      "Broker quotes freeze for 24 hours"
                    ],
                    "answer": 1,
                    "explain": "Volatility futures settle to future index levels on expiration day, not today's spot reading. If the market already expected elevated volatility, much of the move was already in the price."
                  },
                  {
                    "q": "Maria believes LMND implied volatility will rise from 18% to 24%, but she does not know whether it will take three weeks or ten weeks. Which option choice fits best?",
                    "choices": [
                      "A 7-day at-the-money straddle",
                      "Longer-dated options (such as 60 to 90 days)\u2014they offer more vega per dollar of daily theta rent while she waits",
                      "Selling uncovered calls",
                      "Deep in-the-money options with almost zero vega"
                    ],
                    "answer": 1,
                    "explain": "When timing is uncertain, longer-dated options charge gentler daily theta per dollar of vega so the position does not bleed out while waiting."
                  }
                ]
              },
              {
                "id": "p-term-structure",
                "title": "The Calendar Dimension: Term Structure and Time-Weighted Vega",
                "objective": "Read implied volatility across expirations, understand why front-month IV moves fastest, and size calendar trades with time-weighted vega.",
                "body": "Drop a rock into the shallow end of a pool and the water splashes high right where it hits, while the far end barely ripples. Options expirations line up in a **term structure**\u2014each month's implied volatility plotted by date, such as 30-day LMND options at 22% IV and 90-day options at 25% IV. When sudden news hits, 30-day implied volatility might jump 8 points to 30%, while 180-day implied volatility rises only 2 points because a short scare averages out over six months. The ripple analogy stops there: in options, a scheduled event like earnings can load a giant splash into one specific expiration week in advance.\n\nBecause near-term IV moves much faster than long-term IV, comparing raw vega across different months can fool you. Traders use **time-weighted vega**, scaling back-month vega by the square root of the time ratio\u2014for 30 days versus 90 days, multiply 90-day vega by 0.58. Here is the handy shortcut: because a longer option's raw vega is naturally larger by that same square-root factor, a 1-for-1 calendar spread is already roughly balanced. In plain words: near-month volatility jumps harder than back-month volatility, and a 1-to-1 calendar spread naturally accounts for most of that speed difference.\n\nScheduled events create sharp spikes in the term structure. Suppose PowerSun Energy (PWRS) at $95 reports earnings in two weeks, pushing 15-day IV to 45% while 45-day IV sits at 28%. That 45% front-month IV is not a pricing mistake; it packs a one-day earnings jump on top of normal daily movement. Before trading any gap between near-month and back-month IV, Maria always checks whether an earnings report or product ruling falls inside the front expiration.\n\nThe morning after PWRS reports earnings, front-month IV snaps back down toward 28%\u2014the classic post-earnings volatility crush. Selling that 45% front-month option only makes money if the actual stock jump is smaller than the one-day move already priced into that 45% IV. If PWRS gaps $10 on the announcement, the loss on the short front-month strike will overwhelm the volatility crush. In plain words: a steep drop-off from front-month IV to back-month IV usually prices a real news event, and you only win by beating the priced-in jump.",
                "key_takeaways": [
                  "Front-month implied volatility moves several times faster than back-month implied volatility during market shocks.",
                  "Time-weighted vega scales each month by the square root of time, which is why a 1-for-1 calendar spread is roughly balanced in volatility shocks.",
                  "Scheduled events like earnings inflate the expiration month that contains the announcement date.",
                  "Always check the company event calendar before assuming a high front-month IV is an error."
                ],
                "source": "Volcube Trading Implied Volatility; Option Greeks for Traders Part I",
                "sim": "strategy",
                "sim_task": "Open the Strategy Lab, select PWRS, and compare Expiration set to 14d versus 45d by adding a single ATM call in each and checking Position Greeks (live) to see how raw vega and daily theta change across the calendar.",
                "quiz": [
                  {
                    "q": "A sudden market shock pushes 30-day LMND implied volatility up by 8 points. How much would 180-day LMND implied volatility typically rise at the same time?",
                    "choices": [
                      "About 8 points\u2014all months move equally",
                      "Roughly 1 to 3 points\u2014a short-term scare gets diluted over a six-month window",
                      "16 points\u2014longer months move twice as fast",
                      "Zero points under all circumstances"
                    ],
                    "answer": 1,
                    "explain": "A one-week shock represents a large fraction of a 30-day option's life but a much smaller fraction of a 180-day option's life."
                  },
                  {
                    "q": "A 36-day front-month option has 12.6 vega and a 65-day back-month option has 17.0 vega. If you weight back-month vega by \u221A(36/65) \u2248 0.745, a 1-for-1 calendar spread is:",
                    "choices": [
                      "Heavily exposed to back-month vega",
                      "Roughly time-weighted-vega neutral, since 17.0 \xD7 0.745 \u2248 12.7 matches the front month's 12.6",
                      "Completely free of gamma",
                      "Guaranteed to make money"
                    ],
                    "answer": 1,
                    "explain": "Because raw vega grows roughly with the square root of time while IV responsiveness shrinks by that same factor, a 1-for-1 calendar spread comes out nearly balanced."
                  },
                  {
                    "q": "Maria notices that 15-day PWRS options trade at 45% IV while 45-day options trade at 28% IV. Before selling the 15-day options as 'overpriced,' what should she check first?",
                    "choices": [
                      "Whether she can double her position size",
                      "Whether a scheduled event like earnings or a regulatory ruling sits inside the next 15 days",
                      "Whether interest rates changed overnight",
                      "Nothing\u2014a 17-point gap is always free money"
                    ],
                    "answer": 1,
                    "explain": "An upcoming earnings announcement or ruling legitimately inflates the expiration month that holds the event date."
                  },
                  {
                    "q": "The options market already prices a 15-point post-earnings IV crush into front-month PWRS options. Selling that front-month volatility has an edge only if:",
                    "choices": [
                      "Implied volatility drops at all after earnings",
                      "The actual stock gap is smaller than the jump already priced into that 45% pre-earnings IV",
                      "Back-month implied volatility rises",
                      "The stock gaps upward instead of downward"
                    ],
                    "answer": 1,
                    "explain": "Because everyone expects implied volatility to fall after the announcement, the pre-earnings option price already bakes in an expected stock jump. Sellers win only if the real move is tamer than priced."
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
                "objective": "See how option market makers price their bid-ask spread in volatility units, shade quotes to manage inventory, and adjust size to control risk.",
                "body": "A neighborhood used-car dealer stays in business by buying sedans at $14,500 and selling them at $15,000, not by guessing where car prices will be next year. An option market maker posts a two-sided quote\u2014say bidding $1.46 and offering $1.54 on a $42 LMND call\u2014to earn the 8-cent spread while hedging the stock risk. To judge whether 8 cents is enough pay, the dealer measures **width in vol** by dividing the dollar spread by vega: $0.08 \xF7 $0.16 vega equals 0.50 volatility points. The car-lot analogy stops there: when a liquid option market trades $1.48 to $1.52 while your model says $1.60, you adjust your volatility input toward the market.\n\nSuppose LMND implied volatility routinely jumps 3 full points a day. Quoting 0.50 vol points wide on that $42 call means one normal afternoon volatility swing is six times larger than the spread Maria collects on a fill. If she quotes too wide, competing dealers win every order; if she quotes too tight, one-sided customer buying stacks her book with inventory right before prices move. In plain words: divide the bid-ask spread by vega to see your true cushion in volatility points.\n\nOnce inventory piles up, a market maker uses **quote skewing**\u2014shifting both the bid and the ask down or up together, such as moving $1.46/$1.54 down to $1.43/$1.51. If Maria is already stuffed with long front-month options, sliding both sides down by 3 cents makes her offer attractive to buyers while keeping reluctant sellers away. Lowering only the offer to $1.51 while leaving the bid at $1.46 would just shrink her spread to 5 cents and give away her edge. She also never shifts her offer below her own fair value of $1.50, or rival traders will snap up her underpriced contracts immediately.\n\nQuote size is the second lever on the screen. When Maria wants to sell off extra long options, she might show 10 contracts on her bid and 50 contracts on her offer. In a quiet, thinly traded option where getting out takes days, she shrinks her quoted size and widens her spread even when her book is flat. In plain words: you only bank the bid-ask spread when you manage to exit the inventory, so shift both sides together and quote smaller in thin markets.",
                "key_takeaways": [
                  "Measure any option's bid-ask spread in volatility points (dollar width \xF7 vega) and compare it to how much IV moves in a day.",
                  "When a deep, active market trades away from your theoretical value, update your volatility input toward the market rather than fighting the tape.",
                  "To work off inventory, shift both your bid and your offer in the same direction without crossing your own fair value.",
                  "Show larger size on the side that reduces your inventory, and quote smaller size whenever exit liquidity is thin."
                ],
                "source": "Volcube Option Market Making",
                "sim": "market",
                "sim_task": "Open Practice, select LMND in the Watchlist, and inspect the Option chain columns: compare the Bid and Ask spread across near-the-money and far out-of-the-money strikes, then switch to GLXY to see how lower stock prices and different IV levels change the dollar spread.",
                "quiz": [
                  {
                    "q": "An option has $0.16 of vega per 1-point IV move, and Maria quotes a $0.08 bid-ask spread. How wide is her quote in volatility units?",
                    "choices": [
                      "2.0 volatility points wide",
                      "0.5 volatility points wide ($0.08 \xF7 $0.16)",
                      "8.0 volatility points wide",
                      "Width cannot be converted into volatility units"
                    ],
                    "answer": 1,
                    "explain": "Dividing the $0.08 dollar spread by $0.16 of vega equals 0.50 volatility points\u2014the true buffer against daily IV swings."
                  },
                  {
                    "q": "Maria is already long too many front-month options and wants to attract buyers while discouraging sellers. How should she adjust her quote?",
                    "choices": [
                      "Lower only her ask price",
                      "Raise only her bid price",
                      "Shift BOTH her bid and her ask lower together, keeping her spread width intact",
                      "Widen both sides equally around the old midpoint"
                    ],
                    "answer": 2,
                    "explain": "Moving both the bid and the ask down makes her offer competitive to buyers and her bid unattractive to sellers without shrinking her spread."
                  },
                  {
                    "q": "Sam's pricing model says an option is worth $1.60, but a deep, active market is trading at $1.48 bid / $1.52 ask. What is the disciplined move?",
                    "choices": [
                      "Buy every contract offered at $1.52 until his cash runs out",
                      "Adjust his model's implied-volatility input down toward the market's consensus",
                      "Post a $1.58 bid and $1.62 ask anyway",
                      "Turn off his screen for the week"
                    ],
                    "answer": 1,
                    "explain": "When a liquid market persistently disagrees with your model, your volatility input is off. Bidding $1.58 against a $1.52 market just fills you on overpriced inventory."
                  },
                  {
                    "q": "Why do market makers quote smaller contract sizes in thinly traded options even when their current book is completely flat?",
                    "choices": [
                      "Exchange rules ban quotes larger than 5 contracts",
                      "Spread profit is only locked in when you exit the trade, and thin liquidity makes every contract harder and slower to unwind",
                      "Small quotes guarantee higher volatility",
                      "To hide their orders from retail traders"
                    ],
                    "answer": 1,
                    "explain": "Capturing the spread on entry is only half the business; if you cannot easily hedge or exit the inventory, holding it carries real risk."
                  }
                ]
              },
              {
                "id": "p-risk-matrix",
                "title": "Seeing the Whole Book: Risk Matrix and Butterfly-Stripping",
                "objective": "Read a multi-leg option book from a spot-and-volatility risk matrix rather than an inventory list, and simplify complex books by stripping out low-risk butterflies.",
                "body": "Before a road trip, a weather radar map shows where the storm cells are heading far better than a printed list of fifty town temperatures. In options, a **risk matrix** is a grid showing your book's P&L and Greeks across spot moves (like \u221210% to +10%) and volatility shifts (like \u22125 to +5 points). An inventory list only shows what contracts you hold today, while the matrix reveals where hidden short strikes will blow up if the stock drops 8%. The weather-radar analogy stops there: in options, you can buy a specific hedge strike to erase the worst storm cell on your grid.\n\nSuppose Sam's book looks calm at today's $67 BRGR price\u2014near-zero delta and modest theta\u2014because he bought one $65 put and sold two $60 puts. His risk matrix tells the real story: if BRGR drops to $58 with a 5-point IV spike, those extra short $60 puts create heavy losses. By spotting that red corner cell on the matrix before the drop happens, Sam can buy a $55 put to cap the downside cell. In plain words: today's totals can look flat while a big move hides a trap, so always check the full grid of stock and volatility shocks.\n\nWhen a book grows to twenty different strikes, traders simplify the list using **butterfly-stripping**\u2014mentally crossing out balanced 1-by-2-by-1 butterfly spreads whose net vega is nearly zero. Owning one $40 call (12 vega), shorting two $42 calls (10.5 vega each), and owning one $44 call (9.5 vega) leaves just 0.5 net vega. When plenty of time remains, Maria can cross that tight butterfly off her mental summary and focus on the leftover unhedged strikes. That also explains why buying one more long option can lower total risk: adding a missing $44 call turns an exposed 1-by-2 ratio into a capped butterfly.\n\nEven if nobody places a trade, an option book changes shape over a three-day weekend. As calendar days pass, out-of-the-money option deltas bleed toward zero, so a Friday stock hedge against out-of-the-money puts can wake up oversized on Monday morning. Checking the time-decay preview for +1d, +3d, and +5d on Friday afternoon lets Maria trim her stock hedge before the weekend starts. In plain words: use the shock grid and the multi-day time preview so Monday morning never catches your book by surprise.",
                "key_takeaways": [
                  "Manage a multi-leg book from the Spot \xD7 IV risk matrix rather than relying on today's single-price Greek totals.",
                  "Ratio spreads can look flat at today's stock price while hiding severe losses in the crash-plus-vol-spike corner of the matrix.",
                  "Strip out balanced butterflies (near-zero net vega) to see a complex book's true remaining exposure; sometimes buying one missing wing cuts total risk.",
                  "Preview how passing days (+1d, +3d, +5d) bleed out-of-the-money deltas so your stock hedge does not drift off balance over the weekend."
                ],
                "source": "Volcube Option Volatility Trading: Strategies and Risk",
                "sim": "market",
                "sim_task": "Open Practice, place a multi-leg trade on BRGR from the Option chain, then scroll down to the Risk Desk card: inspect the Time decay row across Today, +1d, +3d, and +5d, and read the Spot \xD7 IV shock matrix and Worst scenario tile to find your book's weakest cell.",
                "quiz": [
                  {
                    "q": "A call butterfly's legs have vegas of 12.0 (long $40 call), 10.5 each (two short $42 calls), and 9.5 (long $44 call). What is the butterfly's net vega?",
                    "choices": [
                      "32.0",
                      "0.5 (12.0 + 9.5 \u2212 2 \xD7 10.5)",
                      "21.0",
                      "12.0"
                    ],
                    "answer": 1,
                    "explain": "Adding the two long wings (12.0 + 9.5 = 21.5) and subtracting the two short center calls (2 \xD7 10.5 = 21.0) leaves just 0.5 net vega."
                  },
                  {
                    "q": "Maria's risk matrix shows heavy negative gamma and short vega whenever the stock drops 8%, but positive gamma on rallies. Which scenario is her biggest danger?",
                    "choices": [
                      "A slow, quiet drift higher",
                      "A sharp sell-off paired with an implied-volatility spike",
                      "A flat week with unchanged volatility",
                      "A small dividend payment"
                    ],
                    "answer": 1,
                    "explain": "Clustered short puts below the current stock price suffer both from the drop into negative gamma and from the spike in implied volatility."
                  },
                  {
                    "q": "How can buying MORE of an option strike reduce a complex book's overall risk?",
                    "choices": [
                      "It never can\u2014buying another contract always adds risk",
                      "Buying the missing wing can turn an exposed 1-by-2 ratio spread into a capped, near-zero-vega butterfly",
                      "Brokers cancel margin when you buy calls",
                      "Long options have no delta"
                    ],
                    "answer": 1,
                    "explain": "If your book is long one $40 call and short two $42 calls, buying one $44 call completes a balanced $40/$42/$44 butterfly and caps the upside risk."
                  },
                  {
                    "q": "Sam leaves Friday afternoon delta-neutral, owning out-of-the-money puts hedged with long stock. On Monday morning, with the stock unchanged, he finds himself net long delta. Why?",
                    "choices": [
                      "Implied volatility doubled over the weekend",
                      "Time decay (charm) bled the out-of-the-money puts' negative delta toward zero over the weekend, leaving his long stock hedge too big",
                      "Interest rates jumped on Sunday",
                      "Stock shares gained gamma over the weekend"
                    ],
                    "answer": 1,
                    "explain": "As calendar days pass, out-of-the-money option deltas shrink toward zero even if the stock stays still, leaving the static stock hedge larger than the puts."
                  }
                ]
              },
              {
                "id": "p-higher-order",
                "title": "When Your Greeks Shift Underneath You",
                "objective": "Predict how delta and vega shift when stock price, implied volatility, and time move together\u2014using vanna, vomma, and charm to stress-test a book.",
                "body": "Walking across a boat deck is easy in calm water, but when a wave tilts the deck while you step forward, both motions combine to throw you off balance. Higher-order Greeks measure how your main Greeks tilt when volatility or time shifts underneath your feet. **Vomma** measures how much your vega changes per 1-point shift in implied volatility\u2014for example, a long $38 LMND put gaining +$1.50 of extra vega when IV rises 1 point. The boat-deck analogy stops there: in out-of-the-money wing options, positive vomma actually helps option buyers by growing their vega as volatility rises and shrinking it as volatility falls. In plain words: vomma means your vega itself moves when volatility moves.\n\nThe tricky side of vomma hits traders who sell out-of-the-money wings to bet on falling volatility. Because short wings carry negative vomma, a drop in implied volatility shrinks the very short-vega position that was supposed to profit \u2014 the win gets smaller exactly as the bet starts working. (A book made only of short vanilla options stays short vega; vomma alone never flips it long.) **Vanna** measures how delta changes when implied volatility moves\u2014for instance, a hedged long $38 LMND put picking up \u22120.08 extra delta when IV spikes 5 points with LMND unchanged. In plain words: wing options do not keep fixed Greeks\u2014their vega and delta swell when volatility jumps and shrink when volatility calms down.\n\nTime acts like falling volatility on out-of-the-money options, a daily drift traders call charm. As each day passes, an out-of-the-money option's delta bleeds toward zero\u2014say a $38 LMND put sliding from \u22120.22 delta on Thursday to \u22120.16 delta by Monday. If Maria hedged that \u22120.22 put delta by owning 22 shares of LMND on Friday, she arrives Monday morning net long 6 shares even if LMND never moved. Notice why falling implied volatility and passing calendar time feel like siblings: both shrink the chance an out-of-the-money strike finishes in the money.\n\nThese cross-effects explain why you must stress-test every book against combined shocks\u2014like a sharp stock drop paired with an implied volatility spike. In a crash-and-vol-spike, a short put ladder suffers four hits at once: losing gamma hedges, rising vega marks, vanna pushing the book's delta LONGER just as the market falls (the spiking IV makes each short put act more like long stock \u2014 exactly the wrong direction), and vomma deepening the short-vega hole. None of those four amplifiers looks scary when the stock is quiet on a Tuesday morning. In plain words: know your Greeks, know how they shift when price and volatility move together, and test every trade in the simulator before risking real cash.",
                "key_takeaways": [
                  "Vomma lives in out-of-the-money wings: long wings gain vega when IV rises, while short-wing books can see their short vega shrink as IV falls.",
                  "Vanna shifts an option's delta when implied volatility changes, creating new delta exposure even before the stock moves.",
                  "Charm bleeds out-of-the-money deltas toward zero as calendar days pass, pushing options in the same direction as falling IV.",
                  "Always stress-test positions against combined shocks (crash + IV spike, rally + IV crush) in the Risk Desk matrix before trading."
                ],
                "source": "Volcube Option Volatility Trading: Strategies and Risk; Option Market Making",
                "sim": "greeks",
                "sim_task": "Open the Greeks Lab and switch between the \u0394 Delta and \u03BD Vega tabs: set Strike K to 100 and Days to expiry to 30, then drag the Implied vol slider from 20% to 45% and watch how delta and vega at spot $88 and $112 change compared to spot $100.",
                "quiz": [
                  {
                    "q": "Sam is short vega and short vomma via out-of-the-money options, and implied volatility drops sharply\u2014his hoped-for move. Why might his profit stall partway through the drop?",
                    "choices": [
                      "Theta decay turns against him when IV falls",
                      "Negative vomma shrinks his short-vega exposure as implied volatility falls, reducing how much he earns on each further point of IV decline",
                      "Vanna doubles his cash balance",
                      "Falling volatility always hurts short-vega trades"
                    ],
                    "answer": 1,
                    "explain": "Out-of-the-money options lose vega as implied volatility falls. When you are short those wings, your short-vega bet gets smaller right as the volatility drop plays out."
                  },
                  {
                    "q": "Maria holds a delta-neutral book with long out-of-the-money $38 LMND puts hedged with long stock. Implied volatility spikes 5 points with LMND still at $42. Her book is now:",
                    "choices": [
                      "Still delta-neutral because the stock price did not change",
                      "Net short delta\u2014rising IV made the out-of-the-money puts' negative delta larger (vanna) beyond her existing stock hedge",
                      "Net long delta",
                      "Free of all vega exposure"
                    ],
                    "answer": 1,
                    "explain": "Higher implied volatility gives an out-of-the-money put a greater chance of finishing in the money, making its delta more negative even before the stock moves."
                  },
                  {
                    "q": "Why do vanna (delta shift from volatility changes) and charm (delta drift from passing time) push out-of-the-money options in similar ways?",
                    "choices": [
                      "Both only affect deep in-the-money stock positions",
                      "Falling implied volatility and passing calendar time both reduce an out-of-the-money option's odds of finishing in the money, pulling its delta toward zero",
                      "Both only operate on expiration Friday",
                      "They always cancel each other out"
                    ],
                    "answer": 1,
                    "explain": "Less time on the clock and lower implied volatility both shrink the expected range of the stock, causing out-of-the-money deltas to bleed toward zero."
                  },
                  {
                    "q": "In a sudden crash paired with an implied-volatility spike, a short out-of-the-money put ladder gets hit through four channels at once. What are they?",
                    "choices": [
                      "Dividends, interest rates, stock splits, and commissions",
                      "Gamma (bad re-hedges), vega (higher IV marks), vanna (deltas swelling as IV jumps), and vomma (short vega growing larger as IV rises)",
                      "Positive theta and positive charm only",
                      "Only stock delta"
                    ],
                    "answer": 1,
                    "explain": "When price drops and IV jumps together, short wings suffer from the price move (gamma), the higher IV level (vega), expanding deltas (vanna), and expanding short vega (vomma)."
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  // src/ui/shell.js
  var contentEl;
  var tapeInner;
  var clockEl;
  var navEl;
  var profileEl;
  var liveDot;
  var tabbarEl;
  var nextEl;
  var currentCleanup = null;
  var syncCloudCleanup = null;
  var VIEWS = {};
  var sheetHost = null;
  var NAV = [
    { sect: "Learn" },
    { id: "home", ic: "home", label: "Home" },
    { id: "learn", ic: "book", label: "Lessons", coach: "nav-learn" },
    { sect: "Practice" },
    { id: "market", ic: "monitor", label: "Practice", coach: "nav-practice" },
    { id: "missions", ic: "compass", label: "Missions", coach: "nav-missions" },
    { sect: "Review" },
    { id: "journal", ic: "notebook", label: "Journal", coach: "nav-journal" },
    { id: "progress", ic: "trophy", label: "Progress" },
    { sect: "Labs" },
    { id: "labs", ic: "layers", label: "Labs", sheet: "labs" },
    { sect: "You" },
    { id: "settings", ic: "gear", label: "Settings" },
    { id: "legal", ic: "scale", label: "Disclosures" }
  ];
  var LABS = [
    { id: "strategy", ic: "layers", label: "Builder" },
    { id: "greeks", ic: "temple", label: "Greeks" },
    { id: "vol", ic: "wave", label: "Volatility" },
    { id: "risk", ic: "grid", label: "Risk Desk" }
  ];
  var LAB_IDS = new Set(LABS.map((l) => l.id));
  var YOU_IDS = /* @__PURE__ */ new Set(["journal", "progress", "settings", "upgrade", "welcome", "legal", "start"]);
  function navItems() {
    return NAV;
  }
  function closeSheets() {
    if (sheetHost) {
      sheetHost.remove();
      sheetHost = null;
    }
  }
  var closeSheet = closeSheets;
  function openSheet(title, items) {
    closeSheet();
    const list2 = el(
      "div",
      { class: "oa-sheet", role: "dialog", "aria-label": title },
      el("div", { class: "oa-sheet-handle", "aria-hidden": "true" }),
      el("div", { class: "eyebrow" }, title)
    );
    for (const it of items) {
      const attrs = {
        type: "button",
        class: "oa-sheet-item",
        onclick: () => {
          closeSheet();
          it.onClick();
        }
      };
      if (it.coach) attrs["data-coach"] = it.coach;
      list2.appendChild(el(
        "button",
        attrs,
        it.ic ? icon(it.ic, { cls: "si" }) : el("span", { class: "si" }, it.icon || ""),
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
      label: l.label,
      onClick: () => {
        location.hash = "#/" + l.id;
      }
    })));
  }
  function openPracticeSheet() {
    openSheet("Practice", [
      { ic: "monitor", label: "Practice", coach: "nav-practice", onClick: () => {
        location.hash = "#/market";
      } },
      { ic: "compass", label: "Missions", coach: "nav-missions", onClick: () => {
        location.hash = "#/missions";
      } }
    ]);
  }
  function openYouSheet() {
    const items = [
      { ic: "notebook", label: "Journal", coach: "nav-journal", onClick: () => {
        location.hash = "#/journal";
      } },
      { ic: "trophy", label: "Progress", onClick: () => {
        location.hash = "#/progress";
      } },
      { ic: "layers", label: "Labs", onClick: () => openLabsSheet() },
      { ic: "gear", label: "Settings", onClick: () => {
        location.hash = "#/settings";
      } },
      { ic: "user", label: "Switch profile", onClick: () => profilePicker() },
      { ic: "contrast", label: "Toggle theme", onClick: () => toggleTheme() }
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
      { id: "home", ic: "home", label: "Home", href: "#/home" },
      { id: "learn", ic: "book", label: "Learn", href: "#/learn", coach: "nav-learn" },
      { id: "practice", ic: "monitor", label: "Practice", onClick: openPracticeSheet, coach: "nav-practice" },
      { id: "you", ic: "user", label: "You", onClick: openYouSheet }
    ];
    tabbarEl = el("nav", { class: "oa-tabbar", "aria-label": "Primary" });
    for (const t of tabs) {
      const attrs = { "data-tab": t.id };
      if (t.coach) attrs["data-coach"] = t.coach;
      if (t.href) {
        tabbarEl.appendChild(el(
          "a",
          { ...attrs, href: t.href },
          icon(t.ic, { cls: "ti" }),
          el("span", {}, t.label)
        ));
      } else {
        tabbarEl.appendChild(el(
          "button",
          { ...attrs, type: "button", onclick: t.onClick },
          icon(t.ic, { cls: "ti" }),
          el("span", {}, t.label)
        ));
      }
    }
    return tabbarEl;
  }
  function refreshTabActive(routeName) {
    if (!tabbarEl) return;
    tabbarEl.querySelectorAll("[data-tab]").forEach((a) => {
      const id = a.getAttribute("data-tab");
      let on = false;
      if (id === "home") on = routeName === "home";
      if (id === "learn") on = routeName === "learn";
      if (id === "practice") on = routeName === "market" || routeName === "missions";
      if (id === "you") on = YOU_IDS.has(routeName);
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
      if (n.sheet === "labs") {
        navEl.appendChild(el("button", {
          type: "button",
          class: "oa-nav-link",
          "data-nav": "labs",
          onclick: () => openLabsSheet()
        }, icon(n.ic, { cls: "ni" }), el("span", { class: "lbl" }, n.label)));
        continue;
      }
      const attrs = { href: "#/" + n.id, "data-nav": n.id };
      if (n.coach) attrs["data-coach"] = n.coach;
      navEl.appendChild(el(
        "a",
        attrs,
        n.ic ? icon(n.ic, { cls: "ni" }) : null,
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
    nextEl = el("div", { class: "oa-next", "data-coach": "next-step", role: "region", "aria-label": "Next step" });
    const main = el("main", { class: "oa-main" }, tape, nextEl, contentEl);
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
    navEl.querySelectorAll("[data-nav]").forEach((a) => {
      const id = a.dataset.nav;
      a.classList.toggle("active", id === "labs" ? LAB_IDS.has(name) : id === name);
    });
    refreshTabActive(name);
    contentEl.innerHTML = "";
    window.scrollTo(0, 0);
    currentCleanup = view16.render(contentEl, parts.slice(1)) || null;
    renderNext();
  }
  function renderNext() {
    if (!nextEl) return;
    const sess = session();
    const hide = document.body.classList.contains("oa-landing") || sess && sess.status === "active";
    if (hide) {
      nextEl.hidden = true;
      nextEl.replaceChildren();
      return;
    }
    const step = nextStep(active(), curriculum, readDemos(), get());
    nextEl.hidden = false;
    nextEl.replaceChildren(
      el("p", { class: "oa-next-text" }, step.text),
      el("a", { class: "btn sm primary", href: step.href }, "Continue")
    );
  }
  function boot(views) {
    VIEWS = { welcome: view, upgrade: view2, settings: view3, start: view5, ...views, demo: demoView };
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
    bus.on("profile", () => {
      refreshProfile();
      renderNext();
    });
    bus.on("mission", renderNext);
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
  var view7 = {
    render(root) {
      const p = active();
      const hour = (/* @__PURE__ */ new Date()).getHours();
      const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      root.appendChild(viewHeader("Academy Exchange", p ? `${greet}, ${p.name}` : "Welcome to Options Academy"));
      if (p && incomplete()) {
        const n = Math.min(currentStep() + 1, TOTAL);
        root.appendChild(el("a", {
          class: "pill brass onboard-continue",
          href: "#/welcome",
          style: "text-decoration:none"
        }, `Continue setup (step ${n}/${TOTAL})`));
      }
      const step = nextStep(p, curriculum, readDemos(), p ? get() : { step: 0, done: false });
      const nextCard = el(
        "div",
        { class: "card mt2 home-next" },
        el("div", { class: "eyebrow" }, "Next"),
        el("h2", { style: "margin-top:4px" }, step.text),
        el(
          "div",
          { class: "btn-row mt1" },
          el("a", { class: "btn primary", href: step.href }, "Continue")
        )
      );
      root.appendChild(nextCard);
      if (p) {
        const lv = levelOf(p.xp);
        const avg = avgScore(10);
        const sess = session();
        root.appendChild(el(
          "div",
          { class: "card mt2 home-account" },
          el(
            "div",
            { class: "flex-between", style: "gap:12px;flex-wrap:wrap" },
            el(
              "div",
              {},
              el("div", { style: "font-weight:700" }, p.name),
              el("div", { class: "small muted" }, `Level ${lv.n} \u2014 ${lv.name}`)
            ),
            el("a", { class: "btn sm", href: "#/progress" }, "Progress")
          ),
          el(
            "div",
            { class: "stats mt1" },
            el("div", { class: "stat" }, el("div", { class: "k" }, "XP"), el("div", { class: "v num" }, String(p.xp))),
            el("div", { class: "stat" }, el("div", { class: "k" }, "Equity"), el("div", { class: "v num" }, F.usd(equity(), 0))),
            el("div", { class: "stat" }, el("div", { class: "k" }, "Process Score"), el("div", { class: "v num" }, avg == null ? "\u2014" : String(avg)))
          ),
          sess && sess.status === "active" ? el("a", {
            class: "pill brass mt1",
            href: sess.purpose ? "#/demo/" + sess.def.id + "/" + sess.purpose : "#/missions/" + sess.def.id,
            style: "margin-top:10px;display:inline-flex;text-decoration:none"
          }, `Resume: ${sess.def.title}`) : null
        ));
      }
    }
  };

  // src/content/placement.js
  var PLACEMENT = {
    core: {
      questions: [
        {
          q: "Maria buys one Lumend Brands (LMND) $45 call option quoted at $2.35. What right does this contract give her, and how much cash does she pay upfront (before any fees)?",
          choices: [
            "A requirement to buy 100 shares at $45; upfront cost is $2.35",
            "The choice\u2014never a requirement\u2014to buy 100 shares at $45 on or before expiration; upfront cost is $235",
            "The choice to sell 100 shares at $45; upfront cost is $235",
            "The choice to buy 1 share at $45; upfront cost is $2,350"
          ],
          answer: 1,
          explain: "Buying a call gives you the right, never the obligation, to buy 100 shares at the strike price. Because one contract covers 100 shares, a $2.35 quote costs $235."
        },
        {
          q: "PowerSun Energy (PWRS) trades at $94, and its $90 call is quoted at $6.50. How does that $6.50 price split into real value today (intrinsic) and waiting value (time value)?",
          choices: [
            "$6.50 intrinsic value and $0 time value",
            "$0 intrinsic value and $6.50 time value",
            "$4.00 intrinsic value and $2.50 time value",
            "$2.50 intrinsic value and $4.00 time value"
          ],
          answer: 2,
          explain: "With PWRS at $94, the right to buy at $90 is worth $4.00 right now ($94 \u2212 $90). The remaining $2.50 of the $6.50 price is time value."
        },
        {
          q: "Sam buys a Burgess Restaurant Group (BRGR) $65 put for $3.20 when the stock is at $67. At expiration, what is his breakeven stock price and his maximum possible dollar loss?",
          choices: [
            "Breakeven $61.80; maximum loss $320",
            "Breakeven $68.20; maximum loss $320",
            "Breakeven $61.80; maximum loss $6,180",
            "Breakeven $63.80; maximum loss unlimited"
          ],
          answer: 0,
          explain: "A long put breaks even at the strike minus the price paid ($65 \u2212 $3.20 = $61.80). As an option buyer, Sam cannot lose more than the $320 he paid upfront."
        },
        {
          q: "Maria buys a 30-day PWRS $100 call for $2.00 ($200) when PWRS is at $95. On expiration day, PWRS closes at $101. What is her net profit or loss, and why?",
          choices: [
            "+$100, because the option finished in the money",
            "\u2212$100, because the $1.00 ($100) value at expiration is less than the $2.00 ($200) she paid upfront",
            "+$600, because the stock rose $6.00",
            "\u2212$200, because all calls below $102 finish worthless"
          ],
          answer: 1,
          explain: "At $101, the $100 call finishes worth $1.00 ($100), leaving a $100 net loss against her $200 entry cost. Being right on direction still loses if the stock stops short of the $102 breakeven."
        },
        {
          q: "Sam buys 100 shares of BRGR at $67 and sells one $72 call for $1.80 ($180) as a covered call. What are his breakeven share price and maximum total profit at expiration?",
          choices: [
            "Breakeven $68.80; maximum profit unlimited",
            "Breakeven $65.20; maximum profit $680",
            "Breakeven $65.20; maximum profit $500",
            "Breakeven $70.20; maximum profit $680"
          ],
          answer: 1,
          explain: "Collecting $1.80 per share lowers Sam's breakeven to $65.20 ($67 \u2212 $1.80). Above $72, his shares are sold at $72 for a $500 stock gain plus the $180 cash collected = $680 maximum profit."
        },
        {
          q: "Maria sells one cash-secured $40 put on LMND for $1.60 ($160) while setting aside $4,000 in cash. If LMND drops to $35 at expiration and she is assigned the 100 shares, what is her net purchase price per share?",
          choices: [
            "$40.00",
            "$35.00",
            "$38.40",
            "$33.40"
          ],
          answer: 2,
          explain: "Maria buys the 100 shares at the $40 strike price, but she keeps the $1.60 per share collected upfront, bringing her net entry price to $38.40 per share."
        },
        {
          q: "Sam builds a bull call spread on PWRS by buying the $95 call for $4.80 and selling the $105 call (same expiration) for $1.60. What are his net debit, maximum profit, and breakeven at expiration?",
          choices: [
            "Net debit $3.20 ($320); max profit $6.80 ($680); breakeven $98.20",
            "Net debit $6.40 ($640); max profit $3.60 ($360); breakeven $101.40",
            "Net debit $3.20 ($320); max profit $10.00 ($1,000); breakeven $99.80",
            "Net debit $1.60 ($160); max profit $8.40 ($840); breakeven $96.60"
          ],
          answer: 0,
          explain: "Net debit is $4.80 \u2212 $1.60 = $3.20 ($320). Maximum profit at or above $105 is the $10 strike gap minus the $3.20 debit ($6.80, or $680), and breakeven is $95 + $3.20 = $98.20."
        },
        {
          q: "A stock trades at $80 with an annual implied volatility (IV) of 32%. Using the rule of 16 (\u221A252 \u2248 16), what typical one-day move is the options market pricing in?",
          choices: [
            "About $0.50 per day (0.6%)",
            "About $1.60 per day (2.0%)",
            "About $2.56 per day (3.2%)",
            "About $5.00 per day (6.25%)"
          ],
          answer: 1,
          explain: "Dividing the 32% annual IV by 16 gives a 2.0% typical daily swing. On an $80 stock, 2.0% equals $1.60 per trading day."
        },
        {
          q: "Right before earnings, Sam buys a $180 straddle on Rocket Robotics (RCKT)\u2014buying both the $180 call and $180 put\u2014for $9.00 ($900) total. The next morning RCKT jumps to $186 and implied volatility drops sharply. Why is his straddle losing money despite a $6 rally?",
          choices: [
            "Call and put deltas always cancel to zero no matter how far the stock moves",
            "Paying $9.00 priced in at least a $9.00 jump; a $6.00 move plus the post-earnings IV drop leaves the combined straddle worth less than $9.00",
            "Long straddles only make money when the stock falls",
            "Exchanges freeze option prices on earnings day"
          ],
          answer: 1,
          explain: "The $9.00 entry cost required RCKT to move past $189 or $171 by expiration. Because the $6.00 jump fell short of $9.00 and implied volatility collapsed after the news, the position lost overall: the crush drained premium from both options faster than the call's price gain could add it."
        },
        {
          q: "BRGR trades at 34% implied volatility (52-week range: 18% to 36%). RCKT trades at 52% implied volatility (52-week range: 48% to 95%). Which stock's options are more expensive compared to their own normal behavior?",
          choices: [
            "RCKT's options, because 52% is higher than 34%",
            "BRGR's options, which sit near the top of its 1-year range, while RCKT's sit near the bottom of its 1-year range",
            "Both are overpriced because any IV above 30% is expensive",
            "Implied volatility cannot be compared across a stock's own history"
          ],
          answer: 1,
          explain: "Implied volatility only makes sense compared against the same stock's own past range (IV rank). BRGR at 34% is near its 52-week high, while RCKT at 52% is near its 52-week low."
        },
        {
          q: "Maria opens a call calendar spread at the $42 LMND strike\u2014selling the 30-day $42 call and buying the 60-day $42 call. Which outcome works best for her trade?",
          choices: [
            "LMND rockets to $58 in the first week",
            "LMND stays near $42 into the 30-day expiration so the short 30-day call melts faster than the long 60-day call",
            "30-day implied volatility jumps 15 points while 60-day implied volatility falls",
            "LMND drops to $28 before the 30-day expiration"
          ],
          answer: 1,
          explain: "A calendar spread profits when the stock stays near the strike so the fast-melting near-month option decays faster than the slower back-month option. A big move either way hurts both legs' time value."
        },
        {
          q: "Why does a bull call spread that is already deep in the money\u2014say a $90/$100 PWRS call spread with PWRS at $108 and two weeks left\u2014trade at $9.45 instead of its full $10.00 expiration value?",
          choices: [
            "Vertical spreads can never reach their full width even on expiration day",
            "The short $100 call still has remaining time value and negative gamma; the spread only reaches $10.00 as the clock runs out",
            "Brokers subtract a 55-cent fee from every vertical spread",
            "Put-call parity caps vertical spreads at $9.45"
          ],
          answer: 1,
          explain: "With two weeks left, the short $100 call still carries time value because PWRS could drop back below $100. That remaining time value only melts to zero as expiration arrives."
        }
      ]
    },
    "greeks-vol": {
      questions: [
        {
          q: "Maria's option book on LMND holds 15 long calls at +0.40 delta each and 10 short puts at \u22120.30 delta each (100 shares per contract). What is her net share-equivalent position, and what stock trade makes her delta-neutral?",
          choices: [
            "Long 300 shares; sell 300 shares to hedge",
            "Long 900 shares; sell 900 shares to hedge",
            "Short 300 shares; buy 300 shares to hedge",
            "Long 600 shares; sell 600 shares to hedge"
          ],
          answer: 1,
          explain: "The 15 long calls add +600 delta (15 \xD7 0.40 \xD7 100). Selling 10 puts flips their negative sign (\u221210 \xD7 \u22120.30 \xD7 100 = +300 delta), leaving Maria net long +900 delta, so she sells 900 shares to flatten."
        },
        {
          q: "A PWRS call option with the stock at $95 has +0.50 delta and +0.08 gamma. If PWRS rallies $3 to $98, what is the call's new approximate delta, and what is the estimated option gain per share using average delta?",
          choices: [
            "New delta +0.58; estimated gain $1.50 per share",
            "New delta +0.74; estimated gain $1.86 per share",
            "New delta +0.26; estimated gain $1.14 per share",
            "New delta +0.74; estimated gain $2.22 per share"
          ],
          answer: 1,
          explain: "New delta is 0.50 + (3 \xD7 0.08) = +0.74. Averaging the starting and ending deltas gives (0.50 + 0.74) \xF7 2 = 0.62, and 0.62 \xD7 $3 = $1.86 per share \u2014 a local approximation that holds gamma and implied volatility fixed and ignores second-order effects."
        },
        {
          q: "How does the gamma of an at-the-money option behave as expiration gets close and implied volatility is low?",
          choices: [
            "Gamma shrinks toward zero because little time value remains",
            "Gamma concentrates sharply at the strike price, making delta flip rapidly on small stock moves",
            "Gamma spreads out evenly across all far out-of-the-money and deep in-the-money strikes",
            "Gamma turns negative for long calls and positive for long puts"
          ],
          answer: 1,
          explain: "With almost no time left, a small move across the strike swings the option between acting like 100 shares (delta near 1) and acting like nothing (delta near 0) \u2014 at expiry it settles to its intrinsic value. That fast delta flip is high positive gamma."
        },
        {
          q: "Sam's delta-neutral book is long +60 share-equivalents of gamma per $1 move and pays $120 per trading day in theta rent. Using \u221A(2\u03B8 \xF7 \u0393), what daily stock move does he need to cover his daily theta bill?",
          choices: [
            "$1.00",
            "$1.41",
            "$2.00",
            "$4.00"
          ],
          answer: 2,
          explain: "Gamma profit is 0.5 \xD7 \u0393 \xD7 (move)\xB2. Setting 0.5 \xD7 60 \xD7 (move)\xB2 = $120 gives (move)\xB2 = 4, or a $2.00 move up or down."
        },
        {
          q: "Why does a delta-hedged trader who owns a long straddle lock in a cash profit when the stock drops sharply and she buys shares to get back to delta-neutral?",
          choices: [
            "Because long gamma makes theta turn positive during stock selloffs",
            "Because her straddle turns net short delta as the stock falls, and buying shares at the lower price locks in that gain",
            "Because short stock has positive vega",
            "She does not\u2014long gamma only makes money when the stock rises"
          ],
          answer: 1,
          explain: "Positive gamma makes the straddle shed positive delta and pick up negative delta as the stock drops. Buying shares at the lower price to bring delta back to zero banks that gain in cash."
        },
        {
          q: "With the stock price unchanged, Option X drops $0.12 and has $0.06 of vega per 1-point IV move, while Option Y drops $0.09 and has $0.03 of vega. Which option got cheaper in implied-volatility terms?",
          choices: [
            "Option X, because 12 cents is larger than 9 cents",
            "Option Y, which fell 3.0 IV points ($0.09 \xF7 $0.03) compared to Option X's 2.0 IV points ($0.12 \xF7 $0.06)",
            "Both dropped by the exact same amount of implied volatility",
            "Neither, because vega only measures time decay"
          ],
          answer: 1,
          explain: "Dividing the dollar price drop by vega converts cents into IV points: Option X fell $0.12 \xF7 $0.06 = 2.0 IV points, while Option Y fell $0.09 \xF7 $0.03 = 3.0 IV points."
        },
        {
          q: "Why can traders add daily theta dollars directly across 30-day and 180-day options, whereas adding raw vega directly across 30-day and 180-day options is misleading?",
          choices: [
            "Theta is measured in percentages while vega is measured in days",
            "Every expiration loses one calendar day at the same speed, but 30-day implied volatility jumps much more than 180-day implied volatility in a shock",
            "180-day options have zero vega",
            "Brokers forbid adding vega across months"
          ],
          answer: 1,
          explain: "Every option sheds time value with each passing trading day, so theta dollars add up cleanly. Near-month IV moves several times faster than back-month IV, so vega must be time-weighted before comparing across months."
        },
        {
          q: "Sam sells a delta-hedged LMND straddle at 28% implied volatility. Over the month, LMND's realized volatility on his hedging schedule is 21%. How does his trade finish overall?",
          choices: [
            "He loses money because any realized volatility above 20% wipes out option sellers",
            "He profits because the daily theta rent he collected (priced at 28% IV) was larger than the buy-high, sell-low hedging costs (from 21% realized volatility)",
            "He breaks even because delta hedging removes all profit and loss",
            "His result depends only on whether LMND finished above or below $42"
          ],
          answer: 1,
          explain: "A delta-hedged option trade compares implied volatility against realized volatility. Because actual swings (21%) were calmer than the fear Sam sold (28%), his daily theta income beat his hedging costs."
        },
        {
          q: "LMND rises $0.50 while a +0.40 delta call climbs from $2.10 to $2.30. How much did that call's price change in implied-volatility terms?",
          choices: [
            "It rose by 20 IV points",
            "Zero\u2014the entire $0.20 price rise came from its +0.40 delta on the $0.50 stock move (0.40 \xD7 $0.50 = $0.20)",
            "It fell, because calls always lose implied volatility when stocks rise",
            "It rose by $0.20 of pure vega"
          ],
          answer: 1,
          explain: "A +0.40 delta call should gain 0.40 \xD7 $0.50 = $0.20 from the stock move alone. Because the whole 20-cent rise came from delta, implied volatility did not change."
        },
        {
          q: "In stock and index option markets, why do out-of-the-money downside puts almost always trade at higher implied volatility than equally far upside calls (downside skew)?",
          choices: [
            "Put options have more days until expiration than call options",
            "Investors constantly buy puts to insure stock portfolios, crashes fall faster than rallies rise, and volatility spikes when stocks drop",
            "Dividends increase put values on expiration day",
            "Market makers are not allowed to sell puts"
          ],
          answer: 1,
          explain: "Steady buyer demand for crash protection, combined with the fact that market drops are sudden and violent, keeps downside put implied volatility higher than upside call implied volatility."
        },
        {
          q: "Maria wants to trade how steep the volatility skew is (downside put IV compared to upside call IV) while keeping her overall vega near zero. Which delta-hedged trade targets skew directly?",
          choices: [
            "An at-the-money straddle",
            "A 25-delta risk reversal\u2014buying the 25-delta option on one wing, selling the 25-delta option on the other wing, and hedging the delta with stock",
            "Buying 100 shares of stock outright",
            "A deep in-the-money call"
          ],
          answer: 1,
          explain: "An at-the-money straddle bets on the overall level of IV. A delta-hedged risk reversal pairs a long put wing against a short call wing (or vice versa) so overall vega cancels out, isolating the IV gap between the wings."
        },
        {
          q: "Sam holds a delta-neutral book of long out-of-the-money puts hedged with long stock. Suddenly, implied volatility spikes 6 points while the stock price has not moved yet. Which Greek makes his book turn net short delta, and why?",
          choices: [
            "Theta, because time decay speeds up during volatility spikes",
            "Vanna, because higher implied volatility gives the out-of-the-money puts a bigger chance of finishing in the money, making their negative deltas larger than his stock hedge",
            "Charm, because weekend drift reverses during the day",
            "Rho, because interest rates move with volatility"
          ],
          answer: 1,
          explain: "Vanna measures how delta changes when implied volatility moves. When IV jumps, out-of-the-money puts gain more negative delta toward \u22120.50, leaving Sam's existing stock hedge too small."
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
    root.appendChild(viewHeader("Lessons", "Learn the craft, then trade it"));
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
    root.appendChild(el("div", { class: "crumb" }, el("a", { href: "#/learn" }, "\u2190 Lessons")));
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
      el("a", { href: "#/learn" }, "Lessons"),
      " / ",
      el("a", { href: "#/learn/track/" + l.trackId }, l.trackTitle),
      " / ",
      l.moduleTitle
    ));
    const track2 = curriculum.tracks.find((t) => t.id === l.trackId);
    const flatIds = (track2?.modules || []).flatMap((m) => m.lessons.map((x) => x.id));
    const lessonIdxInTrack = flatIds.indexOf(lid);
    if (lessonTierLocked(l.trackId, lessonIdxInTrack)) {
      const freeDemos = DEMOS.filter((d) => d.lessonId === lid);
      root.appendChild(el(
        "div",
        { class: "card mt2", style: "max-width:68ch;text-align:center" },
        el("div", { style: "font-size:36px" }, icon("lock", { size: 36 })),
        el("h1", {}, "Academy lesson"),
        el(
          "p",
          { class: "sub" },
          "Free practice includes the first lessons of the core track. Upgrade to unlock the full curriculum."
        ),
        freeDemos.length ? el("p", { class: "sub" }, "The strategy demo is free \u2014 watch it before deciding.") : null,
        el(
          "div",
          { class: "btn-row mt1", style: "justify-content:center" },
          ...freeDemos.map((d) => el("a", { class: "btn", href: "#/demo/" + d.id + "/watch" }, "Watch the free demo")),
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
    if (l.source && l.trackId !== "foundations" && l.trackId !== "core") {
      root.appendChild(el("div", { class: "pill mt1" }, icon("bookOpen"), " " + l.source));
    }
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
    const demosFor = DEMOS.filter((d) => d.lessonId === l.id);
    const sim = l.sim && SIM_LINKS[l.sim];
    if (sim || demosFor.length) {
      const actions = el("div", { class: "btn-row" });
      if (sim) actions.appendChild(el("a", { class: "btn primary", href: sim.href }, sim.label));
      demosFor.forEach((d, n) => {
        const tag = demosFor.length > 1 ? d.title.replace(/^The /, "").replace(/,.*$/, "") + " \u2014 " : "";
        actions.appendChild(el("a", { class: "btn" + (sim || n > 0 ? "" : " primary"), href: "#/demo/" + d.id + "/watch" }, tag + "Watch the demo"));
        actions.appendChild(el("a", { class: "btn", href: "#/demo/" + d.id + "/do" }, tag + "Do it guided"));
      });
      root.appendChild(el(
        "div",
        { class: "apply-card", style: "max-width:68ch" },
        iconFor(sim ? sim.icon : "book", "book", { cls: "ic" }),
        el(
          "div",
          { style: "flex:1;min-width:220px" },
          el("div", { style: "font-weight:700" }, demosFor.length ? "Watch it, then try it" : "Apply it on the simulator"),
          el("div", { class: "sub" }, l.sim_task || (demosFor.length ? demosFor[0].intro : "Try what you just learned."))
        ),
        actions
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
  var view8 = {
    render(root, params) {
      if (!curriculum || !curriculum.tracks?.length) {
        root.appendChild(el("p", { class: "sub" }, "Lessons loading\u2026"));
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
  var KEY5 = "oa.analyzeStash";
  function writeAnalyzeStash(payload) {
    try {
      sessionStorage.setItem(KEY5, JSON.stringify({ ...payload, at: Date.now() }));
    } catch {
    }
  }
  function readAnalyzeStash() {
    try {
      const raw = sessionStorage.getItem(KEY5);
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
      sessionStorage.removeItem(KEY5);
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
  var view9 = {
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
      const expiryNote = el("p", { class: "small muted cone-note", style: "margin:6px 0 0" });
      chartCard.appendChild(expiryNote);
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
      function pinnedExpiry(leg) {
        if (realCtx) return { day: realCtx.dte, label: realCtx.expDate || `${realCtx.dte}d` };
        const exps = market.tickers[sym] ? market.expiries(sym) : [];
        if (!exps.length) return expiry();
        if (leg.exp === "far") return exps[exps.length - 1];
        if (leg.exp === "near") return exps[0];
        return exps[Math.min(expIdx, exps.length - 1)];
      }
      function expLabel(day) {
        if (realCtx) return realCtx.expDate || `${realCtx.dte}d`;
        const exps = market.tickers[sym] ? market.expiries(sym) : [];
        const hit = exps.find((e) => e.day === day);
        return hit ? hit.label : day != null ? `Day ${day}` : "\u2014";
      }
      function legDte(L) {
        if (L.kind === "stock") return 0;
        if (realCtx) return Math.max(0, realCtx.dte);
        return Math.max(0, (L.expDay ?? expiry().day) - market.day - market.minute / 390);
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
        legs = p.legs.map((L) => {
          if (L.kind === "stock") return { kind: "stock", side: Math.sign(L.side) || 1, qty: Math.abs(L.qty), entry: spot() };
          const strike = strikeAt(L.k);
          const exp = pinnedExpiry(L);
          let entry = 1;
          if (!realCtx && market.tickers[sym]) {
            entry = market.optQuote(sym, strike, exp.day, L.kind).mid;
          } else {
            const iv = posIv();
            const dte = Math.max(0.01, realCtx ? realCtx.dte : (exp.day ?? 0) - market.day - market.minute / 390);
            entry = price({ S: spot(), K: strike, T: dte / 252, v: iv, r: 0.04, type: L.kind });
          }
          return { kind: L.kind, side: Math.sign(L.side) || 1, qty: Math.abs(L.side) * (L.qty ?? 1), strike, expDay: exp.day, entry };
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
        const p = STRATEGIES.find((x) => x.id === presetSel.value);
        if (p) applyPreset(p);
        else {
          legs = [];
          drawAll();
        }
      });
      const presetSel = el("select", {});
      const presetPlain = el("p", { class: "small muted preset-plain" });
      function syncPresetPlain() {
        const p = STRATEGIES.find((x) => x.id === presetSel.value);
        presetPlain.textContent = p ? p.plain : "";
        presetSel.title = p ? p.plain : "";
      }
      presetSel.appendChild(el("option", { value: "" }, "Choose a strategy\u2026"));
      STRATEGIES.filter((p) => !realCtx || !p.legs.some((L) => L.exp)).forEach((p) => presetSel.appendChild(el("option", { value: p.id, title: p.plain }, p.name)));
      presetSel.addEventListener("change", () => {
        const p = STRATEGIES.find((x) => x.id === presetSel.value);
        syncPresetPlain();
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
        syncPresetPlain();
        if (realCtx) clearRealCtx();
        else drawAll();
      } }, "Clear");
      const tradeBtn = el("button", { class: "btn primary", onclick: () => {
        if (!legs.length || realCtx) return;
        if (!market.tickers[sym]) {
          toast("Switch to a sim symbol to paper-trade.", "loss");
          return;
        }
        const label = presetSel.value ? STRATEGIES.find((p) => p.id === presetSel.value)?.name || "Custom strategy" : "Custom strategy";
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
      controls.appendChild(presetPlain);
      controls.appendChild(legsBox);
      controls.appendChild(el("div", { class: "btn-row mt1" }, addLegBtn, clearBtn, tradeBtn));
      function renderLegs() {
        legsBox.innerHTML = "";
        if (!legs.length) {
          legsBox.appendChild(el("p", { class: "small muted" }, "No legs yet \u2014 pick a preset or add legs manually."));
          return;
        }
        const strikes = strikeList();
        const expDays = new Set(legs.filter((L) => L.kind !== "stock" && L.expDay != null).map((L) => L.expDay));
        const showExp = expDays.size > 1;
        const tbl = el("table", { class: "oa" });
        tbl.appendChild(el("thead", {}, el(
          "tr",
          {},
          el("th", {}, "Side"),
          el("th", {}, "Qty"),
          el("th", {}, "Type"),
          el("th", {}, "Strike"),
          showExp ? el("th", {}, "Expiry") : null,
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
            showExp ? el("td", { class: "small muted" }, L.kind === "stock" ? "\u2014" : expLabel(L.expDay)) : null,
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
          expiryNote.textContent = "";
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
        const optDtes = legs.filter((L) => L.kind !== "stock").map((L) => legDte(L));
        const days = optDtes.length ? Math.max(...optDtes) : posDays();
        const iv = posIv();
        const splitExp = new Set(legs.filter((L) => L.kind !== "stock" && L.expDay != null).map((L) => L.expDay)).size > 1;
        expiryNote.textContent = splitExp ? "These legs expire on different days. The solid line pretends they all finish together. The dashed line prices each leg with its own days left." : "";
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
        if (splitExp) {
          statsRow.appendChild(stat("Max profit", "\u2014"));
          statsRow.appendChild(stat("Max loss", "\u2014"));
          statsRow.appendChild(stat("Breakeven", "\u2014"));
          statsRow.appendChild(el(
            "div",
            { class: "stat pop-stat" },
            el("div", { class: "k" }, "Model-implied win odds"),
            el("div", { class: "v num" }, "\u2014"),
            el(
              "div",
              { class: "small muted", style: "margin-top:4px" },
              "Mixed expiries: single-expiry payoff stats do not apply. Watch the dashed T+0 line instead."
            )
          ));
        } else {
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
        }
        let g = { delta: 0, gamma: 0, theta: 0, vega: 0 };
        for (const L of legs) {
          if (L.kind === "stock") {
            g.delta += L.side * L.qty;
            continue;
          }
          if (realCtx || !market.tickers[sym]) {
            const dte = Math.max(0.01, legDte(L));
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
  var view10 = {
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
  var view11 = {
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
  var KEY6 = "oa.realwatch";
  var DEFAULTS = ["SPY", "QQQ", "AAPL", "MSFT", "IWM"];
  function loadRealWatch() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY6));
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
      localStorage.setItem(KEY6, JSON.stringify(clean.length ? clean : DEFAULTS));
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
      if (L.kind === "stock") {
        const entry2 = market.quote(sym).S;
        cost += L.side * L.qty * entry2;
        return { ...L, entry: entry2 };
      }
      const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
      const entry = L.side > 0 ? q.ask : q.bid;
      cost += L.side * L.qty * 100 * entry;
      return { ...L, entry };
    });
    return { cost, fillLegs };
  }
  function optionFees(ticket) {
    const qty = ticket.filter((L) => L.kind !== "stock").reduce((s2, L) => s2 + L.qty, 0);
    return 0.65 * qty;
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
  var view12 = {
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
      const hdr = viewHeader("Practice", "Paper-trade the Live Market");
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
      const nextDayBtn = el("button", {
        type: "button",
        class: "btn sm",
        "data-coach": "next-day",
        onclick: () => {
          market.advanceDay();
          toast("\u23ED Jumped to the next trading day.");
        }
      }, "\u23ED Next day");
      head.appendChild(el("div", { class: "btn-row" }, clockBig, speedSeg, nextDayBtn));
      root.appendChild(head);
      root.appendChild(el(
        "p",
        { class: "sub", style: "max-width:72ch" },
        "Every profile trades a $100,000 paper account on a simulated Live Market \u2014 prices tick live, implied vol breathes, earnings land, options expire. Speed it up to feel theta; slow it down to think."
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
          stockBtns.appendChild(el("button", {
            type: "button",
            class: "btn sm buy",
            "data-coach": n2 === 100 ? "buy-100" : void 0,
            onclick: () => stageStock(n2)
          }, `Buy ${n2} sh`));
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
        const above = strikes[strikes.indexOf(atm) + 1] || null;
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
                  "data-coach": k === above ? "call-bid-above" : void 0,
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
            const callBid = cell(F.usd(c.bid), k < S2 ? "chain-itm" : "", () => addTicket("call", -1, k, exp.day), "Sell this call at the bid");
            if (k === above) callBid.setAttribute("data-coach", "call-bid-above");
            tr.appendChild(callBid);
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
      function legDesc(L, withExpiry) {
        if (L.kind === "stock") return `${sym} ${L.qty} shares @ ${F.usd(market.quote(sym).S)}`;
        const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
        const px = L.side > 0 ? q.ask : q.bid;
        return `${sym} ${F.usd(L.strike, 2)} ${L.kind.toUpperCase()}${withExpiry ? ` (Day ${L.expDay})` : ""} @ ${F.usd(px)}`;
      }
      function stageStock(n2) {
        const existing = ticket.find((L) => L.kind === "stock" && L.side === 1);
        if (existing) existing.qty += n2;
        else ticket.push({ kind: "stock", side: 1, qty: n2 });
        if (isMobile3()) sheetOpen = true;
        renderTicket();
        toast(`${n2} shares added to the order ticket.`, "gain");
      }
      function orderLabel(legs) {
        if (legs.length === 1 && legs[0].kind === "stock") return `${legs[0].qty} shares`;
        if (legs.length === 1) return `${legs[0].side > 0 ? "Long" : "Short"} ${legs[0].kind}`;
        const stock = legs.some((l) => l.kind === "stock" && l.side > 0);
        const shortCall = legs.some((l) => l.kind === "call" && l.side < 0);
        if (stock && shortCall && legs.length === 2) return "Covered call";
        return `${legs.length}-leg combo`;
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
            el("span", { class: "mono small" }, legDesc(L, false)),
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
          el("span", { class: "small muted" }, `+ ${F.usd(optionFees(ticket))} fees`),
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
          el("button", { type: "button", class: "btn primary", "data-coach": "place-order", onclick: placeOrder }, "Place order"),
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
            el("span", { class: "mono small" }, legDesc(L, true)),
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
          el("span", { class: "small muted" }, `+ ${F.usd(optionFees(ticket))} fees`),
          el(
            "span",
            { class: "num small" },
            pl.maxLoss != null ? `Max loss ${F.usd(Math.abs(pl.maxLoss), 0)}` : "Max loss unbounded"
          ),
          el("button", { type: "button", class: "btn primary", "data-coach": "place-order", onclick: placeOrder }, "Place order"),
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
          if (L.kind === "stock") return { ...L, entry: market.quote(sym).S };
          const q = market.optQuote(sym, L.strike, L.expDay, L.kind);
          return { ...L, entry: L.side > 0 ? q.ask : q.bid };
        });
        const label = orderLabel(legs);
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
  var view13 = {
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
  var view14 = {
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
  var view15 = {
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

  // src/main.js
  function start4() {
    boot({ home: view7, learn: view8, strategy: view9, greeks: view10, vol: view11, market: view12, risk: view13, progress: view14, journal: view15, missions: view6, legal: view4 });
    start3();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start4);
  else start4();
})();
