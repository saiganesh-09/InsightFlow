/*!
 * InsightFlow Tracking SDK v1.0.0
 * Lightweight client for sending product analytics events to an InsightFlow
 * backend. Works in the browser (window.InsightFlow) and in Node/CommonJS.
 *
 * Usage:
 *   <script src="/sdk/insightflow.js"></script>
 *   <script>
 *     InsightFlow.init({ apiKey: "if_live_..." });
 *     InsightFlow.track("PAGE_VIEW", { page: "/products" });
 *   </script>
 */
(function (global, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
  global.InsightFlow = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var DEFAULT_ENDPOINT = "http://localhost:4000";
  var FLUSH_INTERVAL_MS = 5000;
  var MAX_BATCH = 100;

  var state = {
    apiKey: null,
    endpoint: DEFAULT_ENDPOINT,
    userId: null,
    sessionId: null,
    queue: [],
    timer: null,
    initialized: false,
  };

  function storage(kind) {
    try {
      return global[kind + "Storage"] || null;
    } catch (e) {
      return null;
    }
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "xxxx-4xxx-yxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    }) + "-" + Date.now().toString(36);
  }

  function getSessionId() {
    if (state.sessionId) return state.sessionId;
    var store = storage("session");
    var sid = store && store.getItem("if_session_id");
    if (!sid) {
      sid = "sess_" + uuid();
      if (store) store.setItem("if_session_id", sid);
    }
    state.sessionId = sid;
    return sid;
  }

  function getUserId() {
    if (state.userId) return state.userId;
    var store = storage("local");
    var uid = store && store.getItem("if_user_id");
    if (!uid) {
      uid = "anon_" + uuid();
      if (store) store.setItem("if_user_id", uid);
    }
    state.userId = uid;
    return uid;
  }

  function detectDevice() {
    if (typeof navigator === "undefined") return undefined;
    var ua = navigator.userAgent.toLowerCase();
    if (/mobile|iphone|android(?!.*tablet)/.test(ua)) return "mobile";
    if (/ipad|tablet/.test(ua)) return "tablet";
    return "desktop";
  }

  function buildEvent(name, props) {
    props = props || {};
    return {
      event: String(name).toUpperCase(),
      userId: props.userId || getUserId(),
      sessionId: props.sessionId || getSessionId(),
      page: props.page || (global.location ? global.location.pathname : undefined),
      referrer: props.referrer || (global.document ? document.referrer || undefined : undefined),
      source: props.source,
      device: props.device || detectDevice(),
      properties: props.properties || stripReserved(props),
      timestamp: new Date().toISOString(),
    };
  }

  var RESERVED = ["userId", "sessionId", "page", "referrer", "source", "device", "properties", "event"];
  function stripReserved(props) {
    var out = {};
    for (var k in props) {
      if (RESERVED.indexOf(k) === -1) out[k] = props[k];
    }
    return out;
  }

  function enqueue(evt) {
    state.queue.push(evt);
    if (state.queue.length >= MAX_BATCH) flush();
  }

  function flush() {
    if (!state.apiKey || state.queue.length === 0) return;
    var events = state.queue.splice(0, state.queue.length);
    var url = state.endpoint.replace(/\/$/, "") + "/api/events/batch";
    var body = JSON.stringify({ events: events });
    var headers = { "content-type": "application/json", "x-api-key": state.apiKey };

    // sendBeacon cannot set custom headers — pass the key via ?key= for it.
    // The x-api-key header remains the preferred path (fetch below).
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      var ok = navigator.sendBeacon(
        url + "?key=" + encodeURIComponent(state.apiKey),
        new Blob([body], { type: "application/json" })
      );
      if (ok) return;
    }
    if (typeof fetch !== "undefined") {
      fetch(url, { method: "POST", headers: headers, body: body, keepalive: true }).catch(
        function () {
          // requeue once on transient failure
          state.queue = events.concat(state.queue);
        }
      );
    }
  }

  function scheduleFlush() {
    if (state.timer || typeof setInterval === "undefined") return;
    state.timer = setInterval(flush, FLUSH_INTERVAL_MS);
  }

  var api = {
    /**
     * @param {{apiKey:string, endpoint?:string, userId?:string, sessionId?:string}} config
     */
    init: function (config) {
      if (!config || !config.apiKey) throw new Error("InsightFlow.init: apiKey is required");
      state.apiKey = config.apiKey;
      state.endpoint = config.endpoint || DEFAULT_ENDPOINT;
      if (config.userId) state.userId = config.userId;
      if (config.sessionId) state.sessionId = config.sessionId;
      state.initialized = true;
      scheduleFlush();
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "hidden") flush();
        });
      }
      return api;
    },

    /** Track an event. Reserved keys become first-class fields; the rest go to properties. */
    track: function (event, props) {
      if (!state.initialized) {
        if (typeof console !== "undefined") console.warn("InsightFlow: call init() first");
        return;
      }
      enqueue(buildEvent(event, props));
    },

    /** Track a page view (convenience). */
    page: function (page) {
      api.track("PAGE_VIEW", { page: page || (global.location ? global.location.pathname : undefined) });
    },

    /** Attach a persistent user id (e.g. after login). */
    identify: function (userId) {
      state.userId = String(userId);
      var store = storage("local");
      if (store) store.setItem("if_user_id", state.userId);
    },

    /** Immediately send any queued events. */
    flush: flush,

    _state: state, // exposed for tests/debugging
  };

  return api;
});
