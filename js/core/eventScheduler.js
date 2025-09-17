import { EVENT_DEFINITIONS, EVENT_DEFINITION_MAP } from "../content/events.js";

const DEFAULT_PHASE = "dayStart";

const getDefinition = (id) => EVENT_DEFINITION_MAP.get(id);

const evaluateMaybeFn = (value, payload) => (typeof value === "function" ? value(payload) : value);

function ensureStateShape(state) {
  if (!state) return;
  if (!Array.isArray(state.pendingEvents)) state.pendingEvents = [];
  if (!state.eventHistory || typeof state.eventHistory !== "object") state.eventHistory = {};
  if (!Number.isFinite(state.nextScenarioId)) state.nextScenarioId = 1;
}

function ensureMemory(state, defId) {
  ensureStateShape(state);
  if (!state.eventHistory[defId]) {
    state.eventHistory[defId] = {
      count: 0,
      lastTriggeredDay: null,
      lastResolvedDay: null,
      cooldownUntilDay: null,
      cooldownUntilTick: null,
      pendingInstance: null,
      lastChoice: null
    };
  }
  return state.eventHistory[defId];
}

function shouldRespectCooldown(memory, state) {
  const day = Number.isFinite(state?.day) ? state.day : 0;
  const tick = Number.isFinite(state?.tick) ? state.tick : 0;
  if (Number.isFinite(memory.cooldownUntilDay) && day < memory.cooldownUntilDay) return true;
  if (Number.isFinite(memory.cooldownUntilTick) && tick < memory.cooldownUntilTick) return true;
  return false;
}

function resolveDeadline(value, now, fallback = null) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return now + value;
}

function computeDescription(definition, result, { state, context }) {
  if (typeof result?.description === "string") return result.description;
  if (typeof definition.description === "function") {
    return definition.description({ state, context });
  }
  if (typeof definition.description === "string") return definition.description;
  return "";
}

function pickChoice(definition, choiceId) {
  if (!definition || !Array.isArray(definition.choices)) return null;
  if (choiceId) {
    const explicit = definition.choices.find((choice) => choice.id === choiceId);
    if (explicit) return explicit;
  }
  if (definition.defaultChoiceId) {
    const fallback = definition.choices.find((choice) => choice.id === definition.defaultChoiceId);
    if (fallback) return fallback;
  }
  return definition.choices[0] ?? null;
}

function normalizePhase(definition) {
  const phase = definition?.phase;
  if (Array.isArray(phase)) return phase;
  if (typeof phase === "string") return [phase];
  return [DEFAULT_PHASE];
}

function createEventScheduler({ engine, logFeed, applyEffect, random = Math.random, allowedEvents = null } = {}) {
  if (!engine) throw new Error("eventScheduler requires an engine instance");
  if (typeof logFeed !== "function") throw new Error("eventScheduler requires a logFeed handler");
  if (typeof applyEffect !== "function") throw new Error("eventScheduler requires an applyEffect handler");

  const allowSet = Array.isArray(allowedEvents)
    ? new Set(allowedEvents)
    : allowedEvents instanceof Set
      ? allowedEvents
      : null;

  const definitionPhases = new Map();
  for (const def of EVENT_DEFINITIONS) {
    if (allowSet && !allowSet.has(def.id)) continue;
    definitionPhases.set(def.id, normalizePhase(def));
  }

  function queueEvent(state, definition, phase, result = {}) {
    if (!state || !definition) return null;
    ensureStateShape(state);
    const memory = ensureMemory(state, definition.id);
    const instanceId = state.nextScenarioId++;
    const nowTick = Number.isFinite(state.tick) ? state.tick : 0;
    const nowDay = Number.isFinite(state.day) ? state.day : 0;

    const pending = {
      instanceId,
      definitionId: definition.id,
      label: definition.label,
      kind: definition.kind ?? "neutral",
      triggeredDay: nowDay,
      triggeredTick: nowTick,
      phase,
      context: result.context ?? {},
      description: computeDescription(definition, result, { state, context: result.context ?? {} }),
      deadlineDay: resolveDeadline(result.deadlineDays ?? definition.deadlineDays, nowDay, null),
      deadlineTick: resolveDeadline(result.deadlineTicks ?? definition.deadlineTicks, nowTick, null),
      defaultChoiceId: result.defaultChoiceId ?? definition.defaultChoiceId ?? null
    };

    state.pendingEvents.push(pending);

    memory.count = (memory.count ?? 0) + 1;
    memory.pendingInstance = instanceId;
    memory.lastTriggeredDay = nowDay;
    if (Number.isFinite(definition.cooldownDays)) {
      memory.cooldownUntilDay = nowDay + definition.cooldownDays;
    }
    if (Number.isFinite(definition.cooldownTicks)) {
      memory.cooldownUntilTick = nowTick + definition.cooldownTicks;
    }
    if (Number.isFinite(result.cooldownDays)) {
      memory.cooldownUntilDay = nowDay + result.cooldownDays;
    }
    if (Number.isFinite(result.cooldownTicks)) {
      memory.cooldownUntilTick = nowTick + result.cooldownTicks;
    }

    const announcement = result.announcement ?? definition.announcement;
    if (announcement) {
      const text = evaluateMaybeFn(announcement, { state, context: pending.context, definition, pending });
      if (text) {
        logFeed(state, {
          text,
          kind: result.announcementKind ?? definition.kind ?? "neutral",
          targetId: result.announcementTarget ?? null
        });
      }
    }

    return pending;
  }

  function evaluateDefinition(state, definition, phase) {
    if (!state || !definition) return;
    ensureStateShape(state);
    const memory = ensureMemory(state, definition.id);

    if (state.pendingEvents.some((item) => item?.definitionId === definition.id)) {
      return;
    }
    if (memory.pendingInstance != null) {
      return;
    }
    if (shouldRespectCooldown(memory, state)) {
      return;
    }

    const evaluator = definition.evaluate;
    if (typeof evaluator !== "function") return;

    try {
      const result = evaluator({ state, phase, random, memory });
      if (!result) return;
      queueEvent(state, definition, phase, result);
    } catch (error) {
      console.error("eventScheduler:evaluate failed", error);
    }
  }

  function evaluatePhase(state, phase) {
    for (const def of EVENT_DEFINITIONS) {
      if (allowSet && !allowSet.has(def.id)) continue;
      const phases = definitionPhases.get(def.id) ?? [DEFAULT_PHASE];
      if (!phases.includes(phase)) continue;
      evaluateDefinition(state, def, phase);
    }
  }

  function removePending(state, instanceId) {
    if (!state || !Array.isArray(state.pendingEvents)) return null;
    const index = state.pendingEvents.findIndex((item) => item?.instanceId === instanceId);
    if (index === -1) return null;
    const [removed] = state.pendingEvents.splice(index, 1);
    const definition = getDefinition(removed?.definitionId);
    if (definition) {
      const memory = ensureMemory(state, definition.id);
      if (memory.pendingInstance === instanceId) {
        memory.pendingInstance = null;
      }
    }
    return removed ?? null;
  }

  function resolveEffects(state, definition, pending, choice, outcome, { forced }) {
    const context = pending?.context ?? {};
    const payload = { state, context, choice, definition, outcome, forced, random };
    const templates = [];
    if (Array.isArray(outcome?.effects)) templates.push(...outcome.effects);
    else if (outcome?.effect) templates.push(outcome.effect);
    for (const template of templates) {
      if (!template) continue;
      const label = evaluateMaybeFn(template.label, payload) ?? definition.label;
      const effectKind = evaluateMaybeFn(template.kind, payload) ?? outcome?.kind ?? choice?.kind ?? definition.kind ?? "neutral";
      const target = evaluateMaybeFn(template.target, payload) ?? null;
      const durationDays = template.durationDays ?? 0;
      const durationTicks = template.durationTicks ?? 0;
      const effectPayload = evaluateMaybeFn(template.effect, payload) ?? {};
      applyEffect(state, {
        label,
        kind: effectKind,
        targetId: target,
        durationDays,
        durationTicks,
        effect: effectPayload
      });
    }
  }

  function executeChoice(state, definition, pending, choice, { forced = false, reason = null } = {}) {
    if (!state || !definition || !pending || !choice) return false;
    const context = pending.context ?? {};
    const payload = { state, context, choice, definition, forced, random };

    if (!forced && typeof choice.requirements === "function") {
      let ok = false;
      try {
        ok = !!choice.requirements({ state, context, definition, choice });
      } catch (error) {
        console.error("eventScheduler:requirements failed", error);
        ok = false;
      }
      if (!ok) {
        return false;
      }
    }

    if (reason) {
      logFeed(state, {
        text: `${pending.label}: ${reason}`,
        kind: definition.kind ?? "neutral",
        targetId: context?.assetId ?? null
      });
    }

    const outcome = choice.outcome ?? {};

    if (typeof outcome.apply === "function") {
      try {
        outcome.apply({ state, context, choice, definition, applyEffect, logFeed, forced, random });
      } catch (error) {
        console.error("eventScheduler:outcome.apply failed", error);
      }
    }

    resolveEffects(state, definition, pending, choice, outcome, { forced });

    const outcomePayload = { state, context, choice, definition, forced, outcome, random };
    const outcomeKind = evaluateMaybeFn(outcome.kind, outcomePayload) ?? choice.kind ?? definition.kind ?? "neutral";
    const outcomeText = evaluateMaybeFn(outcome.text, outcomePayload) ?? `${pending.label}: ${choice.label}`;
    const outcomeTarget = evaluateMaybeFn(outcome.targetId, outcomePayload) ?? context?.assetId ?? null;

    if (outcomeText) {
      logFeed(state, { text: outcomeText, kind: outcomeKind, targetId: outcomeTarget });
    }

    const extraFeed = evaluateMaybeFn(outcome.extraFeed, outcomePayload);
    if (Array.isArray(extraFeed)) {
      for (const extra of extraFeed) {
        if (!extra || typeof extra.text !== "string") continue;
        logFeed(state, {
          text: extra.text,
          kind: extra.kind ?? outcomeKind,
          targetId: extra.targetId ?? outcomeTarget
        });
      }
    }

    const memory = ensureMemory(state, definition.id);
    memory.lastChoice = choice.id ?? null;
    memory.lastResolvedDay = Number.isFinite(state.day) ? state.day : memory.lastResolvedDay;
    if (Number.isFinite(outcome.cooldownDays)) {
      memory.cooldownUntilDay = (Number.isFinite(state.day) ? state.day : 0) + outcome.cooldownDays;
    }
    if (Number.isFinite(outcome.cooldownTicks)) {
      memory.cooldownUntilTick = (Number.isFinite(state.tick) ? state.tick : 0) + outcome.cooldownTicks;
    }

    return true;
  }

  function autoResolveExpired(state, phase) {
    if (!state || !Array.isArray(state.pendingEvents) || state.pendingEvents.length === 0) return;
    const nowTick = Number.isFinite(state.tick) ? state.tick : 0;
    const nowDay = Number.isFinite(state.day) ? state.day : 0;

    const expired = [];
    for (const pending of state.pendingEvents) {
      if (!pending) continue;
      const definition = getDefinition(pending.definitionId);
      if (!definition) {
        expired.push({ pending, definition: null, choice: null });
        continue;
      }
      const deadlineTick = pending.deadlineTick;
      const deadlineDay = pending.deadlineDay;
      let due = false;
      if (Number.isFinite(deadlineTick) && nowTick >= deadlineTick) due = true;
      if (!due && phase === "dayStart" && Number.isFinite(deadlineDay) && nowDay >= deadlineDay) due = true;
      if (!due) continue;
      const choice = pickChoice(definition, pending.defaultChoiceId ?? definition.defaultChoiceId);
      expired.push({ pending, definition, choice });
    }

    if (!expired.length) return;

    for (const item of expired) {
      const { pending, definition, choice } = item;
      removePending(state, pending.instanceId);
      if (!definition || !choice) continue;
      executeChoice(state, definition, pending, choice, {
        forced: true,
        reason: "No decision made before the deadline"
      });
    }
  }

  function bootstrap(state) {
    ensureStateShape(state);
  }

  function onTick(state) {
    ensureStateShape(state);
    autoResolveExpired(state, "tick");
    evaluatePhase(state, "tick");
  }

  function onDayStart(state) {
    ensureStateShape(state);
    autoResolveExpired(state, "dayStart");
    evaluatePhase(state, "dayStart");
  }

  function resolve(instanceId, choiceId) {
    if (instanceId == null) return false;
    let resolved = false;
    engine.update((draft) => {
      ensureStateShape(draft);
      const index = draft.pendingEvents.findIndex((item) => item?.instanceId === instanceId);
      if (index === -1) return;
      const pending = draft.pendingEvents[index];
      const definition = getDefinition(pending.definitionId);
      if (!definition) {
        draft.pendingEvents.splice(index, 1);
        return;
      }
      const choice = pickChoice(definition, choiceId);
      if (!choice) {
        return;
      }
      const ok = executeChoice(draft, definition, pending, choice, { forced: false });
      if (!ok) {
        logFeed(draft, {
          text: `${pending.label}: Cannot execute ${choice.label} right now.`,
          kind: "bad",
          targetId: pending.context?.assetId ?? null
        });
        return;
      }
      draft.pendingEvents.splice(index, 1);
      const memory = ensureMemory(draft, definition.id);
      if (memory.pendingInstance === instanceId) {
        memory.pendingInstance = null;
      }
      resolved = true;
    });
    return resolved;
  }

  return {
    bootstrap,
    onTick,
    onDayStart,
    resolve,
    getDefinition,
    getDefinitions: () => EVENT_DEFINITIONS.slice(),
    getPending(state) {
      ensureStateShape(state);
      return state.pendingEvents;
    }
  };
}

export { createEventScheduler };
