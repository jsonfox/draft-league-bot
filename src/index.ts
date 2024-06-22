import { App } from "./app";
import { DiscordClient } from "./discord-client";
import "./env";

console.log("Initializing server...");

const port = process.env.PORT || 4000;

const discordClient = new DiscordClient();

const app = new App(async (req, res) => {
  // Handle root path
  if (!req.url) {
    res.send("App is running");
  }
  return;
});

app.POST("/overlay", async (req, res) => {
  app.updateOverlay(req.body);
});

// Handle connections at /overlay namespace
app.io.of("/overlay").on("connection", (socket) => {
  socket.emit("overlay", app.overlay);
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  // Don't initialize Discord client in dev environment
  if (process.env.NODE_ENV !== "development") {
    discordClient.initialize();
  }
});
