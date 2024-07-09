import { logger } from "./utils/logger";
import app from "./app";
import "./utils/env";
import { sendErrorToDiscord } from "./utils/helpers";

logger.init("Initializing server...");

const port = process.env.PORT || 4000;

// Start server
app.listen(port, () => {
  logger.ready(`Server running on port ${port}`);
});

process.on("uncaughtException", async (error) => {
  logger.error(error.stack ?? error.message);
  if (process.env.NODE_ENV === "production") {
    await sendErrorToDiscord(error);
    logger.init("Shutting down server...");
    process.exit(1);
  }
});

process.on("exit", () => {
  logger.init("Server shutting down...");
});
