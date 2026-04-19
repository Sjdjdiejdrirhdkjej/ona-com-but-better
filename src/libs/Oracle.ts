const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const ORACLE_MODEL = process.env.FIREWORKS_ORACLE_MODEL ?? 'accounts/fireworks/models/glm-5p1';
const ORACLE_MAX_REFINEMENT_PASSES = Math.max(1, Math.min(Number(process.env.ORACLE_MAX_REFINEMENT_PASSES ?? '4'), 8));

const ORACLE_SYSTEM_PROMPT = `You are THE ORACLE, a specialist reasoning subagent inside ONA but OPEN SOURCE.

Your role is to think deeply about the main AI's request and return a comprehensive, implementation-ready answer.

Use GLM 5.1's reasoning ability for long-horizon analysis, architecture decisions, debugging hypotheses, strategy, tradeoff analysis, plans, and synthesis.

Rules:
- Think as long as needed internally, but do not expose private chain-of-thought.
- Return the final answer only: clear conclusions, concise rationale, assumptions, alternatives, edge cases, and recommended next steps.
- If the request depends on live web facts, current package APIs, or browser state, say that the main AI should use the Librarian or Browser Use Expert for evidence before acting.
- Be explicit about uncertainty and assumptions.
- Prefer practical, actionable guidance over abstract discussion.
- When the request is about software engineering, include concrete implementation guidance and failure modes.

Default output format:
- Executive answer
- Key reasoning summary
- Recommended approach
- Alternatives considered
- Risks / edge cases
- Implementation checklist or next steps`;

type OracleMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type FireworksNonStreamResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  error?: { message?: string };
};

async function oracleCall(messages: OracleMessage[], maxTokens = 32768): Promise<string> {
  if (!process.env.FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY is not configured.');
  }

  const res = await fetch(FIREWORKS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: ORACLE_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      reasoning_effort: 'high',
    }),
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Oracle AI error (${res.status}): ${text}`);
  }

  const json = await res.json() as FireworksNonStreamResponse;
  if (json.error?.message) throw new Error(`Oracle AI error: ${json.error.message}`);

  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

function parseCompleteness(value: string): { complete: boolean; feedback: string } {
  const trimmed = value.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { complete: false, feedback: trimmed };
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { complete?: unknown; feedback?: unknown; missing?: unknown };
    const missing = Array.isArray(parsed.missing) ? parsed.missing.join('\n- ') : '';
    const feedback = typeof parsed.feedback === 'string'
      ? parsed.feedback
      : missing
        ? `Missing:\n- ${missing}`
        : trimmed;
    return { complete: parsed.complete === true, feedback };
  } catch {
    return { complete: false, feedback: trimmed };
  }
}

export type OracleStepCallback = (
  event: 'start' | 'complete',
  stepLabel: string,
  error?: boolean,
) => void;

export async function runOracleSubagent(request: string, onStep?: OracleStepCallback): Promise<string> {
  const messages: OracleMessage[] = [
    { role: 'system', content: ORACLE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Main AI request:\n\n${request}\n\nProduce a comprehensive preliminary answer. Do not expose private chain-of-thought; provide conclusions and a concise reasoning summary.`,
    },
  ];

  onStep?.('start', 'Deep reasoning pass 1');
  let draft: string;
  try {
    draft = await oracleCall(messages);
    onStep?.('complete', 'Deep reasoning pass 1');
  } catch (error) {
    onStep?.('complete', 'Deep reasoning pass 1', true);
    throw error;
  }

  messages.push({ role: 'assistant', content: draft });

  for (let pass = 1; pass <= ORACLE_MAX_REFINEMENT_PASSES; pass++) {
    const auditLabel = `Auditing answer ${pass}`;
    onStep?.('start', auditLabel);
    let audit: string;
    try {
      audit = await oracleCall([
        { role: 'system', content: ORACLE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Request:\n${request}\n\nCurrent answer:\n${draft}\n\nEvaluate whether this answer is comprehensive enough for the main AI to act on. Respond only as JSON with this shape: {"complete": boolean, "feedback": "specific missing points or improvements"}. Mark complete=true only if the answer covers assumptions, tradeoffs, edge cases, and concrete next steps.`,
        },
      ], 4096);
      onStep?.('complete', auditLabel);
    } catch (error) {
      onStep?.('complete', auditLabel, true);
      throw error;
    }

    const completeness = parseCompleteness(audit);
    if (completeness.complete) break;

    const refineLabel = `Refining answer ${pass}`;
    onStep?.('start', refineLabel);
    try {
      draft = await oracleCall([
        { role: 'system', content: ORACLE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Request:\n${request}\n\nCurrent answer:\n${draft}\n\nAudit feedback:\n${completeness.feedback}\n\nRevise into a stronger, more comprehensive answer. Do not mention this audit process. Do not expose private chain-of-thought.`,
        },
      ]);
      onStep?.('complete', refineLabel);
    } catch (error) {
      onStep?.('complete', refineLabel, true);
      throw error;
    }
  }

  const finalLabel = 'Preparing Oracle report';
  onStep?.('start', finalLabel);
  try {
    const final = await oracleCall([
      { role: 'system', content: ORACLE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Request:\n${request}\n\nBest answer draft:\n${draft}\n\nReturn the final Oracle report in polished Markdown. Be comprehensive but avoid private chain-of-thought.`,
      },
    ]);
    onStep?.('complete', finalLabel);
    return final || draft || 'The Oracle completed its reasoning but produced no report.';
  } catch (error) {
    onStep?.('complete', finalLabel, true);
    throw error;
  }
}

export const callOracleToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'call_oracle',
    description:
      'Delegate a complex reasoning request to the Oracle subagent. The Oracle uses GLM 5.1 to think deeply for as long as needed, self-audit and refine its answer, then return a comprehensive Markdown report. Use for architecture decisions, multi-step strategy, debugging hypotheses, design tradeoffs, planning, synthesis, and any request where deeper reasoning would improve the main AI answer. Do NOT use for live web facts, current API documentation, or browser interaction; use call_librarian or call_browser_use for those.',
    parameters: {
      type: 'object',
      required: ['request'],
      properties: {
        request: {
          type: 'string',
          description: 'The exact question or reasoning task the Oracle should think through and answer comprehensively.',
        },
      },
      additionalProperties: false,
    },
  },
};

export function isCallOracleTool(name: string): boolean {
  return name === 'call_oracle';
}