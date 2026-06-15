import { inflateRawSync } from "node:zlib";
import { normalizePortablePath } from "./portable-path.js";

export interface ExtractedArchiveFile {
  path: string;
  bytes: Buffer;
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIR_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR = 0x06054b50;

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

/**
 * Returns true when the buffer looks like a PKZip archive. Claude `.skill`
 * bundles are distributed as zip archives (a SKILL.md plus any bundled
 * references, scripts, and assets), regardless of the `.skill` extension.
 */
export function looksLikeZipArchive(bytes: Buffer): boolean {
  // An empty zip has the EOCD signature without local headers, but a skill
  // archive always carries at least SKILL.md, so the local-file magic is the
  // reliable signal.
  return bytes.length >= 4 && bytes.subarray(0, 4).equals(ZIP_MAGIC);
}

export function looksLikeGzipArchive(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes.subarray(0, 2).equals(GZIP_MAGIC);
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  // The EOCD record lives at the end of the file and may be followed by a
  // variable-length comment (max 0xffff). Scan backwards for its signature.
  const minOffset = Math.max(0, bytes.length - (0xffff + 22));
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIR) {
      return offset;
    }
  }
  return -1;
}

/**
 * Extracts a zip archive into a list of files using only Node built-ins.
 * Supports the two compression methods used in practice for skill bundles:
 * stored (0) and DEFLATE (8). Directory entries are skipped.
 */
export function extractZipArchive(bytes: Buffer): ExtractedArchiveFile[] {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new Error("Invalid skill archive: missing zip end-of-central-directory record.");
  }

  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  let pointer = bytes.readUInt32LE(eocdOffset + 16);
  const files: ExtractedArchiveFile[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (pointer + 46 > bytes.length || bytes.readUInt32LE(pointer) !== ZIP_CENTRAL_DIR_HEADER) {
      throw new Error("Invalid skill archive: corrupt central directory.");
    }

    const compressionMethod = bytes.readUInt16LE(pointer + 10);
    const compressedSize = bytes.readUInt32LE(pointer + 20);
    const fileNameLength = bytes.readUInt16LE(pointer + 28);
    const extraFieldLength = bytes.readUInt16LE(pointer + 30);
    const commentLength = bytes.readUInt16LE(pointer + 32);
    const localHeaderOffset = bytes.readUInt32LE(pointer + 42);
    const rawName = bytes.toString("utf8", pointer + 46, pointer + 46 + fileNameLength);

    pointer += 46 + fileNameLength + extraFieldLength + commentLength;

    // Skip directory entries.
    if (rawName.endsWith("/")) continue;

    if (bytes.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error(`Invalid skill archive: corrupt local header for "${rawName}".`);
    }
    const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error(`Invalid skill archive: truncated data for "${rawName}".`);
    }
    const compressed = bytes.subarray(dataStart, dataEnd);

    let content: Buffer;
    if (compressionMethod === 0) {
      content = Buffer.from(compressed);
    } else if (compressionMethod === 8) {
      content = inflateRawSync(compressed);
    } else {
      throw new Error(
        `Unsupported compression method ${compressionMethod} for "${rawName}" in skill archive.`,
      );
    }

    const normalizedPath = normalizePortablePath(rawName);
    if (!normalizedPath) continue;
    files.push({ path: normalizedPath, bytes: content });
  }

  return files;
}
