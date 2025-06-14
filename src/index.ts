import { logger } from "./utils/logger";
import { app, client } from "./app";
import "./utils/env";
import { auditLog } from "./utils/audit-log";

logger.init("Initializing server...");

const port = process.env.PORT || 4000;

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.init(`Received ${signal}, shutting down gracefully...`);
  
  try {    // Send shutdown notification to Discord
    if (process.env.NODE_ENV === "production") {
      await auditLog.serverEvent(
        "Bot Shutdown",
        `Bot is shutting down due to ${signal}`
      );
    }

    // Close Discord client
    if (client) {
      await client.close({
        reason: `Application shutdown (${signal})`,
      });
    }

    // Close HTTP server
    if (app.server) {
      app.server.close(() => {
        logger.init("HTTP server closed");
      });
    }

    // Close socket.io server
    if (app.io) {
      app.io.close(() => {
        logger.init("Socket.IO server closed");
      });
    }

    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
};

// Start server
app.listen(port, async () => {
  if (client) {
    await client.open();
  }
  
  logger.ready(`Server running on port ${port}`);
    // Send startup notification to Discord in production
  if (process.env.NODE_ENV === "production") {
    await auditLog.serverEvent(
      "Bot Started",
      `Bot successfully started and listening on port ${port}`
    );
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", async (error) => {
  logger.error("Uncaught Exception:", error.stack ?? error.message);
    if (process.env.NODE_ENV === "production") {
    await auditLog.error(error, "Process - uncaughtException");
  }
  
  await gracefulShutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", async (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Unhandled Promise Rejection:", error.stack ?? error.message);
    if (process.env.NODE_ENV === "production") {
    await auditLog.error(error, "Process - unhandledRejection");
  }
  
  await gracefulShutdown("unhandledRejection");
});

// Handle process termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle exit
process.on("exit", (code) => {
  logger.init(`Process exiting with code ${code}`);
});
