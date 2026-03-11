type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveEnvLevel = (): LogLevel => {
  const maybeLevel = (import.meta.env.VITE_LOG_LEVEL || (import.meta.env.DEV ? 'debug' : 'warn')) as string;
  if (maybeLevel in levelOrder) {
    return maybeLevel as LogLevel;
  }
  return 'warn';
};

const envLevel = resolveEnvLevel();

const shouldLog = (level: LogLevel) => levelOrder[level] >= levelOrder[envLevel];

type LogArgs = Array<unknown>;

const logFactory = (level: LogLevel) => {
  return (...args: LogArgs) => {
    if (!shouldLog(level)) return;
    if (level === 'debug' && !import.meta.env.DEV) {
      // Avoid flooding prod unless explicitly enabled
      return;
    }
    console[level](...args);
  };
};

export const logger = {
  debug: logFactory('debug'),
  info: logFactory('info'),
  warn: logFactory('warn'),
  error: logFactory('error'),
};
