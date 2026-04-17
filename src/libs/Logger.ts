const fmt = (level: string, args: unknown[]) =>
  `[${level}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`;

export const logger = {
  info: (...args: unknown[]) => console.log(fmt('INFO', args)),
  warn: (...args: unknown[]) => console.warn(fmt('WARN', args)),
  error: (...args: unknown[]) => console.error(fmt('ERROR', args)),
  debug: (...args: unknown[]) => console.debug(fmt('DEBUG', args)),
};
