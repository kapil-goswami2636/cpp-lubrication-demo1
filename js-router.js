/* =========================================================
   router.js — hash-based page router (#/page-id?key=value)
   Pages register themselves: Router.register({ id, title,
   intro, tags, render(el, params) }). Breadcrumbs come from
   the navigation structure.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U;
  const pages = {};
  const R = { current: null, params: {} };

  R.register = (p) => { pages[p.id] = p; };
  R.page = (id) => pages[id];
  R.all = () => pages;

  R.parse = () => {
    const h = location.hash.replace(/^#\/?/, "");
    const [id, qs] = h.split("?");
    const params = {};
    if (qs) qs.split("&").forEach((kv) => { const [k, v] = kv.split("="); if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || ""); });
    return { id: id || "dashboard", params };
  };
  R.go = (id, params = {}) => {
    const qs = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const target = `#/${id}${qs ? "?" + qs : ""}`;
    if (location.hash === target) R.render(); else location.hash = target;
  };

  R.render = () => {
    const { id, params } = R.parse();
    const page = pages[id] || pages.dashboard;
    R.current = page.id; R.params = params;
    window.UI.destroyCharts();
    const head = document.getElementById("pageHead");
    // Fresh container per render so listeners attached by a page never accumulate.
    const old = document.getElementById("page"), el = old.cloneNode(false);
    old.replaceWith(el);
    const crumbs = window.Nav.crumbsFor(page.id);
    head.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/dashboard">Home</a>${crumbs.map((c) => `<span class="sep">/</span>${c.id && c.id !== page.id ? `<a href="#/${c.id}">${U.esc(c.label)}</a>` : `<span>${U.esc(c.label)}</span>`}`).join("")}</nav>
      <div class="page-title-row"><h1>${U.esc(page.title)}</h1><div class="page-tags">${typeof page.tags === "function" ? page.tags() : page.tags || ""}</div></div>
      ${page.intro ? `<p class="page-intro">${page.intro}</p>` : ""}`;
    try { page.render(el, params); }
    catch (err) { console.error(err); el.innerHTML = `<div class="callout danger"><strong>This screen failed to render.</strong> ${U.esc(err.message)}</div>`; }
    window.Nav.setActive(page.id);
    if (window.Guided) window.Guided.sync(page.id, params);
    document.title = `${page.title} — CPP Lubrication Cell`;
  };

  /** One-shot params (e.g. ?new=1, ?view=ID): read once, then removed from the URL so refreshes don't re-trigger them. */
  R.consume = (params, key) => {
    const v = params[key];
    if (v === undefined) return undefined;
    delete params[key];
    const qs = Object.entries(params).map(([k, x]) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`).join("&");
    history.replaceState(null, "", `#/${R.current}${qs ? "?" + qs : ""}`);
    return v;
  };

  /** Re-render the current page after data changes, keeping scroll position. */
  R.refresh = U.debounce(() => { const y = window.scrollY; R.render(); window.scrollTo(0, y); }, 30);

  window.addEventListener("hashchange", () => { R.render(); window.scrollTo(0, 0); document.getElementById("content").focus({ preventScroll: true }); });
  window.Router = R;
})();
