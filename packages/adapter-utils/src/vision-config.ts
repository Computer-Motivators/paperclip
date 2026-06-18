import {
  ADAPTER_VISION_MODES,
  DEFAULT_ADAPTER_MAX_VISION_IMAGE_BYTES,
  DEFAULT_ADAPTER_MAX_VISION_IMAGES,
  DEFAULT_ADAPTER_VISION_ATTACH_ON_RESUME,
  DEFAULT_ADAPTER_VISION_MODE,
  DEFAULT_ADAPTER_VISION_SUPPLEMENTAL_RESUME,
  type AdapterVisionMode,
} from "@paperclipai/shared";
import { asBoolean, asNumber, asString } from "./server-utils.js";

export type AdapterVisionConfig = {
  visionMode: AdapterVisionMode;
  maxVisionImages: number;
  maxVisionImageBytes: number;
  visionAttachOnResume: boolean;
  visionSupplementalResume: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readAdapterVisionConfig(config: unknown): AdapterVisionConfig {
  const record = asRecord(config);
  const visionModeRaw = asString(record.visionMode, DEFAULT_ADAPTER_VISION_MODE).trim().toLowerCase();
  const visionMode = ADAPTER_VISION_MODES.includes(visionModeRaw as AdapterVisionMode)
    ? (visionModeRaw as AdapterVisionMode)
    : DEFAULT_ADAPTER_VISION_MODE;
  const maxVisionImages = Math.max(
    0,
    Math.min(32, Math.floor(asNumber(record.maxVisionImages, DEFAULT_ADAPTER_MAX_VISION_IMAGES))),
  );
  const maxVisionImageBytes = Math.max(
    1,
    Math.min(
      32 * 1024 * 1024,
      Math.floor(asNumber(record.maxVisionImageBytes, DEFAULT_ADAPTER_MAX_VISION_IMAGE_BYTES)),
    ),
  );
  return {
    visionMode,
    maxVisionImages,
    maxVisionImageBytes,
    visionAttachOnResume: asBoolean(record.visionAttachOnResume, DEFAULT_ADAPTER_VISION_ATTACH_ON_RESUME),
    visionSupplementalResume: asBoolean(
      record.visionSupplementalResume,
      DEFAULT_ADAPTER_VISION_SUPPLEMENTAL_RESUME,
    ),
  };
}

export function isAdapterVisionEnabled(config: unknown): boolean {
  return readAdapterVisionConfig(config).visionMode !== "off";
}
