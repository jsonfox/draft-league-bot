import {
  Client,
  GatewayIntentBits,
  Routes,
  InteractionResponseType,
  MessageFlags,
  GatewayDispatchEvents,
} from "discord.js";
import "./env";

export class DiscordClient {
  client: Client;
  interactionMessages: Map<string, number> = new Map();

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    // Ready event handler
    this.client.on("ready", () => {
      console.log("Logged in as " + this.client.user?.tag);
    });

    // Interaction event handler
    this.client.ws.on(
      GatewayDispatchEvents.InteractionCreate,
      async (interaction: any) => {
        if (interaction?.application_id !== process.env.APPLICATION_ID) return;
        console.log("Received interaction", interaction.id);

        const sendErrorMessage = (content: string) => {
          return this.client.rest.post(
            Routes.interactionCallback(interaction.id, interaction.token),
            {
              body: {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  content,
                  flags: MessageFlags.Ephemeral,
                },
              },
              auth: false,
            }
          );
        };

        let forwardPath;
        let responseType;

        if (interaction.type === 2) {
          forwardPath = "/command";
          responseType =
            InteractionResponseType.DeferredChannelMessageWithSource;
        } else if (interaction.type === 3) {
          // Check for rate limit (3 seconds)
          const lastInteraction = this.interactionMessages.get(
            interaction.message.id
          );
          if (lastInteraction && Date.now() - lastInteraction < 3000) {
            await sendErrorMessage(
              "You just pressed that button! Please wait a few seconds."
            );
            console.log("Rate limited button interaction");
            return;
          }
          this.interactionMessages.set(interaction.message.id, Date.now());
          forwardPath = "/component";
          responseType = InteractionResponseType.DeferredMessageUpdate;
        } else {
          return;
        }

        await this.client.rest.post(
          Routes.interactionCallback(interaction.id, interaction.token),
          {
            body: {
              type: responseType,
            },
            auth: false,
          }
        );

        const url =
          process.env.ORIGIN_URL + "/api/discord/interactions" + forwardPath;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bot " + process.env.BOT_TOKEN,
          },
          body: JSON.stringify(interaction),
        });

        console.log(
          "Forwarded response status:",
          response.status,
          response.statusText
        );

        if (!response.ok) {
          try {
            await sendErrorMessage("Failed to process interaction");
          } catch (err) {
            const error = err as Error;
            if (!error.message.includes("acknowledged")) {
              console.error(error.message);
            }
          }
        }
      }
    );
  }

  initialize() {
    this.client.login(process.env.BOT_TOKEN).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
