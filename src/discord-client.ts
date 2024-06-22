import { WebSocket } from "ws";
import "./env";
import {
  GatewayIntentBits,
  Routes,
  InteractionResponseType,
  MessageFlags,
  GatewayDispatchEvents,
  GatewayVersion,
  PresenceUpdateStatus,
  ActivityType,
  GatewayOpcodes,
  GatewayIdentify,
  GatewayReceivePayload,
  InteractionType,
  GatewayInteractionCreateDispatchData,
} from "discord-api-types/v10";

const resolveBitfield = (bits: number[]) => {
  return bits.reduce((acc, bit) => acc | bit, 0);
};

export class DiscordClient {
  token: string;
  applicationId: string;
  forwardUrl: string;
  ws: WebSocket;
  interactionMessages: Map<string, number> = new Map();

  constructor() {
    // Check for required environment variables
    if (!process.env.BOT_TOKEN) {
      throw new Error("Missing BOT_TOKEN");
    }
    this.token = process.env.BOT_TOKEN;
    if (!process.env.APPLICATION_ID) {
      throw new Error("Missing APPLICATION_ID");
    }
    this.applicationId = process.env.APPLICATION_ID;
    if (!process.env.ORIGIN_URL) {
      throw new Error("Missing ORIGIN_URL");
    }
    this.forwardUrl = process.env.ORIGIN_URL + "/api/discord/interactions";

    // Initialize WebSocket
    const ws = new WebSocket(
      `wss://gateway.discord.gg/?v=${GatewayVersion}&encoding=json`
    );

    ws.on("open", () => {
      this.initialize();
    });

    ws.on("message", (data: any) => {
      let payload = JSON.parse(data);
      const { t, op, d } = payload as GatewayReceivePayload;

      if (op === GatewayOpcodes.Hello) {
        // Start heartbeat
        const { heartbeat_interval } = d;
        setInterval(() => {
          ws.send(
            JSON.stringify({
              op: GatewayOpcodes.Heartbeat,
              d: null,
            })
          );
        }, heartbeat_interval);
      }

      if (t === GatewayDispatchEvents.Ready) {
        console.log("Connected to Discord Gateway");
      }

      if (t === GatewayDispatchEvents.InteractionCreate) {
        const interaction = d as GatewayInteractionCreateDispatchData;

        if (interaction?.application_id !== process.env.APPLICATION_ID) return;
        console.log("Received interaction", interaction.id);

        this.forwardInteraction(interaction);
      }
    });

    this.ws = ws;
  }

  post(url: string, data: any) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bot " + process.env.BOT_TOKEN,
      },
      body: JSON.stringify(data),
    });
  }

  async forwardInteraction(interaction: GatewayInteractionCreateDispatchData) {
    // Function to reply with ephemeral error message
    const sendErrorMessage = (content: string) => {
      return this.post(
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

    // Check interaction type, only forward command and component interactions
    if (interaction.type === InteractionType.ApplicationCommand) {
      forwardPath = "/command";
      responseType = InteractionResponseType.DeferredChannelMessageWithSource;
    } else if (interaction.type === InteractionType.MessageComponent) {
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

    // Send deferred response
    await this.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: responseType,
        },
        auth: false,
      }
    );

    // Forward interaction to main app
    const res = await this.post(this.forwardUrl + forwardPath, interaction);

    console.log("Forwarded response status:", res.status, res.statusText);

    if (!res.ok) {
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

  initialize() {
    // Payload for initial handshake
    const loginPayload: GatewayIdentify = {
      op: GatewayOpcodes.Identify,
      d: {
        token: this.token,
        intents: resolveBitfield([
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers,
        ]),
        properties: {
          os: "linux",
          browser: "disco",
          device: "disco",
        },
        presence: {
          activities: [
            {
              name: "Gaming",
              type: ActivityType.Competing,
            },
          ],
          status: PresenceUpdateStatus.Online,
          since: Date.now(),
          afk: false,
        },
      },
    };

    this.ws.send(JSON.stringify(loginPayload));
  }
}
