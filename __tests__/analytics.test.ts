import { AnalyticsService } from "../src/utils/analytics";
import { DiscordClient } from "../src/discord-client";

describe("AnalyticsService", () => {
  let analytics: AnalyticsService;
  let mockClient: jest.Mocked<DiscordClient>;

  beforeEach(() => {
    analytics = new AnalyticsService();
    mockClient = {
      health: {
        status: "ready",
        connected: true,
        uptime: 30000,
        timeSinceLastHeartbeat: 1000,
        timeSinceLastAck: 1500,
        consecutiveFailedHeartbeats: 0,
        totalReconnects: 1,
        lastError: undefined,
        reconnectAttempts: 0,
      }
    } as jest.Mocked<DiscordClient>;
  });

  describe("getServerAnalytics", () => {
    test("returns server metrics", () => {
      const result = analytics.getServerAnalytics();

      expect(result).toHaveProperty("uptime");
      expect(result).toHaveProperty("status", "running");
      expect(result).toHaveProperty("memoryUsage");
      expect(result).toHaveProperty("cpuUsage");
      expect(result).toHaveProperty("timestamp");
      expect(typeof result.uptime).toBe("number");
    });
  });

  describe("getDiscordAnalytics", () => {
    test("returns Discord metrics when client is available", () => {
      const result = analytics.getDiscordAnalytics(mockClient);

      expect(result).toEqual({
        connected: true,
        status: "ready",
        uptime: 30000,
        latency: 1500,
        totalReconnects: 1,
        guildCount: null,
        memberCount: null,
        timestamp: expect.any(Number),
      });
    });

    test("returns disconnected state when client is null", () => {
      const result = analytics.getDiscordAnalytics(null);

      expect(result).toEqual({
        connected: false,
        status: "disconnected",
        uptime: 0,
        latency: null,
        totalReconnects: 0,
        guildCount: null,
        memberCount: null,
        timestamp: expect.any(Number),
      });
    });

    test("handles stale latency data", () => {
      mockClient.health.timeSinceLastAck = 70000; // Over 1 minute
      const result = analytics.getDiscordAnalytics(mockClient);

      expect(result.latency).toBeNull();
    });
  });

  describe("getCombinedAnalytics", () => {
    test("returns combined metrics with health status", () => {
      const result = analytics.getCombinedAnalytics(mockClient);

      expect(result).toHaveProperty("server");
      expect(result).toHaveProperty("discord");
      expect(result).toHaveProperty("healthy");
      expect(typeof result.healthy).toBe("boolean");
    });

    test("marks as unhealthy when Discord is disconnected", () => {
      mockClient.health.connected = false;
      const result = analytics.getCombinedAnalytics(mockClient);

      expect(result.healthy).toBe(false);
    });

    test("marks as unhealthy with high latency", () => {
      mockClient.health.timeSinceLastAck = 15000; // 15 seconds
      const result = analytics.getCombinedAnalytics(mockClient);

      expect(result.healthy).toBe(false);
    });
  });

  describe("getPublicStatus", () => {
    test("returns simplified public status", () => {
      const result = analytics.getPublicStatus(mockClient);

      expect(result).toEqual({
        status: "online",
        uptime: expect.any(Number),
        healthy: expect.any(Boolean),
      });
    });

    test("returns offline status when client disconnected", () => {
      const result = analytics.getPublicStatus(null);

      expect(result.status).toBe("offline");
      expect(result.healthy).toBe(false);
    });
  });
});
