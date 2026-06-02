import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@paperclipai/shared";

type LiveEventPayload = Record<string, unknown>;
type LiveEventListener = (event: LiveEvent) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let nextEventId = 0;

function toLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}): LiveEvent {
  nextEventId += 1;
  return {
    id: nextEventId,
    companyId: input.companyId,
    type: input.type,
    createdAt: new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

export function publishLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent(input);
  emitter.emit(input.companyId, event);
  return event;
}

export function publishGlobalLiveEvent(input: {
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent({ companyId: "*", type: input.type, payload: input.payload });
  emitter.emit("*", event);
  return event;
}

export function subscribeCompanyLiveEvents(companyId: string, listener: LiveEventListener) {
  emitter.on(companyId, listener);
  return () => emitter.off(companyId, listener);
}

export function subscribeGlobalLiveEvents(listener: LiveEventListener) {
  emitter.on("*", listener);
  return () => emitter.off("*", listener);
}

const LIVE_EVENT_LISTENER_WARN_THRESHOLD = 500;

export function getLiveEventListenerStats(): {
  byChannel: Record<string, number>;
  total: number;
} {
  const byChannel: Record<string, number> = {};
  for (const channel of emitter.eventNames()) {
    byChannel[String(channel)] = emitter.listenerCount(channel);
  }
  const total = Object.values(byChannel).reduce((sum, count) => sum + count, 0);
  return { byChannel, total };
}

export function logLiveEventListenerPressureIfNeeded(): void {
  const stats = getLiveEventListenerStats();
  if (stats.total < LIVE_EVENT_LISTENER_WARN_THRESHOLD) return;
  console.warn(
    `[live-events] High listener count: total=${stats.total} channels=${JSON.stringify(stats.byChannel)}`,
  );
}
