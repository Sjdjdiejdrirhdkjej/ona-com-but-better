import { Daytona } from '@daytonaio/sdk';

const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;

function getDaytona(): Daytona {
  if (!DAYTONA_API_KEY) {
    throw new Error('DAYTONA_API_KEY is not configured.');
  }
  return new Daytona({ apiKey: DAYTONA_API_KEY });
}

// ── Tool definitions ────────────────────────────────────────────────────────

export const daytonaToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'sandbox_create',
      description: 'Create a new ephemeral Daytona sandbox container for running code, tests, or shell commands in an isolated environment. Returns the sandbox ID needed for subsequent calls.',
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['python', 'typescript', 'javascript'],
            description: 'Runtime language for the sandbox. Defaults to python.',
          },
          env_vars: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Environment variables to set in the sandbox.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_exec',
      description: 'Execute a shell command inside an existing Daytona sandbox. Use this to run tests, install packages, compile code, or inspect the filesystem.',
      parameters: {
        type: 'object',
        required: ['sandbox_id', 'command'],
        properties: {
          sandbox_id: { type: 'string', description: 'Sandbox ID returned by sandbox_create.' },
          command: { type: 'string', description: 'Shell command to execute.' },
          cwd: { type: 'string', description: 'Working directory inside the sandbox.' },
          timeout: { type: 'number', description: 'Timeout in seconds (default 60).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_write_file',
      description: 'Write a file into an existing Daytona sandbox. Use this to place source code, config, or scripts before executing them.',
      parameters: {
        type: 'object',
        required: ['sandbox_id', 'path', 'content'],
        properties: {
          sandbox_id: { type: 'string', description: 'Sandbox ID returned by sandbox_create.' },
          path: { type: 'string', description: 'Absolute or relative destination path inside the sandbox.' },
          content: { type: 'string', description: 'File content as a string.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_read_file',
      description: 'Read the contents of a file from an existing Daytona sandbox.',
      parameters: {
        type: 'object',
        required: ['sandbox_id', 'path'],
        properties: {
          sandbox_id: { type: 'string', description: 'Sandbox ID returned by sandbox_create.' },
          path: { type: 'string', description: 'Absolute or relative path inside the sandbox.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_list_files',
      description: 'List files and directories inside an existing Daytona sandbox.',
      parameters: {
        type: 'object',
        required: ['sandbox_id', 'path'],
        properties: {
          sandbox_id: { type: 'string', description: 'Sandbox ID returned by sandbox_create.' },
          path: { type: 'string', description: 'Directory path to list inside the sandbox.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_delete',
      description: 'Delete a Daytona sandbox when you are done with it to free resources.',
      parameters: {
        type: 'object',
        required: ['sandbox_id'],
        properties: {
          sandbox_id: { type: 'string', description: 'Sandbox ID to delete.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sandbox_git_clone',
      description: 'Clone a Git repository into an existing Daytona sandbox. Useful for running tests or building a project in an isolated container.',
      parameters: {
        type: 'object',
        required: ['sandbox_id', 'url', 'path'],
        properties: {
          sandbox_id: { type: 'string', description: 'Sandbox ID returned by sandbox_create.' },
          url: { type: 'string', description: 'HTTPS clone URL of the repository.' },
          path: { type: 'string', description: 'Destination directory inside the sandbox.' },
          branch: { type: 'string', description: 'Branch to clone. Defaults to default branch.' },
          username: { type: 'string', description: 'Git username for private repos.' },
          password: { type: 'string', description: 'Git password / personal access token for private repos.' },
        },
        additionalProperties: false,
      },
    },
  },
];

// ── Tool runner ─────────────────────────────────────────────────────────────

export async function runDaytonaTool(name: string, args: Record<string, unknown>) {
  const daytona = getDaytona();

  if (name === 'sandbox_create') {
    const language = typeof args.language === 'string' ? args.language : 'python';
    const envVars = (args.env_vars && typeof args.env_vars === 'object' && !Array.isArray(args.env_vars))
      ? (args.env_vars as Record<string, string>)
      : undefined;

    const sandbox = await daytona.create({
      language,
      envVars,
      ephemeral: true,
      autoStopInterval: 30,
    });

    const workDir = await sandbox.getWorkDir();
    return {
      sandbox_id: sandbox.id,
      language,
      work_dir: workDir,
      note: 'Sandbox created. Use sandbox_id in subsequent calls.',
    };
  }

  if (name === 'sandbox_exec') {
    const sandboxId = String(args.sandbox_id ?? '');
    const command = String(args.command ?? '');
    const cwd = typeof args.cwd === 'string' ? args.cwd : undefined;
    const timeout = typeof args.timeout === 'number' ? args.timeout : 60;

    const sandbox = await daytona.get(sandboxId);
    const response = await sandbox.process.executeCommand(command, cwd, undefined, timeout);

    return {
      exit_code: response.exitCode,
      output: (response.result ?? '').slice(0, 20000),
    };
  }

  if (name === 'sandbox_write_file') {
    const sandboxId = String(args.sandbox_id ?? '');
    const filePath = String(args.path ?? '');
    const content = String(args.content ?? '');

    const sandbox = await daytona.get(sandboxId);
    await sandbox.fs.uploadFile(
      Buffer.from(content),
      filePath,
    );

    return { path: filePath, bytes_written: content.length };
  }

  if (name === 'sandbox_read_file') {
    const sandboxId = String(args.sandbox_id ?? '');
    const filePath = String(args.path ?? '');

    const sandbox = await daytona.get(sandboxId);
    const result = await sandbox.fs.downloadFile(filePath);

    const content = Buffer.isBuffer(result) ? result.toString('utf8') : String(result ?? '');
    return { path: filePath, content: content.slice(0, 20000) };
  }

  if (name === 'sandbox_list_files') {
    const sandboxId = String(args.sandbox_id ?? '');
    const dirPath = String(args.path ?? '/');

    const sandbox = await daytona.get(sandboxId);
    const files = await sandbox.fs.listFiles(dirPath);

    return { path: dirPath, files };
  }

  if (name === 'sandbox_delete') {
    const sandboxId = String(args.sandbox_id ?? '');
    const sandbox = await daytona.get(sandboxId);
    await daytona.delete(sandbox);
    return { deleted: sandboxId };
  }

  if (name === 'sandbox_git_clone') {
    const sandboxId = String(args.sandbox_id ?? '');
    const url = String(args.url ?? '');
    const targetPath = String(args.path ?? '/workspace');
    const branch = typeof args.branch === 'string' ? args.branch : undefined;
    const username = typeof args.username === 'string' ? args.username : undefined;
    const password = typeof args.password === 'string' ? args.password : undefined;

    const sandbox = await daytona.get(sandboxId);
    await sandbox.git.clone(url, targetPath, branch, undefined, username, password);

    return { cloned: url, path: targetPath, branch: branch ?? 'default' };
  }

  throw new Error(`Unknown Daytona tool: ${name}`);
}

export function isDaytonaTool(name: string): boolean {
  return name.startsWith('sandbox_');
}

export async function deleteSandboxById(sandboxId: string): Promise<void> {
  try {
    const daytona = getDaytona();
    const sandbox = await daytona.get(sandboxId);
    await daytona.delete(sandbox);
  } catch {
  }
}

export async function listAllSandboxFiles(sandboxId: string): Promise<string[]> {
  try {
    const daytona = getDaytona();
    const sandbox = await daytona.get(sandboxId);
    const response = await sandbox.process.executeCommand(
      'find . -type f -maxdepth 6 2>/dev/null | grep -v "node_modules\\|.git\\|\\.next" | head -500',
      undefined,
      undefined,
      30,
    );
    const output = response.result ?? '';
    return output
      .split('\n')
      .map(l => l.trim().replace(/^\.\//, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}
