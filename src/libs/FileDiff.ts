export type TouchedFileDiff = {
  path: string;
  status: 'created' | 'modified' | 'deleted';
  diff: string;
  truncated?: boolean;
};

function normalizeLines(value: string) {
  return value.replace(/\r\n/g, '\n').split('\n');
}

function trimForDiff(value: string) {
  const maxChars = 30000;
  if (value.length <= maxChars) return { value, truncated: false };
  return { value: value.slice(0, maxChars), truncated: true };
}

export function createFileDiff(path: string, before: string | null, after: string | null): TouchedFileDiff {
  const oldTrimmed = trimForDiff(before ?? '');
  const newTrimmed = trimForDiff(after ?? '');
  const oldLines = normalizeLines(oldTrimmed.value);
  const newLines = normalizeLines(newTrimmed.value);
  let prefix = 0;

  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;

  while (oldSuffix >= prefix && newSuffix >= prefix && oldLines[oldSuffix] === newLines[newSuffix]) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const contextBeforeStart = Math.max(0, prefix - 3);
  const contextAfterEnd = Math.min(oldLines.length, oldSuffix + 4);
  const output: string[] = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ ${before === null ? 'created' : after === null ? 'deleted' : 'modified'} @@`,
  ];

  for (let i = contextBeforeStart; i < prefix; i += 1) {
    output.push(` ${oldLines[i]}`);
  }

  for (let i = prefix; i <= oldSuffix; i += 1) {
    output.push(`-${oldLines[i]}`);
  }

  for (let i = prefix; i <= newSuffix; i += 1) {
    output.push(`+${newLines[i]}`);
  }

  for (let i = Math.max(prefix, oldSuffix + 1); i < contextAfterEnd; i += 1) {
    output.push(` ${oldLines[i]}`);
  }

  if (oldTrimmed.truncated || newTrimmed.truncated) {
    output.push('… diff truncated');
  }

  return {
    path,
    status: before === null ? 'created' : after === null ? 'deleted' : 'modified',
    diff: output.join('\n').slice(0, 20000),
    truncated: oldTrimmed.truncated || newTrimmed.truncated || output.join('\n').length > 20000,
  };
}