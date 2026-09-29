'use strict';
/* global SOURCES, QUIZ, REVIEW */

// ---------- Shared helpers ----------

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const head = (eyebrow, title) => `<p class="eyebrow">${eyebrow}</p><h1 tabindex="-1">${title}</h1>`;
const core = (q) => `<div class="core"><span class="label">Core question</span><p>${q}</p></div>`;
const def = (term, body) => `<section class="def" aria-label="Definition: ${esc(term)}"><span class="label">Definition</span><h4>${term}</h4>${body}</section>`;
const saveBtn = (text) => `<button type="button" class="btn ghost sm" data-action="save-note" data-note="${esc(text)}">Save to PM notes</button>`;
const pmBox = (label, body, note) => `<aside class="pm"><span class="label">${label}</span>${body}${note ? `<div class="row-actions">${saveBtn(note)}</div>` : ''}</aside>`;
const fb = (ok, title, body) => `<div class="fb ${ok ? 'ok' : 'no'}" role="status"><strong><span aria-hidden="true">${ok ? '✓' : '✗'}</span> ${title}</strong>${body ? ` ${body}` : ''}</div>`;
const choice = (action, value, label, selected, extra = '') => `<button type="button" class="choice${selected ? ' is-selected' : ''}" data-action="${action}" data-v="${esc(value)}" aria-pressed="${selected ? 'true' : 'false'}" ${extra}>${label}</button>`;
const SIM_LABEL = '<p class="sim-label">This simplified example is designed to explain a concept. It is not a measurement or literal reconstruction of a commercial model.</p>';
const PROB_LABEL = '<p class="prob-label">Illustrative probabilities for learning, not measurements from a commercial model.</p>';
const decisionHead = (text) => `<h3 class="decision-head"><span class="label">PM decision</span>${text}</h3>`;

const grounded = (keys) => `<footer class="grounded"><span class="label">Grounded in</span><ul>${keys.map((k) => {
  const x = SOURCES[k];
  return `<li><a href="${x.url}" target="_blank" rel="noopener">${x.title}</a> <span class="muted">— ${x.by}</span></li>`;
}).join('')}</ul><p class="muted small">Scripted examples, probabilities, and outputs in this module are original teaching material informed by these sources. They are not quotes or measured outputs from them.</p></footer>`;

const ORIGINAL_BRIEF = 'Build an AI assistant that remembers everything, always gives factually correct answers, learns from every conversation, and responds consistently.';
const JUDGMENTS = [
  'The requirement is ready to build.',
  'The direction may be useful, but the requirement needs clarification.',
  'No part of this is possible.',
];

// ---------- Scene data ----------

const LAYERS = [
  ['Interface', 'Collects the request and displays the result.'],
  ['Product logic', 'Chooses instructions, available conversation, and other information to supply for this request.'],
  ['Storage', 'May retain conversation history, preferences, feedback, or account information under product rules.'],
  ['Safety and policy systems', 'May block, transform, flag, or review requests and responses.'],
  ['LLM', 'Processes the supplied context and generates a continuation. It is a component, not the entire experience.'],
];

const OWNERS = [
  'LLM capability',
  'Product storage and retrieval behavior',
  'Product data and interface behavior, with model assistance possible',
  'Product workflow and permission decision',
  'Layered product and model safety behavior',
];
const CAPABILITIES = [
  ['Draft a natural-language reply', 0],
  ['Remember an approved preference next month', 1],
  ['Show a source link', 2],
  ['Send a refund without human approval', 3],
  ['Block prohibited requests', 4],
];

const SORT_BINS = [
  'Changes model parameters',
  'Changes current input',
  'Changes product state',
  'Runs inference again; does not by itself change parameters',
];
const SORT_EVENTS = [
  ['Pretraining on a large dataset', 0],
  ['Fine-tuning on approved support examples', 0],
  ['Asking for three bullet points', 1],
  ['Adding an example to the prompt', 1],
  ['Saving a user’s preferred language', 2],
  ['Regenerating a response', 3],
];

const TT = {
  start: 'I’m sorry your package arrived',
  steps: {
    '': [['damaged', 42, true], ['late', 28, true], ['today', 18, false], ['unexpectedly', 12, false]],
    damaged: [['.', 35, true], ['and', 31, false], ['during', 19, true], ['—', 15, false]],
    'damaged|.': [['I', 46, true], ['We', 27, false], ['Please', 17, false], ['Unfortunately', 10, false]],
    'damaged|.|I': [['can', 52, true], ['will', 24, false], ['’m', 14, false], ['apologize', 10, false]],
    'damaged|during': [['transit', 64, true], ['shipping', 22, false], ['delivery', 14, false]],
    'damaged|during|transit': [['.', 58, true], ['and', 27, false], [',', 15, false]],
    late: [['.', 47, true], ['and', 25, false], ['—', 16, false], ['again', 12, false]],
    'late|.': [['Let’s', 38, true], ['I', 34, false], ['We', 18, false], ['Please', 10, false]],
  },
  finish: {
    'damaged|.|I|can': ' help arrange a replacement.',
    'damaged|during|transit|.': ' I can help with the next steps.',
    'late|.|Let’s': ' check the latest delivery status.',
  },
};
const isAttached = (t) => /^[.,’—]/.test(t);
const joinTokens = (arr) => arr.reduce((out, t) => (isAttached(t) ? out + t : `${out} ${t}`), '');

const RUNS = [
  'I’m sorry your delivery is taking longer than expected. I’ll help you check its current status.',
  'I understand how frustrating a delayed order can be. Let’s review the latest tracking information.',
  'Thanks for your patience. Your order is delayed, and I can help you explore the available options.',
];

const TEMPS = [
  { label: 'More predictable', T: 0.5, desc: 'Favors the highest-probability continuation.' },
  { label: 'Balanced', T: 1, desc: 'Allows moderate variation.' },
  { label: 'More varied', T: 1.6, desc: 'Allows lower-probability continuations more often.' },
];
function tempDistribution(T) {
  const w = TT.steps[''].map((c) => Math.pow(c[1] / 100, 1 / T));
  const z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((100 * x) / z));
}

const CTX = [
  { label: 'Current customer request', t: 14, rel: 'Essential' },
  { label: 'Instruction to be concise and empathetic', t: 12, rel: 'Useful' },
  { label: 'Relevant seven-day replacement rule', t: 22, rel: 'Essential' },
  { label: 'Desired three-part response format', t: 8, rel: 'Useful' },
  { label: 'Ten earlier greetings', t: 24, rel: 'Low' },
  { label: 'Unrelated international shipping policy', t: 30, rel: 'Low' },
  { label: 'Previous billing complaint', t: 28, rel: 'Irrelevant' },
];
const CTX_OUT = {
  essentials: 'I’m sorry the item arrived damaged. Because you reported it within seven days, you are eligible for a replacement. I can help you begin that process.',
  noRule: 'I’m sorry the item arrived damaged. You may be eligible for a replacement depending on the applicable policy.',
  noise: 'I’m sorry about the damaged item and your previous billing concern. Please review the shipping and replacement options associated with your account.',
};

const COMPARE = [
  { req: 'Summarize this professionally.', base: 'Continues the phrase or imitates nearby text without reliably treating it as an instruction.', post: 'Produces a concise professional summary.' },
  { req: 'Answer only in JSON.', base: 'May explain the answer in prose or mix formats.', post: 'More reliably follows the requested structure.' },
  { req: 'Say you are unsure if evidence is missing.', base: 'May still produce a plausible continuation.', post: 'Is more likely to acknowledge missing evidence.' },
  { req: 'An unsafe request', base: 'May continue the pattern.', post: 'Is more likely to refuse or redirect according to its post-training.' },
];

const REFUND_OUTPUTS = {
  A: 'Yes, your ₹2,499 refund has been approved and will reach your account within three to five business days.',
  B: 'I cannot confirm the refund status from the information available here. Please check the order record or ask an authorized support agent to verify it.',
  C: 'Refunds are usually processed within five to seven business days.',
};
const REFUND_ANALYSIS = {
  A: 'is fluent, direct, and unsupported. It invents an approval status.',
  B: 'is less satisfying but appropriately distinguishes missing evidence and offers a path forward.',
  C: 'may be generally plausible, but it avoids the actual question and may still introduce an unsupported policy.',
};
const REFUND_REFERENCE = {
  A: { fluency: 'High', relevance: 'High', support: 'Low', risk: 'High' },
  B: { fluency: 'High', relevance: 'Medium', support: 'High', risk: 'Low' },
  C: { fluency: 'High', relevance: 'Low', support: 'Low', risk: 'Medium' },
};
const RATE_DIMS = [['fluency', 'Fluency'], ['relevance', 'Relevance'], ['support', 'Factual support'], ['risk', 'Risk']];
const LEVELS = ['Low', 'Medium', 'High'];

const METRICS = [
  { label: 'Supported-answer accuracy', good: true },
  { label: 'Average response length', good: false },
  { label: 'Unsupported confident claim rate', good: true },
  { label: 'Appropriate clarification rate', good: true },
  { label: 'Share of responses written in a confident tone', good: false },
  { label: 'Appropriate abstention rate', good: true },
  { label: 'Human correction rate', good: true },
  { label: 'Escalation and recovery rate', good: true },
  { label: 'Total number of questions answered', good: false },
  { label: 'Severe-error rate', good: true },
];

const BOARD = {
  1: {
    rules: ['Correct answer: +1', 'Wrong answer: 0', 'Abstention: 0'],
    cells: ['x', 'x', 'ok', 'x', 'x', 'x', 'ok', 'x', 'x', 'x'],
    result: 'The model guesses on all ten. Two guesses happen to be correct. Eight are wrong. Answer rate: 100%. Accuracy: 20%. Unsupported answers: 8.',
    score: 'Score under these rules: 2 points (2 × +1, 8 × 0). Guessing costs nothing, so guessing is rewarded.',
  },
  2: {
    rules: ['Supported correct answer: +1', 'Appropriate abstention: 0', 'Unsupported confident answer: −2'],
    cells: ['ab', 'ab', 'ok', 'ab', 'ab', 'ab', 'ok', 'ab', 'ab', 'ab'],
    result: 'The model answers the two supported questions and abstains on eight. Answer rate: 20%. Supported-answer accuracy: 100%. Unsupported answers: 0.',
    score: 'Score under these rules: 2 points (2 × +1, 8 × 0). The guess-everything strategy would score 2 − 16 = −14 here.',
  },
};
const CELL = { ok: ['✓', 'Correct'], x: ['✗', 'Wrong guess'], ab: ['—', 'Abstained'] };

const DECISIONS = [
  {
    title: '“Ask anything”',
    wrong: 'It does not define the intended task, user, risk, or success condition. Broad conversational ability is not the same as dependable product performance.',
    better: 'ReplyRight will generate editable drafts for a defined set of customer-support scenarios. The team will evaluate performance on representative requests from those scenarios before expanding scope.',
    qs: ['Which support scenarios are in scope?', 'Which requests are out of scope?', 'Is the output a draft, recommendation, or final action?', 'Who reviews it?', 'What makes a response acceptable?'],
  },
  {
    title: '“Remember everything”',
    wrong: 'It confuses current context, product storage, persistent memory, and reliable use. It also avoids privacy and user-control decisions.',
    better: 'ReplyRight will use the relevant current conversation and explicitly approved customer information. Persistent information will follow a defined consent, retention, correction, deletion, and access policy.',
    qs: ['What needs to persist?', 'What should never be retained?', 'Who can view or change it?', 'How is relevance decided?', 'How will incorrect memory be detected and corrected?'],
  },
  {
    title: '“Learn from every correction”',
    wrong: 'A correction in a prompt does not ordinarily retrain the model. Automatically turning every user correction into persistent behavior could also amplify mistakes, abuse, or private information.',
    better: 'Corrections can influence the current draft. Feedback intended for future improvement will enter a separate reviewed process with privacy, quality, and approval controls.',
    qs: ['Is the correction used only now or later?', 'Is it stored?', 'Who validates it?', 'Does it update product data, prompts, or model parameters?', 'How can a harmful correction be rejected?'],
  },
  {
    title: '“Always factually correct”',
    wrong: 'It promises an absolute property that an unconstrained language model cannot guarantee. It does not state what evidence is available or what should happen under uncertainty.',
    better: 'ReplyRight will be evaluated for factual support on representative cases. When required evidence is unavailable, it should ask for clarification, abstain, or escalate rather than invent a specific answer. High-consequence responses require human approval.',
    qs: ['What counts as a factual claim?', 'What is the source of truth?', 'Which errors are severe?', 'What level of error is acceptable?', 'When is abstention correct?', 'What recovery path does the user receive?'],
  },
  {
    title: '“Give the same answer every time”',
    wrong: 'Open-ended generation is probabilistic. It may produce several acceptable phrasings. Exact repetition may also be unnecessary for an editable draft.',
    better: 'ReplyRight may vary wording while preserving policy, required facts, tone, and action. Exact legal or regulatory language will use approved deterministic content rather than unconstrained generation.',
    qs: ['What must remain consistent: facts, decision, tone, format, or exact words?', 'Where is variation valuable?', 'Where is it risky?', 'How many generations should be tested?', 'What deterministic validation is required?'],
  },
];

const BRIEF_PROMPTS = [
  'What task and users are in scope?',
  'Is the output a draft, recommendation, or final action?',
  'What information is supplied for the current request?',
  'What may persist, under what consent and retention rules?',
  'What happens when evidence is missing?',
  'Which outputs require human review?',
  'What may vary, and what must remain exact?',
  'Which outcomes will be evaluated on representative cases?',
];

const EXPERT_BRIEF = 'Build an AI-assisted drafting feature for defined customer-support scenarios. ReplyRight will use the instructions and customer information supplied for the current request to generate an editable draft. Support representatives remain responsible for review before sending. The product will store only explicitly defined information under an approved privacy and retention policy. Ordinary corrections will not be represented as immediate model retraining. Before launch, the team will evaluate factual support, instruction adherence, tone, appropriate uncertainty, severe-error rate, latency, and cost on representative cases. Exact required language will use approved deterministic content.';
const CLAUSES = [
  { t: 'AI-assisted drafting feature', p: 'Bounded use case and level of automation.' },
  { t: 'information supplied for the current request', p: 'Context boundary.' },
  { t: 'editable draft', p: 'Human responsibility and recovery.' },
  { t: 'review before sending', p: 'Human responsibility and recovery.' },
  { t: 'approved privacy and retention policy', p: 'Product memory decision.' },
  { t: 'not be represented as immediate model retraining', p: 'Training versus inference.' },
  { t: 'appropriate uncertainty, severe-error rate', p: 'Risk-aware evaluation.' },
  { t: 'approved deterministic content', p: 'Exact-language requirement.' },
];
const BRIEF_CHECKS = ['Scope', 'Evidence', 'Acceptable variability', 'Failure behavior', 'Human responsibility', 'Evaluation'];

const RUBRIC = [
  { k: 'def', dim: 'Definition', ev: 'Describes an LLM as a learned model of language patterns or token probabilities.', re: /learn|pattern|probabilit|predict/i, link: 'orient2' },
  { k: 'train', dim: 'Training', ev: 'Explains that training changes parameters using large amounts of data.', re: /train|parameter|weight/i, link: 'scene2' },
  { k: 'gen', dim: 'Generation', ev: 'Explains probabilistic token-by-token output.', re: /token|probabilis|one at a time|next word/i, link: 'scene4' },
  { k: 'ctx', dim: 'Context', ev: 'Distinguishes current supplied information from persistent memory or retraining.', re: /context|memory|window|remember/i, link: 'scene5' },
  { k: 'cap', dim: 'Capability', ev: 'Recognizes broad language transformation and interpretation abilities.', re: /summar|draft|classif|translat|rewrit|transform|explain/i, link: 'scene3' },
  { k: 'lim', dim: 'Limitation', ev: 'States that fluency does not guarantee truth, exact consistency, or complete recall.', re: /hallucin|guarantee|wrong|false|fluen|confiden|vary|varies|inconsisten|not true/i, link: 'scene7' },
  { k: 'pm', dim: 'Product implication', ev: 'Connects the mechanism to scope, evaluation, deterministic requirements, human review, or recovery.', re: /evaluat|review|determinis|human|recover|scope|test|verify/i, link: 'scene8' },
];

const MODEL_ANSWER = 'An LLM is a neural-network model trained on large amounts of data to predict language tokens. During pretraining, repeated prediction errors adjust a very large set of parameters, allowing the model to develop useful representations of grammar, meaning, style, common facts, and recurring reasoning patterns. When we use the model, it receives a limited context and generates one token at a time from a probability distribution. That makes it flexible enough for drafting, summarization, classification, transformation, and explanation. It also means the output can vary, and plausible language is not guaranteed to be true. The context window is temporary working input, not permanent memory, and prompting does not ordinarily retrain the model. For a product manager, the important decisions are where this flexibility creates value, what information the product supplies or stores, what failures are acceptable, where deterministic behavior is required, how quality is evaluated, and how users verify or recover from mistakes.';

const ART_FIELDS = [
  { k: 'whatIs', h: 'What an LLM is', src: (s) => s.explain },
  { k: 'modelProduct', h: 'Model versus product', src: (s) => s.reflection },
  { k: 'trainPrompt', h: 'Training versus prompting', src: (s) => s.s2Decision },
  { k: 'contextMemory', h: 'Context versus memory', src: (s) => s.s5Rewrite },
  { k: 'probUseful', h: 'Where probabilistic generation is useful', src: (s) => (s.s4Decision === 'A' ? 'Editable first drafts of support responses, where several phrasings can be acceptable.' : '') },
  { k: 'detRequired', h: 'Where deterministic behavior is required', src: (s) => (s.s4Decision === 'A' ? 'Approved legal or regulatory disclosures that must appear word for word.' : '') },
  { k: 'failures', h: 'Failures the product must evaluate', src: (s) => s.s7Metrics.filter((i) => METRICS[i] && METRICS[i].good).map((i) => `- ${METRICS[i].label}`).join('\n') },
  { k: 'brief', h: 'Rewritten ReplyRight product brief', src: (s) => (s.s8Submitted ? s.s8Brief : '') },
  { k: 'questions', h: 'Questions I would ask engineering, design, legal, or a model provider', src: () => '' },
];
const artValue = (s, f) => (s.art[f.k] != null ? s.art[f.k] : f.src(s) || '');

// ---------- Screens ----------

const GROUPS = [
  { id: 'challenge', num: '', label: 'Challenge' },
  { id: 'scene1', num: '1', label: 'Model or product?' },
  { id: 'scene2', num: '2', label: 'Training vs. using' },
  { id: 'scene3', num: '3', label: 'The token machine' },
  { id: 'scene4', num: '4', label: 'One token at a time' },
  { id: 'scene5', num: '5', label: 'Context-window suitcase' },
  { id: 'scene6', num: '6', label: 'Pretraining & post-training' },
  { id: 'scene7', num: '7', label: 'Sounds right vs. supported' },
  { id: 'scene8', num: '8', label: 'Repair the brief' },
  { id: 'explain', num: '', label: 'Explain it back' },
];

const SCREENS = [];

// Challenge 1/3 — the brief
SCREENS.push({
  id: 'challenge',
  group: 'challenge',
  step: 'Challenge · 1 of 3',
  done: (s) => !!s.initialJudgment,
  render: (s) => `
${head('Opening challenge', 'You are the PM for ReplyRight')}
<p class="lede">ReplyRight is a proposed AI-assisted drafting feature for customer-support representatives. Leadership gives you this requirement:</p>
<blockquote class="brief">“${ORIGINAL_BRIEF}”</blockquote>
<p>It sounds desirable. But which parts describe an LLM, which parts require a surrounding product system, and which parts cannot be promised as written?</p>
<fieldset class="choices">
  <legend>Your initial judgment</legend>
  ${JUDGMENTS.map((j) => choice('judge', j, j, s.initialJudgment === j)).join('')}
</fieldset>
${s.initialJudgment ? `<div class="saved" role="status">Keep your first reaction. You will return to this brief after looking inside the system.</div>` : ''}
<p class="muted small how">In this module you investigate eight concepts, make a product decision after each, and repair this brief at the end. Your answers are saved in this browser only.</p>`,
});

// Challenge 2/3 — orientation reading
SCREENS.push({
  id: 'orient1',
  group: 'challenge',
  step: 'Challenge · 2 of 3 · Orientation',
  done: (s) => !!s.visited.orient1,
  render: (s) => `
${head('Orientation', 'What users see')}
<h2>What feels familiar</h2>
<p>If you use ChatGPT, Claude, or Gemini, you already know the visible experience. You type or speak a request, the product returns a response, and you may continue the conversation. You can ask for a summary, rewrite text, generate ideas, compare options, classify feedback, explain a concept, or change the tone of a message.</p>
<p>That experience is useful evidence of what current AI products can do. It does not, by itself, reveal which part of the experience comes from the underlying model.</p>
<p>Daily use shows you the product experience. It does not show how responsibilities are divided beneath it.</p>
<div class="reflect">
  <label for="reflection"><span class="label">Reflection · not scored</span>Think of one behavior you associate with ChatGPT or another assistant. Is it definitely a property of the underlying model, or could it be supplied by the surrounding product?</label>
  <textarea id="reflection" rows="3" data-bind="reflection" placeholder="For example: it remembers my name between conversations…">${esc(s.reflection)}</textarea>
  <div class="row-actions"><button type="button" class="btn ghost sm" data-action="save-bound" data-key="reflection" data-prefix="Reflection">Save to PM notes</button></div>
</div>
${grounded(['every', 'lenny', 'google'])}`,
});

// Challenge 3/3 — four definitions
SCREENS.push({
  id: 'orient2',
  group: 'challenge',
  step: 'Challenge · 3 of 3 · Orientation',
  done: (s) => !!s.visited.orient2,
  render: () => `
${head('Orientation', 'Four terms used in the module')}
${def('Model', `<p>A <strong>model</strong> is a learned mathematical system that turns an input into a prediction or generated output. Rather than listing a rule for every possible situation, a model learns numerical patterns from examples.</p>
<p>For example, a traditional model might estimate whether a transaction is fraudulent. A recommendation model might rank which video a person is likely to watch. A language model estimates probabilities over language.</p>
<p>The word model is broader than LLM. Not every AI model generates language, and not every AI product needs an LLM.</p>`)}
${def('Language model', `<p>A <strong>language model</strong> estimates the probability of a token or sequence of tokens appearing in a particular context.</p>
<p>Suppose the input is:</p><blockquote>“The color of a clear daytime sky is …”</blockquote>
<p>A language model might assign a high probability to the next token representing “blue,” and lower probabilities to other possible continuations.</p>
<p>This idea extends beyond completing one obvious sentence. When the model has learned from enormous and diverse datasets and can consider a rich context, predicting continuations becomes useful for translation, summarization, classification, rewriting, question answering, and generating longer passages.</p>`)}
${def('Large language model', `<p>A <strong>large language model</strong> is a language model with substantial learned capacity, trained on very large and varied datasets using significant computation. The word large does not refer only to the size of the training data. It also commonly refers to the number of learned parameters and the scale of computation involved.</p>
<p>The scale matters because a larger and sufficiently well-trained model can capture many more patterns and relationships. However, “larger” does not mean “always better for every product.” A larger model may be slower or more expensive, and model quality still has to be tested on the actual task.</p>`)}
${def('Foundation model', `<p>A <strong>foundation model</strong> is a broadly trained model that can support many downstream tasks and products rather than being trained for only one narrow job.</p>
<p>An LLM can be a foundation model. The same underlying model may be used for drafting, summarization, extraction, classification, translation, tutoring, or other applications. The model provides a broad base; product design and additional adaptation determine how that capability is used.</p>`)}
<h2>Important distinction</h2>
<p>These four terms form a hierarchy:</p>
<div class="tree" role="img" aria-label="Model contains language model, which contains large language model, which may serve as a foundation model for many applications.">
  <div class="tree-node">Model
    <div class="tree-node">Language model
      <div class="tree-node">Large language model
        <div class="tree-node tree-leaf">May serve as a foundation model for many applications</div>
      </div>
    </div>
  </div>
</div>
<p>“Foundation model” describes the broad role a model can play. “Large language model” describes the kind of model and its scale. The terms overlap but are not perfect synonyms.</p>
<p class="callout">You do not need to memorize these definitions. Use them to keep the product, the model, and the broader model family distinct.</p>
${pmBox('PM takeaway', '<p>When someone says “AI,” ask what kind of model or product they mean. When someone says “use an LLM,” ask what language task requires its broad generative capability.</p>')}
${grounded(['every', 'lenny', 'google'])}`,
});

// Scene 1 — Model or product?
SCREENS.push({
  id: 'scene1',
  group: 'scene1',
  step: 'Scene 1 of 8',
  done: (s) => s.layersOpen >= LAYERS.length && s.s1Checked,
  render: (s) => {
    const n = s.layersOpen;
    const sel = Math.min(s.layerSel, Math.max(0, n - 1));
    const s1All = CAPABILITIES.every((c, i) => Number(s.s1Class[i]) === c[1] && s.s1Class[i] !== '' && s.s1Class[i] != null);
    return `
${head('Scene 1', 'Model or product?')}
${core('When ReplyRight appears to remember, search, refuse, cite, or take an action, which layer is responsible?')}
<h2>The model is one component of the product</h2>
<p>An AI assistant product normally contains several layers:</p>
<ol class="layers-list">
  <li><strong>The interface</strong> collects the request and presents the result.</li>
  <li><strong>The product logic</strong> decides what instructions, conversation history, or other information to supply for a request.</li>
  <li><strong>Storage systems</strong> may save conversations, preferences, account information, or feedback.</li>
  <li><strong>Safety and policy systems</strong> may block, transform, or review some requests and responses.</li>
  <li><strong>The LLM</strong> processes the supplied input and generates output.</li>
  <li><strong>Computing infrastructure</strong> loads and runs the model at the required speed and scale.</li>
</ol>
<p>When a product appears to remember a previous conversation, the memory may be implemented by saving information and supplying it again later. When a product speaks aloud, the voice may come from additional speech systems. When a product lets a user edit, regenerate, rate, or report an answer, those are product capabilities.</p>
<p>This distinction matters because a product manager cannot write “the AI should remember the customer” and assume the underlying LLM will handle it. The team must define what is saved, why it is saved, whether the user consented, how long it is retained, and when it is provided to the model again.</p>
${def('AI product', '<p>An <strong>AI product</strong> is a user-facing or internal system that combines one or more models with interfaces, data, instructions, policies, storage, workflows, infrastructure, and human decisions to produce a useful outcome.</p>')}
${def('LLM', '<p>An <strong>LLM</strong>, or large language model, is the model component that has been trained to process and generate sequences of language tokens. Modern models may also accept or generate other media, but language modeling remains central to how they follow instructions and produce responses.</p>')}

<section class="sim" aria-labelledby="peelTitle">
  <h3 id="peelTitle">Look beneath ReplyRight</h3>
  ${SIM_LABEL}
  <div class="peel">
    <div class="chat" aria-label="ReplyRight chat surface">
      <div class="chat-bar">ReplyRight</div>
      <div class="bubble in"><span class="who">Customer</span>My package arrived damaged. Can I get a replacement?</div>
      <div class="bubble out"><span class="who">Suggested draft</span>${CTX_OUT.essentials}</div>
    </div>
    <div class="stack">
      <ol class="stack-list">
        ${LAYERS.map((l, i) => (i < n
          ? `<li><button type="button" class="layer${i === sel ? ' is-selected' : ''}" data-action="layer-sel" data-i="${i}" aria-pressed="${i === sel}"><span class="layer-n">${i + 1}</span>${l[0]}</button></li>`
          : `<li><span class="layer is-hidden"><span class="layer-n">${i + 1}</span>Not yet opened</span></li>`)).join('')}
      </ol>
      ${n < LAYERS.length
        ? `<button type="button" class="btn" data-action="layer-next">Open the next layer</button> <span class="muted small">${n} of ${LAYERS.length} opened</span>`
        : '<p class="muted small">All five layers are open. Select any layer to revisit it.</p>'}
      ${n > 0 ? `<div class="layer-detail" aria-live="polite"><strong>${LAYERS[sel][0]}:</strong> ${LAYERS[sel][1]}</div>` : ''}
    </div>
  </div>
</section>

<section class="decision">
  ${decisionHead('Who owns each capability?')}
  <p>Classify each proposed ReplyRight capability by its best initial owner.</p>
  <div class="classify">
    ${CAPABILITIES.map((c, i) => {
      const v = s.s1Class[i];
      const has = v !== undefined && v !== '';
      const ok = has && Number(v) === c[1];
      return `<div class="classify-row">
        <label for="s1c${i}">${c[0]}</label>
        <select id="s1c${i}" data-bind="s1Class.${i}" data-change="refresh">
          <option value=""${has ? '' : ' selected'}>Choose an owner…</option>
          ${OWNERS.map((o, oi) => `<option value="${oi}"${has && Number(v) === oi ? ' selected' : ''}>${o}</option>`).join('')}
        </select>
        ${s.s1Checked ? (ok ? '<span class="mark ok">✓ Correct</span>' : `<span class="mark no">✗ Best initial owner: ${OWNERS[c[1]]}</span>`) : ''}
      </div>`;
    }).join('')}
  </div>
  <div class="row-actions"><button type="button" class="btn" data-action="s1-check">${s.s1Checked ? 'Check again' : 'Check my classification'}</button></div>
  ${s.s1Checked ? `${s1All ? fb(true, 'All five match.', '') : ''}<div class="reveal"><p>A feature may use the model, but the product still owns data access, persistence, permissions, workflow, evidence, and recovery.</p></div>` : ''}
</section>
${pmBox('PM implication', '<p>Do not ask only, “Can the model do this?” Ask which part belongs to the model and which part must be designed, stored, verified, or enforced by the surrounding product.</p>', 'Scene 1: Don’t ask only “Can the model do this?” Ask which part belongs to the model and which must be designed, stored, verified, or enforced by the product.')}
${grounded(['lenny'])}`;
  },
});

// Scene 2 — Training vs. using
SCREENS.push({
  id: 'scene2',
  group: 'scene2',
  step: 'Scene 2 of 8',
  done: (s) => s.s2Checked && s.s2Revealed,
  render: (s) => `
${head('Scene 2', 'Training is not the same as using the model')}
${core('If a user corrects ReplyRight, did the model just learn permanently?')}
<div class="panels">
  <div class="panel model"><h3>Training and post-training</h3><p>Data and an optimization process are used to change model parameters. This happens before or between deployed model versions, not automatically every time an ordinary user sends a message.</p></div>
  <div class="panel model"><h3>Inference</h3><p>A trained model receives the context for one request and generates a response. Ordinary inference uses the existing parameters; it does not by itself rewrite them.</p></div>
</div>
<p class="callout">Prompting changes what the model receives now. Product storage changes what the application can retain and supply later. Training changes the model itself.</p>
<p>People often use “training” to describe any interaction with an AI system. That creates confusion. The following processes are different.</p>
${def('Training', '<p><strong>Training</strong> is a process that changes model parameters using data and an optimization objective.</p><p>Pretraining is one form of training. Fine-tuning and other post-training methods are also forms of training because they modify the model. (Scene 6 looks at post-training and fine-tuning in more detail.)</p>')}
${def('Prompt', '<p>A <strong>prompt</strong> is the set of instructions and input supplied to the model for a particular generation. The visible user message may be only one part of the prompt; the product may also include instructions and conversation content.</p>')}
${def('Prompting', '<p><strong>Prompting</strong> means guiding the current output through instructions, examples, constraints, or relevant input. Prompting uses the capabilities of the existing model. It does not ordinarily change the model’s parameters.</p>')}
<div class="codeish" role="note"><p>Training changes the model.</p><p>Prompting changes what the model receives for this generation.</p></div>
${def('Inference', '<p><strong>Inference</strong> is running a trained model to generate a prediction or response for a particular input.</p><p>When a person submits a request and receives a response, the model is performing inference. The same trained parameters are used repeatedly across requests unless the provider deploys a changed model.</p>')}
${def('Product storage', '<p><strong>Product storage</strong> is information retained by the surrounding application, such as conversation history, preferences, account facts, or feedback. Storage does not itself change model parameters. A product may later supply saved information as part of a new prompt or use it in another approved process.</p>')}
<h2>Example: “My name is Meera”</h2>
<p>If a user says “My name is Meera”:</p>
<ul>
  <li>the information can influence later responses while it remains in the current context;</li>
  <li>the product may save it, depending on design and policy;</li>
  <li>saving it does not mean the LLM’s parameters changed;</li>
  <li>using it in a future model-training process would be a separate decision and process.</li>
</ul>
<h2>Why this matters for PM language</h2>
<div class="compare-lang">
  <div><span class="label no-label">Avoid saying</span><p>“The model learns every time the user corrects it.”</p></div>
  <div><span class="label ok-label">Prefer</span><p>“The correction can influence the current conversation. If it should persist, we need to define whether it is saved, reviewed, supplied again later, or incorporated into an approved improvement process.”</p></div>
</div>

<section class="decision">
  <h3 class="decision-head"><span class="label">Applied check</span>What does each event change?</h3>
  <p>Sort each event. This should take less than two minutes.</p>
  <div class="classify">
    ${SORT_EVENTS.map((e, i) => {
      const v = s.s2Sort[i];
      const has = v !== undefined && v !== '';
      const ok = has && Number(v) === e[1];
      return `<div class="classify-row">
        <label for="s2e${i}">${e[0]}</label>
        <select id="s2e${i}" data-bind="s2Sort.${i}" data-change="refresh">
          <option value=""${has ? '' : ' selected'}>Choose…</option>
          ${SORT_BINS.map((b, bi) => `<option value="${bi}"${has && Number(v) === bi ? ' selected' : ''}>${b}</option>`).join('')}
        </select>
        ${s.s2Checked ? (ok ? '<span class="mark ok">✓ Correct</span>' : `<span class="mark no">✗ ${SORT_BINS[e[1]]}</span>`) : ''}
      </div>`;
    }).join('')}
  </div>
  <div class="row-actions"><button type="button" class="btn" data-action="s2-check">${s.s2Checked ? 'Check again' : 'Check my sorting'}</button></div>
  ${s.s2Checked ? '<div class="reveal"><p><strong>Training changes the model.</strong> Pretraining and fine-tuning both change parameters. <strong>Prompting changes what the model receives for this generation</strong>, whether you ask for bullet points or add an example. <strong>Saving a preference changes product state</strong>, not the model. <strong>Regenerating runs inference again</strong>; it does not by itself change parameters.</p></div>' : ''}
</section>

<section class="decision">
  ${decisionHead('Leadership says ReplyRight should “learn from every correction.” What must the PM clarify?')}
  <label class="sr-only" for="s2Decision">Your answer</label>
  <textarea id="s2Decision" rows="4" data-bind="s2Decision" placeholder="Write what you would clarify before accepting this requirement…">${esc(s.s2Decision)}</textarea>
  <div class="row-actions">
    <button type="button" class="btn" data-action="s2-reveal">${s.s2Revealed ? 'Strong response shown below' : 'Compare with a strong response'}</button>
    <button type="button" class="btn ghost sm" data-action="save-bound" data-key="s2Decision" data-prefix="Scene 2 — learn from every correction">Save my answer to PM notes</button>
  </div>
  ${s.s2Revealed ? '<div class="reveal"><span class="label">Strong response</span><p>Clarify whether the correction should affect only the current reply, be saved as approved product data for later use, or enter a separate reviewed model-improvement process. These are different behaviors with different privacy, quality, and safety implications.</p></div>' : ''}
</section>
${pmBox('PM takeaway', '<p>When a requirement uses the word “learn,” ask exactly what must change: the current response, stored product information, or model parameters.</p>', 'Scene 2: When a requirement says “learn,” ask what must change: the current response, stored product information, or model parameters.')}
${grounded(['lenny', 'google', 'googleTune'])}`,
});

// Scene 3 — Token machine
SCREENS.push({
  id: 'scene3',
  group: 'scene3',
  step: 'Scene 3 of 8',
  done: (s) => s.s3Seen,
  render: (s) => {
    const model = s.s3View === 'model';
    const toks = ['Please', ' summarize', ' the', ' damaged', '-package', ' policy', '.'];
    return `
${head('Scene 3', 'The token machine')}
${core('What does the model actually receive and produce?')}
<h2>Text must become numbers</h2>
<p>Computers operate on numbers. Before a language model can process text, text is divided into tokens and those tokens are represented numerically.</p>
${def('Token', '<p>A <strong>token</strong> is a unit processed by a language model. Depending on the tokenizer, a token may be a complete word, part of a word, punctuation, a space-associated fragment, a number fragment, or another symbol.</p><p>For teaching purposes:</p><p class="mono">unpredictability → [un] [predict] [ability]</p><p>Actual tokenization differs by model. The important point is that the model does not receive a page as a human sees it. It receives a sequence of token identifiers.</p>')}

<section class="sim" aria-labelledby="tokTitle">
  <h3 id="tokTitle">Human view or model view</h3>
  <div class="toggle" role="group" aria-label="Choose a view">
    ${choice('tok-view', 'human', 'Human view', !model)}
    ${choice('tok-view', 'model', 'Model view', model)}
  </div>
  <div class="tok-stage" aria-live="polite">
    ${model
      ? `<p class="sr-only">Model view: seven tokens.</p><div class="tokens">${toks.map((t) => `<span class="tok">${esc(t)}</span>`).join('')}</div><p class="muted small">${toks.length} illustrative tokens. Leading spaces belong to the token that follows them.</p>`
      : '<p class="human-text">Please summarize the damaged-package policy.</p>'}
  </div>
  <p class="sim-label">This is an illustrative split. Actual tokenization varies by model.</p>
  <button type="button" class="btn ghost" data-action="tok-why" aria-expanded="${s.s3Why}">Why does this matter?</button>
  ${s.s3Why ? `<ul class="reveal">
    <li>Input and output limits are usually measured in tokens.</li>
    <li>Token counts influence latency and cost.</li>
    <li>Unusual words, numbers, languages, or formatting may split differently.</li>
    <li>The model operates on learned numerical representations, not on a human-readable dictionary or a searchable folder of facts.</li>
  </ul>` : ''}
</section>

${def('Representation', `<p>A <strong>representation</strong> is a numerical form that allows the model to work with an item or concept. Tokens begin as numerical identifiers and are transformed into learned vectors—lists of numbers that capture useful relationships.</p>
<p>The model is not given a dictionary entry explaining every word. It learns from patterns of use. Words and expressions that appear in similar contexts develop related representations.</p>
<p>The <a href="${SOURCES.every.url}" target="_blank" rel="noopener">Every article</a> explains this through a food analogy: two dishes can be treated as similar when they frequently appear with similar surrounding dishes, even if a computer has never tasted either one. The same general intuition applies to language. A word is partly characterized by the contexts in which it appears.</p>
<p>Because the numerical space has many dimensions, the model can capture many overlapping relationships. A word such as “bank” may relate differently to “river” and “loan” depending on its surrounding context.</p>`)}
${def('Parameter or weight', '<p>A <strong>parameter</strong>, also called a <strong>weight</strong>, is a learned numerical value inside the model. A modern LLM contains an enormous collection of these values. During training, the values are adjusted so that the model’s predictions improve.</p><p>Parameters do not function like folders containing exact copies of documents. Knowledge and patterns are distributed across many values. This is one reason an LLM can generalize and produce new combinations, and also one reason it cannot be treated as a perfectly searchable record of everything in its training data.</p>')}
${def('Pretraining', '<p><strong>Pretraining</strong> is the large initial training stage in which a model learns broad patterns from enormous datasets.</p><p>For a next-token objective, the model repeatedly receives a sequence and tries to predict a missing or following token. A simplified training example is:</p><p class="mono">Input:  The customer requested a full…<br>Target: refund</p><p>Early predictions may be poor. Training measures the error between the prediction and the target and adjusts the parameters slightly. Repeating this process across vast numbers of sequences gradually improves prediction.</p><p>No person needs to label the grammatical function or meaning of every sentence. The text supplies its own training signal because the actual next or missing token is already present in the data. This is commonly called <strong>self-supervised learning</strong>.</p>')}
${def('Self-supervised learning', '<p><strong>Self-supervised learning</strong> is a training approach in which the data itself provides the target. In language modeling, text can be partially hidden or shifted so the model learns by predicting the missing or next token.</p>')}

<figure class="flow" aria-label="From dataset to learned representations">
  <ol>
    <li>Large text dataset</li>
    <li>Text is divided into tokens</li>
    <li>Model predicts missing or next tokens</li>
    <li>Prediction error adjusts parameters</li>
    <li>Repeated many times</li>
    <li>Model develops broad language representations</li>
  </ol>
</figure>

<h2>Why prediction creates broad capabilities</h2>
<p>To predict language well across many subjects, styles, and situations, the model benefits from capturing grammar, reference, tone, relationships among concepts, common facts, typical reasoning patterns, and structures such as lists, dialogue, code, and explanations.</p>
<p>The training goal sounds narrow: predict tokens. The learned behavior can be broad because successfully predicting language across diverse data requires many useful internal patterns.</p>
<p>This does not mean the model learns every fact reliably or develops human consciousness. It means that large-scale prediction is a powerful training signal for building general representations.</p>
<h2>Why “autocomplete” is useful but incomplete</h2>
<p>Calling an LLM “autocomplete” points to something real: generation repeatedly predicts a continuation. But ordinary phone autocomplete uses a much narrower context and far less learned capacity.</p>
<p>Modern LLMs can transform, compare, summarize, classify, explain, and follow examples because their representations and prediction process are far richer. “Autocomplete” describes part of the mechanism; it should not be used to dismiss the observed capabilities.</p>

<details class="deeper">
  <summary>Look under the hood: why transformers matter</summary>
  ${def('Transformer', '<p>A <strong>transformer</strong> is the neural-network architecture underlying most modern LLMs. Its important conceptual contribution is that it can compute relationships among tokens in the available context efficiently and at scale.</p>')}
  ${def('Self-attention', '<p><strong>Self-attention</strong> is a mechanism that calculates how strongly tokens in an input should influence the interpretation of one another.</p>')}
  <p>Consider:</p>
  <blockquote>“The animal did not cross the street because it was too tired.”</blockquote>
  <p>To interpret “it,” the model benefits from relating it more strongly to “animal” than “street.” If “tired” becomes “wide,” the relevant relationship may change.</p>
  <p>An application-level AI PM does not need to calculate attention or understand the matrices used to implement it. The useful intuition is:</p>
  <p class="callout">The model does not consider each word in isolation. It builds representations using relationships across the available context.</p>
  <p>Transformers also support highly parallel computation during training, which made scaling to very large datasets and models practical.</p>
  <p class="muted small">Optional reading: <a href="${SOURCES.ft.url}" target="_blank" rel="noopener">${SOURCES.ft.title}</a> (Financial Times) and <a href="${SOURCES.googleT.url}" target="_blank" rel="noopener">${SOURCES.googleT.title}</a> (Google).</p>
</details>

${pmBox('PM implication', '<p>Token budgets are product constraints. They affect how much information can be supplied, how long a response can be, how fast it may arrive, and what it may cost. They do not tell you whether the model understood the information correctly.</p><p>The model learns patterns and representations rather than storing a reliable, inspectable database. It can generalize beyond exact examples, but its outputs must still be evaluated for the intended task.</p>', 'Scene 3: Token budgets are product constraints (input size, output length, latency, cost). They do not tell you whether the model understood the information correctly.')}
${grounded(['every', 'google', 'googleT'])}`;
  },
});

// Scene 4 — token-by-token generation
SCREENS.push({
  id: 'scene4',
  group: 'scene4',
  step: 'Scene 4 of 8',
  done: (s) => s.s4Final && s.s4Runs >= 3 && s.s4Malf === 'no' && s.s4Decision === 'A',
  render: (s) => {
    const path = s.s4Path;
    const key = path.join('|');
    const cands = s.s4Final ? null : TT.steps[key];
    const finalText = s.s4Final ? `${TT.start}${joinTokens(path)}${TT.finish[key]}` : '';
    const temp = TEMPS[s.s4Temp];
    const dist = tempDistribution(temp.T);
    return `
${head('Scene 4', 'Build an answer one token at a time')}
${core('Why can the same prompt produce different but plausible responses?')}
${def('Generation', '<p><strong>Generation</strong> is the inference process through which an LLM produces an output sequence.</p><p>The model begins with the available context. It calculates a probability distribution over possible next tokens. A selection process chooses one token. That token is added to the sequence, and the model calculates the next distribution. Repeating this process creates a sentence, paragraph, or longer response.</p>')}
${def('Probability distribution', '<p>A <strong>probability distribution</strong> assigns relative likelihoods to possible outcomes. For next-token generation, it expresses which candidate tokens the model considers more or less plausible in the current context.</p><p>The probabilities are not a factual-confidence score. A token can be highly probable because it creates a familiar-sounding continuation, even when the resulting claim is not true.</p>')}

<section class="sim" aria-labelledby="sim1Title">
  <h3 id="sim1Title">Simulation 1 — Build the response</h3>
  <p>Complete a customer-support response one token at a time.</p>
  ${SIM_LABEL}
  <div class="seq" aria-live="polite" aria-label="Response so far">
    <span class="seq-start">${TT.start}</span>${path.map((t, i) => `<span class="tok${isAttached(t) ? ' attached' : ''}${i === path.length - 1 ? ' tok-new' : ''}">${esc(t)}</span>`).join('')}${s.s4Final ? `<span class="seq-rest">${esc(TT.finish[key])}</span>` : '<span class="caret" aria-hidden="true"></span>'}
  </div>
  ${cands ? `
    <p class="step-q"><strong>Step ${path.length + 1}.</strong> Candidate next tokens. Choose one, or let the model sample.</p>
    <ul class="cands">
      ${cands.map(([t, p, ok]) => `<li><button type="button" class="cand" data-action="tok-pick" data-t="${esc(t)}"${ok ? '' : ' disabled'}>
        <span class="cand-tok">${esc(t)}</span>
        <span class="cand-bar" aria-hidden="true"><span style="width:${p}%"></span></span>
        <span class="cand-p">${p}%</span>
        ${ok ? '' : '<span class="cand-note">not scripted in this short example</span>'}
      </button></li>`).join('')}
    </ul>
    ${PROB_LABEL}
    <div class="row-actions">
      <button type="button" class="btn" data-action="tok-sample">Let the model sample</button>
      ${path.length ? '<button type="button" class="btn ghost" data-action="tok-reset">Start over</button>' : ''}
    </div>
    <p class="muted small">Greyed candidates are plausible continuations too. This example scripts three complete replies to stay short.</p>
  ` : `
    <div class="fb ok" role="status"><strong>Completed reply</strong> <span class="final-text">${esc(finalText)}</span></div>
    <p class="muted small">After your choices, the remaining tokens were generated the same way: each chosen from a new distribution that includes everything before it.</p>
    <div class="row-actions"><button type="button" class="btn ghost" data-action="tok-reset">Build another path</button></div>
  `}
</section>

<section class="sim" aria-labelledby="sim2Title">
  <h3 id="sim2Title">Simulation 2 — Run the same request again</h3>
  <p class="mono">Write a supportive response to a customer whose delivery is late.</p>
  ${SIM_LABEL}
  <ol class="runs">
    ${RUNS.slice(0, s.s4Runs).map((r, i) => `<li class="run${i === s.s4Runs - 1 ? ' tok-new' : ''}"><span class="label">Run ${i + 1}</span><p>${r}</p></li>`).join('')}
  </ol>
  ${s.s4Runs < 3 ? `<button type="button" class="btn" data-action="run-again">${s.s4Runs === 0 ? 'Run the request' : 'Run the same request again'}</button>` : ''}
  ${s.s4Runs >= 3 ? `
    <fieldset class="choices inline">
      <legend>Is the model malfunctioning because the wording changed?</legend>
      ${choice('s4-malf', 'yes', 'Yes', s.s4Malf === 'yes')}
      ${choice('s4-malf', 'no', 'No', s.s4Malf === 'no')}
    </fieldset>
    ${s.s4Malf ? fb(s.s4Malf === 'no', s.s4Malf === 'no' ? 'No.' : 'Not a malfunction.', 'Variation is expected in probabilistic generation. The product must decide where variation is useful, where it is harmless, and where exact output is required.') : ''}
  ` : ''}
</section>

<details class="deeper">
  <summary>Optional control: from predictable to varied</summary>
  ${def('Temperature', '<p><strong>Temperature</strong> is a generation setting that changes how strongly the selection process favors higher-probability tokens. Lower settings usually make outputs more predictable; higher settings usually create more variation. Temperature does not add knowledge or make facts more accurate.</p>')}
  <label for="tempRange" class="range-label">Selection setting: <strong>${temp.label}</strong> — ${temp.desc}</label>
  <input type="range" id="tempRange" min="0" max="2" step="1" value="${s.s4Temp}" data-change="temp" aria-valuetext="${temp.label}">
  <div class="range-ticks" aria-hidden="true"><span>More predictable</span><span>Balanced</span><span>More varied</span></div>
  <p class="muted small">How the first step (“…arrived ___”) would be weighted:</p>
  <ul class="cands static">
    ${TT.steps[''].map(([t], i) => `<li><div class="cand"><span class="cand-tok">${esc(t)}</span><span class="cand-bar" aria-hidden="true"><span style="width:${dist[i]}%"></span></span><span class="cand-p">${dist[i]}%</span></div></li>`).join('')}
  </ul>
  ${PROB_LABEL}
  <p class="muted small">You do not need to memorize a numerical temperature value.</p>
</details>

<div class="levels">
  <div class="level model"><span class="label">Simple explanation</span><p>The model repeatedly selects a plausible next token using the prompt and tokens already generated.</p></div>
  <div class="level model"><span class="label">Why this happens</span><p>Several continuations can have meaningful probability; an early choice changes later possibilities.</p></div>
  <div class="level pmish"><span class="label">PM implication</span><p>Evaluate distributions of outputs, not one impressive example. Use fixed approved content when exact wording is mandatory.</p></div>
</div>

<h2>What token generation explains</h2>
<ol>
  <li>The same request can produce different wording.</li>
  <li>Early token choices influence everything that follows.</li>
  <li>A response can be fluent without being planned as a complete paragraph in advance.</li>
  <li>Generating more output requires more sequential steps, influencing latency and cost.</li>
  <li>A familiar-sounding continuation is not the same as a verified statement.</li>
</ol>

<section class="decision">
  ${decisionHead('Where is open-ended LLM generation the better fit?')}
  <div class="req-grid">
    ${choice('s4-decide', 'A', '<span class="label">Requirement A</span>Generate an editable first draft of a support response.', s.s4Decision === 'A', 'data-card="1"')}
    ${choice('s4-decide', 'B', '<span class="label">Requirement B</span>Display an approved legal disclosure word for word.', s.s4Decision === 'B', 'data-card="1"')}
  </div>
  ${s.s4Decision ? fb(s.s4Decision === 'A', s.s4Decision === 'A' ? 'Requirement A.' : 'Requirement A is the better fit.', 'Flexible generation is useful when several phrasings can be acceptable. If exact wording is mandatory, the product should normally use fixed approved content or deterministic insertion rather than asking the model to recreate the text freely.') : ''}
</section>
${pmBox('PM takeaway', '<p>Do not specify probabilistic generation as if it were deterministic software. Define acceptable variation, exact-output requirements, review needs, and the distribution of outputs that must be tested.</p>', 'Scene 4: Don’t specify probabilistic generation as if it were deterministic. Define acceptable variation, exact-output needs, review, and test the distribution of outputs.')}
<p class="muted small">Optional depth: <a href="${SOURCES.wolfram.url}" target="_blank" rel="noopener">${SOURCES.wolfram.title}</a> and <a href="${SOURCES.alammar.url}" target="_blank" rel="noopener">${SOURCES.alammar.title}</a>.</p>
${grounded(['every', 'google'])}`;
  },
});

// Scene 5 — context window
function ctxState(s) {
  const cap = s.s5Expanded ? 1000 : 100;
  const used = s.s5Sel.reduce((a, i) => a + CTX[i].t, 0);
  return { cap, used, over: used > cap };
}
SCREENS.push({
  id: 'scene5',
  group: 'scene5',
  step: 'Scene 5 of 8',
  done: (s) => s.s5Success && s.s5Expanded && s.s5Fit === 'no' && s.s5Revealed,
  render: (s) => {
    const { cap, used, over } = ctxState(s);
    const pct = Math.min(100, Math.round((used / cap) * 100));
    const out = s.s5Out;
    return `
${head('Scene 5', 'The context-window suitcase')}
${core('What information is available to the model now, and what does “fit” fail to guarantee?')}
<h2>Tokens affect more than text segmentation</h2>
<p>Tokens are the units a model processes and generates. Token counts influence:</p>
<ul>
  <li>how much information can fit in the current request;</li>
  <li>how long a response can be;</li>
  <li>how much computation is needed;</li>
  <li>latency;</li>
  <li>cost in products priced by token usage;</li>
  <li>performance across languages and unusual character sequences.</li>
</ul>
<p>Users think in pages, words, and conversations. Product teams must also think in tokens.</p>
${def('Context', '<p><strong>Context</strong> is the information available to the model for a particular generation. It can include product instructions, the user’s request, examples, selected conversation history, and any other information the product supplies.</p><p>The model uses relationships across this context to generate the continuation.</p>')}
${def('Context window', '<p>A <strong>context window</strong> is the maximum amount of tokenized input and generated output that a model can handle for a generation, subject to the model and implementation.</p><p>A context window is best understood as bounded working space. It is not automatically:</p><ul><li>permanent memory;</li><li>a guarantee that every detail will be noticed;</li><li>proof that the model will reason correctly across the entire input;</li><li>evidence that the information has entered the model’s weights.</li></ul>')}
<h2>Context versus persistent memory</h2>
<p>If the product includes previous messages in the current request, the model can respond as if it remembers them. If the product stops supplying those messages, the model no longer has that information in its current context.</p>
<p>Persistent memory requires the product to save information and decide when to supply it again. This creates product decisions about consent, privacy, retention, correction, deletion, relevance, and inappropriate use.</p>
<div class="three">
  <div class="panel model"><h3>Training knowledge</h3><p>Patterns distributed across parameters during training. Not an inspectable record.</p></div>
  <div class="panel model"><h3>Current context</h3><p>What the product supplies for this generation. Gone when it is no longer supplied.</p></div>
  <div class="panel pmish"><h3>Persistent product memory</h3><p>What the product saves and chooses to supply again, under consent and retention rules.</p></div>
</div>
<h2>Capacity versus comprehension</h2>
<p>A document fitting inside the context window means it can be supplied to the model. It does not prove that the model will:</p>
<ul>
  <li>identify the most important passage;</li>
  <li>retain equal sensitivity to every section;</li>
  <li>reconcile contradictions;</li>
  <li>perform exact counting;</li>
  <li>apply all instructions consistently;</li>
  <li>produce a factually correct conclusion.</li>
</ul>
<p>Those are performance questions that must be tested on representative tasks.</p>

<section class="sim" aria-labelledby="ctxTitle">
  <h3 id="ctxTitle">What should be supplied?</h3>
  ${SIM_LABEL}
  <p class="task"><span class="label">Task</span>Draft a concise response explaining that a customer is eligible for replacement because the damaged item was reported within seven days.</p>
  <div class="suitcase${over ? ' is-over' : ''}">
    <div class="suitcase-head">
      <span>Fictional context window: <strong>${cap.toLocaleString()} teaching tokens</strong>${s.s5Expanded ? ' (expanded)' : ''}</span>
      <span class="meter-text" aria-live="polite">${used} / ${cap} used${over ? ` — over capacity by ${used - cap}` : ''}</span>
    </div>
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${used}" aria-label="Context used"><span style="width:${pct}%"></span></div>
    <div class="packed">${s.s5Sel.length ? s.s5Sel.map((i) => `<span class="packed-item">${CTX[i].label} <span class="muted">${CTX[i].t}</span></span>`).join('') : '<span class="muted small">Nothing supplied yet. Add items from the list below.</span>'}</div>
  </div>
  <ul class="ctx-items">
    ${CTX.map((c, i) => {
      const on = s.s5Sel.includes(i);
      return `<li><button type="button" class="ctx-item${on ? ' is-on' : ''}" data-action="ctx-toggle" data-i="${i}" aria-pressed="${on}">
        <span class="ctx-state" aria-hidden="true">${on ? '−' : '+'}</span>
        <span class="ctx-label">${c.label}</span>
        <span class="ctx-t">${c.t} tokens</span>
        ${s.s5Tried ? `<span class="ctx-rel rel-${c.rel.toLowerCase()}">${c.rel}</span>` : ''}
        <span class="sr-only">${on ? 'Included. Select to remove.' : 'Not included. Select to add.'}</span>
      </button></li>`;
    }).join('')}
  </ul>
  <div class="row-actions">
    <button type="button" class="btn" data-action="ctx-generate"${over || !s.s5Sel.length ? ' disabled' : ''}>Generate a draft with this context</button>
    ${over ? '<span class="mark no">Over capacity. Remove something first.</span>' : ''}
  </div>
  ${out ? `<div class="gen-out" aria-live="polite">
    ${out === 'noRequest'
      ? fb(false, 'Nothing to respond to.', 'The current customer request is not in the context, so the model has no task to answer.')
      : `<span class="label">Scripted output</span><p class="draft">${CTX_OUT[out]}</p>${
        out === 'essentials' ? fb(true, 'The essentials are present.', 'The request and the seven-day rule were supplied, so the draft can state eligibility.')
          : out === 'noRule' ? fb(false, 'The rule is missing.', 'Without the seven-day replacement rule in context, the draft can only hedge.')
            : fb(false, 'Irrelevant context crept in.', 'The previous billing complaint pulled the draft away from the task.')}`}
    <p class="muted small">These outputs illustrate the role of supplied information. They are not guaranteed behavior from a real model.</p>
  </div>` : ''}
  ${s.s5Success ? `
    <div class="challenge-box">
      <h4>Capacity challenge</h4>
      ${s.s5Expanded ? `
        <p>The fictional capacity is now 1,000 tokens, and every item has been supplied.</p>
        <fieldset class="choices inline">
          <legend>Everything now fits. Does that prove that every detail will be used correctly?</legend>
          ${choice('ctx-fit', 'yes', 'Yes', s.s5Fit === 'yes')}
          ${choice('ctx-fit', 'no', 'No', s.s5Fit === 'no')}
        </fieldset>
        ${s.s5Fit ? fb(s.s5Fit === 'no', 'No.', 'The context window sets a capacity boundary for what can be supplied at that moment. It does not guarantee attention to every detail, accurate interpretation, persistent memory, or correct output. Task performance and reliable use of the information still require evaluation.') : ''}
      ` : `<p>You supplied the essentials within 100 tokens. What happens if capacity is no longer the constraint?</p>
        <button type="button" class="btn" data-action="ctx-expand">Expand capacity to 1,000 tokens</button>`}
    </div>` : ''}
</section>

<section class="decision">
  ${decisionHead('Rewrite: “The AI should remember everything.”')}
  <p>Replace the claim with the explicit product decisions it hides.</p>
  <label class="sr-only" for="s5Rewrite">Your rewrite</label>
  <textarea id="s5Rewrite" rows="4" data-bind="s5Rewrite" placeholder="What should be remembered, by whom, for how long, and how will we know it works?">${esc(s.s5Rewrite)}</textarea>
  <div class="row-actions">
    <button type="button" class="btn" data-action="s5-reveal">${s.s5Revealed ? 'Suggested questions shown below' : 'Compare with suggested product questions'}</button>
    <button type="button" class="btn ghost sm" data-action="save-bound" data-key="s5Rewrite" data-prefix="Scene 5 — remember everything">Save my answer to PM notes</button>
  </div>
  ${s.s5Revealed ? `<div class="reveal"><span class="label">Suggested product questions</span><ul>
    <li>What information is needed only for the current request?</li>
    <li>What information should persist across sessions?</li>
    <li>Who is allowed to save it?</li>
    <li>Did the user consent?</li>
    <li>How long is it retained?</li>
    <li>Can the user inspect, correct, or delete it?</li>
    <li>How will the product decide that saved information is relevant?</li>
    <li>How will we test correct recall and inappropriate use?</li>
  </ul></div>` : ''}
</section>
${pmBox('PM takeaway', '<p>Treat context as designed input, not as magical memory. A larger window increases capacity, but product quality depends on which information is supplied and whether the model uses it correctly.</p>', 'Scene 5: Treat context as designed input, not magical memory. A bigger window adds capacity; quality depends on what is supplied and whether the model uses it correctly.')}
${grounded(['google'])}`;
  },
});

// Scene 6 — pretraining vs post-training
SCREENS.push({
  id: 'scene6',
  group: 'scene6',
  step: 'Scene 6 of 8',
  done: (s) => s.s6Seen.length >= COMPARE.length && s.s6Decision === 'no',
  render: (s) => {
    const r = COMPARE[s.s6Req];
    const allSeen = s.s6Seen.length >= COMPARE.length;
    return `
${head('Scene 6', 'Pretraining creates capability; post-training shapes behavior')}
${core('Why can two models with broad underlying language capability behave very differently as assistants?')}
${def('Pretraining', '<p><strong>Pretraining</strong> is the large initial training stage in which a model learns broad patterns from enormous datasets. <a href="#/scene3">Scene 3</a> shows how next-token prediction drives it.</p>')}
${def('Post-training', '<p><strong>Post-training</strong> refers to additional training after the broad pretraining stage. Its purpose may include improving instruction-following, usefulness, conversational behavior, safety, reasoning behavior, format adherence, or other desired qualities.</p><p>A raw pretrained model is good at continuing patterns in text. It is not automatically a reliable assistant. Post-training helps shape how broad capability is expressed when a user gives an instruction.</p><p>Post-training does not create perfect control. Models can still misunderstand instructions, behave inconsistently, refuse inappropriately, or produce unsafe and incorrect output.</p>')}
${def('Fine-tuning', '<p><strong>Fine-tuning</strong> is additional training on examples chosen for a particular task, domain, or behavior. It changes at least some model parameters.</p><p>Fine-tuning can improve repeatable behaviors such as classification, formatting, tone, terminology, or performance on a well-defined task. It is not automatically the best way to give a product current factual information, and it does not guarantee the model will recall every example exactly.</p>')}
${def('Prompting', '<p><strong>Prompting</strong> means guiding the current output through instructions, examples, constraints, or relevant input. It uses the capabilities of the existing model and does not ordinarily change its parameters. (See <a href="#/scene2">Scene 2</a>.)</p>')}

<section class="sim" aria-labelledby="cmpTitle">
  <h3 id="cmpTitle">Same base, two behaviors</h3>
  <p>Two fictional assistants derived from the same fictional pretrained base. Choose a request to compare them.</p>
  ${SIM_LABEL}
  <div class="tabs" role="group" aria-label="Requests">
    ${COMPARE.map((c, i) => choice('s6-req', i, `${s.s6Seen.includes(i) ? '<span aria-hidden="true">✓ </span>' : ''}${c.req}`, s.s6Req === i)).join('')}
  </div>
  <p class="request mono" aria-live="polite">Request: ${r.req}</p>
  <div class="panels">
    <div class="panel"><span class="label">Base completion-oriented model</span><p>${r.base}</p><p class="muted small">Scripted teaching example</p></div>
    <div class="panel model"><span class="label">Post-trained assistant</span><p>${r.post}</p><p class="muted small">Scripted teaching example</p></div>
  </div>
  ${allSeen
    ? '<div class="reveal"><p>Pretraining develops broad representations and continuation ability. Post-training shapes instruction-following, conversational behavior, preferences, and safety. It improves behavior; it does not produce perfect control.</p></div>'
    : `<p class="muted small">${s.s6Seen.length} of ${COMPARE.length} requests compared.</p>`}
</section>

<section class="decision">
  ${decisionHead('Two candidate models have similar broad capabilities but different instruction-following, format adherence, refusal, and uncertainty behavior. Is choosing between them merely an engineering detail?')}
  <div class="choices inline" role="group" aria-label="Your answer">
    ${choice('s6-decide', 'yes', 'Yes, it is an engineering detail', s.s6Decision === 'yes')}
    ${choice('s6-decide', 'no', 'No, it is a product concern', s.s6Decision === 'no')}
  </div>
  ${s.s6Decision ? fb(s.s6Decision === 'no', 'No.', 'These behaviors affect eligible use cases, UX, safety, evaluation, support burden, and user trust. They are product concerns.') : ''}
</section>
${pmBox('PM implication', '<p>Instruction-following, format adherence, refusal behavior, and handling of uncertainty are product characteristics. Compare candidate models on the behaviors your use case depends on, not only on broad capability.</p>', 'Scene 6: Model behavior differences (instruction-following, format, refusals, uncertainty) are product concerns — they affect use cases, UX, safety, evaluation, and trust.')}
${grounded(['lenny', 'google', 'googleTune'])}`;
  },
});

// Scene 7 — sounds right vs supported
SCREENS.push({
  id: 'scene7',
  group: 'scene7',
  step: 'Scene 7 of 8',
  done: (s) => s.s7Revealed && s.s7Boards.includes(1) && s.s7Boards.includes(2) && s.s7Checked,
  render: (s) => {
    const rated = ['A', 'B', 'C'].every((o) => RATE_DIMS.every(([k]) => s.s7Ratings[o] && s.s7Ratings[o][k]));
    const metricsOk = METRICS.every((m, i) => m.good === s.s7Metrics.includes(i));
    return `
${head('Scene 7', '“Sounds right” versus “is supported”')}
${core('What evidence makes a fluent answer trustworthy?')}
<p>LLMs produce remarkably useful results. Their strengths do not remove their limitations. Product decisions depend on understanding both.</p>
<h2>1. Truth is not the same objective as plausibility</h2>
<p>During pretraining, the model learns to predict tokens from examples of language. The training data does not provide a complete true-or-false label for every statement.</p>
<p>The model becomes very good at producing text with the structure and detail of an answer. When the necessary fact is rare, unavailable, ambiguous, or poorly represented, the same capability can produce a plausible falsehood.</p>
${def('Hallucination', '<p>A <strong>hallucination</strong> is a generated claim that is plausible in form but false or unsupported.</p><p>Not every weak response is a hallucination. An output can also be:</p><ul class="cols"><li>irrelevant;</li><li>incomplete;</li><li>badly formatted;</li><li>unsafe;</li><li>biased;</li><li>based on missing context;</li><li>correct but unhelpful;</li><li>inconsistent with product policy.</li></ul><p>Product teams need a failure taxonomy rather than calling every problem a hallucination.</p>')}
<h2>2. Fluency is not evidence</h2>
<p>The model’s language ability can make an unsupported claim sound polished and specific. Length, confidence, citations, professional tone, and detailed reasoning do not independently establish truth.</p>
<p>A PM should separate:</p>
<dl class="props">
  <div><dt>Fluency</dt><dd>Does it read naturally?</dd></div>
  <div><dt>Relevance</dt><dd>Does it address the request?</dd></div>
  <div><dt>Correctness</dt><dd>Is the claim true and supported?</dd></div>
  <div><dt>Calibration</dt><dd>Does expressed confidence match the evidence?</dd></div>
  <div><dt>Helpfulness</dt><dd>Does it move the user toward their goal?</dd></div>
  <div><dt>Safety</dt><dd>Could the output cause unacceptable harm?</dd></div>
</dl>
<h2>3. Behavior is probabilistic and prompt-sensitive</h2>
<p>The same model can succeed on one phrasing and fail on another. A successful demo proves that a behavior is possible in that example. It does not establish a dependable success rate across real users.</p>
<p>Similarly, one failure does not prove the model can never perform the task. Product teams need representative evaluation rather than intuition based on a handful of examples.</p>
<h2>4. The model does not necessarily know when it is wrong</h2>
<p>The model may express uncertainty, but a verbal confidence statement is itself generated text. It should not automatically be treated as a calibrated probability.</p>
<p>The product may prefer an answer, a clarification question, an abstention, or escalation depending on the risk.</p>
${def('Abstention', '<p>An <strong>abstention</strong> is a response in which the model does not provide a specific answer because the evidence or capability is insufficient.</p><p>An abstention is not always a failure. In a high-consequence setting, “I cannot verify this” can be better than a confident guess.</p>')}
<h2>5. Training data affects behavior</h2>
<p>Models learn from the distributions represented in their data and training processes. They may reproduce or amplify biases, perform unevenly across languages or groups, and be weak in poorly represented domains.</p>
<p>Testing only average performance can conceal important failures for particular users.</p>
<h2>6. Exact operations are not automatically reliable</h2>
<p>An LLM can often perform arithmetic, counting, formatting, and rule-following. But language generation is not the same as a deterministic calculation engine. If exactness is mandatory, the product must test the behavior and may need deterministic validation or computation.</p>
<h2>7. Models and products change</h2>
<p>Providers update models and product layers. A change may improve general capability while altering latency, tone, refusals, formatting, or performance on a specific task. A model upgrade is a product change and should be evaluated before rollout.</p>

<section class="sim" aria-labelledby="refTitle">
  <h3 id="refTitle">Which answer is better?</h3>
  ${SIM_LABEL}
  <p class="task"><span class="label">Customer asks</span>“Has my ₹2,499 refund for order RR-1842 been approved?”</p>
  <p><strong>The model has not been given any account or order information.</strong> Rate each output.</p>
  ${['A', 'B', 'C'].map((o) => `
    <div class="output-card">
      <p class="output-text"><span class="label">Output ${o}</span>${REFUND_OUTPUTS[o]}</p>
      <div class="ratings">
        ${RATE_DIMS.map(([k, name]) => `<div class="rating-row" role="group" aria-label="Output ${o}: ${name}">
          <span class="rating-name">${name}</span>
          <span class="seg">${LEVELS.map((lv) => {
            const on = s.s7Ratings[o] && s.s7Ratings[o][k] === lv;
            return `<button type="button" class="seg-btn${on ? ' is-selected' : ''}" data-action="rate" data-o="${o}" data-k="${k}" data-v="${lv}" aria-pressed="${!!on}">${lv}</button>`;
          }).join('')}</span>
          ${s.s7Revealed ? `<span class="ref muted small">One reasonable rating: ${REFUND_REFERENCE[o][k]}</span>` : ''}
        </div>`).join('')}
      </div>
      ${s.s7Revealed ? `<p class="analysis"><strong>${o}</strong> ${REFUND_ANALYSIS[o]}</p>` : ''}
    </div>`).join('')}
  <div class="row-actions">
    <button type="button" class="btn" data-action="s7-reveal"${rated ? '' : ' disabled'}>Reveal which claims are unsupported</button>
    ${rated ? '' : '<span class="muted small">Rate all four properties for each output first.</span>'}
  </div>
</section>

<section class="sim" aria-labelledby="scoreTitle">
  <h3 id="scoreTitle">What behavior are we rewarding?</h3>
  ${SIM_LABEL}
  <p>Ten fictional factual questions. The evidence needed for an answer is available for only two of them; for the other eight, the answer is unavailable to the model.</p>
  <div class="boards">
    ${[1, 2].map((b) => {
      const B = BOARD[b];
      const ran = s.s7Boards.includes(b);
      return `<div class="board">
        <h4>Scoreboard ${b}</h4>
        <ul class="rules">${B.rules.map((r) => `<li>${r}</li>`).join('')}</ul>
        ${ran ? `<ol class="grid10" aria-label="Results for ten questions">${B.cells.map((c, i) => `<li class="cell c-${c}"><span class="cell-n">Q${i + 1}</span><span aria-hidden="true">${CELL[c][0]}</span><span class="sr-only">${CELL[c][1]}</span></li>`).join('')}</ol>
          <p class="result">${B.result}</p><p class="muted small">${B.score}</p>`
          : `<button type="button" class="btn" data-action="board" data-b="${b}">Run Scoreboard ${b}</button>`}
      </div>`;
    }).join('')}
  </div>
  <p class="legend muted small"><span>✓ correct</span> <span>✗ wrong guess</span> <span>— abstained</span></p>
  ${s.s7Boards.includes(1) && s.s7Boards.includes(2) ? '<div class="reveal"><p>The simulation is not a literal model-training process. It illustrates a product and evaluation principle: measuring only how often the system answers can reward behavior that is harmful when uncertainty matters.</p></div>' : ''}
  <p class="muted small">Grounding: <a href="${SOURCES.openai.url}" target="_blank" rel="noopener">${SOURCES.openai.title}</a> (OpenAI).</p>
</section>

<section class="decision">
  ${decisionHead('ReplyRight currently reports only “percentage of questions answered.” Which additional outcomes should the PM request?')}
  <p>Select all that apply.</p>
  <div class="checks">
    ${METRICS.map((m, i) => {
      const on = s.s7Metrics.includes(i);
      let mark = '';
      if (s.s7Checked) {
        if (m.good && on) mark = '<span class="mark ok">✓ Yes</span>';
        else if (m.good && !on) mark = '<span class="mark no">Missing — worth requesting</span>';
        else if (!m.good && on) mark = '<span class="mark no">✗ Does not measure quality</span>';
      }
      return `<label class="check"><input type="checkbox" data-change="metric" data-i="${i}"${on ? ' checked' : ''}> <span>${m.label}</span> ${mark}</label>`;
    }).join('')}
  </div>
  <div class="row-actions"><button type="button" class="btn" data-action="s7-check">${s.s7Checked ? 'Check again' : 'Check my selection'}</button></div>
  ${s.s7Checked ? fb(metricsOk, metricsOk ? 'Strong selection.' : 'Not yet complete.', 'Track supported-answer accuracy, unsupported confident claims, appropriate clarification and abstention, human correction, escalation and recovery, and severe errors. Fluency, confidence, and correctness are separate properties.') : ''}
</section>
${pmBox('PM takeaway', '<p>Evaluate truthfulness, relevance, uncertainty, safety, and usefulness separately. Do not treat confident language or a high answer rate as a proxy for product quality.</p>', 'Scene 7: Evaluate truthfulness, relevance, uncertainty, safety, and usefulness separately. Confident language or a high answer rate is not a proxy for quality.')}
<details class="deeper"><summary>Go deeper: why one example proves little</summary>
<p>Bowman’s survey notes that specific capabilities can be hard to predict in advance, that steering techniques are imperfect, and that we have limited ability to inspect why a model produced an output. This is why one successful or failed example does not establish general capability.</p>
<p><a href="${SOURCES.bowman.url}" target="_blank" rel="noopener">${SOURCES.bowman.title}</a></p></details>
${grounded(['openai', 'bowman'])}`;
  },
});

// Scene 8 — repair the brief
function expertHtml(sel) {
  let html = esc(EXPERT_BRIEF);
  CLAUSES.forEach((c, i) => {
    html = html.replace(esc(c.t), `<button type="button" class="clause${sel === i ? ' is-selected' : ''}" data-action="clause" data-i="${i}" aria-pressed="${sel === i}">${esc(c.t)}</button>`);
  });
  return html;
}
SCREENS.push({
  id: 'scene8',
  group: 'scene8',
  step: 'Scene 8 of 8',
  done: (s) => s.s8Submitted,
  render: (s) => `
${head('Scene 8', 'Repair the ReplyRight brief')}
<p class="lede">Return to the original brief.</p>
<blockquote class="brief">“${ORIGINAL_BRIEF}”</blockquote>
<div class="first-reaction"><span class="label">Your first reaction</span><p>${s.initialJudgment ? esc(s.initialJudgment) : '<a href="#/challenge">You have not recorded one yet.</a>'}</p></div>
<p>Having looked inside the system, you can now say which parts are useful direction and which need clarification before anyone builds them. In a later conversation, leadership restates it as:</p>
<blockquote class="brief small-brief">“Customers should be able to ask anything. The AI should remember everything, learn from every correction, always be factually correct, and give the same answer every time.”</blockquote>

<h2>Five statements to repair</h2>
<p>Open each statement, decide what is wrong with it, then compare.</p>
${DECISIONS.map((d, i) => `
<details class="decision-card">
  <summary><span class="dnum">${i + 1}</span> ${d.title}</summary>
  <div class="dc-body">
    <h4>What is wrong with the statement?</h4><p>${d.wrong}</p>
    <h4>Better requirement</h4><p class="better">${d.better}</p>
    <h4>PM questions</h4><ul>${d.qs.map((q) => `<li>${q}</li>`).join('')}</ul>
    <div class="row-actions"><button type="button" class="btn ghost sm" data-action="add-req" data-i="${i}">Add this requirement to my brief</button></div>
  </div>
</details>`).join('')}

<section class="decision">
  <h3 class="decision-head"><span class="label">Your brief</span>Revise the ReplyRight brief</h3>
  <div class="brief-editor">
    <div>
      <label class="sr-only" for="s8Brief">Your revised brief</label>
      <textarea id="s8Brief" rows="12" data-bind="s8Brief">${esc(s.s8Brief)}</textarea>
      <div class="row-actions">
        <button type="button" class="btn" data-action="s8-submit">${s.s8Submitted ? 'Update my submitted brief' : 'Submit my brief'}</button>
        <button type="button" class="btn ghost sm" data-action="s8-reset">Reset to the original</button>
      </div>
    </div>
    <aside class="prompts"><span class="label">Optional prompts</span><ul>${BRIEF_PROMPTS.map((p) => `<li>${p}</li>`).join('')}</ul></aside>
  </div>
</section>

${s.s8Submitted ? `
<section class="expert">
  <h3>Expert comparison</h3>
  <p class="muted small">Select a highlighted clause to see what it does.</p>
  <p class="expert-text">${expertHtml(s.s8Clause)}</p>
  <div class="clause-detail" aria-live="polite">${s.s8Clause != null ? `<strong>“${CLAUSES[s.s8Clause].t}”</strong> → ${CLAUSES[s.s8Clause].p}` : 'No clause selected.'}</div>
  <p class="callout">This is one defensible version, not the only correct brief. Compare whether each version defines scope, evidence, acceptable variability, failure behavior, human responsibility, and evaluation.</p>
  <fieldset class="checks">
    <legend>Does your brief define…</legend>
    ${BRIEF_CHECKS.map((c, i) => `<label class="check"><input type="checkbox" data-bind="s8Check.${i}"${s.s8Check[i] ? ' checked' : ''}> <span>${c}</span></label>`).join('')}
  </fieldset>
</section>` : ''}
${grounded(['every', 'lenny', 'google', 'openai', 'bowman'])}`,
});

// Explain it back 1/3
let recognition = null;
SCREENS.push({
  id: 'explain',
  group: 'explain',
  step: 'Explain it back · 1 of 3',
  done: (s) => s.explainFeedback,
  render: (s) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const sentences = (s.explain || '').split(/(?<=[.!?])\s+/).filter(Boolean);
    const count = RUBRIC.filter((r) => s.rubric[r.k]).length;
    let state = '';
    if (s.explainFeedback) state = count === RUBRIC.length ? 'Clear and decision-ready' : count >= 5 ? 'Strong explanation; clarify one distinction' : 'Revisit one concept and try again';
    return `
${head('Explain it back', 'Explain it in two minutes')}
<blockquote class="brief">A senior product leader asks: “In two minutes, explain what an LLM is, why it can do so many language tasks, what it cannot guarantee, and how that changes our product decisions.”</blockquote>
<label for="explainText" class="field-label">Your explanation</label>
<textarea id="explainText" rows="9" data-bind="explain" placeholder="Write as you would say it out loud…">${esc(s.explain)}</textarea>
<div class="row-actions">
  ${SR ? `<button type="button" class="btn ghost" data-action="dictate" aria-pressed="${!!recognition}">${recognition ? 'Stop dictating' : 'Dictate instead'}</button><span class="muted small">Dictation writes a transcript into the box above.</span>` : ''}
</div>
<details class="deeper"><summary>Show an optional structure</summary><ol>
  <li>Define the model.</li><li>Explain pretraining and learned parameters.</li><li>Explain token-by-token generation.</li><li>Explain context.</li><li>Name capabilities.</li><li>Name limitations.</li><li>Translate them into product decisions.</li>
</ol></details>
<div class="row-actions"><button type="button" class="btn" data-action="explain-submit">${s.explainSubmitted ? 'Re-assess my explanation' : 'Submit and self-assess'}</button></div>

${s.explainSubmitted ? `
<section class="decision">
  <h3 class="decision-head"><span class="label">Self-assessment</span>Check your explanation against the rubric</h3>
  <p class="muted small">Where a sentence of yours looks relevant, it is quoted as possible evidence. You decide whether it demonstrates the dimension. Tick only what your explanation actually shows.</p>
  <div class="rubric">
    ${RUBRIC.map((r) => {
      const hit = sentences.find((x) => r.re.test(x));
      return `<label class="rubric-row"><input type="checkbox" data-bind="rubric.${r.k}"${s.rubric[r.k] ? ' checked' : ''}>
        <span><strong>${r.dim}</strong> — ${r.ev}${hit ? `<span class="evidence">Possible evidence: “${esc(hit.length > 180 ? `${hit.slice(0, 177)}…` : hit)}”</span>` : '<span class="evidence none">No matching sentence found. Tick only if you covered it in other words.</span>'}</span>
      </label>`;
    }).join('')}
  </div>
  <div class="row-actions"><button type="button" class="btn" data-action="explain-feedback">Get feedback</button></div>
  ${s.explainFeedback ? `<div class="fb ${count === RUBRIC.length ? 'ok' : 'mid'}" role="status"><strong>${state}</strong> ${count} of ${RUBRIC.length} dimensions demonstrated.
    ${count < RUBRIC.length ? `<span class="revisit">Revisit: ${RUBRIC.filter((r) => !s.rubric[r.k]).map((r) => `<a href="#/${r.link}">${r.dim}</a>`).join(', ')}</span>` : ''}</div>
    <div class="reveal"><span class="label">Model answer</span><p>${MODEL_ANSWER}</p></div>` : ''}
</section>` : ''}
<p class="muted small">Passing is based on explaining and applying the concepts, not recalling parameter counts, architecture trivia, or historical model facts.</p>`;
  },
});

// Explain it back 2/3 — applied check
SCREENS.push({
  id: 'check',
  group: 'explain',
  step: 'Explain it back · 2 of 3',
  done: (s) => QUIZ.every((q, i) => s.quiz[i] && s.quiz[i].correct),
  render: (s) => {
    const correctCount = QUIZ.filter((q, i) => s.quiz[i] && s.quiz[i].correct).length;
    const labels = { scene2: 'Scene 2', scene4: 'Scene 4', scene5: 'Scene 5', scene7: 'Scene 7' };
    const rv = s.review;
    return `
${head('Explain it back', 'Applied check')}
<p class="lede">Six scenarios. They assess application, not vocabulary recall. You can revise any answer as many times as you need.</p>
<p class="progress-line" aria-live="polite">${correctCount} of ${QUIZ.length} answered correctly</p>
${QUIZ.map((q, qi) => {
  const st = s.quiz[qi] || {};
  return `<fieldset class="q">
    <legend><span class="label">Question ${qi + 1}</span>${q.q}</legend>
    ${q.opts.map((o, oi) => `<label class="opt${st.correct && oi === q.a ? ' is-correct' : ''}${st.wrong && st.sel === oi ? ' is-wrong' : ''}">
      <input type="radio" name="q${qi}" value="${oi}" data-change="quiz-sel" data-q="${qi}" data-o="${oi}"${st.sel === oi ? ' checked' : ''}${st.correct ? ' disabled' : ''}>
      <span><b>${'ABCD'[oi]}.</b> ${o}</span></label>`).join('')}
    ${st.correct ? fb(true, 'Correct.', q.why)
      : st.wrong ? `<div class="fb no" role="status"><strong><span aria-hidden="true">✗</span> Not quite.</strong> ${q.why} <a href="#/${q.link}">Revisit ${labels[q.link]}</a> <button type="button" class="btn ghost sm" data-action="quiz-retry" data-q="${qi}">Try again</button></div>`
        : `<div class="row-actions"><button type="button" class="btn" data-action="quiz-check" data-q="${qi}"${st.sel == null ? ' disabled' : ''}>Check answer</button></div>`}
  </fieldset>`;
}).join('')}

<details class="deeper">
  <summary>Optional review: the four terms</summary>
  <fieldset class="q">
    <legend>${REVIEW.q}</legend>
    ${REVIEW.opts.map((o, oi) => `<label class="opt"><input type="radio" name="review" data-change="review-sel" data-o="${oi}"${rv.sel === oi ? ' checked' : ''}> <span><b>${'ABCD'[oi]}.</b> ${o}</span></label>`).join('')}
    ${rv.sel != null ? fb(rv.sel === REVIEW.a, rv.sel === REVIEW.a ? '' : 'Not quite.', REVIEW.fb[rv.sel]) : ''}
  </fieldset>
</details>`;
  },
});

// Explain it back 3/3 — artifact
function completionItems(s) {
  const byId = Object.fromEntries(SCREENS.map((x) => [x.id, x]));
  return [
    ['Initial judgment recorded', byId.challenge.done(s)],
    ['Scene 1 — layers opened and capabilities classified', byId.scene1.done(s)],
    ['Scene 2 — sorting check and PM decision', byId.scene2.done(s)],
    ['Scene 3 — model view of tokens explored', byId.scene3.done(s)],
    ['Scene 4 — generation simulations and PM decision', byId.scene4.done(s)],
    ['Scene 5 — context simulation, capacity challenge, and rewrite', byId.scene5.done(s)],
    ['Scene 6 — pretraining vs. post-training comparison and PM decision', byId.scene6.done(s)],
    ['Scene 7 — confident-error interactions and metrics decision', byId.scene7.done(s)],
    ['Scene 8 — revised brief submitted', byId.scene8.done(s)],
    ['Explain-back submitted and assessed', byId.explain.done(s)],
    ['All six applied questions answered correctly', byId.check.done(s)],
  ];
}
function artifactMarkdown(s) {
  const lines = ['# My LLM product mental model', '', '_Inside an LLM: Make Better Product Decisions — Module 1_', ''];
  if (s.initialJudgment) lines.push(`**First reaction to the ReplyRight brief:** ${s.initialJudgment}`, '');
  ART_FIELDS.forEach((f) => {
    lines.push(`## ${f.h}`, '', artValue(s, f).trim() || '_Not yet written._', '');
  });
  const notes = s.notes.map((n) => `- ${n.text}`);
  if (notes.length || s.freeNotes.trim()) {
    lines.push('## PM notes', '');
    if (notes.length) lines.push(...notes, '');
    if (s.freeNotes.trim()) lines.push(s.freeNotes.trim(), '');
  }
  return lines.join('\n');
}
SCREENS.push({
  id: 'artifact',
  group: 'explain',
  step: 'Explain it back · 3 of 3',
  done: (s) => !!s.visited.artifact,
  render: (s) => {
    const items = completionItems(s);
    const all = items.every((x) => x[1]);
    return `
${head('Your takeaway', 'My LLM product mental model')}
<p class="lede">Your one-page summary, assembled from your choices. Edit anything, then copy or download it.</p>
${all ? fb(true, 'Module complete.', 'You have completed every required decision, the explain-back, and the applied check.') : ''}
<div class="art">
  ${ART_FIELDS.map((f) => `<div class="art-field">
    <label for="art-${f.k}">${f.h}</label>
    <textarea id="art-${f.k}" rows="${f.k === 'brief' || f.k === 'whatIs' ? 7 : 3}" data-bind="art.${f.k}" placeholder="${f.k === 'questions' ? 'For example: How will we measure unsupported claims before launch?' : 'In your own words…'}">${esc(artValue(s, f))}</textarea>
  </div>`).join('')}
</div>
<div class="row-actions">
  <button type="button" class="btn" data-action="art-copy">Copy as Markdown</button>
  <button type="button" class="btn ghost" data-action="art-download">Download .md</button>
</div>
<section class="completion">
  <h3>Completion</h3>
  <ul class="done-list">${items.map(([label, ok]) => `<li class="${ok ? 'is-done' : ''}"><span aria-hidden="true">${ok ? '✓' : '○'}</span> ${label}<span class="sr-only">${ok ? ' — done' : ' — not yet done'}</span></li>`).join('')}</ul>
  <div class="row-actions"><button type="button" class="btn ghost sm" data-action="reset-all">Reset the module and start over</button></div>
</section>`;
  },
});

// ---------- Actions ----------

const ACTIONS = {
  refresh: () => {},
  judge: (s, el) => { s.initialJudgment = el.dataset.v; },
  'layer-next': (s) => { s.layersOpen = Math.min(LAYERS.length, s.layersOpen + 1); s.layerSel = s.layersOpen - 1; },
  'layer-sel': (s, el) => { s.layerSel = Number(el.dataset.i); },
  's1-check': (s) => { s.s1Checked = true; },
  's2-check': (s) => { s.s2Checked = true; },
  's2-reveal': (s) => { s.s2Revealed = true; },
  'tok-view': (s, el) => { s.s3View = el.dataset.v; if (el.dataset.v === 'model') s.s3Seen = true; },
  'tok-why': (s) => { s.s3Why = !s.s3Why; },
  'tok-pick': (s, el) => {
    const next = [...s.s4Path, el.dataset.t];
    s.s4Path = next;
    if (TT.finish[next.join('|')]) s.s4Final = true;
  },
  'tok-sample': (s, el, api) => {
    const cands = TT.steps[s.s4Path.join('|')].filter((c) => c[2]);
    const total = cands.reduce((a, c) => a + c[1], 0);
    let r = Math.random() * total;
    const pick = cands.find((c) => (r -= c[1]) < 0) || cands[cands.length - 1];
    ACTIONS['tok-pick'](s, { dataset: { t: pick[0] } });
    api.announce(`Sampled “${pick[0]}”.`);
  },
  'tok-reset': (s) => { s.s4Path = []; s.s4Final = false; },
  'run-again': (s) => { s.s4Runs = Math.min(3, s.s4Runs + 1); },
  's4-malf': (s, el) => { s.s4Malf = el.dataset.v; },
  temp: (s, el) => { s.s4Temp = Number(el.value); },
  's4-decide': (s, el) => { s.s4Decision = el.dataset.v; },
  'ctx-toggle': (s, el) => {
    const i = Number(el.dataset.i);
    s.s5Sel = s.s5Sel.includes(i) ? s.s5Sel.filter((x) => x !== i) : [...s.s5Sel, i].sort((a, b) => a - b);
    s.s5Out = null;
  },
  'ctx-generate': (s) => {
    const sel = s.s5Sel;
    let out;
    if (!sel.includes(0)) out = 'noRequest';
    else if (!sel.includes(2)) out = 'noRule';
    else if (sel.includes(6)) out = 'noise';
    else out = 'essentials';
    s.s5Out = out;
    s.s5Tried = true;
    if (out === 'essentials') s.s5Success = true;
  },
  'ctx-expand': (s) => { s.s5Expanded = true; s.s5Sel = CTX.map((c, i) => i); s.s5Out = null; },
  'ctx-fit': (s, el) => { s.s5Fit = el.dataset.v; },
  's5-reveal': (s) => { s.s5Revealed = true; },
  's6-req': (s, el) => {
    const i = Number(el.dataset.v);
    s.s6Req = i;
    if (!s.s6Seen.includes(i)) s.s6Seen = [...s.s6Seen, i];
  },
  's6-decide': (s, el) => { s.s6Decision = el.dataset.v; },
  rate: (s, el) => {
    const { o, k, v } = el.dataset;
    s.s7Ratings[o] = { ...(s.s7Ratings[o] || {}), [k]: v };
  },
  's7-reveal': (s) => { s.s7Revealed = true; },
  board: (s, el) => { const b = Number(el.dataset.b); if (!s.s7Boards.includes(b)) s.s7Boards = [...s.s7Boards, b]; },
  metric: (s, el) => {
    const i = Number(el.dataset.i);
    s.s7Metrics = el.checked ? [...new Set([...s.s7Metrics, i])] : s.s7Metrics.filter((x) => x !== i);
  },
  's7-check': (s) => { s.s7Checked = true; },
  'add-req': (s, el, api) => {
    const text = DECISIONS[Number(el.dataset.i)].better;
    if (s.s8Brief.includes(text)) { api.toast('Already in your brief.'); return false; }
    s.s8Brief = `${s.s8Brief.trim()}\n\n${text}`.trim();
    api.toast('Added to your brief.');
  },
  's8-submit': (s) => { s.s8Submitted = true; },
  's8-reset': (s) => { s.s8Brief = ORIGINAL_BRIEF; },
  clause: (s, el) => { s.s8Clause = Number(el.dataset.i); },
  'explain-submit': (s, el, api) => {
    if ((s.explain || '').trim().length < 40) { api.toast('Write at least a few sentences first.'); return false; }
    s.explainSubmitted = true;
    s.explainFeedback = false;
  },
  'explain-feedback': (s) => { s.explainFeedback = true; },
  dictate: (s, el, api) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    if (recognition) { recognition.stop(); return undefined; }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = document.documentElement.lang || 'en';
    recognition.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (!t.trim()) return;
      s.explain = `${(s.explain || '').trim()} ${t.trim()}`.trim();
      api.save();
      const ta = document.getElementById('explainText');
      if (ta) ta.value = s.explain;
    };
    recognition.onend = () => { recognition = null; api.rerender(); };
    recognition.onerror = () => { recognition = null; api.toast('Dictation is unavailable. You can type instead.'); api.rerender(); };
    recognition.start();
  },
  'quiz-sel': (s, el) => { s.quiz[el.dataset.q] = { sel: Number(el.dataset.o) }; },
  'quiz-check': (s, el) => {
    const qi = Number(el.dataset.q);
    const st = s.quiz[qi] || {};
    if (st.sel == null) return false;
    s.quiz[qi] = st.sel === QUIZ[qi].a ? { sel: st.sel, correct: true } : { sel: st.sel, wrong: true };
  },
  'quiz-retry': (s, el) => { s.quiz[el.dataset.q] = {}; },
  'review-sel': (s, el) => { s.review = { sel: Number(el.dataset.o) }; },
  'art-copy': (s, el, api) => { api.copy(artifactMarkdown(s)); return false; },
  'art-download': (s, el, api) => { api.download('my-llm-product-mental-model.md', artifactMarkdown(s)); return false; },
};
