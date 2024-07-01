import { DiscordClient } from "./discord-client";
import { AppServer } from "./server";
import { logger } from "./utils/logger";
import { env } from "./utils/env";
import { v } from "./utils/validator";
import { ActivityType, PresenceUpdateStatus } from "discord-api-types/v10";

const app = new AppServer();
const client =
  process.env.NODE_ENV === "development" ? null : new DiscordClient();

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

// Restart Discord client
app.POST("/client/restart", async (req, res) => {
  if (!client) {
    res.status(400).send("Client not initialized");
    return;
  }
  if (!req.headers["x-token"]?.includes(env.BOT_TOKEN)) {
    res.status(403).send("Forbidden");
    return;
  }
  logger.init("Restarting client...");
  client.restart();
  res.send();
  return;
});

// Update Discord client status
app.POST("/client/status", async (req, res) => {
  if (!client) {
    res.status(400).send("Client not initialized");
    return;
  }
  if (!req.headers["x-token"]?.includes(env.BOT_TOKEN)) {
    res.status(403).send("Forbidden");
    return;
  }
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

export default app;
