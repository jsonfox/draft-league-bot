import { WebSocket } from "ws";
import { env } from "./env";
import {
  GatewayIntentBits,
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
  GatewayHelloData,
} from "discord-api-types/v10";

const resolveBitfield = (bits: number[]) => {
  return bits.reduce((acc, bit) => acc | bit, 0);
};

const DISCORD_API_VERSION = "v10";

export class DiscordClient {
  token: string;
  applicationId: string;
  baseUrl = `https://discord.com/api/${DISCORD_API_VERSION}`;
  forwardUrl: string;
  ws: WebSocket;
  interactionMessages: Map<string, number> = new Map();

  constructor() {
    // Check for required environment variables
    this.token = env.BOT_TOKEN;
    this.applicationId = env.APPLICATION_ID;
    this.forwardUrl = env.ORIGIN_URL + "/api/discord/interactions";

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
        this.heartbeat(d as GatewayHelloData);
      }

      if (t === GatewayDispatchEvents.Ready) {
        const { user } = d;
        console.log("Logged in as", user.username);
      }

      if (t === GatewayDispatchEvents.InteractionCreate) {
        const interaction = d as GatewayInteractionCreateDispatchData;

        if (interaction?.application_id !== env.APPLICATION_ID) return;
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
        Authorization: "Bot " + env.BOT_TOKEN,
      },
      body: JSON.stringify(data),
    });
  }

  async forwardInteraction(interaction: GatewayInteractionCreateDispatchData) {
    // Function to reply with ephemeral error message
    const sendErrorMessage = (content: string) => {
      return this.post(
        `${this.baseUrl}/interactions/${interaction.id}/${interaction.token}/callback`,
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
      if (this.interactionMessages.has(interaction.message.id)) {
        await sendErrorMessage(
          "Please wait a couple seconds before using another button on this message."
        );
        console.log("Rate limited button interaction");
        return;
      }

      // Add 3 second timeout to clear data from map
      this.interactionMessages.set(interaction.message.id, Date.now());
      setTimeout(() => {
        this.interactionMessages.delete(interaction.message.id);
      }, 3000);

      forwardPath = "/component";
      responseType = InteractionResponseType.DeferredMessageUpdate;
    } else {
      return;
    }

    // Send deferred response
    await this.post(
      `${this.baseUrl}/interactions/${interaction.id}/${interaction.token}/callback`,
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

  heartbeat({ heartbeat_interval }: GatewayHelloData) {
    setInterval(() => {
      this.ws.send(
        JSON.stringify({
          op: GatewayOpcodes.Heartbeat,
          d: null,
        })
      );
    }, heartbeat_interval);
  }
}
