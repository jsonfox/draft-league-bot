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

const app = new AppServer();
const client = new DiscordClient();
// process.env.NODE_ENV === "development" ? null : new DiscordClient();

// Health check
app.GET(
  "/",
  async (req, res) => {
    res.send("App is running");
    return;
  },
  true
);

// Get overlay data
app.GET("/overlay", async (req, res) => {
  res.json(app.overlay);
  return;
});

// Update overlay data
app.POST("/overlay", async (req, res) => {
  const data = await req.json().catch(() => {
    logger.error("Error parsing JSON from request body");
  });
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

// TODO: Implement actual middleware system
const validateClientAction = (req: HttpRequestType, res: HttpResponseType) => {
  if (!client) {
    res.writeHead(400);
    res.end("Client not initialized");
    return false;
  } else if (!req.headers["x-token"]?.includes(env.BOT_TOKEN)) {
    res.writeHead(403);
    res.end("Forbidden");
    return false;
  }
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
    res.writeHead(400);
    res.end("Client not connected");
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
