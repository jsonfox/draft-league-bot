import { ClientRecovery, DiscordClient } from "./discord-client";
import { AppServer } from "./server";
import { logger } from "./utils/logger";
import { env } from "./utils/env";
import { v } from "./utils/validator";
import { ActivityType, PresenceUpdateStatus } from "discord-api-types/v10";
import {
  DiscordClientStatus,
  HttpRequestType,
  HttpResponseType,
} from "./utils/types";
import { AnalyticsService } from "./utils/analytics";
import { auditLog } from "./utils/audit-log";

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
  true
);

// Comprehensive health status endpoint - public facing for status page
app.GET(
  "/health",
  async (req, res) => {
    const serverStartTime = process.hrtime.bigint();
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
      }    };
    
    // Set appropriate status code based on Discord health
    if (!client.health.connected) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
      return;
    }
    
    res.json(health);
    return;
  },
  true
);

// Detailed health metrics - protected endpoint
app.GET("/health/detailed", async (req, res) => {
  const health = {
    ...client.health,
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    }
  };
  
  res.json(health);
  return;
});

// Public analytics endpoint for status page
app.GET("/analytics", async (req, res) => {
  const publicStatus = analytics.getPublicStatus(client);
  res.json(publicStatus);
  return;
}, true);

// Internal analytics endpoint (requires origin auth)
app.GET("/analytics/internal", async (req, res) => {
  const fullAnalytics = analytics.getCombinedAnalytics(client);
  res.json(fullAnalytics);
  return;
});

// Get overlay data
app.GET("/overlay", async (req, res) => {
  res.json(app.overlay);
  return;
});

// Update overlay data
app.POST("/overlay", async (req, res) => {
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
});

// Middleware for validating Discord client actions
const validateClientAction = (req: HttpRequestType, res: HttpResponseType) => {
  if (!client) {
    res.status(400).send("Client not initialized");
    return false;
  } 
  if (!req.headers["x-token"]?.includes(env.BOT_TOKEN)) {
    res.sendStatus(403);
    return false;
  }
  return true;
};

// Get Discord client status
app.GET("/client", async (req, res) => {
  const isValid = validateClientAction(req, res);
  if (!isValid) return;

  res.send(client.status.toString());
  return;
});

// Re/start Discord client
app.POST("/client", async (req, res) => {
  const isValid = validateClientAction(req, res);
  if (!isValid) return;

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
});

// Close Discord client
app.DELETE("/client", async (req, res) => {
  const isValid = validateClientAction(req, res);
  if (!isValid) return;

  if (client.status === DiscordClientStatus.Idle) {
    res.status(400).send("Client not connected");
    return;
  }

  await client.close({
    reason: "Received disconnect request via API",
  });
  res.send("Client disconnected");
  return;
});

// Update Discord client presence
app.POST("/client/presence", async (req, res) => {
  const isValid = validateClientAction(req, res);
  if (!isValid) return;

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
});

// Handle connections at /overlay namespace
app.io.of("/overlay").on("connection", (socket) => {
  socket.emit("overlay", app.overlay);
});

export { app, client };
