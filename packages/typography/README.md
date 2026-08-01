# @aevum/typography

Professional typography metadata and provider-neutral contracts for the AEVUM AI Reconstruction Engine.

The package models checksum-addressed font records, uploaded/fallback/system families, Unicode and glyph metrics, variable axes, OpenType features, mixed-language runs, and RTL metadata. Measurement, line breaking, shaping, and font parsing are interfaces only so HarfBuzz WASM and OpenType.js can be introduced later without changing the public API.

Allowed workspace dependency: `@aevum/document-model`.

Canonical references: `../../docs/03_DESIGN_DOCUMENT_MODEL.md` and `../../docs/05_TYPOGRAPHY_AND_ASSETS.md`.
