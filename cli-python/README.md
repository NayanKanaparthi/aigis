# aigis-cli (Python)

AI governance guardrails for coding agents. Python port of the [@aigis-ai/cli](https://www.npmjs.com/package/@aigis-ai/cli) npm package.

Curated, agent-consumable security and compliance patterns from NIST AI RMF, OWASP Top 10 for LLMs, and ISO/IEC 42001.

## Install

```bash
pip install aigis-cli
```

## Quick start

```bash
aigis classify --traits uses-llm,processes-pii,accepts-user-input
aigis get input-validation pii-handling
aigis verify input-validation pii-handling
aigis template ai-impact-assessment
aigis audit --scan
aigis search pii
aigis traits
aigis init cursor
```

## Documentation

See the full documentation at [github.com/NayanKanaparthi/aigis](https://github.com/NayanKanaparthi/aigis).

## License

[MIT](LICENSE)
