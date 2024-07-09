import { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import { env } from "./env";
import { logger } from "./logger";

// Log uncaught exceptions in Discord
export const sendErrorToDiscord = async (error: Error) => {
  try {
    const res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [
          {
            title: "Server Error",
            description: error.message,
            color: 0xff0000,
          },
        ],
      } as RESTPostAPIChannelMessageJSONBody),
    });
    if (!res.ok) {
      throw new Error(res.status + " " + res.statusText);
    }
    logger.info("Posted error to Discord webhook");
  } catch (err) {
    logger.error("Failed post to Discord webhook:", (err as Error).message);
  }
};
