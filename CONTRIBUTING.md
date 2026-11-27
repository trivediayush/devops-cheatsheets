# Contributing

Thanks for helping improve DevOps Cheatsheets. Contributions that correct commands, clarify explanations, improve examples, or add useful operational guidance are welcome.

## Before opening a pull request

1. Keep changes focused and explain the problem they solve.
2. Verify commands and examples against the tool or platform version being documented. Mention version-specific behavior where it matters.
3. Preserve the existing category and filename conventions when adding a cheatsheet.
4. Do not include credentials, tokens, private endpoints, or other sensitive information in examples.
5. Keep examples practical, readable, and safe to run. Clearly label destructive commands and production-impacting operations.

## Run the documentation site locally

```bash
npm ci
npm run dev
```

Keep the local VitePress dev/preview server bound to loopback. Do not expose it to untrusted networks.

Before submitting, run the link check and production build:

```bash
npm run check
```

## Pull requests

Include a short summary, the reason for the change, and any relevant tool versions or references. For substantial content updates, describe how the examples were verified.
