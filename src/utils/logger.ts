/* tslint:disable:no-console */

type FormatString = `\x1b[${string}m`;

enum TextFormat {
  Reset = "\x1b[0m",
  Gray = "\x1b[38;5;249m",
  Timestamp = "\x1b[38;5;24m",
  Error = "\x1b[38;5;1m",
  Success = "\x1b[38;5;42m",
  Warn = "\x1b[38;5;228m",
  Info = "\x1b[38;5;117m",
  Debug = "\x1b[38;5;187m",
  Init = "\x1b[38;5;75m",
}

const levels = {
  debug: {
    severity: 0,
    format: TextFormat.Debug,
  },
  info: {
    severity: 1,
    format: TextFormat.Info,
  },
  init: {
    severity: 1,
    format: TextFormat.Init,
  },
  ready: {
    severity: 1,
    format: TextFormat.Success,
  },
  warn: {
    severity: 2,
    format: TextFormat.Warn,
  },
  error: {
    severity: 3,
    format: TextFormat.Error,
  },
} as const;

type LogLevel = keyof typeof levels;

class Logger {
  protected level: LogLevel;

  constructor() {
    this.level = process.env.NODE_ENV === "development" ? "debug" : "info";
  }

  protected get timestamp() {
    const dateString = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "shortGeneric",
    });
    const [day, time] = dateString.split(", ");
    return `${day.replace(/\//g, "-")} @ ${time}`;
  }

  protected format(formatStr: FormatString, content: string) {
    return `${formatStr}${content}${TextFormat.Reset}`;
  }

  protected getPrefix(level: LogLevel) {
    const symbol = this.format.bind(this, TextFormat.Gray);

    const MAX_LEVEL_LENGTH = 5;
    const padding = " ".repeat(MAX_LEVEL_LENGTH - level.length);

    const timestampStr =
      symbol("[") +
      this.format(TextFormat.Timestamp, this.timestamp) +
      symbol("]");

    const levelStr =
      symbol("[") +
      this.format(levels[level].format, level.toUpperCase()) +
      symbol("]") +
      " ".repeat(MAX_LEVEL_LENGTH - level.length) + // Padding
      symbol(":");

    return `${timestampStr} ${levelStr}`;
  }

  protected log(level: keyof typeof levels, ...args: any[]) {
    if (process.env.DISABLE_LOGGING === "true") return;
    if (levels[level].severity < levels[this.level].severity) return;
    const message = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        try {
          return JSON.stringify(arg, null, 2);
        } catch (err) {
          return "";
        }
      })
      .join(" ");
    console.log(this.getPrefix(level), message);
  }

  debug = this.log.bind(this, "debug");
  info = this.log.bind(this, "info");
  init = this.log.bind(this, "init");
  ready = this.log.bind(this, "ready");
  warn = this.log.bind(this, "warn");
  error = this.log.bind(this, "error");
}

export const logger = new Logger();
