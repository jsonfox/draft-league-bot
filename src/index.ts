import { DiscordClient } from "./discord-client";
import { logger } from "./logger";
import app from "./app";
import "./env";

logger.init("Initializing server...");

const port = process.env.PORT || 4000;

// Start server
app.listen(port, () => {
  logger.ready(`Server running on port ${port}`);
  // Don't initialize Discord client in dev environment
  if (process.env.NODE_ENV !== "development") {
    new DiscordClient();
  }
});
