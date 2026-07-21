# Agent Credits

Agent Credits are AgentOS compute accounting. They are separate from Appstore and Skill Store monetization.

## Current State

The current build exposes the credit surface honestly, but no real credit ledger is connected yet.

AgentOS must not invent:

- credit balances
- weekly allowances
- reset windows
- low-credit warnings
- usage history
- sources that consumed credits

## Required Runtime Contract

When backend telemetry exists, credit payloads should provide:

- current balance
- weekly allowance
- reset window
- usage history
- what consumed credits
- low-credit warning state
- upgrade path

Until then, Home and Settings show a disabled or not-connected state.

## Product Boundary

Agent Credits belong to the AgentOS platform compute layer. Developer earnings from apps and skills remain a separate monetization surface.
