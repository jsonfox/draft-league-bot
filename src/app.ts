import { AppServer } from "./server";
import { logger } from "./utils/logger";

const app = new AppServer();

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

// Handle connections at /overlay namespace
app.io.of("/overlay").on("connection", (socket) => {
  socket.emit("overlay", app.overlay);
});

export default app;
