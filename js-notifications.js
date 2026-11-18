/* =========================================================
   notifications.js — toasts + notification panel rendering
   ========================================================= */
(function () {
  "use strict";
  const U = window.U;
  const N = {};

  /** Transient toast. type: success | error | warning | info */
  N.toast = (title, text = "", type = "info", ms = 4200) => {
    const host = document.getElementById("toasts");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.innerHTML = `<strong>${U.esc(title)}</strong>${text ? `<div>${U.esc(text)}</div>` : ""}`;
    host.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 320); }, ms);
  };
  N.success = (t, x) => N.toast(t, x, "success");
  N.error = (t, x) => N.toast(t, x, "error", 6500);
  N.warn = (t, x) => N.toast(t, x, "warning", 6000);

  /** Show the result of a State operation as a toast. Returns result.ok */
  N.result = (res, successTitle, successText) => {
    if (res && res.ok) { N.success(successTitle, successText || ""); return true; }
    N.error("Action not completed", (res && res.error) || "Unknown error");
    return false;
  };

  N.renderPanel = () => {
    const list = document.getElementById("notifList");
    const items = window.State.db.notifications.slice(0, 40);
    const unread = window.State.db.notifications.filter((n) => !n.read).length;
    const dot = document.getElementById("notifDot");
    dot.hidden = unread === 0; dot.textContent = unread > 99 ? "99+" : unread;
    list.innerHTML = items.length ? items.map((n) => `
      <div class="notif-item sev-${n.sev} ${n.read ? "" : "unread"}" data-notif="${n.id}" data-link="${U.esc(n.link || "")}">
        <span class="ni-dot"></span>
        <div><strong>${U.esc(n.title)}</strong><p>${U.esc(n.text)}</p><time>${U.fmtDateTime(n.at)}</time></div>
      </div>`).join("") : `<div class="empty"><strong>No notifications</strong>Actions you perform will appear here.</div>`;
  };
  N.togglePanel = (show) => {
    const p = document.getElementById("notifPanel");
    p.hidden = show === undefined ? !p.hidden : !show;
    if (!p.hidden) N.renderPanel();
  };

  window.Notify = N;
})();
