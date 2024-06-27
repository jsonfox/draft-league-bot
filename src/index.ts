import { App } from "./app";
import { DiscordClient } from "./discord-client";

console.log("Initializing server...");

const port = process.env.PORT || 4000;

const app = new App(async (req, res) => {
  // Handle root path
  if (!req.url) {
    res.send("App is running");
  }
  return;
});

app.GET("/overlay", async (req, res) => {
  res.json(app.overlay);
});

app.POST("/overlay", async (req, res) => {
  try {
    const data = await req.json();
    app.updateOverlay(data);
    res.sendStatus(200);
    console.log(Date.now(), "Overlay updated");
  } catch (err) {
    res.status(400).send("Invalid overlay data");
  }
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
    new DiscordClient();
  }
});
