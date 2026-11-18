/* =========================================================
   storage.js — localStorage wrapper used ONLY for demo-state
   persistence. This is NOT a production database: data lives
   in one browser only and can be cleared at any time.
   Every access is wrapped in try/catch so the app still works
   in private windows or when storage is blocked.
   ========================================================= */
(function () {
  "use strict";
  const PREFIX = "cppLubDemo.v1.";
  let available = true;
  try { const k = PREFIX + "__t"; localStorage.setItem(k, "1"); localStorage.removeItem(k); } catch (e) { available = false; }

  const DemoStore = {
    available: () => available,
    get(key, fallback = null) {
      if (!available) return fallback;
      try { const raw = localStorage.getItem(PREFIX + key); return raw === null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(key, value) {
      if (!available) return false;
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
      catch (e) { console.warn("Demo storage write failed (quota or blocked):", e); return false; }
    },
    remove(key) { if (!available) return; try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ } },
    clearAll() {
      if (!available) return;
      try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    }
  };
  window.DemoStore = DemoStore; // (named to avoid shadowing the browser's built-in window.Storage)
})();
