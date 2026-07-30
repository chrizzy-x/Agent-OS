# AgentOS Product Vocabulary

This document keeps public docs, in-app copy, and release notes aligned with the production AgentOS product map.

## Product Thesis

AgentOS is an operating intelligence ecosystem. Super AgentOS is the command layer, and the workspace routes work into apps, skills, workflows, subagents, projects, Library assets, memory, Vault secrets, Universal MCP tools, and future FFP primitives.

AgentOS must not be described as only a chatbot, only a coding assistant, only an app marketplace, or only an MCP host.

## User Surfaces

- Home is the signed-in command overview and should use real workspace data or honest empty states.
- Studio contains NL Studio, Workflow Builder, and Code Studio as one workspace system.
- Library is the durable inventory for installed apps, installed skills, workflows, projects, subagents, files, outputs, downloads, and reusable workspace assets.
- Projects are durable context containers for sessions, files, assets, workflows, subagents, apps, and skills.
- Settings controls account, plan, credits, memory, appearance, notifications, security, Vault, connected tools, developer access, data/privacy, and billing.

## Apps

SDK apps are product surfaces registered through the AgentOS SDK and publishing flow. An app can become Appstore-discoverable only after registration, metadata, verification, listing review, and install/open integration.

Apps can be free or priced when monetization backend support exists. Apps may appear in Library after installation. Apps are not the same thing as MCP connectors.

## Skills

Skills are modular capabilities that Super AgentOS, workflows, and subagents can use after installation. Skills can be free or priced when the Skill Store publishing and monetization path supports it.

Skills are not generic agents. Skills are installed capabilities with metadata, supported surfaces, permissions, versioning, and examples.

## Subagents

Subagents are user-created operators. The user-facing subagent types are Incognito, Public, and Workflow.

Incognito subagents are the user-private operating mode. Public subagents can be discoverable where supported. Workflow subagents are configured for workflow execution. Subagents are not the monetization layer.

## Workflows

Workflows are reusable execution graphs. They can use prompts, skills, apps, subagents, Vault permission nodes, MCP tools, triggers, and outputs where backend support exists.

Workflows can be discovered, starred, forked, and shared where supported, but they are not paid marketplace products. Forking must not copy Vault secrets, private project data, or private memory.

## Vault

Vault is the secure permission layer for secrets. Secrets never become normal memory, chat text, public listing content, screenshots, or workflow logs.

Vault should expose secret labels, status, permission reason, assignment, runtime grant, revocation, and audit state. Secret values remain hidden by default.

## Universal MCP

Universal MCP is the external connector layer. It connects outside tools and external agents to Super AgentOS routing.

MCP connectors do not automatically become Appstore apps. SDK apps and MCP tools have separate registration, permission, health, listing, installation, and monetization rules.

## FFP

FFP is visible but disabled/coming soon until real backend functionality exists.

AgentOS must not claim live FFP validators, proof events, transactions, voting, decentralization, or consensus routing unless those systems are actually connected and tested.

## Agent Credits

Agent Credits are platform compute accounting. Credits are separate from Appstore and Skill Store pricing, developer revenue, and the 30% platform cut.

Credit balances, reset windows, allowance, and usage history must come from real telemetry. If telemetry is unavailable, the UI should show an honest unavailable or empty state.

## Monetization

Apps and skills are monetizable surfaces. Workflows and subagents are not the monetization layer.

Developer earnings are separate from Agent Credits. Earnings, revenue splits, platform cuts, ratings, reviews, installs, usage metrics, and payouts must not be fabricated.

## Data Discipline

Use real data where available. Use honest empty states where data is unavailable. Use disabled or coming-soon states where backend support is missing.

Do not expose raw JSON, orchestration payloads, stack traces, secret values, fake validators, fake proof events, fake logs, fake earnings, fake ratings, fake installs, or fake usage metrics to normal users.
