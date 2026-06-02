import { OPENROUTER_API_BASE_URL } from "../index.js";

const MODELS_TIMEOUT_MS = 8000;
const MODELS_CACHE_TTL_MS = 60_000;

export interface OpenRouterTokenPricing {
  promptPerToken: number;
  completionPerToken: number;
  cacheReadPerToken: number;
}

export interface UsageForPricing {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

type PricingCacheEntry = {
  keyFingerprint: string;
  expiresAt: number;
  byModelId: Map<string, OpenRouterTokenPricing>;
};

let pricingCache: PricingCacheEntry | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

function readPricingRate(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function parseModelPricing(pricing: unknown): OpenRouterTokenPricing | null {
  const record = typeof pricing === "object" && pricing !== null ? pricing as Record<string, unknown> : null;
  if (!record) return null;

  const promptPerToken = readPricingRate(record.prompt);
  const completionPerToken = readPricingRate(record.completion);
  if (promptPerToken <= 0 && completionPerToken <= 0) return null;

  const cacheReadPerToken = readPricingRate(record.input_cache_read) || promptPerToken;
  return {
    promptPerToken,
    completionPerToken,
    cacheReadPerToken,
  };
}

async function fetchOpenRouterPricingByModel(apiKey: string): Promise<Map<string, OpenRouterTokenPricing>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  try {
    const response = await fetch(`${OPENROUTER_API_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return new Map();

    const payload = (await response.json()) as { data?: unknown };
    const data = Array.isArray(payload.data) ? payload.data : [];
    const byModelId = new Map<string, OpenRouterTokenPricing>();

    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || id.trim().length === 0) continue;
      const pricing = parseModelPricing((item as { pricing?: unknown }).pricing);
      if (pricing) byModelId.set(id, pricing);
    }

    return byModelId;
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadOpenRouterPricingByModel(apiKey: string): Promise<Map<string, OpenRouterTokenPricing>> {
  const trimmed = apiKey.trim();
  if (!trimmed) return new Map();

  const now = Date.now();
  const keyFingerprint = fingerprint(trimmed);
  if (pricingCache && pricingCache.keyFingerprint === keyFingerprint && pricingCache.expiresAt > now) {
    return pricingCache.byModelId;
  }

  const byModelId = await fetchOpenRouterPricingByModel(trimmed);
  if (byModelId.size > 0) {
    pricingCache = {
      keyFingerprint,
      expiresAt: now + MODELS_CACHE_TTL_MS,
      byModelId,
    };
    return byModelId;
  }

  if (pricingCache && pricingCache.keyFingerprint === keyFingerprint && pricingCache.byModelId.size > 0) {
    return pricingCache.byModelId;
  }

  return byModelId;
}

export function estimateOpenRouterCostUsd(
  modelId: string,
  usage: UsageForPricing,
  pricing: OpenRouterTokenPricing,
): number {
  const inputTokens = Math.max(0, usage.inputTokens);
  const cachedInputTokens = Math.min(Math.max(0, usage.cachedInputTokens), inputTokens);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = Math.max(0, usage.outputTokens);

  const cost =
    uncachedInputTokens * pricing.promptPerToken +
    cachedInputTokens * pricing.cacheReadPerToken +
    outputTokens * pricing.completionPerToken;

  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return cost;
}

export async function resolveOpenRouterRunCostUsd(input: {
  modelId: string;
  usage: UsageForPricing;
  parsedCostUsd?: number | null;
  apiKey?: string | null;
}): Promise<number | null> {
  if (typeof input.parsedCostUsd === "number" && Number.isFinite(input.parsedCostUsd) && input.parsedCostUsd > 0) {
    return input.parsedCostUsd;
  }

  const modelId = input.modelId.trim();
  const apiKey = input.apiKey?.trim() ?? "";
  if (!modelId || !apiKey) return null;

  const hasUsage =
    input.usage.inputTokens > 0 ||
    input.usage.outputTokens > 0 ||
    input.usage.cachedInputTokens > 0;
  if (!hasUsage) return null;

  const pricingByModel = await loadOpenRouterPricingByModel(apiKey);
  const pricing = pricingByModel.get(modelId);
  if (!pricing) return null;

  const estimated = estimateOpenRouterCostUsd(modelId, input.usage, pricing);
  return estimated > 0 ? estimated : null;
}

export function resetOpenRouterPricingCacheForTests() {
  pricingCache = null;
}
