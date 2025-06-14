import { DiscordClient } from "./discord-client";
import { AppServer, RouteAccess } from "./server";
import { logger } from "./utils/logger";
import { env } from "./utils/env";
import { v } from "./utils/validator";
import { ActivityType, PresenceUpdateStatus } from "discord-api-types/v10";
import { DiscordClientStatus } from "./utils/types";
import { AnalyticsService } from "./utils/analytics";
import { MiddlewareStack, Middleware } from "./utils/middleware";

const app = new AppServer();
const client = new DiscordClient();
const analytics = new AnalyticsService();

// Health check endpoint - public facing
app.GET(
  "/",
  async (req, res) => {
    res.send("App is running");
    return;
  },
  RouteAccess.Public
);

// Comprehensive health status endpoint - public facing for status page
app.GET(
  "/health",
  async (req, res) => {
    const memUsage = process.memoryUsage();

    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.version,
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      },
      discord: client.health,
      services: {
        http: "ok",
        websocket: "ok",
        discord: client.health.connected ? "ok" : "degraded",
      },
    };

    // Set appropriate status code based on Discord health
    if (!client.health.connected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
      return;
    }

    res.json(health);
    return;
  },
  RouteAccess.Public
);

// Detailed health metrics - protected endpoint (minimized sensitive data exposure)
app.GET("/health/detailed", async (req, res) => {
  const health = {
    ...client.health,
    process: {
      // Remove PID for security - don't expose process ID
      uptime: process.uptime(),
      memory: {
        // Only expose high-level memory usage, not detailed breakdown
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      // Remove detailed CPU usage - potential for timing attacks
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      // Remove architecture details
    },
  };

  res.json(health);
  return;
});

// Public analytics endpoint for status page
app.GET(
  "/analytics",
  async (req, res) => {
    const publicStatus = analytics.getPublicStatus(client);
    res.json(publicStatus);
    return;
  },
  RouteAccess.Public
);

// Internal analytics endpoint (requires origin auth)
app.GET("/analytics/internal", async (req, res) => {
  const fullAnalytics = analytics.getCombinedAnalytics(client);
  res.json(fullAnalytics);
  return;
});

// Get overlay data
app.GET(
  "/overlay",
  async (req, res) => {
    res.json(app.overlay);
    return;
  },
  RouteAccess.Protected
);

// Update overlay data
app.POST(
  "/overlay",
  async (req, res) => {
    // Use the body that was already parsed by bodyParser middleware
    const data = req.body || null;

    if (!data) {
      res.status(400).send("Invalid JSON");
      return;
    }

    const updated = app.updateOverlay(data);

    if (updated) {
      res.send("Overlay updated");
    } else {
      res.status(400).send("Invalid overlay data");
    }
    return;
  },
  RouteAccess.Protected
);

// Middleware for validating Discord client actions
const validateDiscordClientToken: Middleware = (req, res, next) => {
  if (!client) {
    res.status(400).send("Client not initialized");
    return;
  }
  if (req.headers["x-token"] !== env.BOT_TOKEN) {
    res.sendStatus(403);
    return;
  }
  next();
};

// Create middleware stack for Discord routes
const discordMiddleware = new MiddlewareStack();
discordMiddleware.use(validateDiscordClientToken);

// Get Discord client status
app.GET(
  "/discord",
  async (req, res) => {
    res.send(client.status.toString());
    return;
  },
  RouteAccess.Protected,
  discordMiddleware
);

// Re/start Discord client
app.POST(
  "/discord",
  async (req, res) => {
    if (client.status === DiscordClientStatus.Idle) {
      await client.open();
      res.send("Client connected");
      return;
    } else {
      await client.close({
        reason: "Received restart request via API",
      });
      await client.open();
      res.send("Client restarted");
      return;
    }
  },
  RouteAccess.Protected,
  discordMiddleware
);

// Close Discord client
app.DELETE(
  "/discord",
  async (req, res) => {
    if (client.status === DiscordClientStatus.Idle) {
      res.status(400).send("Client not connected");
      return;
    }

    await client.close({
      reason: "Received disconnect request via API",
    });
    res.send("Client disconnected");
    return;
  },
  RouteAccess.Protected,
  discordMiddleware
);

// Update Discord client presence
app.POST(
  "/discord/presence",
  async (req, res) => {
    const data = await req.json().catch(() => {
      logger.error("Error parsing JSON from request body");
      return null;
    });

    if (!data) {
      res.status(400).send("Invalid JSON");
      return;
    }

    const statusSchema = v.object({
      status: v.enum(Object.values(PresenceUpdateStatus)),
      type: v.enum<ActivityType, number[]>(
        Object.values(ActivityType) as number[]
      ),
      name: v.string(),
    });

    try {
      const parsed = statusSchema.parse(data);
      client.updatePresence(parsed);
      res.send("Presence updated");
    } catch (err) {
      res.status(400).send((err as Error).message);
      return;
    }
  },
  RouteAccess.Protected,
  discordMiddleware
);

// Handle connections at /overlay namespace
app.io.of("/overlay").on("connection", (socket) => {
  socket.emit("overlay", app.overlay);
});

export { app, client };
