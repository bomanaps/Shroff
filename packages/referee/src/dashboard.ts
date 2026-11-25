export function renderDashboard(refereeId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shroff Referee</title>
<style>
:root { --bg:#0b0e14; --card:#131824; --ink:#e6e9f0; --dim:#8a93a6; --good:#3fb97f; --bad:#e5534b; --warn:#d9a23d; }
* { box-sizing: border-box; }
body { background:var(--bg); color:var(--ink); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; margin:0; padding:24px 16px; max-width:980px; margin-inline:auto; }
h1 { font-size:20px; margin:0 0 4px; }
.sub { color:var(--dim); font-size:12px; margin-bottom:24px; }
.grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
.card { background:var(--card); border:1px solid #1f2736; border-radius:10px; padding:16px; }
.seller { font-size:13px; word-break:break-all; color:var(--dim); }
.score { font-size:40px; font-weight:700; margin:8px 0; }
.band { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
.band.trusted { background:#10301f; color:var(--good); }
.band.untrusted { background:#331512; color:var(--bad); }
.band.suspicious, .band.unknown { background:#2e2410; color:var(--warn); }
.stats { color:var(--dim); font-size:12px; margin-top:8px; }
h2 { font-size:14px; margin:32px 0 12px; color:var(--dim); text-transform:uppercase; letter-spacing:.08em; }
table { width:100%; border-collapse:collapse; font-size:12px; }
td,th { text-align:left; padding:8px 10px; border-top:1px solid #1f2736; vertical-align:top; }
th { color:var(--dim); font-weight:400; border-top:none; }
.k { font-weight:700; }
.k.delivered { color:var(--good); }
.k.not_delivered { color:var(--bad); }
.sig { color:var(--dim); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
footer { color:var(--dim); font-size:11px; margin-top:28px; }
</style>
</head>
<body>
<h1>Shroff — delivery referee</h1>
<div class="sub">referee ${refereeId} · every verdict below is Ed25519-signed and hash-chained · auto-refreshes</div>
<div class="grid" id="sellers"></div>
<h2>Signed verdict feed</h2>
<table><thead><tr><th>when</th><th>verdict</th><th>seller</th><th>test hash</th><th>signature</th></tr></thead>
<tbody id="feed"></tbody></table>
<footer>Kane CLI is the only judge. Money moves only on its word.</footer>
<script>
async function refresh() {
  try {
    const sellers = await (await fetch('/sellers')).json();
    document.getElementById('sellers').innerHTML = sellers.map(s => \`
      <div class="card">
        <div class="seller">\${s.seller}</div>
        <div class="score">\${s.score === null ? '–' : Math.round(s.score * 100) + '%'}</div>
        <span class="band \${s.band}">\${s.band}</span>
        <div class="stats">\${s.delivered} delivered · \${s.notDelivered} failed · \${s.unverified} unverified · \${s.verdicts} signed verdicts</div>
      </div>\`).join('');
    const feed = await (await fetch('/feed')).json();
    document.getElementById('feed').innerHTML = feed.slice().reverse().map(e => \`
      <tr>
        <td>\${new Date(e.entry.issuedAt).toLocaleTimeString()}</td>
        <td class="k \${e.entry.verdict.kind}">\${e.entry.verdict.kind}</td>
        <td class="sig">\${e.entry.deliveryUrl}</td>
        <td class="sig">\${e.entry.testHash.slice(0, 18)}…</td>
        <td class="sig">\${e.entry.signature.slice(0, 24)}…</td>
      </tr>\`).join('');
  } catch {}
}
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
}
