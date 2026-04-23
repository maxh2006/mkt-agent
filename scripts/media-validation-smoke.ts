/**
 * scripts/media-validation-smoke.ts
 *
 * Live smoke test for src/lib/manus/media-validation.ts. Exercises
 * every MediaValidationReason branch against real URLs + known
 * private IPs + deliberately invalid inputs, and asserts each case
 * matches the documented expected outcome.
 *
 * Runs outside the app — no Prisma, no network to the VM. Uses
 * httpbin.org as a long-lived public test endpoint for the happy
 * path and the 404 case. Private-host cases short-circuit on the
 * syntactic check (no actual DNS/fetch), so they don't rely on
 * network state.
 *
 * Usage:
 *   npm run media:smoke
 *
 * Exit code: 0 if all cases matched, 1 on any mismatch.
 */

import {
  validateMediaUrl,
  validateMediaUrls,
  type MediaValidationReason,
} from "../src/lib/manus/media-validation";

// "pass" = expect null (URL is fine)
// Anything else = expected MediaValidationReason
type Expected = "pass" | MediaValidationReason;

interface Case {
  name: string;
  url: string;
  expected: Expected;
}

const cases: Case[] = [
  {
    name: "public 200 (httpbin)",
    url: "https://httpbin.org/status/200",
    expected: "pass",
  },
  {
    name: "public 404 (httpbin)",
    url: "https://httpbin.org/status/404",
    expected: "http_error",
  },
  {
    name: "localhost",
    url: "http://localhost:8080/x.png",
    expected: "private_host",
  },
  {
    name: "loopback 127.0.0.1",
    url: "http://127.0.0.1/x.png",
    expected: "private_host",
  },
  {
    name: "RFC1918 10.0.0.1",
    url: "http://10.0.0.1/x.png",
    expected: "private_host",
  },
  {
    name: "RFC1918 192.168.1.1",
    url: "http://192.168.1.1/x.png",
    expected: "private_host",
  },
  {
    name: "link-local 169.254.1.1",
    url: "http://169.254.1.1/x.png",
    expected: "private_host",
  },
  {
    name: "IPv6 loopback ::1",
    url: "http://[::1]/x.png",
    expected: "private_host",
  },
  {
    name: ".local mDNS suffix",
    url: "http://printer.local/x.png",
    expected: "private_host",
  },
  {
    name: "nonexistent domain (.invalid TLD reserved)",
    url: "https://mkt-agent-nonexistent-abc123.invalid/x.png",
    expected: "unreachable",
  },
  {
    name: "invalid URL syntax",
    url: "not a url",
    expected: "invalid_url",
  },
  {
    name: "unsupported scheme (ftp)",
    url: "ftp://example.com/x.png",
    expected: "unsupported_scheme",
  },
  {
    name: "unsupported scheme (file)",
    url: "file:///etc/passwd",
    expected: "unsupported_scheme",
  },
];

interface Row {
  name: string;
  expected: Expected;
  actual: Expected;
  status?: number;
  message?: string;
  ok: boolean;
}

async function main() {
  console.log("─".repeat(72));
  console.log(`media-validation smoke — ${cases.length} cases`);
  console.log("─".repeat(72));

  // Edge cases up front — no network expected.
  const empty = await validateMediaUrls([]);
  if (!empty.ok || empty.checked.length !== 0 || empty.issues.length !== 0) {
    console.error("✗ empty-array case FAILED:", empty);
    process.exit(1);
  }
  console.log("✓ empty-array case: ok=true, checked=[], issues=[]");

  const dedup = await validateMediaUrls([
    "https://httpbin.org/status/200",
    "https://httpbin.org/status/200",
  ]);
  if (dedup.checked.length !== 1) {
    console.error("✗ dedup case FAILED:", dedup);
    process.exit(1);
  }
  console.log(`✓ dedup case: 2 inputs → ${dedup.checked.length} unique checked`);

  // Run all cases concurrently.
  const results = await Promise.all(
    cases.map(async (c): Promise<Row> => {
      const issue = await validateMediaUrl(c.url, { timeoutMs: 7000 });
      const actual: Expected = issue === null ? "pass" : issue.reason;
      return {
        name: c.name,
        expected: c.expected,
        actual,
        status: issue?.http_status,
        message: issue?.message,
        ok: actual === c.expected,
      };
    }),
  );

  console.log("");
  console.log(
    `case`.padEnd(44) + `${"expected".padEnd(20)}${"actual".padEnd(20)}detail`,
  );
  console.log("─".repeat(110));
  for (const r of results) {
    const marker = r.ok ? "✓" : "✗";
    const detail = r.message
      ? `${r.status ? `status=${r.status} ` : ""}${r.message.slice(0, 50)}`
      : "";
    console.log(
      `${marker} ${r.name.padEnd(42)}${r.expected.padEnd(20)}${r.actual.padEnd(20)}${detail}`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("─".repeat(110));
  if (failed.length === 0) {
    console.log(`✓ all ${results.length} cases matched expected outcomes`);
    process.exit(0);
  } else {
    console.error(`✗ ${failed.length}/${results.length} cases FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ media-validation-smoke crashed:");
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
