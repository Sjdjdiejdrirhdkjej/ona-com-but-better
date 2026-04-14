import { cookies } from 'next/headers';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GITHUB_API = 'https://api.github.com';
const TOKEN_COOKIE = 'ona_github_token';
const USER_COOKIE = 'ona_github_user';
const STATE_COOKIE = 'ona_github_oauth_state';
const WORKSPACE_ROOT = '/tmp/ona-github-workspaces';

export type GitHubUser = {
  login: string;
  name?: string | null;
  avatar_url?: string;
  html_url?: string;
};

export type GitHubAuthStatus = {
  configured: boolean;
  connected: boolean;
  user?: GitHubUser;
  error?: string;
};

export function getGitHubConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    configured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  };
}

export function getGitHubRedirectUri(req: Request) {
  if (process.env.GITHUB_REDIRECT_URI) {
    return process.env.GITHUB_REDIRECT_URI;
  }
  return new URL('/api/github/callback', req.url).toString();
}

export function makeCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  };
}

export { STATE_COOKIE, TOKEN_COOKIE, USER_COOKIE };

export async function getGitHubToken() {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value;
}

export async function githubFetch<T>(token: string, endpoint: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = typeof data?.message === 'string' ? data.message : `GitHub API error ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function getGitHubViewer(token: string) {
  return githubFetch<GitHubUser>(token, '/user');
}

function encodePath(value: string) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function repoPath(owner: string, repo: string) {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function parseRepo(input: { owner?: string; repo?: string; repository?: string }) {
  if (input.owner && input.repo) {
    return { owner: input.owner, repo: input.repo };
  }

  const repository = input.repository?.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  const [owner, repo] = repository?.split('/') ?? [];
  if (!owner || !repo) {
    throw new Error('Provide repository as owner/repo, or provide owner and repo separately.');
  }
  return { owner, repo };
}

async function readFileSha(token: string, owner: string, repo: string, filePath: string, branch: string) {
  try {
    const file = await githubFetch<{ sha?: string }>(token, `${repoPath(owner, repo)}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(branch)}`);
    return file.sha;
  } catch (error) {
    if ((error as Error).message.toLowerCase().includes('not found')) {
      return undefined;
    }
    throw error;
  }
}

export const githubToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'github_get_viewer',
      description: 'Get the connected GitHub user profile.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_repositories',
      description: 'List repositories the connected GitHub user can access, sorted by recent activity.',
      parameters: {
        type: 'object',
        properties: {
          visibility: { type: 'string', enum: ['all', 'public', 'private'], description: 'Repository visibility filter.' },
          affiliation: { type: 'string', description: 'Comma-separated owner,collaborator,organization_member. Defaults to all three.' },
          per_page: { type: 'number', minimum: 1, maximum: 100, description: 'Maximum repositories to return.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_repository',
      description: 'Get metadata for a repository.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_branches',
      description: 'List branches in a repository.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          per_page: { type: 'number', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Read a text file from a GitHub repository.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'File path inside the repository.' },
          ref: { type: 'string', description: 'Branch, tag, or SHA. Defaults to repository default branch.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_directory',
      description: 'List files and folders at a path in a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'Directory path. Defaults to repository root.' },
          ref: { type: 'string', description: 'Branch, tag, or SHA. Defaults to repository default branch.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_branch',
      description: 'Create a branch from an existing base branch.',
      parameters: {
        type: 'object',
        required: ['newBranch'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          baseBranch: { type: 'string', description: 'Branch to start from. Defaults to repository default branch.' },
          newBranch: { type: 'string', description: 'Name of the branch to create.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_upsert_file',
      description: 'Create or update one file in a branch using the GitHub Contents API.',
      parameters: {
        type: 'object',
        required: ['path', 'branch', 'content', 'message'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'File path inside the repository.' },
          branch: { type: 'string', description: 'Target branch.' },
          content: { type: 'string', description: 'New UTF-8 file content.' },
          message: { type: 'string', description: 'Commit message.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_pull_request',
      description: 'Open a pull request for a branch.',
      parameters: {
        type: 'object',
        required: ['title', 'head'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string', description: 'PR source branch.' },
          base: { type: 'string', description: 'PR target branch. Defaults to repository default branch.' },
          draft: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_clone_repository',
      description: 'Clone a repository into an isolated temporary workspace for inspection or command-based work.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          branch: { type: 'string', description: 'Optional branch to clone.' },
        },
        additionalProperties: false,
      },
    },
  },
];

export async function runGitHubTool(token: string, name: string, args: Record<string, unknown>) {
  if (name === 'github_get_viewer') {
    return getGitHubViewer(token);
  }

  if (name === 'github_list_repositories') {
    const visibility = typeof args.visibility === 'string' ? args.visibility : 'all';
    const affiliation = typeof args.affiliation === 'string' ? args.affiliation : 'owner,collaborator,organization_member';
    const perPage = Math.min(Number(args.per_page ?? 30), 100);
    const repos = await githubFetch<Array<Record<string, unknown>>>(token, `/user/repos?sort=updated&visibility=${encodeURIComponent(visibility)}&affiliation=${encodeURIComponent(affiliation)}&per_page=${perPage}`);
    return repos.map(repo => ({
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
      description: repo.description,
      default_branch: repo.default_branch,
      updated_at: repo.updated_at,
      language: repo.language,
    }));
  }

  const { owner, repo } = parseRepo(args as { owner?: string; repo?: string; repository?: string });

  if (name === 'github_get_repository') {
    const repository = await githubFetch<Record<string, unknown>>(token, repoPath(owner, repo));
    return {
      full_name: repository.full_name,
      private: repository.private,
      html_url: repository.html_url,
      description: repository.description,
      default_branch: repository.default_branch,
      language: repository.language,
      open_issues_count: repository.open_issues_count,
      pushed_at: repository.pushed_at,
    };
  }

  if (name === 'github_list_branches') {
    const perPage = Math.min(Number(args.per_page ?? 50), 100);
    return githubFetch(token, `${repoPath(owner, repo)}/branches?per_page=${perPage}`);
  }

  if (name === 'github_read_file') {
    const filePath = String(args.path ?? '');
    const ref = typeof args.ref === 'string' ? `?ref=${encodeURIComponent(args.ref)}` : '';
    const file = await githubFetch<{ content?: string; encoding?: string; name?: string; path?: string; sha?: string; html_url?: string }>(token, `${repoPath(owner, repo)}/contents/${encodePath(filePath)}${ref}`);
    if (!file.content || file.encoding !== 'base64') {
      throw new Error('GitHub did not return a base64 encoded file.');
    }
    return {
      name: file.name,
      path: file.path,
      sha: file.sha,
      html_url: file.html_url,
      content: Buffer.from(file.content, 'base64').toString('utf8'),
    };
  }

  if (name === 'github_list_directory') {
    const dirPath = typeof args.path === 'string' ? args.path : '';
    const ref = typeof args.ref === 'string' ? `?ref=${encodeURIComponent(args.ref)}` : '';
    const listing = await githubFetch<Array<Record<string, unknown>>>(token, `${repoPath(owner, repo)}/contents/${encodePath(dirPath)}${ref}`);
    return listing.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type,
      size: item.size,
      html_url: item.html_url,
    }));
  }

  if (name === 'github_create_branch') {
    const newBranch = String(args.newBranch ?? '');
    if (!newBranch) throw new Error('newBranch is required.');
    const repository = await githubFetch<{ default_branch: string }>(token, repoPath(owner, repo));
    const baseBranch = String(args.baseBranch ?? repository.default_branch);
    const base = await githubFetch<{ object: { sha: string } }>(token, `${repoPath(owner, repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
    return githubFetch(token, `${repoPath(owner, repo)}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: base.object.sha }),
    });
  }

  if (name === 'github_upsert_file') {
    const filePath = String(args.path ?? '');
    const branch = String(args.branch ?? '');
    const content = String(args.content ?? '');
    const message = String(args.message ?? '');
    if (!filePath || !branch || !message) throw new Error('path, branch, and message are required.');
    const sha = await readFileSha(token, owner, repo, filePath, branch);
    return githubFetch(token, `${repoPath(owner, repo)}/contents/${encodePath(filePath)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  if (name === 'github_create_pull_request') {
    const repository = await githubFetch<{ default_branch: string }>(token, repoPath(owner, repo));
    return githubFetch(token, `${repoPath(owner, repo)}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: String(args.title ?? ''),
        body: String(args.body ?? ''),
        head: String(args.head ?? ''),
        base: String(args.base ?? repository.default_branch),
        draft: Boolean(args.draft),
      }),
    });
  }

  if (name === 'github_clone_repository') {
    const branch = typeof args.branch === 'string' ? args.branch : undefined;
    const slug = `${owner}-${repo}-${Date.now()}`.replace(/[^a-zA-Z0-9._-]/g, '-');
    const target = path.join(WORKSPACE_ROOT, slug);
    await mkdir(WORKSPACE_ROOT, { recursive: true });
    const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    const gitArgs = ['clone', '--depth', '1', ...(branch ? ['--branch', branch] : []), cloneUrl, target];
    await execFileAsync('git', gitArgs, { timeout: 120000, maxBuffer: 1024 * 1024 });
    return { path: target, repository: `${owner}/${repo}`, branch: branch ?? 'default', note: 'Repository cloned into a temporary isolated server workspace.' };
  }

  throw new Error(`Unknown GitHub tool: ${name}`);
}
