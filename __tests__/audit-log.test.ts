import { AuditLogService, AuditLogLevel } from "../src/utils/audit-log";
import { env } from "../src/utils/env";

// Mock fetch globally
global.fetch = jest.fn();

describe("AuditLogService", () => {
  let auditLog: AuditLogService;
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    auditLog = new AuditLogService();
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    } as Response);
  });

  describe("info", () => {
    test("sends info message to Discord channel", async () => {
      await auditLog.info("Test Title", "Test Description");

      expect(mockFetch).toHaveBeenCalledWith(
        `https://discord.com/api/v10/channels/${env.AUDIT_LOG_CHANNEL}/messages`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bot ${env.BOT_TOKEN}`
          },
          body: expect.stringContaining("Test Title")
        })
      );
    });

    test("includes fields in the embed", async () => {
      const fields = [
        { name: "Field 1", value: "Value 1", inline: true },
        { name: "Field 2", value: "Value 2", inline: false }
      ];

      await auditLog.info("Test", "Description", fields);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      
      expect(body.embeds[0].fields).toEqual(fields);
    });
  });

  describe("error", () => {
    test("sends error with stack trace", async () => {
      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at test";

      await auditLog.error(error, "Test Context");

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      
      expect(body.embeds[0].title).toBe("Application Error");
      expect(body.embeds[0].description).toBe("Test error");
      expect(body.embeds[0].fields).toContainEqual(
        expect.objectContaining({
          name: "Context",
          value: "Test Context"
        })
      );
    });
  });

  describe("discordEvent", () => {
    test("formats Discord events properly", async () => {
      const eventData = {
        username: "testuser",
        id: "123456789",
        guild_id: "987654321"
      };

      await auditLog.discordEvent("Member Joined", eventData);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      
      expect(body.embeds[0].title).toBe("Discord Event: Member Joined");
      expect(body.embeds[0].fields).toHaveLength(3);
    });
  });

  describe("error handling", () => {
    test("handles fetch errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      // Should not throw
      await expect(auditLog.info("Test", "Test")).resolves.toBeUndefined();
    });

    test("handles non-ok responses", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error"
      } as Response);

      // Should not throw
      await expect(auditLog.error(new Error("Test"))).resolves.toBeUndefined();
    });
  });
});
