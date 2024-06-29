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
  try {
    const data = await req.json();
    app.updateOverlay(data);
    logger.info("Overlay updated");
    res.send("Overlay updated");
  } catch (err) {
    logger.warn("Error updating overlay");
    res.send("Invalid overlay data", 400);
  }
  return;
});

// Handle connections at /overlay namespace
app.io.of("/overlay").on("connection", (socket) => {
  socket.emit("overlay", app.overlay);
});

export default app;
