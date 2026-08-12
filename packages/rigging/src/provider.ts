import { buildBasicHumanoidTemplate } from "./templates/humanoid.js";
import { buildMechanicalChainTemplate, type MechanicalChainOptions } from "./templates/mechanical.js";
import type { RigTemplateId, RigTemplateResult } from "./schemas.js";

/**
 * Provider-neutral rig-generation interface (Phase 19B §28). No paid or external rigging
 * service is integrated — every registered provider here is a deterministic local template,
 * used for architecture testing, not a claim of universal auto-rigging.
 */
export interface AutoRigProvider {
  readonly id: RigTemplateId;
  readonly version: string;
  generate(options?: MechanicalChainOptions): RigTemplateResult;
}

export function createMechanicalChainProvider(): AutoRigProvider {
  return {
    id: "MECHANICAL_CHAIN",
    version: "1.0.0",
    generate(options) {
      return buildMechanicalChainTemplate(options);
    },
  };
}

export function createBasicHumanoidProvider(): AutoRigProvider {
  return {
    id: "BASIC_HUMANOID",
    version: "1.0.0",
    generate() {
      return buildBasicHumanoidTemplate();
    },
  };
}

export function listAutoRigProviders(): readonly AutoRigProvider[] {
  return [createMechanicalChainProvider(), createBasicHumanoidProvider()];
}

export function findAutoRigProvider(id: RigTemplateId): AutoRigProvider | undefined {
  return listAutoRigProviders().find((provider) => provider.id === id);
}
