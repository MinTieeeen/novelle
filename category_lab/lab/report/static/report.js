// Theme toggle and chart tooltips. Tooltip text comes from data-tip (JSON array of lines) and is inserted
// with textContent only: labels come from scenario code and must never be parsed as HTML.
(function () {
  const root = document.documentElement;
  const key = "novelle-lab-theme";
  try { const saved = localStorage.getItem(key); if (saved) root.dataset.theme = saved; } catch (e) {}
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      const dark = root.dataset.theme
        ? root.dataset.theme === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem(key, root.dataset.theme); } catch (e) {}
    });
  }

  const tip = document.querySelector(".tooltip");
  if (!tip) return;
  function show(mark, x, y) {
    let lines;
    try { lines = JSON.parse(mark.getAttribute("data-tip") || "[]"); } catch (e) { return; }
    tip.replaceChildren();
    lines.forEach(function (text, i) {
      const row = document.createElement("div");
      if (i === 0) {
        row.className = "tt-value";
        const k = document.createElement("span");
        k.className = "tt-key";
        k.style.background = mark.dataset.series === "redis" ? "var(--series-2)" : "var(--series-1)";
        row.appendChild(k);
      } else {
        row.className = "tt-sub";
      }
      row.appendChild(document.createTextNode(text));
      tip.appendChild(row);
    });
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(x + 14, window.innerWidth - w - 8);
    const top = y + h + 20 > window.innerHeight ? y - h - 12 : y + 14;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }
  function hide() { tip.hidden = true; }
  document.querySelectorAll(".chart .mark").forEach(function (mark) {
    mark.addEventListener("pointermove", function (e) { show(mark, e.clientX, e.clientY); });
    mark.addEventListener("pointerleave", hide);
    mark.addEventListener("focus", function () {
      const r = mark.getBoundingClientRect();
      show(mark, r.left + r.width * 0.6, r.top);
    });
    mark.addEventListener("blur", hide);
  });

  // Printing / PDF export: open every collapsed section so nothing is lost on paper.
  window.addEventListener("beforeprint", function () {
    document.querySelectorAll("details").forEach(function (d) { d.dataset.wasOpen = d.open; d.open = true; });
  });
  window.addEventListener("afterprint", function () {
    document.querySelectorAll("details").forEach(function (d) { d.open = d.dataset.wasOpen === "true"; });
  });
})();
