# @aevum/assets

Immutable, content-addressed asset registration and metadata contracts for the AEVUM AI Reconstruction Engine.

The package computes SHA-256 identity, proposes canonical `AssetRecord` values, detects exact duplicates, records provenance and licensing, models derivatives and quarantine, and exposes provider-neutral storage interfaces. It does not upload files or mutate the Canonical Design Document; accepted records enter canonical state through `asset.register`.

Allowed workspace dependency: `@aevum/document-model`.

Canonical references: `../../docs/03_DESIGN_DOCUMENT_MODEL.md` and `../../docs/05_TYPOGRAPHY_AND_ASSETS.md`.
