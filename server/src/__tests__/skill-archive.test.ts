import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractZipArchive, looksLikeGzipArchive, looksLikeZipArchive } from "../services/skill-archive.ts";

interface ZipInput {
  name: string;
  content: Buffer;
  method: 0 | 8;
}

// Minimal PKZip writer used only for tests. The extractor does not validate
// CRCs, so we leave them zeroed.
function buildZip(entries: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const stored = entry.method === 8 ? deflateRawSync(entry.content) : entry.content;

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(0, 14); // crc
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    locals.push(local, stored);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(0, 16); // crc
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.length + stored.length;
  }

  const centralDir = Buffer.concat(centrals);
  const localDir = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(localDir.length, 16);

  return Buffer.concat([localDir, centralDir, eocd]);
}

describe("skill archive extraction", () => {
  it("detects zip and gzip magic bytes", () => {
    const zip = buildZip([{ name: "SKILL.md", content: Buffer.from("# Hi"), method: 0 }]);
    expect(looksLikeZipArchive(zip)).toBe(true);
    expect(looksLikeGzipArchive(zip)).toBe(false);
    expect(looksLikeZipArchive(Buffer.from("# not a zip"))).toBe(false);
    expect(looksLikeGzipArchive(Buffer.from([0x1f, 0x8b, 0x08]))).toBe(true);
  });

  it("extracts stored and deflated entries", () => {
    const script = "#!/usr/bin/env python3\nprint('hello')\n";
    const zip = buildZip([
      { name: "my-skill/SKILL.md", content: Buffer.from("---\nname: My Skill\n---\n# My Skill\n"), method: 8 },
      { name: "my-skill/scripts/run.py", content: Buffer.from(script), method: 8 },
      { name: "my-skill/assets/logo.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47]), method: 0 },
    ]);

    const files = extractZipArchive(zip);
    const byPath = new Map(files.map((file) => [file.path, file.bytes]));

    expect(byPath.get("my-skill/SKILL.md")?.toString("utf8")).toContain("name: My Skill");
    expect(byPath.get("my-skill/scripts/run.py")?.toString("utf8")).toBe(script);
    expect(Array.from(byPath.get("my-skill/assets/logo.png") ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("skips directory entries", () => {
    const zip = buildZip([
      { name: "skill/", content: Buffer.alloc(0), method: 0 },
      { name: "skill/SKILL.md", content: Buffer.from("# Skill"), method: 0 },
    ]);
    const files = extractZipArchive(zip);
    expect(files.map((file) => file.path)).toEqual(["skill/SKILL.md"]);
  });

  it("throws on a buffer without an end-of-central-directory record", () => {
    expect(() => extractZipArchive(Buffer.from("not a zip archive at all"))).toThrow(/end-of-central-directory/);
  });
});
