import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReleaseAge } from "../check-pr-release-age.mjs";

test("checkReleaseAge passes when lockfile is unchanged", async () => {
  const result = await checkReleaseAge([{ filename: "README.md", patch: "+hello" }]);
  assert.equal(result.passed, true);
  assert.equal(result.informational.length, 0);
});

test("checkReleaseAge reports immature net-new lockfile packages", async () => {
  const now = new Date("2026-06-02T12:00:00.000Z");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { time: { "1.0.0": "2026-06-02T11:59:00.000Z" } };
    },
  });

  try {
    const result = await checkReleaseAge([
      {
        filename: "pnpm-lock.yaml",
        patch: "+  fresh-pkg@1.0.0:\n+    resolution: {integrity: sha512}\n",
      },
    ]);
    assert.equal(result.passed, true);
    assert.equal(result.informational.length, 1);
    assert.match(result.informational[0], /fresh-pkg@1\.0\.0/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
