import { describe, expect, it } from "vitest";
import { packageContract as commandEngineContract } from "@aevum/command-engine";
import { packageContract as documentModelContract } from "@aevum/document-model";
import { packageContract as exportersContract } from "@aevum/exporters";
import { packageContract as sceneRuntimeContract } from "@aevum/scene-runtime";
import { packageContract as animationCoreContract } from "@aevum/animation-core";
import { CANONICAL_PRODUCT_NAME, createAevumError, createLogger } from "@aevum/shared";

describe("workspace package imports", () => {
  it("imports foundational package contracts through workspace names", () => {
    expect(CANONICAL_PRODUCT_NAME).toBe("AEVUM AI Reconstruction Engine");
    expect(documentModelContract.mustNotOwn).toContain("renderers");
    expect(commandEngineContract.owns).toContain("mutation");
    expect(exportersContract.responsibility).toContain("exporter");
    expect(sceneRuntimeContract.status).toBe("IMPLEMENTED");
    expect(animationCoreContract.responsibility).toContain("timeline");
  });

  it("creates structured errors and logs with correlation context", () => {
    const error = createAevumError({
      code: "CONFIGURATION_ERROR",
      message: "Missing DATABASE_URL.",
      recoverability: "RECOVERABLE",
      suggestedAction: "Set DATABASE_URL in the environment.",
      correlationId: "corr_test",
    });

    const entries: unknown[] = [];
    const logger = createLogger({ correlationId: "corr_test" }, (entry) => entries.push(entry));
    logger.info("phase0.smoke", "Structured logging works.");

    expect(error.toJSON()).toMatchObject({
      code: "CONFIGURATION_ERROR",
      recoverability: "RECOVERABLE",
      correlationId: "corr_test",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ event: "phase0.smoke", correlationId: "corr_test" });
  });
});
