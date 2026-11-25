"use strict";

const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */

function middleTrunc(value, head, tail) {
  if (typeof value !== "string" || value.length <= head + tail + 1) {
    return `<span class="mono2">${esc(value ?? "")}</span>`;
  }
  return `<span class="trunc mono2" aria-label="${esc(value)}" title="${esc(value)}">` +
    `<span class="head">${esc(value.slice(0, head))}</span>` +
    `<span class="tail">…${esc(value.slice(-tail))}</span></span>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function copyChip(button, text) {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.classList.add("copied");
      setTimeout(() => button.classList.remove("copied"), 1200);
    } catch {}
  });
}

function tween(el, from, to) {
  const start = performance.now();
  const dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 640;
  function frame(now) {
    const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function flashCounter(card, cls) {
  card.classList.add(cls);
  setTimeout(() => card.classList.remove(cls), 1600);
}

/* ---------- identity ---------- */

async function loadIdentity() {
  const r = await fetch("/identity");
  const id = await r.json();
  $("identicon").innerHTML = shroffIdenticon(id.referee_id, 34);
  $("referee-id").textContent = id.referee_id.slice(0, 6) + "…" + id.referee_id.slice(-4);
  copyChip($("referee-chip"), id.referee_id);
}

/* ---------- counters ---------- */

const counts = { settled: 0, refused: 0, verdicts: 0 };

function setCount(key, value, flashClass) {
  if (value === counts[key]) return;
  const el = $("c-" + key);
  tween(el, counts[key], value);
  counts[key] = value;
  if (flashClass) flashCounter(el.closest(".counter"), flashClass);
  window.shroffScene?.setCounts(counts.settled, counts.refused);
}

/* ---------- sellers ---------- */

function gauge(score, band) {
  const r = 44;
  const cx = 56, cy = 60;
  const startAngle = 200, sweep = 220;
  const circumference = (sweep / 360) * 2 * Math.PI * r;
  const frac = score === null ? 0 : Math.max(0, Math.min(1, score));
  const color = band === "trusted" ? "var(--ok-fill)" : band === "untrusted" ? "var(--bad-fill)" : "var(--warn-text)";
  const label = score === null ? "–" : Math.round(score * 100) + "%";
  const d = describeArc(cx, cy, r, startAngle, startAngle + sweep);
  return `<svg class="gauge" viewBox="0 0 112 86" role="img" aria-label="trust score ${label}">
    <path class="track" d="${d}" fill="none" stroke-width="8" stroke-linecap="round"/>
    <path class="fill-arc" d="${d}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - frac)}"/>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="20">${label}</text>
  </svg>`;
}

function describeArc(cx, cy, r, a0, a1) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function renderSellers(sellers, history) {
  $("sellers").innerHTML = sellers.map((s) => {
    const ticks = (history.get(s.seller) ?? [])
      .slice(-14)
      .map((k) => `<i class="${k === "delivered" ? "ok" : k === "not_delivered" ? "bad" : ""}"></i>`)
      .join("");
    const glyph = s.band === "trusted" ? "✓" : s.band === "untrusted" ? "✕" : "·";
    return `<div class="seller-card">
      ${gauge(s.score, s.band)}
      <div class="seller-meta">
        <div class="seller-host" title="${esc(s.seller)}">${esc(s.seller)}</div>
        <span class="band-pill ${s.band}">${glyph} ${s.band}</span>
      </div>
      <div class="seller-stats">
        <span>${s.delivered} delivered</span>
        <span>${s.notDelivered} failed</span>
        <span>${s.verdicts} sealed</span>
        <span class="ticks" title="recent verdicts">${ticks}</span>
        <span>policy: always</span>
      </div>
    </div>`;
  }).join("");
}

/* ---------- ledger ---------- */

const knownSeq = new Set();

function outcomeCell(row) {
  const o = row.outcome;
  if (!o) {
    return row.entry.verdict.settleable
      ? `<span class="rail-tag">awaiting</span>`
      : `<span class="rail-tag">refused</span>`;
  }
  return `<span class="rail-tag">${esc(o.rail)} · ${esc(o.status)}</span>`;
}

function kindCell(kind) {
  if (kind === "delivered") return `<span class="kind ok">✓ delivered</span>`;
  if (kind === "not_delivered") return `<span class="kind bad">✕ not delivered</span>`;
  return `<span class="kind dim">○ ${esc(kind.replace("_", " "))}</span>`;
}

function proofSheet(row) {
  const e = row.entry;
  const o = row.outcome;
  const session = e.evidenceDir ? e.evidenceDir.split("/").at(-1) : null;
  const txHtml = o && o.transaction
    ? (o.rail === "x402-usdc"
        ? `<a class="tx-link mono2" href="https://sepolia.basescan.org/tx/${esc(o.transaction)}" target="_blank" rel="noreferrer">${esc(o.transaction.slice(0, 10))}…${esc(o.transaction.slice(-8))} ↗</a>`
        : `<span class="mono2">${esc(o.transaction)}</span>`)
    : "n/a";
  return `<div class="proof">
    <div class="summary">${esc(e.verdict.summary)}</div>
    <dl class="proof-grid">
      <dt>delivery</dt><dd>${middleTrunc(e.deliveryUrl, 34, 8)}</dd>
      <dt>promise (test)</dt><dd><a class="chip" href="/promise" target="_blank" rel="noreferrer" title="read the seller's promise and its compiled Kane test">${esc(e.testHash.slice(0, 22))}… ↗</a></dd>
      <dt>signed by</dt><dd><button class="chip" data-copy="${esc(e.refereeId)}">${esc(e.refereeId)}</button></dd>
      <dt>signature</dt><dd><button class="chip" data-copy="${esc(e.signature)}">${esc(e.signature.slice(0, 16))}…${esc(e.signature.slice(-8))}</button></dd>
      <dt>settlement</dt><dd>${txHtml}</dd>
    </dl>
    <div class="shots" data-session="${session ?? ""}"></div>
    <div class="verify-cmd"><span>npx shroff-verify-ledger  <span style="color:var(--ink-2)"># verify this chain yourself</span></span></div>
  </div>`;
}

function addLedgerRow(row, fresh) {
  if (knownSeq.has(row.seq)) {
    const existing = document.querySelector(`[data-seq="${row.seq}"]`);
    if (existing) {
      const tag = existing.querySelector(".outcome-cell");
      if (tag) tag.innerHTML = outcomeCell(row);
    }
    return;
  }
  knownSeq.add(row.seq);
  const e = row.entry;
  const div = document.createElement("div");
  div.className = "ledger-row" + (fresh ? " fresh" : "");
  div.dataset.seq = String(row.seq);
  div.innerHTML = `<button aria-expanded="false">
      <span class="when">${new Date(e.issuedAt).toLocaleTimeString()}</span>
      ${kindCell(e.verdict.kind)}
      <span class="seller">${esc(e.deliveryUrl)}</span>
      <span class="outcome-cell">${outcomeCell(row)}</span>
      <span class="caret">›</span>
    </button>${proofSheet(row)}`;

  const toggle = div.querySelector("button");
  toggle.addEventListener("click", (ev) => {
    if (ev.target.closest(".chip, .tx-link")) return;
    const open = div.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    if (open) loadShots(div);
  });
  for (const chip of div.querySelectorAll(".chip[data-copy]")) {
    copyChip(chip, chip.dataset.copy);
  }
  $("ledger").prepend(div);
  setCount("verdicts", counts.verdicts + 1, null);
}

async function loadShots(rowEl) {
  const holder = rowEl.querySelector(".shots");
  const session = holder.dataset.session;
  if (!session || holder.childElementCount > 0) return;
  const shots = await (await fetch(`/evidence/${session}`)).json();
  holder.innerHTML = shots.slice(0, 8).map((u) =>
    `<img src="${esc(u)}" loading="lazy" alt="evidence step screenshot">`).join("");
  for (const img of holder.querySelectorAll("img")) {
    img.addEventListener("click", () => {
      $("lightbox-img").src = img.src;
      $("lightbox").classList.add("on");
    });
  }
}

$("lightbox").addEventListener("click", () => $("lightbox").classList.remove("on"));

/* ---------- live stage ---------- */

const stage = $("stage");
const stepsEl = $("steps");
let currentSession = null;
let shotTimer = null;

function stageReset(title, seller, rail) {
  const txEl = $("verdict-tx");
  if (txEl) {
    txEl.hidden = true;
    txEl.textContent = "";
  }
  stage.classList.remove("sealed-ok", "sealed-bad");
  stage.classList.add("live");
  $("stage-title").textContent = title;
  $("stage-seller").textContent = seller ?? "";
  $("stage-rail").textContent = rail ? rail : "";
  $("verdict-banner").className = "verdict-banner";
  stepsEl.innerHTML = "";
  $("shot").innerHTML = `<span class="placeholder">waiting for the browser…</span>`;
}

function stageStep(data) {
  stepsEl.querySelector(".idle-note")?.remove();
  const prior = stepsEl.querySelector(`[data-step="${data.step}"]`);
  const mark = data.status === "done" ? "✓" : data.status === "failed" ? "✕" : "";
  const priorText = prior ? (prior.querySelector(".txt")?.textContent ?? "") : "";
  const text = data.remark && data.remark.trim() !== "" ? data.remark : priorText;
  const html = `<span class="n">${data.step}</span>` +
    (data.status === "running" ? `<span class="spin"></span>` : `<span class="mark">${mark}</span>`) +
    `<span class="txt">${esc(text)}</span>`;
  if (prior) {
    prior.className = `step-row ${data.status}`;
    prior.innerHTML = html;
  } else {
    const div = document.createElement("div");
    div.className = `step-row ${data.status}`;
    div.dataset.step = String(data.step);
    div.innerHTML = html;
    stepsEl.appendChild(div);
  }
  stepsEl.scrollTop = stepsEl.scrollHeight;
}

function stageVerdict(data) {
  stage.classList.remove("live");
  for (const spin of stepsEl.querySelectorAll(".step-row.running .spin")) {
    spin.remove();
  }
  const ok = data.kind === "delivered";
  stage.classList.add(ok ? "sealed-ok" : "sealed-bad");
  const banner = $("verdict-banner");
  banner.className = "verdict-banner on " + (ok ? "ok" : "bad");
  $("verdict-glyph").textContent = ok ? "✓" : "✕";
  $("verdict-text").textContent = ok
    ? "Delivered. Verdict sealed, settlement may proceed"
    : "Not delivered. Verdict sealed, settlement refused";
  $("verdict-detail").textContent = (data.summary ?? "").split("\n")[0];
  if (data.evidenceSession) {
    currentSession = data.evidenceSession;
    showLatestShot();
  }
  if (!ok) setCount("refused", counts.refused + 1, "flash-bad");
  refreshAll();
}

async function showLatestShot() {
  if (!currentSession) return;
  const shots = await (await fetch(`/evidence/${currentSession}`)).json();
  if (shots.length === 0) return;
  $("shot").innerHTML =
    `<img alt="latest browser evidence"><span class="shot-count">${shots.length} steps captured</span>`;
  const img = $("shot").querySelector("img");
  img.src = shots[shots.length - 1];
  img.onload = () => img.classList.add("on");
  img.addEventListener("click", () => {
    $("lightbox-img").src = img.src;
    $("lightbox").classList.add("on");
  });
}

/* ---------- SSE ---------- */

function connect() {
  const es = new EventSource("/events");
  es.onmessage = (msg) => {
    const ev = JSON.parse(msg.data);
    if (ev.kind === "run_start") {
      stageReset("Kane is verifying a delivery", ev.data.seller, ev.data.rail);
      window.shroffScene?.startScan();
    } else if (ev.kind === "step") {
      stageStep(ev.data);
    } else if (ev.kind === "verdict") {
      stageVerdict(ev.data);
      window.shroffScene?.verdict(ev.data.kind === "delivered");
      document.dispatchEvent(new Event("shroff:verdict"));
    } else if (ev.kind === "outcome") {
      if (ev.data.status === "settled" || ev.data.status === "captured") {
        setCount("settled", counts.settled + 1, "flash-ok");
      }
      const txEl = $("verdict-tx");
      if (txEl && ev.data.transaction) {
        if (ev.data.rail === "x402-usdc") {
          txEl.href = `https://sepolia.basescan.org/tx/${ev.data.transaction}`;
          txEl.textContent = `settled on-chain: ${ev.data.transaction.slice(0, 10)}…${ev.data.transaction.slice(-6)} ↗`;
        } else {
          txEl.removeAttribute("href");
          txEl.textContent = `Stripe sandbox ${ev.data.status}: ${ev.data.transaction}`;
        }
        txEl.hidden = false;
      }
      if (ev.data.status === "buyer_refused") {
        const note = $("console-note");
        if (note) note.textContent = "the buyer checked this seller's record and refused to even pay";
      }
      refreshAll();
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connect, 2000);
  };
}

/* ---------- data refresh ---------- */

async function refreshAll() {
  const [sellers, feed] = await Promise.all([
    (await fetch("/sellers")).json(),
    (await fetch("/feed")).json(),
  ]);

  const history = new Map();
  for (const row of feed) {
    const origin = new URL(row.entry.deliveryUrl).origin;
    if (!history.has(origin)) history.set(origin, []);
    history.get(origin).push(row.entry.verdict.kind);
  }
  renderSellers(sellers, history);

  let settled = 0, refused = 0;
  for (const row of feed) {
    addLedgerRow(row, knownSeq.size > 0 && !knownSeq.has(row.seq));
    if (row.outcome && (row.outcome.status === "settled" || row.outcome.status === "captured")) settled++;
    if (!row.entry.verdict.settleable) refused++;
  }
  if (counts.settled === 0 && settled > 0) setCount("settled", settled, null);
  if (counts.refused === 0 && refused > 0) setCount("refused", refused, null);

  $("chain-label").textContent = `ledger · ${feed.length} sealed`;
}

/* ---------- demo console ---------- */

async function initConsole() {
  const panel = $("console");
  const probe = await fetch("/demo/buy", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (probe.status === 404) return;
  panel.hidden = false;
  const note = $("console-note");
  const buttons = panel.querySelectorAll("button.buy");
  const setBusy = (busy, message) => {
    for (const b of buttons) b.disabled = busy;
    note.textContent = message ?? "";
  };
  for (const button of buttons) {
    button.addEventListener("click", async () => {
      setBusy(true, "payment in flight, watch the stage above");
      const r = await fetch("/demo/buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: button.dataset.target }),
      });
      if (!r.ok) setBusy(false, "busy, one purchase at a time");
    });
  }
  document.addEventListener("shroff:verdict", () => setTimeout(() => setBusy(false, ""), 4000));
}

loadIdentity();
refreshAll();
connect();
initConsole();
