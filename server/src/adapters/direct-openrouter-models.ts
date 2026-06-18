import type { AdapterModel } from "./types.js";
import { models as directOpenRouterFallbackModels } from "@computermotivators/adapter-direct-openrouter-local";
import {
  fetchOpenRouterModelCapabilities,
  mergeAdapterModelsWithFallback,
  toAdapterModelFromOpenRouterCapabilities,
} from "@paperclipai/adapter-utils/model-vision-capabilities";

const OPENROUTER_MODELS_CACHE_TTL_MS = 60_000;

let cached: { keyFingerprint: string; expiresAt: number; models: AdapterModel[] } | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

function resolveOpenRouterApiKey(): string | null {
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

async function loadDirectOpenRouterModels(options?: { forceRefresh?: boolean }): Promise<AdapterModel[]> {
  const forceRefresh = options?.forceRefresh === true;
  const apiKey = resolveOpenRouterApiKey();
  const fallback = mergeAdapterModelsWithFallback([], directOpenRouterFallbackModels);
  if (!apiKey) return fallback;

  const now = Date.now();
  const keyFingerprint = fingerprint(apiKey);
  if (!forceRefresh && cached && cached.keyFingerprint === keyFingerprint && cached.expiresAt > now) {
    return cached.models;
  }

  const fetched = (await fetchOpenRouterModelCapabilities(apiKey)).map(toAdapterModelFromOpenRouterCapabilities);
  if (fetched.length > 0) {
    const merged = mergeAdapterModelsWithFallback(fetched, directOpenRouterFallbackModels);
    cached = {
      keyFingerprint,
      expiresAt: now + OPENROUTER_MODELS_CACHE_TTL_MS,
      models: merged,
    };
    return merged;
  }

  if (cached && cached.keyFingerprint === keyFingerprint && cached.models.length > 0) {
    return cached.models;
  }

  return fallback;
}

export async function listDirectOpenRouterModels(): Promise<AdapterModel[]> {
  return loadDirectOpenRouterModels();
}

export async function refreshDirectOpenRouterModels(): Promise<AdapterModel[]> {
  return loadDirectOpenRouterModels({ forceRefresh: true });
}

export function resetDirectOpenRouterModelsCacheForTests() {
  cached = null;
}
