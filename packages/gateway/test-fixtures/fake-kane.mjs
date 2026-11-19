#!/usr/bin/env node
const mode = process.env.FAKE_KANE_MODE ?? "pass";

const runEnd = (status) =>
  JSON.stringify({
    v: 1,
    ts: new Date().toISOString(),
    type: "run_end",
    status,
    summary: status === "passed" ? "fixture pass" : "fixture fail",
    session_dir: "/tmp/fake-session",
    credits_consumed: 1,
  });

const writeAndExit = (data, code) => {
  process.stdout.write(data, () => process.exit(code));
};

switch (mode) {
  case "pass":
    writeAndExit(runEnd("passed") + "\n", 0);
    break;
  case "fail":
    writeAndExit(runEnd("failed") + "\n", 1);
    break;
  case "pass-no-newline":
    writeAndExit(runEnd("passed"), 0);
    break;
  case "self-kill":
    process.stdout.write(runEnd("passed") + "\n", () => {
      process.kill(process.pid, "SIGKILL");
    });
    break;
  case "hang":
    setInterval(() => {}, 1000);
    break;
  default:
    process.exit(2);
}
