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
  // ── Identity ──────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_get_viewer',
      description: 'Get the connected GitHub user profile (login, name, avatar).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },

  // ── Repository discovery ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_list_repositories',
      description: 'List repositories the user can access, sorted by recent activity.',
      parameters: {
        type: 'object',
        properties: {
          visibility: { type: 'string', enum: ['all', 'public', 'private'], description: 'Filter by visibility.' },
          affiliation: { type: 'string', description: 'Comma-separated: owner, collaborator, organization_member.' },
          per_page: { type: 'number', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_repository',
      description: 'Get metadata for a repository (language, default branch, open issues count, etc).',
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
      name: 'github_search_code',
      description: 'Search for code across a repository or all accessible repos. Use to locate files, functions, imports, or patterns before making changes.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'GitHub code search query, e.g. "MyClass repo:owner/repo".' },
          per_page: { type: 'number', minimum: 1, maximum: 30 },
        },
        additionalProperties: false,
      },
    },
  },

  // ── File system ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_list_directory',
      description: 'List files and folders at a path in a repository.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'Directory path. Defaults to repo root.' },
          ref: { type: 'string', description: 'Branch, tag, or SHA.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_file_tree',
      description: 'Get the full recursive file tree of a repository. Use to understand project structure before reading individual files.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          branch: { type: 'string', description: 'Branch to read from. Defaults to repository default branch.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Read the full content of a text file from a repository.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'File path inside the repository.' },
          ref: { type: 'string', description: 'Branch, tag, or SHA.' },
        },
        additionalProperties: false,
      },
    },
  },

  // ── Branches & commits ────────────────────────────────────────────────────
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
      name: 'github_create_branch',
      description: 'Create a new branch from a base branch.',
      parameters: {
        type: 'object',
        required: ['newBranch'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          baseBranch: { type: 'string', description: 'Branch to start from. Defaults to default branch.' },
          newBranch: { type: 'string', description: 'Name of the new branch to create.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_commits',
      description: 'List recent commits on a branch. Use for weekly digests, audit trails, and change summaries.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          branch: { type: 'string', description: 'Branch name. Defaults to default branch.' },
          since: { type: 'string', description: 'ISO 8601 date. Only commits after this date.' },
          per_page: { type: 'number', minimum: 1, maximum: 100 },
          author: { type: 'string', description: 'Filter by GitHub login or email.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_commit',
      description: 'Get the full diff and stats for a single commit.',
      parameters: {
        type: 'object',
        required: ['sha'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          sha: { type: 'string', description: 'Commit SHA.' },
        },
        additionalProperties: false,
      },
    },
  },

  // ── File writes ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_upsert_file',
      description: 'Create or update a single file in a branch. Use for targeted code changes, documentation updates, or config edits.',
      parameters: {
        type: 'object',
        required: ['path', 'branch', 'content', 'message'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'File path inside the repository.' },
          branch: { type: 'string', description: 'Target branch to write to.' },
          content: { type: 'string', description: 'Full UTF-8 file content to write.' },
          message: { type: 'string', description: 'Commit message.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_delete_file',
      description: 'Delete a file from a branch.',
      parameters: {
        type: 'object',
        required: ['path', 'branch', 'message'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string', description: 'File path to delete.' },
          branch: { type: 'string', description: 'Branch to delete from.' },
          message: { type: 'string', description: 'Commit message.' },
        },
        additionalProperties: false,
      },
    },
  },

  // ── Pull requests ─────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_list_pull_requests',
      description: 'List pull requests in a repository. Use to find stale PRs, review-needed PRs, or recent activity.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state. Defaults to open.' },
          sort: { type: 'string', enum: ['created', 'updated', 'popularity', 'long-running'] },
          per_page: { type: 'number', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_pull_request',
      description: 'Get full details of a pull request including its diff URL, reviewers, labels, and mergeable state.',
      parameters: {
        type: 'object',
        required: ['pull_number'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          pull_number: { type: 'number', description: 'PR number.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_pr_diff',
      description: 'Get the raw unified diff of a pull request. Use for code review, impact analysis, or CVE remediation.',
      parameters: {
        type: 'object',
        required: ['pull_number'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          pull_number: { type: 'number', description: 'PR number.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_pull_request',
      description: 'Open a pull request. Always write a clear description explaining what changed, why, and what to review.',
      parameters: {
        type: 'object',
        required: ['title', 'head'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          title: { type: 'string', description: 'PR title.' },
          body: { type: 'string', description: 'PR description in markdown. Include: what changed, why, files affected, and testing notes.' },
          head: { type: 'string', description: 'Source branch name.' },
          base: { type: 'string', description: 'Target branch. Defaults to repository default branch.' },
          draft: { type: 'boolean', description: 'Open as draft PR for risky or incomplete changes.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_add_pr_review',
      description: 'Submit a review on a pull request with comments and an overall verdict (APPROVE, REQUEST_CHANGES, or COMMENT).',
      parameters: {
        type: 'object',
        required: ['pull_number', 'event'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          pull_number: { type: 'number' },
          body: { type: 'string', description: 'Overall review summary.' },
          event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: 'Review verdict.' },
        },
        additionalProperties: false,
      },
    },
  },

  // ── Issues ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_list_issues',
      description: 'List issues in a repository. Use to find tasks to work on, bugs to fix, or track project health.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Defaults to open.' },
          labels: { type: 'string', description: 'Comma-separated label names to filter by.' },
          assignee: { type: 'string', description: 'Filter by assignee login.' },
          sort: { type: 'string', enum: ['created', 'updated', 'comments'] },
          per_page: { type: 'number', minimum: 1, maximum: 100 },
          since: { type: 'string', description: 'ISO 8601 date. Only issues updated after this date.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_issue',
      description: 'Get the full details and body of a single issue.',
      parameters: {
        type: 'object',
        required: ['issue_number'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          issue_number: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_issue',
      description: 'Create a new issue in a repository.',
      parameters: {
        type: 'object',
        required: ['title'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string', description: 'Issue description in markdown.' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Label names to apply.' },
          assignees: { type: 'array', items: { type: 'string' }, description: 'GitHub logins to assign.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_add_comment',
      description: 'Add a comment to an issue or pull request.',
      parameters: {
        type: 'object',
        required: ['issue_number', 'body'],
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          issue_number: { type: 'number', description: 'Issue or PR number (PRs are issues in GitHub API).' },
          body: { type: 'string', description: 'Comment body in markdown.' },
        },
        additionalProperties: false,
      },
    },
  },

  // ── Clone / workspace ─────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'github_clone_repository',
      description: 'Clone a repository into an isolated temporary workspace on the server for deeper inspection or running commands. Use when you need the full codebase locally.',
      parameters: {
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository in owner/repo format.' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          branch: { type: 'string', description: 'Branch to clone. Defaults to default branch.' },
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
      open_issues_count: repo.open_issues_count,
      stargazers_count: repo.stargazers_count,
    }));
  }

  if (name === 'github_search_code') {
    const query = String(args.query ?? '');
    const perPage = Math.min(Number(args.per_page ?? 10), 30);
    const results = await githubFetch<{ items: Array<Record<string, unknown>> }>(token, `/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}`, {
      headers: { Accept: 'application/vnd.github.text-match+json' },
    });
    return results.items.map(item => ({
      name: item.name,
      path: item.path,
      repository: (item.repository as Record<string, unknown>)?.full_name,
      html_url: item.html_url,
      score: item.score,
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
      topics: repository.topics,
      open_issues_count: repository.open_issues_count,
      stargazers_count: repository.stargazers_count,
      pushed_at: repository.pushed_at,
      size: repository.size,
    };
  }

  if (name === 'github_list_branches') {
    const perPage = Math.min(Number(args.per_page ?? 50), 100);
    return githubFetch(token, `${repoPath(owner, repo)}/branches?per_page=${perPage}`);
  }

  if (name === 'github_get_file_tree') {
    const branch = typeof args.branch === 'string' ? args.branch : undefined;
    let ref = branch;
    if (!ref) {
      const repository = await githubFetch<{ default_branch: string }>(token, repoPath(owner, repo));
      ref = repository.default_branch;
    }
    const tree = await githubFetch<{ tree: Array<Record<string, unknown>>; truncated: boolean }>(token, `${repoPath(owner, repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    const files = tree.tree
      .filter(item => item.type === 'blob')
      .map(item => ({ path: item.path, size: item.size }));
    return { ref, truncated: tree.truncated, file_count: files.length, files };
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

  if (name === 'github_list_commits') {
    const branch = typeof args.branch === 'string' ? args.branch : undefined;
    const since = typeof args.since === 'string' ? args.since : undefined;
    const author = typeof args.author === 'string' ? args.author : undefined;
    const perPage = Math.min(Number(args.per_page ?? 20), 100);
    const params = new URLSearchParams({ per_page: String(perPage) });
    if (branch) params.set('sha', branch);
    if (since) params.set('since', since);
    if (author) params.set('author', author);
    const commits = await githubFetch<Array<Record<string, unknown>>>(token, `${repoPath(owner, repo)}/commits?${params.toString()}`);
    return commits.map(c => {
      const commit = c.commit as Record<string, unknown>;
      const author_info = commit.author as Record<string, unknown>;
      const committer = c.committer as Record<string, unknown>;
      return {
        sha: (c.sha as string)?.slice(0, 8),
        full_sha: c.sha,
        message: (commit.message as string)?.split('\n')[0],
        author: author_info?.name,
        date: author_info?.date,
        committer_login: committer?.login,
        html_url: c.html_url,
      };
    });
  }

  if (name === 'github_get_commit') {
    const sha = String(args.sha ?? '');
    const commit = await githubFetch<Record<string, unknown>>(token, `${repoPath(owner, repo)}/commits/${encodeURIComponent(sha)}`);
    const commitData = commit.commit as Record<string, unknown>;
    const files = (commit.files as Array<Record<string, unknown>> | undefined) ?? [];
    return {
      sha: commit.sha,
      message: (commitData.message as string),
      author: (commitData.author as Record<string, unknown>),
      stats: commit.stats,
      files: files.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: (f.patch as string)?.slice(0, 3000),
      })),
      html_url: commit.html_url,
    };
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

  if (name === 'github_delete_file') {
    const filePath = String(args.path ?? '');
    const branch = String(args.branch ?? '');
    const message = String(args.message ?? '');
    if (!filePath || !branch || !message) throw new Error('path, branch, and message are required.');
    const sha = await readFileSha(token, owner, repo, filePath, branch);
    if (!sha) throw new Error(`File not found: ${filePath} on branch ${branch}`);
    return githubFetch(token, `${repoPath(owner, repo)}/contents/${encodePath(filePath)}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch }),
    });
  }

  if (name === 'github_list_pull_requests') {
    const state = typeof args.state === 'string' ? args.state : 'open';
    const sort = typeof args.sort === 'string' ? args.sort : 'updated';
    const perPage = Math.min(Number(args.per_page ?? 20), 100);
    const prs = await githubFetch<Array<Record<string, unknown>>>(token, `${repoPath(owner, repo)}/pulls?state=${encodeURIComponent(state)}&sort=${encodeURIComponent(sort)}&per_page=${perPage}`);
    return prs.map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft,
      html_url: pr.html_url,
      head: (pr.head as Record<string, unknown>)?.ref,
      base: (pr.base as Record<string, unknown>)?.ref,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      user: (pr.user as Record<string, unknown>)?.login,
      labels: (pr.labels as Array<Record<string, unknown>>)?.map(l => l.name),
    }));
  }

  if (name === 'github_get_pull_request') {
    const pullNumber = Number(args.pull_number);
    const pr = await githubFetch<Record<string, unknown>>(token, `${repoPath(owner, repo)}/pulls/${pullNumber}`);
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      draft: pr.draft,
      html_url: pr.html_url,
      diff_url: pr.diff_url,
      head: (pr.head as Record<string, unknown>)?.ref,
      base: (pr.base as Record<string, unknown>)?.ref,
      mergeable: pr.mergeable,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      requested_reviewers: (pr.requested_reviewers as Array<Record<string, unknown>>)?.map(r => r.login),
      labels: (pr.labels as Array<Record<string, unknown>>)?.map(l => l.name),
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      user: (pr.user as Record<string, unknown>)?.login,
    };
  }

  if (name === 'github_get_pr_diff') {
    const pullNumber = Number(args.pull_number);
    const res = await fetch(`${GITHUB_API}${repoPath(owner, repo)}/pulls/${pullNumber}`, {
      headers: {
        Accept: 'application/vnd.github.diff',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    const diff = await res.text();
    return { pull_number: pullNumber, diff: diff.slice(0, 30000), truncated: diff.length > 30000 };
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

  if (name === 'github_add_pr_review') {
    const pullNumber = Number(args.pull_number);
    return githubFetch(token, `${repoPath(owner, repo)}/pulls/${pullNumber}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        body: String(args.body ?? ''),
        event: String(args.event ?? 'COMMENT'),
      }),
    });
  }

  if (name === 'github_list_issues') {
    const state = typeof args.state === 'string' ? args.state : 'open';
    const sort = typeof args.sort === 'string' ? args.sort : 'updated';
    const perPage = Math.min(Number(args.per_page ?? 20), 100);
    const params = new URLSearchParams({ state, sort, per_page: String(perPage) });
    if (typeof args.labels === 'string') params.set('labels', args.labels);
    if (typeof args.assignee === 'string') params.set('assignee', args.assignee);
    if (typeof args.since === 'string') params.set('since', args.since);
    const issues = await githubFetch<Array<Record<string, unknown>>>(token, `${repoPath(owner, repo)}/issues?${params.toString()}`);
    return issues
      .filter(issue => !issue.pull_request)
      .map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        html_url: issue.html_url,
        labels: (issue.labels as Array<Record<string, unknown>>)?.map(l => l.name),
        assignees: (issue.assignees as Array<Record<string, unknown>>)?.map(a => a.login),
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        user: (issue.user as Record<string, unknown>)?.login,
        comments: issue.comments,
      }));
  }

  if (name === 'github_get_issue') {
    const issueNumber = Number(args.issue_number);
    const issue = await githubFetch<Record<string, unknown>>(token, `${repoPath(owner, repo)}/issues/${issueNumber}`);
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      html_url: issue.html_url,
      labels: (issue.labels as Array<Record<string, unknown>>)?.map(l => l.name),
      assignees: (issue.assignees as Array<Record<string, unknown>>)?.map(a => a.login),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      user: (issue.user as Record<string, unknown>)?.login,
      comments: issue.comments,
    };
  }

  if (name === 'github_create_issue') {
    return githubFetch(token, `${repoPath(owner, repo)}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: String(args.title ?? ''),
        body: String(args.body ?? ''),
        labels: Array.isArray(args.labels) ? args.labels : [],
        assignees: Array.isArray(args.assignees) ? args.assignees : [],
      }),
    });
  }

  if (name === 'github_add_comment') {
    const issueNumber = Number(args.issue_number);
    return githubFetch(token, `${repoPath(owner, repo)}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: String(args.body ?? '') }),
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
    return { path: target, repository: `${owner}/${repo}`, branch: branch ?? 'default', note: 'Repository cloned into an isolated server workspace.' };
  }

  throw new Error(`Unknown GitHub tool: ${name}`);
}
