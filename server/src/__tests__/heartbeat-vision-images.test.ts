import { describe, expect, it } from "vitest";
import { extractAttachmentIdsFromMarkdown } from "../services/heartbeat-vision-images.js";

describe("heartbeat vision image helpers", () => {
  it("extracts attachment ids from markdown image links", () => {
    const body = [
      "Please review this screenshot:",
      "![](/api/attachments/11111111-1111-4111-8111-111111111111/content)",
      "and this one too",
      "![alt](/api/attachments/22222222-2222-4222-8222-222222222222/content?download=1)",
    ].join("\n");

    expect(extractAttachmentIdsFromMarkdown(body)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });
});
