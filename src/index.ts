import { App } from "./app";
import { DiscordClient } from "./discord-client";
import "./env";

console.log("Initializing server...");

const port = process.env.PORT || 4000;

const app = new App();

app.GET(
  "/",
  (req, res) => {
    res.send("App is running");
  },
  true
);

app.GET("/overlay", async (req, res) => {
  res.json(app.overlay);
});

app.POST("/overlay", async (req, res) => {
  try {
    const data = await req.json();
    app.updateOverlay(data);
    console.log(Date.now(), "Overlay updated");
  } catch (err) {
    console.log("Error updating overlay:", err);
    res.send("Invalid overlay data", 400);
    return;
  }
  res.send("Overlay updated");
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
