"""Draws the forecast fan chart on the home page.

Data: Oceanic Nino Index from NOAA CPC, snapshot in scripts/data/oni.csv.
https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt

Model: a latent AR(2) signal observed with noise, in state-space form.
    y[t] = x[t] + e[t],                     e[t] ~ N(0, r)
    x[t] = phi1 x[t-1] + phi2 x[t-2] + u[t],  u[t] ~ N(0, q)
Parameters are fitted by maximising the Kalman filter likelihood. The index is
already a three-month mean, so the fit leaves almost no observation noise.

Standard library only, so it needs no setup:
    python scripts/fan_chart.py
Writes _fan-chart.md (inline SVG for index.qmd) and the blog thumbnail.
"""

import csv
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "scripts" / "data" / "oni.csv"
HORIZON = 24
HISTORY = 120
Z50 = 0.6745
Z90 = 1.6449


def read_series():
    with DATA.open(newline="") as f:
        rows = list(csv.DictReader(f))
    return [(int(r["year"]), int(r["month"])) for r in rows], [float(r["anom"]) for r in rows]


def predict(state, P, phi1, phi2, q):
    """One Kalman time update for the two-element companion state."""
    a, b = state
    state = [phi1 * a + phi2 * b, a]
    p00, p01, p11 = P
    P = [
        phi1**2 * p00 + 2 * phi1 * phi2 * p01 + phi2**2 * p11 + q,
        phi1 * p00 + phi2 * p01,
        p00,
    ]
    return state, P


def kalman(y, phi1, phi2, q, r):
    """Returns the log likelihood and the final filtered state."""
    state, P = [0.0, 0.0], [10.0, 0.0, 10.0]
    loglik = 0.0
    for obs in y:
        state, P = predict(state, P, phi1, phi2, q)
        innovation = obs - state[0]
        s = P[0] + r
        loglik -= 0.5 * (math.log(2 * math.pi * s) + innovation**2 / s)
        k0, k1 = P[0] / s, P[1] / s
        state = [state[0] + k0 * innovation, state[1] + k1 * innovation]
        P = [P[0] - k0 * P[0], P[1] - k0 * P[1], P[2] - k1 * P[1]]
    return loglik, state, P


def fit(y):
    """Pattern search on (phi1, phi2, log q, log r)."""
    theta = [1.5, -0.6, math.log(0.02), math.log(0.01)]
    step = [0.1, 0.1, 0.5, 0.5]

    def objective(t):
        return kalman(y, t[0], t[1], math.exp(t[2]), math.exp(t[3]))[0]

    best = objective(theta)
    while max(step) > 1e-3:
        improved = False
        for i in range(4):
            for sign in (1, -1):
                trial = list(theta)
                trial[i] += sign * step[i]
                value = objective(trial)
                if value > best:
                    theta, best, improved = trial, value, True
                    break
        if not improved:
            step = [s / 2 for s in step]
    return theta[0], theta[1], math.exp(theta[2]), math.exp(theta[3]), best


def forecast(state, P, phi1, phi2, q, r, horizon):
    means, sds = [], []
    for _ in range(horizon):
        state, P = predict(state, P, phi1, phi2, q)
        means.append(state[0])
        sds.append(math.sqrt(P[0] + r))
    return means, sds


def polyline(points):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def band(xs, lower, upper, sy):
    top = [(x, sy(v)) for x, v in zip(xs, upper)]
    bottom = [(x, sy(v)) for x, v in zip(reversed(xs), reversed(lower))]
    return polyline(top + bottom)


def hero_svg(dates, y, means, sds, width=1200, height=300, history_n=HISTORY, name="fan-wide", year_step=2):
    """Two sizes are emitted: CSS shows the compact one on phones, so text stays legible."""
    left, right, top, bottom = round(width * 0.045), 6, 22, 30
    hist = y[-history_n:]
    hist_dates = dates[-history_n:]
    n = len(hist) + HORIZON
    last = len(hist) - 1

    lows = [m - Z90 * s for m, s in zip(means, sds)] + hist
    highs = [m + Z90 * s for m, s in zip(means, sds)] + hist
    vmin, vmax = min(lows), max(highs)

    def sx(i):
        return left + i * (width - left - right) / (n - 1)

    def sy(v):
        return top + (vmax - v) * (height - top - bottom) / (vmax - vmin)

    xs = [sx(last)] + [sx(last + 1 + i) for i in range(HORIZON)]
    start = hist[-1]
    mean = [start] + means
    lo50 = [start] + [m - Z50 * s for m, s in zip(means, sds)]
    hi50 = [start] + [m + Z50 * s for m, s in zip(means, sds)]
    lo90 = [start] + [m - Z90 * s for m, s in zip(means, sds)]
    hi90 = [start] + [m + Z90 * s for m, s in zip(means, sds)]

    history = polyline((sx(i), sy(v)) for i, v in enumerate(hist))
    centre = polyline(zip(xs, map(sy, mean)))

    axis = []
    for v in range(math.ceil(vmin), math.floor(vmax) + 1):
        cls = "fan-zero" if v == 0 else "fan-grid"
        text = "0" if v == 0 else f"{v:+d}".replace("-", "−")
        axis.append(
            f'<line class="{cls}" x1="{left}" x2="{width - right}" y1="{sy(v):.1f}" y2="{sy(v):.1f}"/>'
            f'<text class="fan-ytick" x="{left - 8}" y="{sy(v) + 5:.1f}">{text}</text>'
        )
    axis.append(f'<text class="fan-unit" x="{left}" y="12">ONI, °C</text>')
    ticks = []
    for i, (year, month) in enumerate(hist_dates):
        if month == 1 and year % year_step == 0:
            ticks.append(
                f'<text class="fan-tick" x="{sx(i):.1f}" y="{height - 6}">{year}</text>'
            )
    future_year = hist_dates[-1][0] + 1
    future_i = last + (13 - hist_dates[-1][1])
    ticks.append(
        f'<text class="fan-tick" x="{sx(future_i):.1f}" y="{height - 6}">{future_year}</text>'
    )

    span = "ten" if history_n == HISTORY else "four"
    label = (
        f"Oceanic Nino Index in degrees Celsius for the last {span} years, followed by a 24-month "
        "forecast whose 50% and 90% intervals widen with the horizon."
    )
    return (
        f'<svg class="fan-chart {name}" viewBox="0 0 {width} {height}" role="img" aria-label="{label}">'
        + "".join(axis)
        + f'<polygon class="fan-90" points="{band(xs, lo90, hi90, sy)}"/>'
        f'<polygon class="fan-50" points="{band(xs, lo50, hi50, sy)}"/>'
        f'<polyline class="fan-history" points="{history}"/>'
        f'<polyline class="fan-mean" points="{centre}"/>'
        f'<circle class="fan-now" cx="{sx(last):.1f}" cy="{sy(start):.1f}" r="4.5"/>'
        + "".join(ticks)
        + "</svg>"
    )


def thumbnail_svg(y, means, sds):
    """Same chart without text, with fixed colours, for use in an img tag."""
    width, height = 480, 270
    hist = y[-48:]
    n = len(hist) + HORIZON
    last = len(hist) - 1
    lows = [m - Z90 * s for m, s in zip(means, sds)] + hist
    highs = [m + Z90 * s for m, s in zip(means, sds)] + hist
    vmin, vmax = min(lows), max(highs)

    def sx(i):
        return 16 + i * (width - 32) / (n - 1)

    def sy(v):
        return 20 + (vmax - v) * (height - 40) / (vmax - vmin)

    xs = [sx(last)] + [sx(last + 1 + i) for i in range(HORIZON)]
    start = hist[-1]
    lo90 = [start] + [m - Z90 * s for m, s in zip(means, sds)]
    hi90 = [start] + [m + Z90 * s for m, s in zip(means, sds)]
    lo50 = [start] + [m - Z50 * s for m, s in zip(means, sds)]
    hi50 = [start] + [m + Z50 * s for m, s in zip(means, sds)]
    history = polyline((sx(i), sy(v)) for i, v in enumerate(hist))
    centre = polyline(zip(xs, map(sy, [start] + means)))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">'
        f'<rect width="{width}" height="{height}" fill="#e9efee"/>'
        f'<polygon fill="#1f6f78" fill-opacity=".18" points="{band(xs, lo90, hi90, sy)}"/>'
        f'<polygon fill="#1f6f78" fill-opacity=".34" points="{band(xs, lo50, hi50, sy)}"/>'
        f'<polyline fill="none" stroke="#3b3f45" stroke-width="2.5" points="{history}"/>'
        f'<polyline fill="none" stroke="#c9822b" stroke-width="3" points="{centre}"/>'
        "</svg>\n"
    )


def main():
    dates, y = read_series()
    phi1, phi2, q, r, loglik = fit(y)
    _, state, P = kalman(y, phi1, phi2, q, r)
    means, sds = forecast(state, P, phi1, phi2, q, r, HORIZON)
    print(
        f"n={len(y)} last={dates[-1]} phi1={phi1:.3f} phi2={phi2:.3f} "
        f"q={q:.4f} r={r:.4f} loglik={loglik:.1f}"
    )
    print(f"forecast h=1 {means[0]:.2f}, h=12 {means[11]:.2f}, h=24 {means[23]:.2f}")

    svg = hero_svg(dates, y, means, sds) + hero_svg(
        dates, y, means, sds, width=600, height=400, history_n=48, name="fan-compact", year_step=1
    )
    (ROOT / "_fan-chart.md").write_text("```{=html}\n" + svg + "\n```\n", encoding="utf-8")
    thumb = ROOT / "blog" / "posts" / "welcome" / "signal.svg"
    thumb.write_text(thumbnail_svg(y, means, sds), encoding="utf-8")


if __name__ == "__main__":
    main()
