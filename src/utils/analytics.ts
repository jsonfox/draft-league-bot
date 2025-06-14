import { DiscordClient } from "../discord-client";

export interface ServerAnalytics {
  uptime: number;
  status: string;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  timestamp: number;
}

export interface DiscordAnalytics {
  connected: boolean;
  status: string;
  uptime: number;
  latency: number | null;
  totalReconnects: number;
  guildCount: number | null;
  memberCount: number | null;
  timestamp: number;
}

export interface CombinedAnalytics {
  server: ServerAnalytics;
  discord: DiscordAnalytics;
  healthy: boolean;
}

export class AnalyticsService {
  private startTime: number;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  private getCpuUsage(): number {
    const current = process.cpuUsage();

    if (!this.lastCpuUsage) {
      this.lastCpuUsage = current;
      return 0;
    }

    const userDiff = current.user - this.lastCpuUsage.user;
    const systemDiff = current.system - this.lastCpuUsage.system;
    const totalDiff = userDiff + systemDiff;

    this.lastCpuUsage = current;

    // Convert microseconds to percentage (rough approximation)
    return Math.round((totalDiff / 1000000) * 100) / 100;
  }

  getServerAnalytics(): ServerAnalytics {
    return {
      uptime: Date.now() - this.startTime,
      status: "running",
      memoryUsage: process.memoryUsage(),
      cpuUsage: this.getCpuUsage(),
      timestamp: Date.now(),
    };
  }

  getDiscordAnalytics(client: DiscordClient | null): DiscordAnalytics {
    if (!client) {
      return {
        connected: false,
        status: "disconnected",
        uptime: 0,
        latency: null,
        totalReconnects: 0,
        guildCount: null,
        memberCount: null,
        timestamp: Date.now(),
      };
    }

    const health = client.health;

    return {
      connected: health.connected,
      status: health.status,
      uptime: health.uptime,
      latency: health.timeSinceLastAck < 60000 ? health.timeSinceLastAck : null,
      totalReconnects: health.totalReconnects,
      guildCount: null, // Would need to be populated from Ready event
      memberCount: null, // Would need to be populated from guild member cache
      timestamp: Date.now(),
    };
  }

  getCombinedAnalytics(client: DiscordClient | null): CombinedAnalytics {
    const server = this.getServerAnalytics();
    const discord = this.getDiscordAnalytics(client);

    const healthy =
      server.status === "running" &&
      discord.connected &&
      server.memoryUsage.heapUsed < 500 * 1024 * 1024 && // Under 500MB heap usage
      (discord.latency === null || discord.latency < 10000); // Under 10s latency

    return {
      server,
      discord,
      healthy,
    };
  }

  /**
   * Returns a simplified status for public consumption
   */
  getPublicStatus(client: DiscordClient | null): {
    status: string;
    uptime: number;
    healthy: boolean;
  } {
    const analytics = this.getCombinedAnalytics(client);

    return {
      status: analytics.discord.connected ? "online" : "offline",
      uptime: analytics.server.uptime,
      healthy: analytics.healthy,
    };
  }
}
