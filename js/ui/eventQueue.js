import { EVENT_DEFINITION_MAP } from "../content/events.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const evaluateMaybeFn = (value, payload) => {
  if (typeof value === "function") {
    try {
      return value(payload);
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  return value;
};

const checkChoiceRequirements = (choice, definition, state, context) => {
  if (!choice || typeof choice.requirements !== "function") return true;
  try {
    return !!choice.requirements({ state, context, choice, definition });
  } catch (error) {
    console.error(error);
    return false;
  }
};

const choiceDescription = (choice, definition, state, context) => {
  if (!choice) return "";
  const payload = { state, context, choice, definition };
  const desc = evaluateMaybeFn(choice.description, payload);
  return typeof desc === "string" ? desc : "";
};

const choiceDisabledReason = (choice, definition, state, context) => {
  if (!choice) return "";
  const payload = { state, context, choice, definition };
  const reason = evaluateMaybeFn(choice.disabledReason, payload);
  if (typeof reason === "string" && reason.trim()) return reason;
  return "Requirements not met.";
};

const predictChoiceKind = (choice, definition, state, context) => {
  if (!choice) return definition?.kind ?? "neutral";
  const payload = { state, context, choice, definition };
  const outcomeKind = evaluateMaybeFn(choice.outcome?.kind, payload);
  return (typeof outcomeKind === "string" && outcomeKind) || choice.kind || definition?.kind || "neutral";
};

const toneClass = (kind) => {
  if (kind === "good") return "tag--good";
  if (kind === "bad") return "tag--bad";
  if (kind === "warn") return "tag--warn";
  return "tag--neutral";
};

function renderChoice(choice, definition, pending, state) {
  const context = pending.context && typeof pending.context === "object" ? pending.context : {};
  const allowed = checkChoiceRequirements(choice, definition, state, context);
  const desc = choiceDescription(choice, definition, state, context);
  const reason = !allowed ? choiceDisabledReason(choice, definition, state, context) : "";
  const predictedKind = predictChoiceKind(choice, definition, state, context);
  const className =
    predictedKind === "good" ? "btn btn-primary" : predictedKind === "bad" ? "btn btn-danger" : "btn";
  const tooltip = choice.outcome?.text
    ? ` data-tooltip="${escapeHtml(evaluateMaybeFn(choice.outcome.text, {
        state,
        context,
        choice,
        definition,
        pending
      }) || "" )}"`
    : "";
  const choiceId = choice.id != null ? String(choice.id) : "";
  const instanceId = String(pending.instanceId ?? "");

  return `
    <li class="event-choice">
      <button type="button" class="${className}" data-event-choice data-event-id="${escapeHtml(instanceId)}" data-choice-id="${escapeHtml(choiceId)}" ${
        allowed ? "" : "disabled"
      }${tooltip}>${escapeHtml(choice.label || "Choose")}</button>
      <div class="event-choice__body">
        <p>${desc ? escapeHtml(desc) : "—"}</p>
        ${!allowed && reason ? `<p class="event-choice__reason">${escapeHtml(reason)}</p>` : ""}
      </div>
    </li>
  `;
}

function renderCard(pending, state) {
  if (!pending) return "";
  const definition = pending.definitionId ? EVENT_DEFINITION_MAP.get(pending.definitionId) : null;
  const context = pending.context && typeof pending.context === "object" ? pending.context : {};
  const labelText = pending.label || definition?.label || "Event";
  const fallbackDescription = definition
    ? evaluateMaybeFn(definition.description, { state, context, definition })
    : null;
  const description = pending.description || (typeof fallbackDescription === "string" ? fallbackDescription : "");
  const kind = pending.kind || definition?.kind || "neutral";
  const kindTag = toneClass(kind);
  const deadlineBits = [];
  if (Number.isFinite(pending.deadlineDay)) deadlineBits.push(`D${pending.deadlineDay}`);
  if (Number.isFinite(pending.deadlineTick)) deadlineBits.push(`T${pending.deadlineTick}`);
  const deadlineLabel = deadlineBits.length ? `Resolve by ${deadlineBits.join(" · ")}` : "No fixed deadline";
  const assetTag = context.assetId ? `<span class="event-card__asset">${escapeHtml(context.assetId)}</span>` : "";
  const summary = context.summary || context.reason || context.headline || "";
  const summaryHtml = summary ? `<div class="event-card__summary">${escapeHtml(summary)}</div>` : "";

  const choices = Array.isArray(definition?.choices) ? definition.choices : [];
  const renderedChoices = choices.length
    ? choices.map((choice) => renderChoice(choice, definition, pending, state)).join("")
    : '<li class="event-choice"><div class="event-choice__body"><p>No actions available.</p></div></li>';

  return `
    <article class="event-card" data-event-instance="${pending.instanceId}">
      <header class="event-card__header">
        <div class="event-card__title">
          <span class="tag ${kindTag}">${escapeHtml(kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Neutral")}</span>
          <strong>${escapeHtml(labelText)}</strong>
          ${assetTag}
        </div>
        <div class="event-card__deadline">${escapeHtml(deadlineLabel)}</div>
      </header>
      ${summaryHtml}
      <p class="event-card__description">${description ? escapeHtml(description) : "—"}</p>
      <ul class="event-card__choices">
        ${renderedChoices}
      </ul>
    </article>
  `;
}

export function createEventQueueController({ onResolve } = {}) {
  const root = document.querySelector('[data-module="events"]');
  if (!root) {
    return {
      render() {}
    };
  }

  const listEl = root.querySelector('[data-region="event-list"]');
  const emptyState = root.querySelector('[data-element="events-empty"]');

  if (listEl && typeof onResolve === "function") {
    listEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-event-choice]");
      if (!button || button.disabled) return;
      const instanceId = Number(button.getAttribute("data-event-id"));
      if (!Number.isFinite(instanceId)) return;
      const choiceId = button.getAttribute("data-choice-id") || null;
      onResolve(instanceId, choiceId);
    });
  }

  return {
    render(state) {
      if (!listEl) return;
      const queue = Array.isArray(state?.pendingEvents) ? state.pendingEvents : [];
      if (queue.length === 0) {
        listEl.innerHTML = "";
        if (emptyState) emptyState.classList.remove("is-hidden");
        return;
      }

      const cards = queue.map((pending) => renderCard(pending, state)).filter(Boolean).join("");
      listEl.innerHTML = cards;
      if (emptyState) emptyState.classList.add("is-hidden");
    }
  };
}
