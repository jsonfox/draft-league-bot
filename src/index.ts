import { logger } from "./utils/logger";
import app from "./app";
import "./utils/env";

logger.init("Initializing server...");

const port = process.env.PORT || 4000;

// Start server
app.listen(port, () => {
  logger.ready(`Server running on port ${port}`);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception thrown", error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("exit", () => {
  logger.init("Server shutting down...");
});