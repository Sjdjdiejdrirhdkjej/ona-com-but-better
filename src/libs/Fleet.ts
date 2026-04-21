import { githubToolDefinitions, runGitHubTool } from '@/libs/GitHub';
import { daytonaToolDefinitions, isDaytonaTool, prebootSandbox, runDaytonaTool } from '@/libs/Daytona';
import { callLibrarianProToolDefinition, isCallLibrarianProTool, runLibrarianProSubagent } from '@/libs/LibrarianPro';
import { callOracleToolDefinition, isCallOracleTool, runOracleSubagent } from '@/libs/Oracle';
import { logger } from '@/libs/Logger';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const FLEET_MODEL = process.env.FIREWORKS_FLEET_MODEL ?? process.env.FIREWORKS_MODEL ?? 'accounts/fireworks/routers/kimi-k2p5-turbo';
const MAX_FLEET_ITERATIONS = 30;

// ── Types ────────────────────────────────────────────────────────────────────

export type FleetTask = {
  id: string;
  task: string;
  repository?: string;
  context?: string;
};

export type FleetResult = {
  id: string;
  task: string;
  status: 'done' | 'error' | 'partial';
  pr_url?: string;
  branch?: string;
  summary: string;
  error?: string;
  steps: string[];
};

export type FleetProgressCallback = (
  agentId: string,
  event: 'dispatched' | 'step' | 'done' | 'error',
  detail?: string,
) => void;

type FleetMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

type FireworksNonStreamResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { total_tokens?: number };
  error?: { message?: string };
};

// ── Fleet agent system prompt ─────────────────────────────────────────────

const FLEET_SYSTEM_PROMPT = `You are a fleet sub-agent inside ONA. You execute a single assigned task fully autonomously and return a structured result.

## Your mandate
Complete the assigned task end-to-end. If repository work is involved, create a branch, make all changes, verify with tests if available, open one PR, and call task_complete with the PR URL. There is no user to ask — work autonomously.

## Operating rules
- Create a branch named \`ona/<short-slug>\` for every repo change.
- Run tests or builds in a Daytona sandbox before opening a PR.
- Call task_complete as soon as the task is done (or if genuinely blocked with no path forward).
- Never repeat the same tool call more than twice.
- If a tool fails, try a different approach before giving up.
- Be concise in tool calls — avoid redundant reads of files already seen.

## Tool decision guide
- Use GitHub tools to explore the repo, branch, write files, and open a PR.
- Use sandbox tools to install deps, run tests, and verify before shipping.
- Use call_librarian_pro to look up library APIs or verify current package versions before writing code.
- Use call_oracle for complex architecture or debugging decisions.
- Always call task_complete when done — this is mandatory to exit the loop.`;

const FLEET_TASK_COMPLETE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'task_complete',
    description: 'Signal the fleet task is finished. Include PR URL if one was opened. This is the only way to exit the loop.',
    parameters: {
      type: 'object' as const,
      required: ['summary'],
      properties: {
        summary: {
          type: 'string',
          description: 'Concise summary of what was accomplished. Include PR URL if applicable.',
        },
        pr_url: {
          type: 'string',
          description: 'GitHub PR URL if a PR was opened.',
        },
        branch: {
          type: 'string',
          description: 'Branch name created for this task.',
        },
        status: {
          type: 'string',
          enum: ['done', 'partial', 'blocked'],
          description: 'done = fully completed, partial = some work done but blocked, blocked = could not start.',
        },
      },
    },
  },
};

// ── Fireworks non-streaming call ─────────────────────────────────────────────

function parseFleetToolArgs(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function callFleetFireworks(
  messages: FleetMessage[],
  tools: unknown[],
): Promise<{
  content: string;
  toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  finishReason: string | null;
}> {
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
      model: FLEET_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 8192,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Fleet AI error (${res.status}): ${text}`);
  }

  const json = await res.json() as FireworksNonStreamResponse;
  if (json.error?.message) {
    throw new Error(`Fleet AI error: ${json.error.message}`);
  }

  const choice = json.choices?.[0];
  const msg = choice?.message;
  return {
    content: msg?.content?.trim() ?? '',
    toolCalls: msg?.tool_calls ?? [],
    finishReason: choice?.finish_reason ?? null,
  };
}

// ── Single fleet agent ────────────────────────────────────────────────────────

export async function runFleetAgent(
  task: FleetTask,
  githubToken: string | null,
  onProgress?: FleetProgressCallback,
): Promise<FleetResult> {
  const steps: string[] = [];
  const result: FleetResult = {
    id: task.id,
    task: task.task,
    status: 'partial',
    summary: '',
    steps,
  };

  try {
    onProgress?.(task.id, 'dispatched', task.task);
    steps.push(`Dispatched: ${task.task}`);

    // Pre-boot a dedicated Daytona sandbox for this agent
    let sandboxContext = '';
    if (process.env.DAYTONA_API_KEY) {
      try {
        const booted = await prebootSandbox();
        if (booted) {
          sandboxContext = `\n[Pre-booted sandbox] sandbox_id=${booted.sandbox_id}, work_dir=${booted.work_dir}. Use this ID directly — do NOT call sandbox_create.`;
        }
      } catch (err) {
        logger.warn({ err, agentId: task.id }, 'Fleet agent: failed to pre-boot sandbox');
      }
    }

    const userContent = [
      `ASSIGNED TASK: ${task.task}`,
      task.repository ? `REPOSITORY: ${task.repository}` : '',
      task.context ? `CONTEXT: ${task.context}` : '',
      sandboxContext,
    ].filter(Boolean).join('\n');

    const conversation: FleetMessage[] = [
      { role: 'system', content: FLEET_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    const tools = [
      ...githubToolDefinitions,
      ...daytonaToolDefinitions,
      callLibrarianProToolDefinition,
      callOracleToolDefinition,
      FLEET_TASK_COMPLETE_TOOL,
    ];

    const recentSigs: string[] = [];

    for (let i = 0; i < MAX_FLEET_ITERATIONS; i++) {
      const { content, toolCalls, finishReason } = await callFleetFireworks(conversation, tools);

      if (!toolCalls.length || finishReason === 'stop') {
        result.summary = content || 'Agent completed without calling task_complete.';
        result.status = 'partial';
        break;
      }

      // Loop detection
      const sig = toolCalls.map(t => `${t.function.name}:${t.function.arguments.slice(0, 200)}`).join('|');
      recentSigs.push(sig);
      if (recentSigs.length > 3) recentSigs.shift();
      if (recentSigs.length === 3 && recentSigs.every(s => s === sig)) {
        result.summary = 'Agent stopped due to loop detection. Partial progress may exist.';
        result.status = 'partial';
        break;
      }

      conversation.push({ role: 'assistant', content: content ?? '', tool_calls: toolCalls });

      let completed = false;

      await Promise.all(toolCalls.map(async (tc) => {
        const toolName = tc.function.name;
        const toolArgs = parseFleetToolArgs(tc.function.arguments);
        steps.push(`${toolName}`);
        onProgress?.(task.id, 'step', toolName);

        let toolResult: unknown;
        try {
          if (toolName === 'task_complete') {
            completed = true;
            const summary = typeof toolArgs.summary === 'string' ? toolArgs.summary : '';
            const prUrl = typeof toolArgs.pr_url === 'string' ? toolArgs.pr_url : undefined;
            const branch = typeof toolArgs.branch === 'string' ? toolArgs.branch : undefined;
            const rawStatus = toolArgs.status;
            const status: FleetResult['status'] = rawStatus === 'done' || rawStatus === 'partial'
              ? rawStatus
              : 'done';
            result.summary = summary;
            result.pr_url = prUrl;
            result.branch = branch;
            result.status = status;
            toolResult = { ok: true };
          } else if (isCallLibrarianProTool(toolName)) {
            const request = typeof toolArgs.request === 'string' ? toolArgs.request : JSON.stringify(toolArgs);
            toolResult = await runLibrarianProSubagent(request);
          } else if (isCallOracleTool(toolName)) {
            const request = typeof toolArgs.request === 'string' ? toolArgs.request : JSON.stringify(toolArgs);
            toolResult = await runOracleSubagent(request);
          } else if (isDaytonaTool(toolName)) {
            toolResult = await runDaytonaTool(toolName, toolArgs);
          } else {
            toolResult = await runGitHubTool(githubToken, toolName, toolArgs);
          }
        } catch (err) {
          toolResult = { error: (err as Error).message };
          steps.push(`Error in ${toolName}: ${(err as Error).message}`);
        }

        conversation.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult).slice(0, 16000),
        });
      }));

      if (completed) {
        onProgress?.(task.id, 'done', result.summary);
        break;
      }
    }

    if (!result.summary) {
      result.summary = steps.at(-1) ?? 'Agent completed.';
    }

    return result;
  } catch (err) {
    const message = (err as Error).message;
    result.status = 'error';
    result.error = message;
    result.summary = `Fleet agent failed: ${message}`;
    steps.push(`Error: ${message}`);
    onProgress?.(task.id, 'error', message);
    logger.warn({ err, agentId: task.id }, 'runFleetAgent: fatal error');
    return result;
  }
}

// ── Fleet dispatcher (parallel) ───────────────────────────────────────────────

export async function runFleet(
  tasks: FleetTask[],
  githubToken: string | null,
  onProgress?: FleetProgressCallback,
): Promise<FleetResult[]> {
  return Promise.all(
    tasks.map(task => runFleetAgent(task, githubToken, onProgress)),
  );
}

// ── Tool definition for the main agent ───────────────────────────────────────

export const callFleetToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'dispatch_fleet',
    description: 'Dispatch a fleet of parallel autonomous sub-agents to execute multiple independent coding tasks simultaneously. Each agent gets its own isolated cloud sandbox, runs the full agent loop (GitHub tools, Daytona, Librarian, Oracle), opens a PR, and reports back. Use when the user wants to apply work across multiple repos, run a batch of independent tasks in parallel, or when N≥2 coding tasks can proceed without blocking each other. Do NOT use for sequential tasks where step B depends on step A — use the normal loop for those.',
    parameters: {
      type: 'object' as const,
      required: ['tasks'],
      properties: {
        tasks: {
          type: 'array',
          maxItems: 10,
          description: 'Independent tasks to run in parallel (max 10). Each agent executes one task autonomously.',
          items: {
            type: 'object',
            required: ['id', 'task'],
            properties: {
              id: {
                type: 'string',
                description: 'Short unique ID for this sub-agent, e.g. "agent-01".',
              },
              task: {
                type: 'string',
                description: 'Complete self-contained task description. The sub-agent has no user to ask — be specific.',
              },
              repository: {
                type: 'string',
                description: 'Optional owner/repo this agent should work on, e.g. "acme/backend".',
              },
              context: {
                type: 'string',
                description: 'Optional additional context, constraints, or background for this sub-agent.',
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
};

export function isFleetTool(name: string): boolean {
  return name === 'dispatch_fleet';
}
