import type { AdapterModel } from "./types.js";

export const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_MODELS_TIMEOUT_MS = 8000;
export const OPENROUTER_MODELS_CACHE_TTL_MS = 60_000;

export type OpenRouterModelCapabilities = {
  id: string;
  label: string;
  supportsImageInput: boolean;
  inputModalities: string[];
};

let cachedCapabilities: {
  keyFingerprint: string;
  expiresAt: number;
  models: OpenRouterModelCapabilities[];
} | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function parseOpenRouterModelCapabilities(item: unknown): OpenRouterModelCapabilities | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const architecture =
    typeof record.architecture === "object" && record.architecture !== null
      ? (record.architecture as Record<string, unknown>)
      : null;
  const inputModalities = parseStringArray(architecture?.input_modalities);
  const supportsImageInput = inputModalities.includes("image");
  return {
    id,
    label: name || id,
    supportsImageInput,
    inputModalities,
  };
}

export function dedupeOpenRouterModelCapabilities(
  models: OpenRouterModelCapabilities[],
): OpenRouterModelCapabilities[] {
  const seen = new Set<string>();
  const deduped: OpenRouterModelCapabilities[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({
      ...model,
      id,
      label: model.label.trim() || id,
    });
  }
  return deduped;
}

export async function fetchOpenRouterModelCapabilities(apiKey: string): Promise<OpenRouterModelCapabilities[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_MODELS_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: unknown };
    const data = Array.isArray(payload.data) ? payload.data : [];
    const models: OpenRouterModelCapabilities[] = [];
    for (const item of data) {
      const parsed = parseOpenRouterModelCapabilities(item);
      if (parsed) models.push(parsed);
    }
    return dedupeOpenRouterModelCapabilities(models);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadOpenRouterModelCapabilities(
  apiKey: string,
  options: { forceRefresh?: boolean } = {},
): Promise<OpenRouterModelCapabilities[]> {
  const forceRefresh = options.forceRefresh === true;
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) return [];

  const now = Date.now();
  const keyFingerprint = fingerprint(trimmedKey);
  if (
    !forceRefresh &&
    cachedCapabilities &&
    cachedCapabilities.keyFingerprint === keyFingerprint &&
    cachedCapabilities.expiresAt > now
  ) {
    return cachedCapabilities.models;
  }

  const fetched = await fetchOpenRouterModelCapabilities(trimmedKey);
  if (fetched.length > 0) {
    cachedCapabilities = {
      keyFingerprint,
      expiresAt: now + OPENROUTER_MODELS_CACHE_TTL_MS,
      models: fetched,
    };
    return fetched;
  }

  if (cachedCapabilities && cachedCapabilities.keyFingerprint === keyFingerprint) {
    return cachedCapabilities.models;
  }

  return [];
}

export function resetOpenRouterModelCapabilitiesCacheForTests() {
  cachedCapabilities = null;
}

export function resolveOpenRouterImageInputSupportFromCapabilities(
  modelId: string,
  capabilities: OpenRouterModelCapabilities[],
  fallbackModels: AdapterModel[] = [],
): boolean | null {
  const normalized = modelId.trim();
  if (!normalized) return null;

  const match = capabilities.find((entry) => entry.id === normalized);
  if (match) return match.supportsImageInput;

  const fallback = fallbackModels.find((entry) => entry.id === normalized);
  if (fallback && typeof fallback.supportsImageInput === "boolean") {
    return fallback.supportsImageInput;
  }

  return null;
}

export async function resolveOpenRouterImageInputSupport(
  modelId: string,
  apiKey: string | null | undefined,
  fallbackModels: AdapterModel[] = [],
): Promise<boolean> {
  const normalized = modelId.trim();
  if (!normalized) return false;

  const trimmedKey = apiKey?.trim() ?? "";
  if (trimmedKey) {
    const capabilities = await loadOpenRouterModelCapabilities(trimmedKey);
    const resolved = resolveOpenRouterImageInputSupportFromCapabilities(
      normalized,
      capabilities,
      fallbackModels,
    );
    if (resolved !== null) return resolved;
  }

  const fallback = fallbackModels.find((entry) => entry.id === normalized);
  if (fallback && typeof fallback.supportsImageInput === "boolean") {
    return fallback.supportsImageInput;
  }

  return false;
}

const OPENAI_VISION_MODEL_PREFIXES = [
  "gpt-4o",
  "gpt-5",
  "o3",
  "o4",
  "codex",
] as const;

export function resolveOpenAiCodexImageInputSupport(
  modelId: string,
  fallbackModels: AdapterModel[] = [],
): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;

  const fallback = fallbackModels.find((entry) => entry.id.trim().toLowerCase() === normalized);
  if (fallback && typeof fallback.supportsImageInput === "boolean") {
    return fallback.supportsImageInput;
  }

  return OPENAI_VISION_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function toAdapterModelFromOpenRouterCapabilities(
  capability: OpenRouterModelCapabilities,
): AdapterModel {
  return {
    id: capability.id,
    label: capability.label,
    supportsImageInput: capability.supportsImageInput,
    inputModalities: capability.inputModalities,
  };
}

export function mergeAdapterModelsWithFallback(
  discovered: AdapterModel[],
  fallback: AdapterModel[],
): AdapterModel[] {
  const byId = new Map<string, AdapterModel>();
  for (const model of fallback) {
    const id = model.id.trim();
    if (!id) continue;
    byId.set(id, { ...model, id, label: model.label.trim() || id });
  }
  for (const model of discovered) {
    const id = model.id.trim();
    if (!id) continue;
    byId.set(id, { ...model, id, label: model.label.trim() || id });
  }
  return [...byId.values()].sort((a, b) =>
    a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }),
  );
}
