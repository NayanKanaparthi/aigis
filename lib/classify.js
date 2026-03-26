const fs = require('fs');
const path = require('path');

const ALL_TRAITS = [
  'uses-llm', 'uses-rag', 'uses-finetuned', 'uses-thirdparty-api', 'is-agentic', 'is-multimodal',
  'processes-pii', 'handles-financial', 'handles-health', 'handles-proprietary', 'handles-minors',
  'influences-decisions', 'accepts-user-input', 'is-external', 'is-internal', 'is-high-volume',
  'generates-code', 'generates-content', 'multi-model-pipeline',
  'jurisdiction-eu', 'jurisdiction-us-regulated', 'jurisdiction-global',
];

const TRAIT_FILES = {
  'uses-llm': ['input-validation', 'output-sanitization', 'prompt-security', 'audit-logging', 'monitoring'],
  'uses-rag': ['rag-security', 'data-integrity'],
  'uses-finetuned': ['data-integrity', 'supply-chain'],
  'uses-thirdparty-api': ['supply-chain'],
  'is-agentic': ['human-oversight', 'rate-limiting', 'fallback-patterns', 'audit-logging'],
  'is-multimodal': ['input-validation', 'output-sanitization', 'pii-handling'],
  'processes-pii': ['pii-handling', 'audit-logging'],
  'handles-financial': ['pii-handling', 'audit-logging', 'bias-monitoring'],
  'handles-health': ['pii-handling', 'audit-logging', 'bias-monitoring', 'explainability'],
  'handles-proprietary': ['pii-handling', 'prompt-security'],
  'handles-minors': ['pii-handling', 'bias-monitoring', 'human-oversight'],
  'influences-decisions': ['bias-monitoring', 'confidence-scoring', 'human-oversight', 'explainability'],
  'accepts-user-input': ['input-validation', 'output-sanitization'],
  'is-external': ['rate-limiting', 'confidence-scoring'],
  'is-internal': [],
  'is-high-volume': ['rate-limiting', 'monitoring', 'fallback-patterns'],
  'generates-code': ['output-sanitization', 'human-oversight', 'fallback-patterns'],
  'generates-content': ['confidence-scoring', 'bias-monitoring', 'audit-logging'],
  'multi-model-pipeline': ['audit-logging', 'monitoring', 'fallback-patterns', 'data-integrity'],
  'jurisdiction-eu': [],
  'jurisdiction-us-regulated': [],
  'jurisdiction-global': [],
};

const FILE_CONTROLS = {
  'input-validation': { owasp: ['LLM01'], nist: ['MEASURE-2.7', 'MANAGE-1.3'], iso: ['Clause-8.2', 'Annex-A.6'] },
  'output-sanitization': { owasp: ['LLM05'], nist: ['MEASURE-2.6', 'MEASURE-2.7'], iso: ['Clause-8.2'] },
  'pii-handling': { owasp: ['LLM02'], nist: ['MAP-2.1', 'MEASURE-2.10'], iso: ['Annex-A.7', 'Annex-A.4'] },
  'prompt-security': { owasp: ['LLM07'], nist: ['MEASURE-2.7', 'MEASURE-2.8'], iso: ['Clause-8.2'] },
  'human-oversight': { owasp: ['LLM06'], nist: ['MAP-3.5', 'MANAGE-1.3', 'MANAGE-4.1'], iso: ['Annex-A.9', 'Clause-8.4'] },
  'supply-chain': { owasp: ['LLM03'], nist: ['GOVERN-6.1', 'GOVERN-6.2', 'MANAGE-3.1', 'MANAGE-3.2'], iso: ['Annex-A.10'] },
  'data-integrity': { owasp: ['LLM04'], nist: ['MAP-2.3', 'MEASURE-2.6'], iso: ['Annex-A.7'] },
  'rag-security': { owasp: ['LLM08'], nist: ['MEASURE-2.7'], iso: ['Clause-8.2', 'Annex-A.7'] },
  'confidence-scoring': { owasp: ['LLM09'], nist: ['MAP-2.2', 'MEASURE-2.5', 'MEASURE-2.9'], iso: ['Annex-A.8'] },
  'rate-limiting': { owasp: ['LLM10'], nist: ['MEASURE-2.6', 'MANAGE-2.4'], iso: ['Clause-8.2'] },
  'audit-logging': { owasp: [], nist: ['MEASURE-2.8', 'MANAGE-4.1', 'MANAGE-4.3'], iso: ['Clause-9.1', 'Annex-A.6'] },
  'bias-monitoring': { owasp: [], nist: ['MAP-2.3', 'MEASURE-2.11', 'MEASURE-3.1'], iso: ['Clause-6.1', 'Annex-C'] },
  'fallback-patterns': { owasp: [], nist: ['MEASURE-2.6', 'MANAGE-2.3', 'MANAGE-2.4'], iso: ['Clause-8.2'] },
  'monitoring': { owasp: [], nist: ['MEASURE-2.4', 'MEASURE-3.1', 'MANAGE-4.1', 'MANAGE-4.2'], iso: ['Clause-9.1', 'Clause-10'] },
  'explainability': { owasp: [], nist: ['MEASURE-2.8', 'MEASURE-2.9'], iso: ['Annex-A.8', 'Clause-7.4'] },
};

function classify(traitList) {
  const ts = new Set(traitList);
  const warnings = [];

  // Validate traits
  const invalid = traitList.filter(t => !ALL_TRAITS.includes(t));
  if (invalid.length > 0) {
    throw new Error(`Unknown traits: ${invalid.join(', ')}. Run "aigis traits" to see available traits.`);
  }

  // Constraint C1: is-internal + is-external
  if (ts.has('is-internal') && ts.has('is-external')) {
    warnings.push('Both is-internal and is-external selected. Treating as is-external (stricter).');
    ts.delete('is-internal');
  }

  // Step 1: Trait-based file selection
  const files = new Set();
  for (const t of ts) {
    for (const f of (TRAIT_FILES[t] || [])) {
      files.add(f);
    }
  }

  // Step 2: Risk tier
  const sensData = ts.has('processes-pii') || ts.has('handles-financial') || ts.has('handles-health') || ts.has('handles-proprietary') || ts.has('handles-minors');

  let tier = 'LOW';
  let reason = 'no high/medium triggers';

  if (ts.has('influences-decisions')) { tier = 'HIGH'; reason = 'influences-decisions'; }
  else if (ts.has('handles-health')) { tier = 'HIGH'; reason = 'handles-health'; }
  else if (ts.has('handles-financial') && ts.has('accepts-user-input')) { tier = 'HIGH'; reason = 'handles-financial + accepts-user-input'; }
  else if (ts.has('handles-minors')) { tier = 'HIGH'; reason = 'handles-minors'; }
  else if ((ts.has('jurisdiction-eu') || ts.has('jurisdiction-global')) && sensData) { tier = 'HIGH'; reason = 'jurisdiction-eu + sensitive data'; }
  else if (ts.has('generates-code') && ts.has('is-external')) { tier = 'HIGH'; reason = 'generates-code + is-external'; }
  else if (ts.has('generates-code') && ts.has('is-agentic')) { tier = 'HIGH'; reason = 'generates-code + is-agentic'; }
  else if (ts.has('processes-pii')) { tier = 'MEDIUM'; reason = 'processes-pii'; }
  else if (ts.has('is-external')) { tier = 'MEDIUM'; reason = 'is-external'; }
  else if (ts.has('is-agentic')) { tier = 'MEDIUM'; reason = 'is-agentic'; }
  else if (ts.has('handles-proprietary')) { tier = 'MEDIUM'; reason = 'handles-proprietary'; }
  else if (ts.has('generates-content')) { tier = 'MEDIUM'; reason = 'generates-content'; }
  else if (ts.has('multi-model-pipeline')) { tier = 'MEDIUM'; reason = 'multi-model-pipeline'; }
  else if (ts.has('jurisdiction-us-regulated')) { tier = 'MEDIUM'; reason = 'jurisdiction-us-regulated'; }
  else if (ts.has('generates-code')) { tier = 'MEDIUM'; reason = 'generates-code'; }

  // Jurisdiction modifier
  if ((ts.has('jurisdiction-eu') || ts.has('jurisdiction-global')) && tier !== 'HIGH') {
    const oldTier = tier;
    tier = tier === 'LOW' ? 'MEDIUM' : 'HIGH';
    reason += ` (elevated from ${oldTier} by EU/global jurisdiction)`;
  }

  // Step 3: Guardrails
  const guardrailsFired = [];

  const guardrails = [
    { id: 'G1', cond: () => sensData && !files.has('audit-logging'), file: 'audit-logging', rationale: 'Sensitive data requires traceability' },
    { id: 'G2', cond: () => ts.has('handles-health') && !files.has('bias-monitoring'), file: 'bias-monitoring', rationale: 'Health data has demographic bias risks' },
    { id: 'G3', cond: () => ts.has('handles-financial') && ts.has('influences-decisions') && !files.has('fallback-patterns'), file: 'fallback-patterns', rationale: 'Financial decisions need safe failure' },
    { id: 'G4', cond: () => ts.has('is-agentic') && !files.has('human-oversight'), file: 'human-oversight', rationale: 'Autonomous systems need oversight' },
    { id: 'G5', cond: () => ts.has('generates-code') && !files.has('output-sanitization'), file: 'output-sanitization', rationale: 'Generated code is execution risk' },
    { id: 'G6', cond: () => ts.has('jurisdiction-eu') && !files.has('explainability'), file: 'explainability', rationale: 'EU AI Act requires explainability' },
    { id: 'G7', cond: () => ts.has('jurisdiction-eu') && !files.has('bias-monitoring'), file: 'bias-monitoring', rationale: 'EU AI Act mandates non-discrimination' },
    { id: 'G8', cond: () => ts.has('handles-minors') && !files.has('human-oversight'), file: 'human-oversight', rationale: 'Systems affecting children require review' },
    { id: 'G9', cond: () => ts.has('multi-model-pipeline') && !files.has('monitoring'), file: 'monitoring', rationale: 'Multi-model compounding failures' },
    { id: 'G10', cond: () => tier === 'HIGH' && !files.has('monitoring'), file: 'monitoring', rationale: 'High-risk systems need monitoring' },
    { id: 'G11', cond: () => tier === 'HIGH' && !files.has('fallback-patterns'), file: 'fallback-patterns', rationale: 'High-risk systems must fail safely' },
    { id: 'G13', cond: () => ts.has('jurisdiction-us-regulated') && !files.has('audit-logging'), file: 'audit-logging', rationale: 'US regulated industries need audit trails' },
    { id: 'G14', cond: () => ts.has('jurisdiction-us-regulated') && !files.has('human-oversight'), file: 'human-oversight', rationale: 'US regulated industries need human review' },
    { id: 'G15', cond: () => ts.has('generates-code') && !files.has('human-oversight'), file: 'human-oversight', rationale: 'Code generation needs human review' },
  ];

  // Removal guardrail
  if (ts.has('uses-llm') && !ts.has('uses-thirdparty-api') && files.has('supply-chain')) {
    files.delete('supply-chain');
    guardrailsFired.push({ id: 'G12', action: 'REMOVE supply-chain', rationale: 'Self-hosted models skip third-party controls' });
  }

  for (const g of guardrails) {
    if (g.cond()) {
      files.add(g.file);
      guardrailsFired.push({ id: g.id, action: `ADD ${g.file}`, rationale: g.rationale });
    }
  }

  // Step 4: Templates
  const templates = [];
  if (tier === 'HIGH' || ts.has('jurisdiction-eu') || ts.has('jurisdiction-global') || ts.has('influences-decisions')) {
    templates.push('ai-impact-assessment', 'intended-purpose-doc', 'risk-characterization');
  } else if (tier === 'MEDIUM' || ts.has('jurisdiction-us-regulated')) {
    templates.push('intended-purpose-doc');
  }
  if (ts.has('uses-thirdparty-api') && tier !== 'LOW') {
    templates.push('third-party-assessment');
  }
  // Jurisdiction overrides
  if (ts.has('jurisdiction-us-regulated') && !templates.includes('ai-impact-assessment')) {
    templates.unshift('ai-impact-assessment');
  }

  // Step 5: Collect control IDs
  const allOwasp = new Set();
  const allNist = new Set();
  const allIso = new Set();
  for (const f of files) {
    const c = FILE_CONTROLS[f];
    if (c) {
      c.owasp.forEach(x => allOwasp.add(x));
      c.nist.forEach(x => allNist.add(x));
      c.iso.forEach(x => allIso.add(x));
    }
  }

  return {
    risk_tier: tier,
    reason,
    traits: [...ts],
    implement_files: [...files].sort(),
    templates: [...new Set(templates)],
    guardrails_fired: guardrailsFired,
    warnings,
    controls: {
      owasp: [...allOwasp].sort(),
      nist: [...allNist].sort(),
      iso: [...allIso].sort(),
    },
  };
}

module.exports = { classify, ALL_TRAITS };
