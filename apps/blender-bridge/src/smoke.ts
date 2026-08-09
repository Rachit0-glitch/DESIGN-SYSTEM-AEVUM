import { env } from "@aevum/shared";
import { blenderBridgeConfig } from "./config.js";
import { inspectBlenderRuntime } from "./runtime.js";

const runtime = await inspectBlenderRuntime(blenderBridgeConfig(env));
process.stdout.write(
  `${JSON.stringify({
    protocolVersion: runtime.protocolVersion,
    blenderVersion: runtime.blenderVersion,
    pythonVersion: runtime.pythonVersion,
    platform: runtime.platform,
    compatibility: runtime.compatibility,
    headless: runtime.headless,
  })}\n`,
);
