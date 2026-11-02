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

  // SQL Server / Redis tabs of each pair (WAI-ARIA tabs: click, or Left/Right/Home/End on the tab list).
  document.querySelectorAll(".code-tabs").forEach(function (list) {
    const tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        const on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(tab, false); });
      tab.addEventListener("keydown", function (e) {
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length], true);
      });
    });
  });

  // "Sao chép" copies the statement text (falls back to selecting it when the clipboard is unavailable).
  document.querySelectorAll(".stmt .copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const code = btn.closest(".stmt").querySelector("code");
      const done = function () { btn.textContent = "Đã chép"; setTimeout(function () { btn.textContent = "Sao chép"; }, 1500); };
      const select = function () {
        const range = document.createRange(); range.selectNodeContents(code);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code.textContent).then(done, select);
      } else {
        select();
      }
    });
  });

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

// Editable comments. Only active when the page was served by `lab serve`, which adds
// <meta name="lab-token">; a report opened as a file stays read-only. All text goes through
// .value / textContent, never innerHTML.
(function () {
  const meta = document.querySelector('meta[name="lab-token"]');
  const comments = Array.prototype.slice.call(document.querySelectorAll(".comment"));
  if (!meta || !location.protocol.startsWith("http")) {
    comments.forEach(function (c) {
      const area = c.querySelector(".comment-text");
      if (!area.value) area.placeholder = "Chưa có nhận xét.";
    });
    return;
  }
  const token = meta.content;
  const topic = document.body.dataset.topic;
  const bar = document.querySelector(".edit-bar");
  const barStatus = bar.querySelector(".edit-bar-status");
  const saveBtn = bar.querySelector(".save-notes");
  document.body.classList.add("editable");
  bar.hidden = false;

  function post(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Lab-Token": token },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
        return data;
      });
    });
  }

  function dirtyCount() {
    return comments.filter(function (c) { return c.classList.contains("dirty"); }).length;
  }
  function refreshBar(text, isError) {
    const n = dirtyCount();
    barStatus.textContent = text || (n ? n + " nhận xét chưa lưu" : "Đã lưu hết thay đổi");
    barStatus.classList.toggle("error", !!isError);
    saveBtn.disabled = n === 0;
  }
  function setStatus(c, text, isError) {
    const el = c.querySelector(".comment-status");
    el.textContent = text;
    el.classList.toggle("error", !!isError);
  }

  comments.forEach(function (c) {
    const area = c.querySelector(".comment-text");
    const btn = c.querySelector(".ai-suggest");
    const btnText = btn.querySelector(".ai-suggest-text");
    area.readOnly = false;
    area.dataset.saved = area.value;
    btn.disabled = false;
    btn.title = "Nhờ Gemini viết đề xuất từ số liệu của topic; nội dung đang có được dùng làm bản nháp";
    area.addEventListener("input", function () {
      c.classList.toggle("dirty", area.value !== area.dataset.saved);
      refreshBar();
    });
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.classList.add("busy");
      btnText.textContent = "Đang hỏi Gemini…";
      setStatus(c, "");
      post("/api/suggest", { topic: topic, id: c.dataset.commentId, draft: area.value })
        .then(function (data) {
          area.value = data.text;
          c.classList.toggle("dirty", area.value !== area.dataset.saved);
          setStatus(c, "Đề xuất từ " + data.model + ". Hãy đọc, sửa cho đúng ý rồi bấm Lưu.");
          refreshBar();
          area.focus();
        })
        .catch(function (err) { setStatus(c, "Không tạo được gợi ý: " + err.message, true); })
        .finally(function () {
          btn.disabled = false;
          btn.classList.remove("busy");
          btnText.textContent = "Gợi ý bằng Gemini";
        });
    });
  });

  saveBtn.addEventListener("click", function () {
    const payload = {};
    comments.forEach(function (c) { payload[c.dataset.commentId] = c.querySelector(".comment-text").value; });
    saveBtn.disabled = true;
    refreshBar("Đang lưu…");
    post("/api/notes", { topic: topic, comments: payload })
      .then(function (data) {
        comments.forEach(function (c) {
          const area = c.querySelector(".comment-text");
          area.dataset.saved = area.value;
          c.classList.remove("dirty");
        });
        refreshBar("Đã lưu vào " + data.notes + " và cập nhật " + data.report);
      })
      .catch(function (err) { refreshBar("Lưu thất bại: " + err.message, true); saveBtn.disabled = false; });
  });

  window.addEventListener("beforeunload", function (e) {
    if (dirtyCount()) { e.preventDefault(); e.returnValue = ""; }
  });
  refreshBar();
})();
