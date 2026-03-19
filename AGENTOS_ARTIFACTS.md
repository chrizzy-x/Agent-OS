# Agent OS Artifacts

This file is the canonical inventory for Agent OS brand assets, logos, and graphics work stored in this repository.

## Current Static Asset Files

1. Primary application icon
   - File: `app/icon.svg`
   - Purpose: canonical Agent OS icon used for browser tab icon, shortcut icon, and Apple touch icon metadata.
   - Visual spec: dark rounded square, purple-to-cyan gradient border, stylized `A` glyph.

## Brand Wiring

1. Metadata wiring
   - File: `app/layout.tsx`
   - Usage: registers `/icon.svg` as the `icon`, `shortcut`, and `apple` icon for the app shell.

2. Shared text treatment
   - File: `app/globals.css`
   - Usage: defines `.gradient-text` and related classes used across the product wordmark and highlight treatments.

## In-App Graphic Usage

1. Landing page wordmark and brand mark
   - File: `app/page.tsx`
   - Usage: top navigation logo tile, hero branding, stat accents, and core visual identity blocks.

2. Docs branding
   - Files:
     - `app/docs/page.tsx`
     - `app/docs/api/page.tsx`
     - `app/docs/audit/page.tsx`
     - `app/docs/launch/page.tsx`
   - Usage: docs navigation brand mark, gradient wordmark, and status/launch presentation.

3. Product console surfaces
   - Files:
     - `app/studio/page.tsx`
     - `app/ops/page.tsx`
     - `app/dashboard/page.tsx`
     - `app/developer/page.tsx`
   - Usage: console/header brand mark and gradient identity treatment.

4. Auth surfaces
   - Files:
     - `app/signup/page.tsx`
     - `app/signin/page.tsx`
     - `app/forgot-password/page.tsx`
   - Usage: wordmark, marketing headline emphasis, and auth entry branding.

5. Marketplace surfaces
   - Files:
     - `app/marketplace/page.tsx`
     - `app/marketplace/[slug]/page.tsx`
   - Usage: marketplace header brand mark and product identity treatment.

## Non-File Graphic Conventions

1. Skill icons are currently data-driven emoji values stored in skill records, not standalone image files.
2. Several product illustrations are rendered from inline SVG or CSS gradients inside page components instead of stored binary assets.
3. No additional PNG, JPG, WEBP, or ICO brand assets are currently stored in the repository.

## Storage Rule Going Forward

1. Add any future static logo or brand-image file under a dedicated product-owned path such as `app/` or `public/brand/`.
2. Update this file whenever a new artifact, logo variant, favicon, social card, or branded illustration file is added.
3. Keep this file as the single inventory record for design and deployment audits.
