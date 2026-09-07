export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL: LogLevel = "info";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  fields: Record<string, unknown>;
}

function formatEntry(level: LogLevel, message: string, fields: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    fields,
  };
  return JSON.stringify(entry);
}

function writeLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

export interface LoggerOptions {
  minLevel?: LogLevel;
}

export class Logger {
  private readonly minLevelOrder: number;

  constructor(options: LoggerOptions = {}) {
    const raw = options.minLevel ?? process.env.CREX_LOG_LEVEL;
    const minLevel: LogLevel =
      raw !== undefined && raw in LEVEL_ORDER ? (raw as LogLevel) : DEFAULT_LEVEL;
    this.minLevelOrder = LEVEL_ORDER[minLevel];
  }

  debug(message: string, fields: Record<string, unknown> = {}): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    this.write("error", message, fields);
  }

  private write(level: LogLevel, message: string, fields: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.minLevelOrder) {
      return;
    }
    writeLine(formatEntry(level, message, fields));
  }
}

export const logger = new Logger();