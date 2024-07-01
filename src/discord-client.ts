import { WebSocket } from "ws";
import { env } from "./utils/env";
import {
  GatewayIntentBits,
  InteractionResponseType,
  MessageFlags,
  GatewayDispatchEvents,
  PresenceUpdateStatus,
  ActivityType,
  GatewayOpcodes,
  GatewayIdentify,
  GatewayReceivePayload,
  InteractionType,
  GatewayInteractionCreateDispatchData,
  GatewayHelloData,
  GatewayVersion,
  GatewayCloseCodes,
} from "discord-api-types/v10";
import { logger } from "./utils/logger";

const resolveBitfield = (bits: number[]) => {
  /* tslint:disable-next-line no-bitwise */
  return bits.reduce((acc, bit) => acc | bit, 0);
};

const ApiVersion = "v10";

export class DiscordClient {
  /** Discord bot token */
  readonly token = env.BOT_TOKEN;
  /** Discord application id */
  readonly applicationId = env.APPLICATION_ID;
  /** https://discord.com/developers/docs/topics/gateway#connecting */
  readonly gatewayUrl = `wss://gateway.discord.gg/?v=${GatewayVersion}&encoding=json`;
  /** Base url for Discord API */
  readonly baseUrl = `https://discord.com/api/${ApiVersion}`;
  /** Base url for forwarded interactions */
  readonly forwardUrl = env.ORIGIN_URL + "/api/discord/interactions";
  /** Map of interaction messages to prevent rate limiting */
  readonly interactionMessages: Map<string, number> = new Map();
  /** WebSocket connection to Discord gateway */
  ws: WebSocket;
  // For resuming connections
  sessionId?: string;
  resumeGatewayUrl?: string;
  lastSequenceNumber?: number;
  /** https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes */
  shouldStartNewSession = [
    GatewayCloseCodes.InvalidSeq,
    GatewayCloseCodes.SessionTimedOut,
  ];
  shouldNotReconnect = [
    GatewayCloseCodes.AuthenticationFailed,
    GatewayCloseCodes.InvalidShard,
    GatewayCloseCodes.ShardingRequired,
    GatewayCloseCodes.InvalidAPIVersion,
    GatewayCloseCodes.InvalidIntents,
    GatewayCloseCodes.DisallowedIntents,
  ];

  constructor(cb?: () => void) {
    /** https://discord.com/developers/docs/topics/gateway#connecting */
    const ws = new WebSocket(this.gatewayUrl);
    this.ws = this.addSocketListeners(ws, cb);
  }

  private addSocketListeners(ws: WebSocket, cb?: () => void) {
    // Run initialize function after connection is open
    ws.onopen = () => {
      cb?.();
    };

    // Handle disconnects based on close code
    ws.onclose = ({ code }) => {
      logger.error("Disconnected from Discord gateway with code", code);

      if (this.shouldNotReconnect.includes(code)) {
        logger.error(
          "The close code indicates that the socket should not attempt to reconnect"
        );
        return;
      }

      if (!this.ws.CLOSED) {
        this.ws.close();
      }

      let url = this.gatewayUrl;
      if (
        this.shouldStartNewSession.includes(code) &&
        this.sessionId &&
        this.lastSequenceNumber
      ) {
        url = this.resumeGatewayUrl ?? url;
        // Send resume payload
        cb = () => {
          ws.send(
            JSON.stringify({
              op: GatewayOpcodes.Resume,
              d: {
                token: this.token,
                session_id: this.sessionId,
                seq: this.lastSequenceNumber,
              },
            })
          );
        };
      }

      // Create new socket connection
      const newSocket = this.addSocketListeners(new WebSocket(url), cb);
      // Clear session data
      this.sessionId = undefined;
      this.resumeGatewayUrl = undefined;
      this.lastSequenceNumber = undefined;
      this.ws = newSocket;
    };

    /** https://discord.com/developers/docs/topics/gateway#gateway-events */
    ws.onmessage = (data: any) => {
      const payload = JSON.parse(data);
      const { t, op, d, s } = payload as GatewayReceivePayload;

      // Handle gateway opcodes
      switch (op) {
        case GatewayOpcodes.Dispatch:
          this.lastSequenceNumber = s;
          break;
        case GatewayOpcodes.Heartbeat:
          this.ws.send(
            JSON.stringify({
              op: GatewayOpcodes.Heartbeat,
              d: null,
            })
          );
          break;
        case GatewayOpcodes.InvalidSession:
          this.identify();
          break;
        /** https://discord.com/developers/docs/topics/gateway#hello-event */
        case GatewayOpcodes.Hello:
          this.identify();
          this.heartbeat(d as GatewayHelloData);
          break;
        default:
          break;
      }

      // Handle gateway dispatch events
      switch (t) {
        /** https://discord.com/developers/docs/topics/gateway#ready-event */
        case GatewayDispatchEvents.Ready: {
          const { user, session_id, resume_gateway_url } = d;
          this.sessionId = session_id;
          this.resumeGatewayUrl = resume_gateway_url;
          logger.ready("Logged in as", user.username);
          break;
        }
        case GatewayDispatchEvents.InteractionCreate: {
          const interaction = d as GatewayInteractionCreateDispatchData;

          if (interaction?.application_id !== env.APPLICATION_ID) return;
          logger.info("Received interaction", interaction.id);

          this.forwardInteraction(interaction);
          break;
        }
        default:
          break;
      }
    };

    return ws;
  }

  /** Returns new client instance */
  static start(cb?: () => void) {
    return new DiscordClient(cb);
  }

  close() {
    if (!this.ws.CLOSED) this.ws.close();
  }

  restart() {
    this.close();
    const ws = new WebSocket(this.gatewayUrl);
    this.ws = this.addSocketListeners(ws);
  }

  /** Reusable fetch init since all fetch requests in this class use the same init */
  private post(url: string, data: any) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bot " + env.BOT_TOKEN,
      },
      body: JSON.stringify(data),
    });
  }

  /** Fowards Discord interaction data to main draft league app */
  private async forwardInteraction(
    interaction: GatewayInteractionCreateDispatchData
  ) {
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
        logger.info("Rate limited button interaction");
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

    logger.info("Forwarded response status:", res.status, res.statusText);

    if (!res.ok) {
      try {
        await sendErrorMessage("Failed to process interaction");
      } catch (err) {
        const error = err as Error;
        if (!error.message.includes("acknowledged")) {
          logger.error(error.message);
        }
      }
    }
  }

  /** https://discord.com/developers/docs/topics/gateway#identifying */
  private identify(payload?: GatewayIdentify) {
    // Payload for initial handshake
    const loginPayload: GatewayIdentify = payload ?? {
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

  /** https://discord.com/developers/docs/topics/gateway#sending-heartbeats */
  private heartbeat({ heartbeat_interval }: GatewayHelloData) {
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
