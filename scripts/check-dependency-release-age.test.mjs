import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodePackageNameForRegistry,
  findImmatureLockfilePackages,
  isPublishedTooRecently,
  parseLockfilePackageDiffKeys,
  parseLockfilePackageKeys,
  parseMinReleaseAgeMinutes,
} from "./lib/dependency-release-age.mjs";

test("parseMinReleaseAgeMinutes defaults to 24h", () => {
  assert.equal(parseMinReleaseAgeMinutes(undefined), 1440);
  assert.equal(parseMinReleaseAgeMinutes("60"), 60);
});

test("parseLockfilePackageKeys reads pnpm lock entries", () => {
  const keys = parseLockfilePackageKeys(`
lockfileVersion: '9.0'

packages:
  lodash@4.17.21:
    resolution: {integrity: sha512}
  '@scope/pkg@1.2.3':
    resolution: {integrity: sha512}
`);
  assert.equal(keys.size, 2);
  assert.deepEqual(keys.get("lodash@4.17.21"), { packageName: "lodash", version: "4.17.21" });
  assert.deepEqual(keys.get("@scope/pkg@1.2.3"), { packageName: "@scope/pkg", version: "1.2.3" });
});

test("parseLockfilePackageDiffKeys keeps net-new packages only", () => {
  const patch = `
+  fresh-pkg@1.0.0:
+    resolution: {integrity: sha512}
-  fresh-pkg@0.9.0:
+  kept-pkg@2.0.0:
`;
  const entries = parseLockfilePackageDiffKeys(patch);
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => `${entry.packageName}@${entry.version}`).sort(),
    ["fresh-pkg@1.0.0", "kept-pkg@2.0.0"],
  );
});

test("encodePackageNameForRegistry escapes scopes", () => {
  assert.equal(encodePackageNameForRegistry("lodash"), "lodash");
  assert.equal(encodePackageNameForRegistry("@scope/pkg"), "@scope%2Fpkg");
});

test("findImmatureLockfilePackages flags young versions", async () => {
  const now = new Date("2026-06-02T12:00:00.000Z");
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        time: {
          "1.0.0": "2026-06-02T11:30:00.000Z",
          "0.9.0": "2026-05-01T00:00:00.000Z",
        },
      };
    },
  });

  const immature = await findImmatureLockfilePackages(
    [{ packageName: "example", version: "1.0.0" }, { packageName: "example", version: "0.9.0" }],
    { minAgeMinutes: 1440, now, fetchImpl },
  );

  assert.equal(immature.length, 1);
  assert.equal(immature[0].version, "1.0.0");
  assert.equal(isPublishedTooRecently(new Date("2026-06-02T11:30:00.000Z"), 1440, now), true);
});
