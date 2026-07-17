# AgentOS Beta v7.0.0 - Phase 30

Phase 30 upgrades Skill Store publishing for enterprise builders.

## What changed

- Skill publishing now supports safer draft, review, update, unpublish, and public publish controls.
- The publish step now shows review readiness before a skill can be submitted.
- Review approval is clearly disabled until a real review backend is connected.
- Live runtime tests are clearly disabled until a saved skill is installed from Skill Store.
- Builders can preview a skill invocation through the saved backend preview route.
- Skill pricing now supports free, per-call, and coming-soon states without fake revenue claims.
- Visual uploads are marked disabled until durable media storage is connected, while URL-based visuals remain usable.
- Skill manifest preview is readable in the product instead of forcing users through raw internal payloads.
- AgentOS provenance is now documented with the production domain, canonical GitHub repository, and official `$sAGENT` contract address.

## Official identifiers

- Production domain: https://www.agentos.services
- GitHub repository: https://github.com/chrizzy-x/Agent-OS
- Official `$sAGENT` contract address: `2Fob54QUhUbP9jv6h5XAh3PgB1kcULR6LXbxSzuwpump`

## User impact

Enterprise builders can prepare skill listings with clearer publishing rules, safer review gates, and honest disabled states where backend systems are not live yet. Normal users still see Skill Store install/use surfaces only; publishing remains enterprise-gated.
