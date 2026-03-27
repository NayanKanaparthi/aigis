---
id: intended-purpose-doc
title: Intended Purpose Documentation
framework: NIST MAP 1.1
required_when: risk_tier=HIGH OR risk_tier=MEDIUM
---

# Intended purpose documentation

> Maps to NIST AI RMF MAP 1.1. The agent generates this alongside code for medium and high-risk systems.

## System purpose
- **Primary function:** [Summarize in 1-2 sentences. Focus on WHAT the system does and WHY, not HOW. Example: "Routes insurance claims to appropriate handling tracks based on AI-assessed severity to reduce triage time from 4 hours to under 5 minutes"]
- **Problem it solves:** [Describe the business problem in user terms, not technical terms. Example: "Manual claim triage is slow and inconsistent across adjusters, causing delays for customers and uneven workloads"]
- **What it does NOT do:** [limitations, inferred from system type]

## Intended users
- **Primary users:** [List specific roles, their expertise level, and how they interact with the system. Example: "Claims processors (non-technical, 2+ years claims experience) view AI recommendations in the claims management UI"]
- **User expertise level:** [Describe the business problem in user terms, not technical terms. Example: "Manual claim triage is slow and inconsistent across adjusters, causing delays for customers and uneven workloads"]
- **Training required:** [recommended based on system complexity]

## Deployment context
- **Environment:** [production/staging/internal]
- **Access scope:** [internal-only / customer-facing / public]
- **Geographic scope:** [List countries/regions based on jurisdiction traits. If jurisdiction-eu: list EU member states served. If jurisdiction-global: list all regions]
- **Expected volume:** [If is-high-volume: estimate requests/day and concurrent users. Otherwise: state "Low volume, <1000 requests/day"]

## Known limitations
- [List 3-5 concrete limitations. Reference known limitations from the model provider. Example: "Cannot verify factual claims in claim descriptions", "Performance degrades below 20-word inputs"]
- The system should NOT be used for: [generated]

## Legal and regulatory context
- **Applicable regulations:** [List countries/regions based on jurisdiction traits. If jurisdiction-eu: list EU member states served. If jurisdiction-global: list all regions]
- **Compliance requirements:** [list of applicable frameworks]

## Stakeholder expectations
- **Organization:** [alignment with organizational mission — requires human input]
- **Users:** [what users expect from the system]
- **Affected individuals:** [what people affected by decisions expect]
