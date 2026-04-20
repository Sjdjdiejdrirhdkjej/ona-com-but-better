'use client';

import { useEffect, useState } from 'react';

type ApiExample = {
  title: string;
  description: string;
  code: string;
};

function ApiExampleBlock({ example }: { example: ApiExample }) {
  const [copied, setCopied] = useState(false);

  async function copyExample() {
    await navigator.clipboard.writeText(example.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-black/8 dark:border-white/10">
      <div className="flex items-start justify-between gap-3 border-b border-black/8 px-3 py-2 dark:border-white/10">
        <div>
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{example.title}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{example.description}</p>
        </div>
        <button
          type="button"
          onClick={copyExample}
          className="shrink-0 rounded-lg border border-black/8 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-black/5 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto bg-gray-950 p-3 text-xs leading-5 text-gray-100">
        <code>{example.code}</code>
      </pre>
    </div>
  );
}

export default function ApiDocsPage() {
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const exampleBaseUrl = baseUrl || 'https://your-ona-app-url';

  const examples: ApiExample[] = [
    {
      title: 'Set your environment variables',
      description: 'Run this once in your terminal before calling the API.',
      code: `export ONA_BASE_URL="${exampleBaseUrl}"
export ONA_API_KEY="paste-your-api-key-here"`,
    },
    {
      title: 'List conversations',
      description: 'Fetch conversations owned by this API key.',
      code: `curl "$ONA_BASE_URL/api/conversations" \\
  -H "Authorization: Bearer $ONA_API_KEY"`,
    },
    {
      title: 'Create a conversation',
      description: 'Create a conversation before sending a task.',
      code: `CONVERSATION_ID="$(node -e 'console.log(crypto.randomUUID())')"

curl "$ONA_BASE_URL/api/conversations" \\
  -X POST \\
  -H "Authorization: Bearer $ONA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"id\\": \\"$CONVERSATION_ID\\",
    \\"title\\": \\"Programmatic task\\"
  }"`,
    },
    {
      title: 'Send a task to ONA',
      description: 'The chat endpoint streams server-sent events as the agent works.',
      code: `ASSISTANT_MESSAGE_ID="$(node -e 'console.log(crypto.randomUUID())')"
JOB_ID="$(node -e 'console.log(crypto.randomUUID())')"

curl -N "$ONA_BASE_URL/api/chat" \\
  -X POST \\
  -H "Authorization: Bearer $ONA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"conversationId\\": \\"$CONVERSATION_ID\\",
    \\"assistantMessageId\\": \\"$ASSISTANT_MESSAGE_ID\\",
    \\"jobId\\": \\"$JOB_ID\\",
    \\"messages\\": [
      {
        \\"role\\": \\"user\\",
        \\"content\\": \\"Review this repository and suggest the top three improvements.\\"
      }
    ]
  }"`,
    },
    {
      title: 'Poll background job events',
      description: 'Use this if the chat stream disconnects or you want to resume progress polling.',
      code: `curl "$ONA_BASE_URL/api/jobs/$JOB_ID/events?after=0" \\
  -H "Authorization: Bearer $ONA_API_KEY"`,
    },
    {
      title: 'Wake super agents on a heartbeat',
      description: 'Point your scheduler at this route to wake any enabled super agents whose heartbeat is due.',
      code: `export ONA_HEARTBEAT_SECRET="replace-me"

curl "$ONA_BASE_URL/api/super-agent/heartbeat" \\
  -X POST \\
  -H "x-ona-heartbeat-secret: $ONA_HEARTBEAT_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{ "limit": 1 }'`,
    },
  ];

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">API docs</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Use these examples to interact with ONA programmatically. You will need a task-running API key — create one in{' '}
            <a
              href="/dashboard/user-profile"
              className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Settings
            </a>
            .
          </p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Authentication</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Send your API key as a Bearer token in the <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">Authorization</code> header on every request.
            Read-only keys can list conversations and poll job events, but cannot create conversations or start tasks.
          </p>
        </div>

        <div className="space-y-4">
          {examples.map(example => (
            <ApiExampleBlock key={example.title} example={example} />
          ))}
        </div>
      </div>
    </div>
  );
}
