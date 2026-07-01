# Publishing

AgentOS V6.6.7 exposes official Appstore and Skillstore publishing flows through the Developer Console.

## Publish App

Route: `/publish/app`

Flow:

1. Build App
2. Configure App
3. Store Listing
4. Publish

Required listing fields include name, icon, banner, screenshots, gallery, video, description, long description, category, tags, developer, website, support, privacy policy, terms, permissions, version, release notes, changelog, and pricing.

Actions: Publish, Draft, Update, Unpublish, Submit Review.

`/developer/publish` remains a compatibility redirect to `/publish/app`.

## Publish Skill

Route: `/publish/skill`

Flow:

1. Create Skill
2. Configure Skill
3. Store Listing
4. Publish

Required listing fields include name, icon, banner, screenshots, gallery, examples, description, long description, category, capability tags, compatible apps, compatible agents, compatible workflows, permissions, required secrets, version, release notes, changelog, and pricing.

Actions: Publish, Draft, Update, Unpublish, Submit Review.

## Review Pipeline

Listings move through Draft, Submitted, Reviewing, Approved, Rejected, Published, Update Pending, and Unpublished. Rejected listings persist a rejection reason for the Developer Console.

## Media Manager

App and skill editors support URL entry, delete, reorder, preview, and validation. App screenshots can be uploaded after the app slug exists. Icon, banner, gallery, and video binary uploads are visibly disabled until durable media storage is available. Store previews render with the same marketplace card and detail structure used in Appstore and Skillstore surfaces.

## Developer Console

Developer is table-first and includes Overview, Apps, Skills, Reviews, Media, Analytics, Revenue, SDK, Webhooks, and Settings. Analytics and revenue use real API data or empty states only.

Webhook management supports create, edit, delete, logs, failures, retries, secrets, and callback URLs through `/api/developer/webhooks`.

## Publish Side Effects

Publishing creates or updates the store page, search index inputs, developer listing metadata, discovery payloads, recommendation inputs, and workspace asset registry records. No manual marketplace registration is required after publishing.
