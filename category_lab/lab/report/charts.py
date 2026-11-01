"""Inline SVG charts for the report (no JavaScript library, so the HTML file works offline).

timing_chart: one horizontal bar per server_ms variant of a pair, coloured by DBMS (categorical slot 1
= SQL Server, slot 2 = Redis; colours are CSS variables so dark mode swaps them). The bar is the p50,
a thin whisker runs to the p95, the formatted p50 sits at the tip. Every row has a hit area the full
row height carrying a tooltip (handled by report.js) and is keyboard-focusable.
Mark specs follow the dataviz rules: bars 16 px thick with a 4 px rounded data end and a square
baseline, 1 px solid hairline grid, text in ink tokens (never the series colour).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from html import escape

from markupsafe import Markup

from lab.framework.result import Metric

WIDTH = 720
LABEL_W = 170           # left column with the variant name
VALUE_W = 92            # room right of the longest bar for its value label
ROW_H = 30
BAR_H = 16
TOP = 8
AXIS_H = 26
DBMS_NAME = {"sqlserver": "SQL Server", "redis": "Redis"}
SERIES_VAR = {"sqlserver": "var(--series-1)", "redis": "var(--series-2)"}


def fmt_ms(v: float) -> str:
    """Times read best in µs below 1 ms: 0.0029 -> '2.9 µs', 0.377 -> '377 µs', 12.3 -> '12.30 ms'."""
    if v == 0:
        return "0 ms"
    if v < 0.01:
        return f"{v * 1000:.1f} µs"
    if v < 1:
        return f"{v * 1000:.0f} µs"
    if v < 100:
        return f"{v:.2f} ms"
    return f"{v:,.0f} ms"


def fmt_value(m: Metric) -> str:
    if m.unit == "ms":
        return fmt_ms(m.value)
    v = m.value
    text = f"{v:,.0f}" if float(v).is_integer() else f"{v:,.3g}"
    return f"{text} {m.unit}".strip()


def nice_ticks(maximum: float, count: int = 4) -> list[float]:
    if maximum <= 0:
        return [0.0]
    raw = maximum / count
    mag = 10 ** math.floor(math.log10(raw))
    step = next(s * mag for s in (1, 2, 2.5, 5, 10) if s * mag >= raw)
    return [round(i * step, 12) for i in range(int(math.ceil(maximum / step)) + 1)]


@dataclass
class Bar:
    dbms: str
    metric: Metric


def _bar_path(x0: float, y: float, w: float, h: float, r: float = 4) -> str:
    """Square at the baseline (left), rounded data end (right)."""
    w = max(w, 2.0)
    r = min(r, w / 2, h / 2)
    x1 = x0 + w
    return (f"M{x0:.1f},{y:.1f} H{x1 - r:.1f} A{r},{r} 0 0 1 {x1:.1f},{y + r:.1f} "
            f"V{y + h - r:.1f} A{r},{r} 0 0 1 {x1 - r:.1f},{y + h:.1f} H{x0:.1f} Z")


def timing_chart(bars: list[Bar], title: str) -> Markup:
    if not bars:
        return Markup("")
    top_value = max(b.metric.stats.p95 if b.metric.stats else b.metric.value for b in bars)
    ticks = nice_ticks(top_value)
    scale_max = ticks[-1] or 1.0
    plot_w = WIDTH - LABEL_W - VALUE_W
    height = TOP + len(bars) * ROW_H + AXIS_H

    def x(v: float) -> float:
        return LABEL_W + plot_w * v / scale_max

    parts = [f'<svg class="chart" viewBox="0 0 {WIDTH} {height}" role="img" '
             f'aria-label="{escape(title)}: thời gian xử lý phía server, p50 và p95">']
    # gridlines + axis labels (recessive)
    for t in ticks:
        gx = x(t)
        parts.append(f'<line class="grid" x1="{gx:.1f}" x2="{gx:.1f}" y1="{TOP - 4}" '
                     f'y2="{TOP + len(bars) * ROW_H}"/>')
        parts.append(f'<text class="tick" x="{gx:.1f}" y="{height - 8}" text-anchor="middle">'
                     f'{escape(fmt_ms(t) if t else "0")}</text>')
    parts.append(f'<line class="baseline" x1="{LABEL_W}" x2="{LABEL_W}" y1="{TOP - 4}" '
                 f'y2="{TOP + len(bars) * ROW_H}"/>')

    for i, b in enumerate(bars):
        m, s = b.metric, b.metric.stats
        row_y = TOP + i * ROW_H
        bar_y = row_y + (ROW_H - BAR_H) / 2
        p50 = s.p50 if s else m.value
        p95 = s.p95 if s else m.value
        tip = [f"{fmt_ms(p50)} p50", f"{DBMS_NAME[b.dbms]} · {m.label or 'server_ms'}"]
        if s:
            tip += [f"p95 {fmt_ms(s.p95)} · min {fmt_ms(s.min)} · max {fmt_ms(s.max)}", f"n = {s.count}"]
        if m.resolution_ms:
            tip.append(f"độ phân giải ~{fmt_ms(m.resolution_ms)}" + (" (thô so với giá trị)" if m.coarse else ""))
        parts.append(f'<g class="mark" tabindex="0" data-tip="{escape(json.dumps(tip, ensure_ascii=False))}" '
                     f'data-series="{b.dbms}">')
        parts.append(f'<rect class="hit" x="0" y="{row_y}" width="{WIDTH}" height="{ROW_H}"/>')
        parts.append(f'<text class="row-label" x="{LABEL_W - 10}" y="{row_y + ROW_H / 2 + 4:.1f}" '
                     f'text-anchor="end">{escape(m.label or "server_ms")}</text>')
        parts.append(f'<path class="bar" d="{_bar_path(LABEL_W, bar_y, x(p50) - LABEL_W, BAR_H)}" '
                     f'style="fill:{SERIES_VAR[b.dbms]}"/>')
        if p95 > p50:
            cy = bar_y + BAR_H / 2
            parts.append(f'<line class="whisker" x1="{x(p50):.1f}" x2="{x(p95):.1f}" y1="{cy:.1f}" y2="{cy:.1f}"/>')
            parts.append(f'<line class="whisker" x1="{x(p95):.1f}" x2="{x(p95):.1f}" y1="{cy - 4:.1f}" '
                         f'y2="{cy + 4:.1f}"/>')
        label = fmt_ms(p50) + ("*" if m.coarse else "")
        parts.append(f'<text class="value" x="{max(x(p50), x(p95)) + 6:.1f}" y="{row_y + ROW_H / 2 + 4:.1f}">'
                     f'{escape(label)}</text>')
        parts.append("</g>")
    parts.append("</svg>")
    return Markup("".join(parts))
