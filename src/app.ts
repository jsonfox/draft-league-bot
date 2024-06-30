import { DiscordClient } from "./discord-client";
import { AppServer } from "./server";
import { logger } from "./utils/logger";
import { env } from "./utils/env";

const app = new AppServer();
const client =
  process.env.NODE_ENV === "development" ? null : new DiscordClient();

app.GET(
  "/",
  async (req, res) => {
    res.send("App is running");
    return;
  },
  true
);

app.GET("/overlay", async (req, res) => {
  res.json(app.overlay);
  return;
});

app.POST("/overlay", async (req, res) => {
  const data = await req.json().catch(() => {
    logger.error("Error parsing JSON");
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

app.POST("/restart-client", async (req, res) => {
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
  res.send()
  return;
});

// Handle connections at /overlay namespace
app.io.of("/overlay").on("connection", (socket) => {
  socket.emit("overlay", app.overlay);
});

export default app;
