import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { prepareAdapterVisionRun } from "@paperclipai/adapter-utils/adapter-vision-run";
import { readAdapterVisionConfig } from "@paperclipai/adapter-utils/vision-config";
import { renderAdapterVisionGuidance } from "@paperclipai/adapter-utils/vision-guidance";
import { readStagedVisionImageBase64 } from "@paperclipai/adapter-utils/vision-images";
import {
  asNumber,
  asString,
  buildPaperclipEnv,
  joinPromptSections,
  parseObject,
  renderPaperclipWakePrompt,
  renderTemplate,
  runChildProcess,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_DIRECT_OPENROUTER_MODEL, models as directOpenRouterFallbackModels } from "../index.js";
import { parseDirectOpenRouterJsonl } from "./parse.js";
import { DIRECT_OPENROUTER_PYTHON_SCRIPT } from "./python-script.js";
import {
  buildMinimalAgentEnv,
  buildMinimalShellEnv,
  resolveShellPolicy,
} from "./shell-policy.js";

function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function readResolvedEnv(envConfig: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(envConfig)) {
    if (typeof raw === "string") {
      out[key] = raw;
      continue;
    }
    if (typeof raw !== "object" || !raw) continue;
    const rec = raw as Record<string, unknown>;
    if (rec.type === "plain" && typeof rec.value === "string") {
      out[key] = rec.value;
    }
  }
  return out;
}

function hashBundle(instructions: string, toolMode: string): string {
  return crypto.createHash("sha256").update(`${toolMode}\n${instructions}`).digest("hex");
}

async function buildMultimodalUserContent(
  runPrompt: string,
  staged: Awaited<ReturnType<typeof prepareAdapterVisionRun>>["staged"],
): Promise<string | Array<Record<string, unknown>>> {
  if (staged.length === 0) return runPrompt;
  const parts: Array<Record<string, unknown>> = [{ type: "text", text: runPrompt }];
  for (const image of staged) {
    const base64 = await readStagedVisionImageBase64(image.localPath);
    parts.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${base64}` },
    });
  }
  return parts;
}

function wakePromptWillExist(context: Record<string, unknown>): boolean {
  return renderPaperclipWakePrompt(context.paperclipWake).length > 0;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;
  const cwd = asString(config.cwd, process.cwd());
  const model = asString(config.model, DEFAULT_DIRECT_OPENROUTER_MODEL).trim();
  const toolCallingMode = asString(config.toolCallingMode, "native") === "text" ? "text" : "native";
  const maxTurns = Math.max(1, asNumber(config.maxTurns, 25));
  const shellTimeoutSec = Math.max(5, asNumber(config.shellTimeoutSec, 120));
  const timeoutSec = Math.max(0, asNumber(config.timeoutSec, 0));
  const graceSec = Math.max(1, asNumber(config.graceSec, 15));
  const httpReferer = asString(config.httpReferer, "https://paperclip.ing");
  const openRouterTitle = asString(config.openRouterTitle, "Paperclip");
  const traceName = asString(config.traceName, "Paperclip Direct OpenRouter");
  const traceEnvironment = asString(config.traceEnvironment, process.env.NODE_ENV || "development");
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const instructionsFilePath = asString(config.instructionsFilePath, "");
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceRoot = asString(workspaceContext.cwd, cwd) || cwd;
  const visionConfig = readAdapterVisionConfig(config);

  const envConfig = parseObject(config.env) ?? {};
  const adapterEnv = readResolvedEnv(envConfig);
  const paperclipEnv = buildPaperclipEnv(agent);
  const apiKey = asString(adapterEnv.OPENROUTER_API_KEY, asString(process.env.OPENROUTER_API_KEY, "")).trim();
  const effectiveEnv = buildMinimalAgentEnv(agent, workspaceRoot, paperclipEnv, adapterEnv);
  const shellPolicy = resolveShellPolicy(config);
  const shellEnv = buildMinimalShellEnv(workspaceRoot, effectiveEnv.PATH);
  const issueId = asString(context.issueId, "").trim();
  const sessionSeed = runtime.sessionId ?? (issueId ? `issue:${issueId}` : `run:${runId}`);
  const sessionId = `pc:${agent.companyId}:${agent.id}:${sessionSeed}`.slice(0, 128);

  let instructionsContents = "";
  if (instructionsFilePath) {
    try {
      instructionsContents = await fs.readFile(instructionsFilePath, "utf8");
    } catch (error) {
      await onLog("stderr", `[paperclip] Failed reading instructions file ${instructionsFilePath}: ${error}\n`);
    }
  }

  const prior = parseObject(runtime.sessionParams);
  const priorMessages = Array.isArray(prior.messages) ? prior.messages : [];
  const bundleKey = hashBundle(instructionsContents, toolCallingMode);
  const shouldResume = asString(prior.bundleKey, "") === bundleKey;
  const shouldUseResumeDeltaPrompt = shouldResume && wakePromptWillExist(context);
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, {
    resumedSession: shouldUseResumeDeltaPrompt,
  });
  const runPrompt = joinPromptSections([
    renderTemplate(promptTemplate, context),
    wakePrompt,
  ]);
  const messages = shouldResume ? [...priorMessages] : [];
  if (!shouldResume && instructionsContents.trim()) {
    messages.push({ role: "system", content: instructionsContents.trim() });
  }

  const visionRun = await prepareAdapterVisionRun({
    config,
    context,
    runId,
    cwd: workspaceRoot,
    workspaceRoot,
    modelId: model,
    apiUrl: effectiveEnv.PAPERCLIP_API_URL,
    apiKey: authToken ?? effectiveEnv.PAPERCLIP_API_KEY,
    openRouterApiKey: apiKey,
    provider: "openrouter",
    fallbackModels: directOpenRouterFallbackModels,
    isResumeDelta: shouldUseResumeDeltaPrompt,
  });
  for (const note of visionRun.notes) {
    await onLog("stdout", `[paperclip] ${note}\n`);
  }

  const visionGuidance = renderAdapterVisionGuidance({
    adapterKind: "direct_openrouter",
    modelSupportsImageInput: visionRun.modelSupportsImageInput,
  });
  if (visionGuidance) {
    messages.push({ role: "system", content: visionGuidance });
  }

  const userPrompt = shouldUseResumeDeltaPrompt ? wakePrompt : runPrompt;
  const userContent = await buildMultimodalUserContent(userPrompt, visionRun.staged);
  messages.push({ role: "user", content: userContent });

  const trace = {
    trace_id: `pc:${agent.companyId}:${agent.id}:${issueId || runId}`.slice(0, 128),
    trace_name: traceName,
    span_name: asString(context.wakeReason, "agent_turn"),
    environment: traceEnvironment,
    feature: "paperclip",
    paperclip_run_id: runId,
    paperclip_issue_id: issueId || undefined,
    paperclip_agent_id: agent.id,
    paperclip_company_id: agent.companyId,
    paperclip_wake_reason: asString(context.wakeReason, ""),
  };

  const payload = {
    apiKey,
    model,
    toolCallingMode,
    maxTurns,
    shellTimeoutSec,
    maxVisionImageBytes: visionConfig.maxVisionImageBytes,
    supportsImageInput: visionRun.modelSupportsImageInput,
    runId,
    paperclipApiUrl: effectiveEnv.PAPERCLIP_API_URL,
    paperclipApiKey: authToken ?? effectiveEnv.PAPERCLIP_API_KEY,
    workspaceRoot,
    sessionId,
    httpReferer,
    openRouterTitle,
    user: `agent:${agent.id}`.slice(0, 128),
    trace,
    messages,
    shellPolicy: {
      enabled: shellPolicy.enabled,
      preset: shellPolicy.preset,
      allowedCommands: [...shellPolicy.allowedCommands],
      blockedSubstrings: [...shellPolicy.blockedSubstrings],
      blockMetacharacters: shellPolicy.blockMetacharacters,
      blockAbsolutePaths: shellPolicy.blockAbsolutePaths,
      blockGitPush: shellPolicy.blockGitPush,
      blockInlineCodeExecution: shellPolicy.blockInlineCodeExecution,
      blockDestructiveRm: shellPolicy.blockDestructiveRm,
      blockPackagePublish: shellPolicy.blockPackagePublish,
      maxCommandLength: shellPolicy.maxCommandLength,
    },
    shellEnv,
  };

  if (onMeta) {
    await onMeta({
      adapterType: "direct_openrouter_local",
      command: asString(config.command, "python3"),
      cwd: workspaceRoot,
      prompt: typeof userContent === "string" ? userContent : userPrompt,
      context,
      visionImagesStaged: visionRun.staged.length,
      visionImagesSkipped: visionRun.skipped.length,
      modelSupportsImageInput: visionRun.modelSupportsImageInput,
    });
  }

  const scriptPath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-direct-openrouter-")),
    "agent.py",
  );
  await fs.writeFile(scriptPath, DIRECT_OPENROUTER_PYTHON_SCRIPT, { mode: 0o700 });

  const command = asString(config.command, "python3");
  const result = await runChildProcess(runId, command, [scriptPath], {
    cwd: workspaceRoot,
    env: effectiveEnv,
    timeoutSec,
    graceSec,
    stdin: JSON.stringify(payload),
    onLog,
    onSpawn: ctx.onSpawn,
  });

  await fs.rm(path.dirname(scriptPath), { recursive: true, force: true });

  if ((result.exitCode ?? 1) !== 0 && !result.stdout.trim()) {
    const detail = firstNonEmptyLine(result.stderr);
    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage: detail || "Direct OpenRouter agent loop failed.",
    };
  }

  const parsed = parseDirectOpenRouterJsonl(result.stdout);
  const summary = parsed.summary ?? firstNonEmptyLine(parsed.messages.join("\n"));
  const resultError = parsed.errors[0] ?? null;
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    errorMessage: resultError,
    usage: {
      inputTokens: parsed.usage.inputTokens,
      outputTokens: parsed.usage.outputTokens,
      cachedInputTokens: parsed.usage.cachedInputTokens,
    },
    costUsd: parsed.usage.costUsd,
    provider: parsed.provider ?? "openrouter",
    model: parsed.model ?? model,
    summary: summary || null,
    sessionParams: {
      ...(parsed.sessionParams ?? {}),
      bundleKey,
      sessionId: parsed.sessionId ?? sessionId,
      cwd: workspaceRoot,
    },
    sessionId: parsed.sessionId ?? sessionId,
  };
}
