# @aevum/agent-planner

Phase 13 provider-neutral intent and planning engine. Plans are immutable, versioned, fingerprinted, inspectable, and
dependency ordered. Every tool is selected from actor-visible `system.get_capabilities` output and classified before
execution. Missing domains produce explicit capability gaps.

The deterministic provider supports inspection, document rename, node update/offset, and destructive-node fixtures
without an external model. It never interprets untrusted design content as instructions.
