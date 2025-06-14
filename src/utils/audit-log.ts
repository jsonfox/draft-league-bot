import { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { env } from "./env";
import { logger } from "./logger";

export enum AuditLogLevel {
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  CRITICAL = "critical",
}

interface AuditLogEntry {
  level: AuditLogLevel;
  title: string;
  description: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
}

export class AuditLogService {
  private readonly baseUrl = `https://discord.com/api/v10`;

  private getColor(level: AuditLogLevel): number {
    switch (level) {
      case AuditLogLevel.INFO:
        return 0x3498db; // Blue
      case AuditLogLevel.WARN:
        return 0xf39c12; // Orange
      case AuditLogLevel.ERROR:
        return 0xe74c3c; // Red
      case AuditLogLevel.CRITICAL:
        return 0x8e44ad; // Purple
      default:
        return 0x95a5a6; // Gray
    }
  }

  private async sendToChannel(entry: AuditLogEntry): Promise<void> {
    try {
      const embed = {
        title: entry.title,
        description:
          entry.description.length > 4096
            ? entry.description.substring(0, 4093) + "..."
            : entry.description,
        color: this.getColor(entry.level),
        timestamp: entry.timestamp || new Date().toISOString(),
        fields: entry.fields || [],
        footer: {
          text: `Level: ${entry.level.toUpperCase()}`,
        },
      };

      const payload: RESTPostAPIChannelMessageJSONBody = {
        embeds: [embed],
      };

      const response = await fetch(
        `${this.baseUrl}/channels/${env.AUDIT_LOG_CHANNEL}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bot ${env.BOT_TOKEN}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      logger.debug(`Audit log sent: ${entry.level} - ${entry.title}`);
    } catch (error) {
      logger.error("Failed to send audit log:", (error as Error).message);
    }
  }

  async info(
    title: string,
    description: string,
    fields?: Array<{ name: string; value: string; inline?: boolean }>
  ): Promise<void> {
    await this.sendToChannel({
      level: AuditLogLevel.INFO,
      title,
      description,
      fields,
    });
  }

  async warn(
    title: string,
    description: string,
    fields?: Array<{ name: string; value: string; inline?: boolean }>
  ): Promise<void> {
    await this.sendToChannel({
      level: AuditLogLevel.WARN,
      title,
      description,
      fields,
    });
  }

  async error(error: Error, context?: string): Promise<void> {
    const fields = [
      { name: "Error Type", value: error.constructor.name, inline: true },
      {
        name: "Stack Trace",
        value: error.stack?.substring(0, 1024) || "N/A",
        inline: false,
      },
    ];

    if (context) {
      fields.unshift({ name: "Context", value: context, inline: true });
    }

    await this.sendToChannel({
      level: AuditLogLevel.ERROR,
      title: "Application Error",
      description: error.message || "Unknown error occurred",
      fields,
    });
  }

  async critical(
    title: string,
    description: string,
    fields?: Array<{ name: string; value: string; inline?: boolean }>
  ): Promise<void> {
    await this.sendToChannel({
      level: AuditLogLevel.CRITICAL,
      title,
      description,
      fields,
    });
  }

  async discordEvent(event: string, data: any): Promise<void> {
    const fields = Object.entries(data).map(([key, value]) => ({
      name: key,
      value: String(value).substring(0, 1024),
      inline: true,
    }));

    await this.sendToChannel({
      level: AuditLogLevel.INFO,
      title: `Discord Event: ${event}`,
      description: `Discord gateway event received`,
      fields,
    });
  }

  async serverEvent(
    title: string,
    description: string,
    data?: any
  ): Promise<void> {
    const fields = data
      ? Object.entries(data).map(([key, value]) => ({
          name: key,
          value: String(value).substring(0, 1024),
          inline: true,
        }))
      : undefined;

    await this.sendToChannel({
      level: AuditLogLevel.INFO,
      title: `Server: ${title}`,
      description,
      fields,
    });
  }
}

// Export singleton instance
export const auditLog = new AuditLogService();
