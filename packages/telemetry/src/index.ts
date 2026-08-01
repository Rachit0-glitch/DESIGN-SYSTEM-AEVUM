import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/telemetry",
  kind: "package",
  responsibility: "Structured logs, traces, metrics, timings, error correlation, and audit-event contracts.",
  owns: "Observability primitives beyond generic shared envelopes.",
  mustNotOwn: "Own domain behavior or mutate canonical state.",
  status: "PHASE_0_SHELL",
};

export const TELEMETRY_STATUS = packageContract.status;
