import { AnimationStateMachineSchema, type AnimationStateMachine } from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import { stableHash } from "./stable.js";
import type { AnimationAction, JsonValue, ResolvedAnimationState, StateMachineEvaluationInput } from "./types.js";

export function createStateMachine(input: unknown): Readonly<AnimationStateMachine> {
  return deepFreeze(AnimationStateMachineSchema.parse(input));
}

function conditionPasses(
  condition: NonNullable<AnimationStateMachine["transitions"][number]["guard"]>["conditions"][number],
  variables: Readonly<Record<string, JsonValue>>,
): boolean {
  const actual = variables[condition.variable];
  switch (condition.operator) {
    case "EQUALS":
      return JSON.stringify(actual) === JSON.stringify(condition.value);
    case "NOT_EQUALS":
      return JSON.stringify(actual) !== JSON.stringify(condition.value);
    case "GREATER_THAN":
      return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "LESS_THAN":
      return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "TRUTHY":
      return Boolean(actual);
    case "FALSY":
      return !actual;
  }
  return false;
}

function guardPasses(
  guard: AnimationStateMachine["transitions"][number]["guard"],
  variables: Readonly<Record<string, JsonValue>>,
): boolean {
  if (!guard) return true;
  const results = guard.conditions.map((condition) => conditionPasses(condition, variables));
  return guard.mode === "ALL" ? results.every(Boolean) : results.some(Boolean);
}

function applyVariables(
  variables: Readonly<Record<string, JsonValue>>,
  actions: readonly AnimationAction[],
): Record<string, JsonValue> {
  const next = { ...variables };
  for (const action of actions) {
    if (action.type === "SET_VARIABLE" && action.name && action.value !== undefined) next[action.name] = action.value;
  }
  return next;
}

export function evaluateAnimationState(
  machine: AnimationStateMachine,
  input: StateMachineEvaluationInput = {},
): Readonly<ResolvedAnimationState> {
  const previousStateId = input.currentStateId ?? machine.initialStateId;
  const previous = machine.states.find((state) => state.id === previousStateId);
  if (!previous) throw new Error(`Animation state ${previousStateId} does not exist in ${machine.id}.`);
  const variables = input.variables ?? {};
  const transition = [...machine.transitions]
    .filter(
      (candidate) =>
        candidate.fromStateId === previousStateId &&
        (candidate.triggerId === undefined || candidate.triggerId === input.triggerId) &&
        guardPasses(candidate.guard, variables),
    )
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))[0];
  const current = transition ? machine.states.find((state) => state.id === transition.toStateId) : previous;
  if (!current) throw new Error(`Transition ${transition?.id ?? "unknown"} targets a missing state.`);
  const actions = transition ? [...previous.exitActions, ...transition.actions, ...current.entryActions] : [];
  const nextVariables = applyVariables(variables, actions);
  return deepFreeze({
    machineId: machine.id,
    machineVersion: machine.version,
    previousStateId,
    currentStateId: current.id,
    ...(transition ? { transitionId: transition.id } : {}),
    ...(current.timelineId ? { timelineId: current.timelineId } : {}),
    actions,
    variables: nextVariables,
    fingerprint: `sha256:${stableHash({ machine, input, currentStateId: current.id, actions, nextVariables })}`,
  });
}
