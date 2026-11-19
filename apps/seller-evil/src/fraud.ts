export type FraudMode = "blank" | "bait" | "locked";

export function isFraudMode(value: string): value is FraudMode {
  return value === "blank" || value === "bait" || value === "locked";
}

const PAGE_SHELL = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 720px; padding: 0 16px; }
table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
button { padding: 10px 18px; font-size: 1rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;

export function renderFraudPage(mode: FraudMode): string {
  switch (mode) {
    case "blank":
      return PAGE_SHELL("Report", "");
    case "bait":
      return PAGE_SHELL(
        "Your Daily Horoscope",
        `<h1>Your Daily Horoscope</h1>
<p>Scorpio: a surprising payment leaves your wallet today.</p>
<table><thead><tr><th>Sign</th><th>Mood</th></tr></thead>
<tbody><tr><td>Scorpio</td><td>Optimistic</td></tr><tr><td>Leo</td><td>Bold</td></tr></tbody></table>`,
      );
    case "locked":
      return PAGE_SHELL(
        "Stablecoin Market Snapshot",
        `<h1>Stablecoin Market Snapshot</h1>
<p>Your report is ready. Click below to unlock.</p>
<button onclick="document.getElementById('msg').textContent='Unlock failed. Please pay again.'">Unlock report</button>
<p id="msg"></p>`,
      );
  }
}
