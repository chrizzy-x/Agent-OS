# AgentOS Data Discipline

AgentOS production surfaces must render real backend data, an honest empty state, an actionable error state, or a disabled/coming-soon state.

Production must not show local runtime fallback data, sample catalog rows, generated reviews, generated ratings, generated installs, generated downloads, generated earnings, fake workflow logs, fake validator records, fake proof events, or fake FFP consensus states as real user data.

Development-only fallback data is allowed only when an explicit local fallback flag is enabled. The current store flags are `AGENTOS_ALLOW_LOCAL_APPSTORE_FALLBACK=1` and `AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK=1`. These flags must not be enabled for production.

Marketplace metrics should use these display rules:

- zero installs: `No installs yet`
- zero downloads: `No downloads recorded`
- zero reviews: `No reviews yet`
- missing analytics: `No data`
- missing revenue backend data: `No revenue data`
- zero real revenue records: `No revenue recorded`

App and skill listing pages must not synthesize version history or execution examples. If release notes, changelog, examples, inputs, outputs, screenshots, reviews, or analytics are missing, the page must say they are not published or not recorded.

FFP remains visible but disabled/coming soon until real backend functionality exists. Product surfaces must not display fake validators, fake consensus, fake transactions, or fake proof events.
