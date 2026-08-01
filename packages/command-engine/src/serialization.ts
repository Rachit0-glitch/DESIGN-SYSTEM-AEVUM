import { randomUUID } from "node:crypto";
import "./builtins.js";
import { deepFreeze } from "./freeze.js";
import type { Command } from "./schemas.js";
import { parseRegisteredCommand } from "./registry.js";

export function createCommandId(): `cmd_${string}` {
  return `cmd_${randomUUID()}`;
}

export function createTransactionId(): `tx_${string}` {
  return `tx_${randomUUID()}`;
}

export function serializeCommand(command: Command, pretty = false): string {
  return JSON.stringify(parseRegisteredCommand(command), null, pretty ? 2 : undefined);
}

export function deserializeCommand(serialized: string): Command {
  let input: unknown;
  try {
    input = JSON.parse(serialized);
  } catch (error) {
    throw new SyntaxError(
      `Command is not valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }
  return deepFreeze(parseRegisteredCommand(input));
}

export function validateCommand(input: unknown): Command {
  return deepFreeze(parseRegisteredCommand(input));
}
