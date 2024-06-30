import { DiscordClient } from "./discord-client";
import { logger } from "./utils/logger";
import app from "./app";
import "./utils/env";

logger.init("Initializing server...");

const port = process.env.PORT || 4000;

// Start server
app.listen(port, () => {
  logger.ready(`Server running on port ${port}`);
});
