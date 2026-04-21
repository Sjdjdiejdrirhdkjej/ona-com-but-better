export type LearnSection = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type LearnEntry = {
  slug: string;
  tag: string;
  title: string;
  intro: string;
  sections: LearnSection[];
  cta?: { label: string; href: string };
};

export const learnEntries: Record<string, LearnEntry> = {
  'agents': {
    slug: 'agents',
    tag: 'Background agents',
    title: 'Task in, pull request out.',
    intro:
      'ONA agents run end-to-end in the background. You describe the outcome, the agent picks up the work in an isolated cloud environment and returns a reviewable pull request.',
    sections: [
      {
        heading: 'What an agent actually does',
        body: 'Each task gets its own VM with the repo, dependencies, and tools. The agent reads context, edits code, runs tests, and pushes a branch — without touching your local machine.',
        bullets: [
          'Reads the repo, AGENTS.md, and prior PRs for context.',
          'Plans the change, edits files, and runs your test suite.',
          'Opens a pull request with a written summary and test output.',
        ],
      },
      {
        heading: 'How you stay in control',
        body: 'You can take over the same environment at any time, redirect the work mid-flight, or close the task. Every step is logged, so review is straightforward.',
      },
      {
        heading: 'When to reach for an agent',
        body: 'Agents shine on well-scoped work: refactors, dependency upgrades, test backfills, doc drift, and triaging incoming bugs.',
      },
    ],
    cta: { label: 'Start your first agent', href: '/dashboard' },
  },
  'automations': {
    slug: 'automations',
    tag: 'Automations',
    title: 'Agent fleets at scale.',
    intro:
      'Automations turn one-off agent tasks into repeatable workflows. Trigger them from pull requests, schedules, webhooks, or your backlog system, then review the resulting PRs when they land.',
    sections: [
      {
        heading: 'Triggers',
        body: 'Start work the moment something happens upstream — a merged PR, a Sentry alert, a new Linear ticket, a cron schedule, or a Slack-style prompt.',
        bullets: ['Schedules', 'Webhooks', 'Pull requests', 'Issue trackers'],
      },
      {
        heading: 'Parallel execution',
        body: 'Each automation can dispatch dozens of agents at once, each in its own isolated VM. They never share state, so failures stay contained.',
      },
      {
        heading: 'One review queue',
        body: 'Every agent delivers a PR. Reviewers see a normal diff, a written summary, and the test output — no special tooling required.',
      },
    ],
    cta: { label: 'Browse automation recipes', href: '/dashboard' },
  },
  'environments': {
    slug: 'environments',
    tag: 'Connected environments',
    title: 'More than a sandbox.',
    intro:
      'Each agent gets a full cloud environment with your tools, network access, and permissions — not a stripped-down container.',
    sections: [
      {
        heading: 'What is in the box',
        body: 'A real Linux VM with your repo, language runtimes, build tools, and access to the systems your code needs to run.',
        bullets: [
          'Cloned repository at the right commit',
          'Cached dependencies and toolchains',
          'Scoped network and credential access',
          'Persistent state for the duration of the task',
        ],
      },
      {
        heading: 'Bring your own',
        body: 'Plug in private registries, internal package mirrors, or your own base images. Agents inherit the same environment your engineers use.',
      },
      {
        heading: 'Human takeover',
        body: 'Open the same environment in a browser IDE and continue the work yourself. Nothing is locked away inside the agent.',
      },
    ],
    cta: { label: 'Configure an environment', href: '/dashboard' },
  },
  'governance': {
    slug: 'governance',
    tag: 'Governance with guarantees',
    title: 'Runs in your VPC.',
    intro:
      'ONA is built for teams that need real network controls, scoped credentials, and a durable record of what every agent did.',
    sections: [
      {
        heading: 'Network and isolation',
        body: 'Run agents inside your VPC, with explicit egress rules and no shared state across tasks. Production data never leaves your perimeter.',
      },
      {
        heading: 'Credentials and policies',
        body: 'Every agent run uses scoped, short-lived credentials. Command policies prevent agents from touching paths or services they should not.',
        bullets: [
          'Least-privilege secrets per task',
          'Allow- and deny-lists for shell commands',
          'RBAC for who can dispatch which automations',
        ],
      },
      {
        heading: 'Audit trails',
        body: 'Every action — human or agent — is captured with timestamps, inputs, and outputs. Export to your SIEM or review in the console.',
      },
    ],
    cta: { label: 'Talk to us about your VPC', href: '/demo' },
  },
  'code-migration': {
    slug: 'code-migration',
    tag: 'Use case',
    title: 'Code migration & modernization',
    intro:
      'Migrate hundreds of repos in parallel — COBOL, Java, framework upgrades, CI pipelines. ONA does the work; you review the PRs.',
    sections: [
      {
        heading: 'How a migration runs',
        body: 'Define the target state once. ONA dispatches an agent per repo, applies the change, runs tests, and opens a PR. Failures come back with logs so you can iterate.',
      },
      {
        heading: 'Common migrations',
        body: 'React 18 → 19, Node LTS bumps, Java 8 → 17, monorepo splits, build tool swaps, Dockerfile rewrites, and language-level rewrites guided by deterministic codemods.',
      },
      {
        heading: 'Why parallel matters',
        body: 'A migration that would take quarters of human work finishes in days when hundreds of agents work in parallel — without anyone context-switching across repos.',
      },
    ],
    cta: { label: 'Plan a migration', href: '/demo' },
  },
  'code-review': {
    slug: 'code-review',
    tag: 'Use case',
    title: 'AI code review',
    intro:
      "ONA doesn't just scan patterns — it compiles, runs tests, and reviews in a real environment.",
    sections: [
      {
        heading: 'Real review, not just lint',
        body: 'The reviewer agent checks out the PR, builds it, runs the test suite, and looks at behavior — then leaves grounded comments on what actually broke.',
      },
      {
        heading: 'Where it helps most',
        body: 'Catching regressions in long-tail tests, spotting subtle behavior changes in refactors, and giving fast feedback on PRs from contributors who are new to the codebase.',
      },
      {
        heading: 'Plays well with humans',
        body: 'Reviewer comments appear in your normal PR UI. Approve, dismiss, or ask the agent for a revised patch — the workflow you already use.',
      },
    ],
    cta: { label: 'Add review to a repo', href: '/dashboard' },
  },
  'cve-remediation': {
    slug: 'cve-remediation',
    tag: 'Use case',
    title: 'Automated CVE remediation',
    intro:
      'Remediates what your scanner finds — across hundreds of repos, in isolated environments. Tested, with PRs ready for review.',
    sections: [
      {
        heading: 'From alert to PR',
        body: 'Connect your scanner. When a new CVE lands, ONA dispatches agents to the affected repos, bumps the dependency, runs tests, and opens PRs grouped by severity.',
      },
      {
        heading: 'Safer by default',
        body: 'Each remediation runs in an isolated VM with read-only access to production. Patches are validated by your existing test suite before a PR is opened.',
      },
      {
        heading: 'Ship faster than the disclosure cycle',
        body: 'Mean time to remediate drops from weeks to hours when the boring work — bumping versions across repos — happens automatically.',
      },
    ],
    cta: { label: 'Connect your scanner', href: '/demo' },
  },
  'backlog-automation': {
    slug: 'backlog-automation',
    tag: 'Use case',
    title: 'Backlog and bug triage',
    intro:
      'Pick up well-scoped backlog tickets, triage Sentry-style issues, reproduce failures, ship fixes, and leave a linked report.',
    sections: [
      {
        heading: 'Pick up the small stuff',
        body: 'Tag tickets that are well-scoped. ONA picks them up, opens a branch, attempts the change, and either ships a PR or comments why it could not.',
      },
      {
        heading: 'Triage at the source',
        body: 'For incoming Sentry-style issues, an agent reproduces the failure in a clean environment, attaches a stack trace and a candidate fix, and assigns the right human if review is needed.',
      },
      {
        heading: 'Keep your roadmap moving',
        body: 'Engineers spend their time on the hard work. The backlog stops being a graveyard.',
      },
    ],
    cta: { label: 'Connect your tracker', href: '/dashboard' },
  },
  'maintenance-agents': {
    slug: 'maintenance-agents',
    tag: 'Use case',
    title: 'Docs drift and dead-code cleanup',
    intro:
      'Run deterministic scripts with AI judgment to update docs, remove unused code, and keep repositories ready for other agents.',
    sections: [
      {
        heading: 'Why repos go stale',
        body: 'Docs lag behind APIs. Dead code accumulates. AGENTS.md files contradict reality. Maintenance agents close that gap on a schedule.',
      },
      {
        heading: 'What they do',
        body: 'Regenerate API docs from source, prune unreferenced exports, refresh changelogs, and fix broken example snippets — each as a small reviewable PR.',
      },
      {
        heading: 'Compounding benefit',
        body: 'Cleaner repos make every other agent more accurate. Maintenance is the multiplier.',
      },
    ],
    cta: { label: 'Schedule a maintenance run', href: '/dashboard' },
  },
};

export const blogPosts: Record<string, LearnEntry> = {
  'agent-sandbox-escape': {
    slug: 'agent-sandbox-escape',
    tag: 'Security',
    title: 'How AI agents escape their own denylist and sandbox',
    intro:
      "The adversary can reason now, and our security tools weren't built for that. A look at why command-level denylists fail against agents that plan around them.",
    sections: [
      {
        heading: 'The old model: deny by string',
        body: 'Traditional sandboxes block known-bad commands. Agents read the deny list, understand it, and pick equivalent commands that are not on it.',
      },
      {
        heading: 'The new model: deny by capability',
        body: 'Effective controls scope what the environment itself can do — network egress, file paths, credential reach — instead of trying to enumerate every dangerous command.',
      },
      {
        heading: 'What we recommend',
        body: 'Run agents in VMs, not shared shells. Issue scoped, short-lived credentials. Log everything. Treat the agent as a remote contractor, not a trusted process.',
      },
    ],
    cta: { label: 'Read the governance overview', href: '/learn/governance' },
  },
  'ona-automations-launch': {
    slug: 'ona-automations-launch',
    tag: 'AI',
    title: 'ONA Automations: proactive background agents',
    intro:
      'Background agents that write, test, and ship code on a schedule. A field guide to the new automation triggers we shipped this quarter.',
    sections: [
      {
        heading: 'Why proactive matters',
        body: 'Most agents wait for a prompt. Automations flip the model: the work starts when an upstream signal fires, and a PR shows up before anyone asks.',
      },
      {
        heading: 'What is new',
        body: 'Schedule, webhook, and PR-event triggers; per-team cost caps; and a fleet view that lets reviewers see every running agent in one place.',
      },
      {
        heading: 'Where to start',
        body: 'Pick one repetitive task — dependency bumps, doc regeneration, CI fixups — and wire it to a daily schedule. Iterate from there.',
      },
    ],
    cta: { label: 'Explore automations', href: '/learn/automations' },
  },
  'last-year-of-localhost': {
    slug: 'last-year-of-localhost',
    tag: 'AI',
    title: 'The last year of localhost',
    intro:
      "The companies winning with background agents didn't start with better models. They started by moving the work out of localhost and into reproducible cloud environments.",
    sections: [
      {
        heading: 'Localhost was never reproducible',
        body: 'Every laptop is a snowflake. Every "works on my machine" bug is a tax on review. Agents amplify that tax until you fix the substrate.',
      },
      {
        heading: 'What changes when work moves to the cloud',
        body: 'Environments become declarative. Agents and humans share the same starting state. Reviews become trustworthy because the test run is reproducible.',
      },
      {
        heading: 'How to begin the move',
        body: 'Start with one team. Define their environment as code. Have agents and humans both work inside it. Expand from there.',
      },
    ],
    cta: { label: 'See connected environments', href: '/learn/environments' },
  },
};
