const KEYWORD_MAP = {
  'uses-llm': [
    'llm', 'language model', 'gpt', 'claude', 'chatbot', 'chat bot', 'bot',
    'generative ai', 'gen ai', 'genai', 'openai', 'anthropic', 'gemini',
    'mistral', 'cohere', 'completion', 'prompt', 'chat completion',
    'text generation', 'natural language', 'nlp',
  ],
  'uses-rag': [
    'rag', 'retrieval', 'vector', 'embedding', 'knowledge base', 'knowledgebase',
    'pinecone', 'weaviate', 'chromadb', 'chroma', 'qdrant', 'pgvector',
    'faiss', 'milvus', 'semantic search', 'document search', 'vector db',
    'vector database', 'vector store',
  ],
  'uses-finetuned': [
    'fine-tune', 'finetune', 'fine tune', 'custom model', 'trained model',
    'lora', 'qlora', 'peft', 'sft', 'custom trained', 'training data',
    'fine-tuning',
  ],
  'uses-thirdparty-api': [
    'openai api', 'anthropic api', 'api key', 'third party', 'third-party',
    'external model', 'model provider', 'hosted model', 'api provider',
    'cloud model', 'model api',
  ],
  'is-agentic': [
    'agent', 'agentic', 'autonomous', 'auto-execute', 'takes actions',
    'tool use', 'function calling', 'tool calling', 'writes to database',
    'sends email', 'executes code', 'multi-step', 'self-directed',
    'langchain agent', 'autogen', 'crewai',
  ],
  'is-multimodal': [
    'multimodal', 'multi-modal', 'image', 'audio', 'video', 'vision',
    'speech', 'voice', 'text-to-speech', 'speech-to-text', 'ocr',
    'image generation', 'dall-e', 'stable diffusion', 'whisper',
  ],
  'processes-pii': [
    'pii', 'personal data', 'personally identifiable', 'names', 'emails',
    'email address', 'phone number', 'ssn', 'social security', 'address',
    'date of birth', 'user data', 'customer data', 'gdpr', 'personal information',
  ],
  'handles-financial': [
    'financial', 'finance', 'banking', 'payment', 'credit', 'debit',
    'transaction', 'insurance', 'claim', 'policy', 'lending', 'loan',
    'mortgage', 'investment', 'trading', 'fintech', 'account balance',
    'credit card', 'credit score',
  ],
  'handles-health': [
    'health', 'medical', 'clinical', 'patient', 'diagnosis', 'prescription',
    'hipaa', 'healthcare', 'hospital', 'doctor', 'treatment', 'symptom',
    'disease', 'medication', 'ehr', 'electronic health', 'pharma',
    'pharmaceutical',
  ],
  'handles-proprietary': [
    'proprietary', 'trade secret', 'confidential', 'internal only',
    'competitive', 'intellectual property', 'ip', 'source code analysis',
    'strategy', 'classified',
  ],
  'handles-minors': [
    'children', 'child', 'minor', 'kid', 'student', 'school', 'coppa',
    'under 13', 'under 16', 'parental', 'youth', 'teen', 'education',
    'k-12', 'k12',
  ],
  'influences-decisions': [
    'decision', 'approve', 'deny', 'reject', 'score', 'rank', 'filter',
    'hiring', 'recruitment', 'credit decision', 'loan decision',
    'eligibility', 'assessment', 'evaluation', 'grading', 'sentencing',
    'recommendation', 'determines', 'affects people',
  ],
  'accepts-user-input': [
    'user input', 'user text', 'chat', 'message', 'form', 'text area',
    'text input', 'free text', 'user query', 'search box', 'prompt input',
    'customer message', 'user message', 'text field',
  ],
  'is-external': [
    'customer', 'public', 'external', 'user-facing', 'customer-facing',
    'consumer', 'website', 'app', 'saas', 'product', 'end user',
    'client-facing',
  ],
  'is-internal': [
    'internal', 'employee', 'staff only', 'back office', 'internal tool',
    'admin only', 'intranet', 'corporate only',
  ],
  'is-high-volume': [
    'high volume', 'production', 'scale', 'thousands', 'millions',
    'high traffic', 'load balancer', 'auto-scaling', 'enterprise',
    'at scale', 'high throughput',
  ],
  'generates-code': [
    'generates code', 'code generation', 'sql generation', 'writes code',
    'code execution', 'executes code', 'eval', 'exec', 'coding assistant',
    'code interpreter',
  ],
  'generates-content': [
    'generates content', 'content generation', 'marketing copy', 'blog post',
    'email generation', 'social media', 'article', 'report generation',
    'publish', 'customer email', 'notification',
  ],
  'multi-model-pipeline': [
    'pipeline', 'chain', 'multi-model', 'multi model', 'sequential',
    'model chain', 'orchestration', 'workflow', 'first model',
    'second model', 'feeds into',
  ],
  'jurisdiction-eu': [
    'eu', 'european', 'europe', 'gdpr', 'eu ai act', 'ai act',
    'european union', 'germany', 'france', 'brussels',
  ],
  'jurisdiction-us-regulated': [
    'hipaa', 'fcra', 'ferpa', 'fedramp', 'soc2', 'regulated',
    'compliance', 'banking regulation', 'sec', 'finra', 'occ',
    'us regulated', 'federal',
  ],
  'jurisdiction-global': [
    'global', 'worldwide', 'international', 'multi-country', 'multi country',
    'cross-border', 'multiple countries', 'global deployment',
  ],
};

function detectTraitsFromText(text) {
  const textLower = text.toLowerCase();
  const detected = [];
  const seen = new Set();

  for (const [trait, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword) && !seen.has(trait)) {
        seen.add(trait);
        detected.push({
          trait,
          keyword,
          confidence: keyword.length > 4 ? 'high' : 'medium',
        });
        break;
      }
    }
  }

  return detected;
}

module.exports = { detectTraitsFromText, KEYWORD_MAP };
