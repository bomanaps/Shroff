export interface ReportRow {
  asset: string;
  price: string;
  change24h: string;
}

export interface Report {
  title: string;
  generatedAt: string;
  rows: ReportRow[];
}

export function buildReport(): Report {
  return {
    title: "Stablecoin Market Snapshot",
    generatedAt: new Date().toISOString(),
    rows: [
      { asset: "USDC", price: "$1.0001", change24h: "+0.01%" },
      { asset: "USDT", price: "$0.9998", change24h: "-0.02%" },
      { asset: "DAI", price: "$1.0003", change24h: "+0.03%" },
      { asset: "PYUSD", price: "$0.9995", change24h: "-0.05%" },
      { asset: "EURC", price: "$1.0842", change24h: "+0.12%" },
    ],
  };
}

export function renderReportPage(report: Report): string {
  const rows = report.rows
    .map(
      (row) =>
        `<tr><td>${row.asset}</td><td>${row.price}</td><td>${row.change24h}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${report.title}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 720px; padding: 0 16px; }
table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
th { background: #f5f5f5; }
.meta { color: #555; }
</style>
</head>
<body>
<h1 data-testid="report-title">${report.title}</h1>
<p class="meta">Generated at <time data-testid="generated-at">${report.generatedAt}</time> · Paid delivery via x402</p>
<table data-testid="report-table">
<thead><tr><th>Asset</th><th>Price</th><th>24h change</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p data-testid="row-count">${report.rows.length} assets covered</p>
</body>
</html>`;
}
