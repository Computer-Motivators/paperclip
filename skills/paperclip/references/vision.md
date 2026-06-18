# Mid-run vision

When an agent downloads or saves an image during a heartbeat and needs model vision input (not UTF-8 text), use the adapter-specific path below.

## Direct OpenRouter (`direct_openrouter_local`)

Call the `read_image` tool with a workspace-relative path or `attachmentId`:

```json
{"path": "tmp/screenshot.png"}
```

```json
{"attachmentId": "11111111-1111-4111-8111-111111111111"}
```

Use `list_workspace_images` to discover image files under the workspace when the path is unknown.

## Codex (`codex_local`, `codex_openrouter_local`)

Codex receives images via `codex exec --image` at run start or on a supplemental resume in the same heartbeat. After downloading or saving an image, append an entry to `.paperclip/vision-queue.json`:

```json
{
  "images": [
    {
      "workspaceRelativePath": "tmp/screenshot.png",
      "label": "curl download"
    }
  ]
}
```

You may queue a Paperclip attachment instead:

```json
{
  "images": [
    {
      "attachmentId": "11111111-1111-4111-8111-111111111111",
      "label": "uploaded screenshot"
    }
  ]
}
```

Paperclip reads the queue after the primary Codex exec finishes and, when vision is enabled and the model supports image input, chains one supplemental `codex exec resume --image ...` turn in the same heartbeat.

## Sandboxed agents

`GET /api/attachments/{attachmentId}/content` is allowed through the Paperclip sandbox callback bridge so agents can download attachments into the workspace before queueing or calling `read_image`.

## Configuration

Adapter config fields (all optional):

- `visionMode`: `auto` (default) or `off`
- `visionAttachOnResume`: attach queued/discovered images on session resume deltas (default `true`)
- `visionSupplementalResume`: chain supplemental Codex resume when the queue is non-empty (default `true`)
