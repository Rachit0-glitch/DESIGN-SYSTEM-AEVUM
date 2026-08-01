import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { z } from "zod";
import type { AppliedChanges } from "./changes.js";
import { commandError } from "./errors.js";
import type { CommandEventDraft } from "./events.js";
import type { Command, CommandType } from "./schemas.js";

export interface CommandApplication {
  readonly document: CanonicalDesignDocument;
  readonly changes: AppliedChanges;
  readonly event: CommandEventDraft;
}

export interface CommandDefinition<TCommand extends Command = Command> {
  readonly type: TCommand["type"];
  readonly schema: z.ZodType<TCommand>;
  canExecute(document: CanonicalDesignDocument | null, command: TCommand): void;
  apply(document: CanonicalDesignDocument | null, command: TCommand): CommandApplication;
}

const commandDefinitions = new Map<CommandType, CommandDefinition>();

export function registerCommand<TCommand extends Command>(definition: CommandDefinition<TCommand>): void {
  if (commandDefinitions.has(definition.type)) {
    throw commandError("CONFLICT_ERROR", `Command type ${definition.type} is already registered.`, {
      commandType: definition.type,
    });
  }
  commandDefinitions.set(definition.type, definition as unknown as CommandDefinition);
}

export function getCommand(type: string): CommandDefinition {
  const definition = commandDefinitions.get(type as CommandType);
  if (!definition) {
    throw commandError("UNKNOWN_COMMAND", `Unknown command type: ${type}.`, { commandType: type });
  }
  return definition;
}

export function listCommands(): readonly CommandType[] {
  return [...commandDefinitions.keys()].sort();
}

export function parseRegisteredCommand(input: unknown): Command {
  if (typeof input !== "object" || input === null || !("type" in input) || typeof input.type !== "string") {
    throw commandError("COMMAND_VALIDATION_ERROR", "Command must contain a string type.");
  }
  const definition = getCommand(input.type);
  const parsed = definition.schema.safeParse(input);
  if (!parsed.success) {
    throw commandError("COMMAND_VALIDATION_ERROR", `Invalid ${input.type} command.`, {
      issues: parsed.error.issues.map((entry) => ({ path: entry.path.join("."), message: entry.message })),
    });
  }
  return parsed.data;
}
