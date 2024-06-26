/* tslint:disable:no-console */

type FormatString = `\x1b[${string}m`;

const getTextFormatter = (format: number): FormatString => `\x1b[${format}m`;

const formatting = {
  reset: getTextFormatter(0),
  black: getTextFormatter(30),
  red: getTextFormatter(31),
  green: getTextFormatter(32),
  yellow: getTextFormatter(33),
  blue: getTextFormatter(34),
  magenta: getTextFormatter(35),
  cyan: getTextFormatter(36),
  white: getTextFormatter(37),
} as const;

const levels = {
  debug: {
    severity: 0,
    format: formatting.blue,
  },
  info: {
    severity: 1,
    format: formatting.green,
  },
  init: {
    severity: 1,
    format: formatting.blue,
  },
  ready: {
    severity: 1,
    format: formatting.green,
  },
  warn: {
    severity: 2,
    format: formatting.yellow,
  },
  error: {
    severity: 3,
    format: formatting.red,
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
    return `${formatStr}${content}${formatting.reset}`;
  }

  protected getPrefix(level: LogLevel) {
    const MAX_LEVEL_LENGTH = 5;
    const padding = " ".repeat(MAX_LEVEL_LENGTH - level.length);
    return `[${this.format(formatting.cyan, this.timestamp)}] [${this.format(
      levels[level].format,
      level.toUpperCase()
    )}]${padding}:`;
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
