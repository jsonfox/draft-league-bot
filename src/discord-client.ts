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
  GatewayUpdatePresence,
} from "discord-api-types/v10";
import { logger } from "./utils/logger";
import { DiscordStatusUpdateData } from "./utils/types";

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
  currentReconnectAttempts = 0;

  constructor(cb?: () => void) {
    /** https://discord.com/developers/docs/topics/gateway#connecting */
    const ws = new WebSocket(this.gatewayUrl);
    this.ws = this.initialize(ws, cb);
  }

  /** Returns new client instance */
  static start(cb?: () => void) {
    return new DiscordClient(cb);
  }

  private sleep(ms: number, cb?: () => any) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(cb?.());
      }, ms);
    });
  }

  /** Set up event listeners for WebSocket connection */
  private initialize(ws: WebSocket, cb?: () => void) {
    // Run initialize function after connection is open
    ws.onopen = () => {
      cb?.();
    };

    ws.onerror = (err) => {
      logger.error("WebSocket error:", err.message);
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

      if (this.currentReconnectAttempts >= 5) {
        logger.error("Exceeded maximum number of failed reconnect attempts");
        return;
      }

      // Reconnect after delay
      const reconnectDelay =
        1000 + 9000 * +(code === GatewayCloseCodes.RateLimited);
      this.sleep(reconnectDelay, () => {
        this.currentReconnectAttempts++;
        if (this.shouldStartNewSession.includes(code)) {
          this.restart();
        } else {
          this.resume();
        }
      });
    };

    /** https://discord.com/developers/docs/topics/gateway#gateway-events */
    ws.onmessage = ({ data }) => {
      data = data.toString();
      let payload: GatewayReceivePayload;
      try {
        payload = JSON.parse(data);
      } catch (err) {
        return;
      }
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
          this.currentReconnectAttempts = 0;
          const { user, session_id, resume_gateway_url } = d;
          this.sessionId = session_id;
          this.resumeGatewayUrl = resume_gateway_url;
          logger.ready("Logged in as", user.username);
          break;
        }
        case GatewayDispatchEvents.InteractionCreate: {
          const interaction = d as GatewayInteractionCreateDispatchData;

          if (interaction?.application_id !== env.APPLICATION_ID) return;
          logger.debug("Received interaction", interaction.id);

          this.forwardInteraction(interaction);
          break;
        }
        case GatewayDispatchEvents.Resumed: {
          logger.info("Resumed session");
          break;
        }
        default:
          break;
      }
    };

    // Clear session data
    this.sessionId = undefined;
    this.resumeGatewayUrl = undefined;
    this.lastSequenceNumber = undefined;
    return ws;
  }

  /** Disconnect from Discord gateway */
  close() {
    if (!this.ws.CLOSED) {
      logger.info("Closing connection to Discord gateway");
      this.ws.close(1000);
    }
  }

  /** Create new Discord gateway session */
  restart(cb?: () => void) {
    logger.init("Restarting Discord gateway session");
    this.close();
    const ws = new WebSocket(this.gatewayUrl);
    this.ws = this.initialize(ws, cb);
  }

  /** Resume Discord gateway session with session data */
  resume(cb?: () => void) {
    logger.init("Attempting to resume Discord gateway session");
    if (!(this.resumeGatewayUrl && this.sessionId && this.lastSequenceNumber)) {
      logger.error(
        "Cannot resume session without session data. Attempting to start a new session."
      );
      this.restart(cb);
      return;
    }
    const ws = new WebSocket(this.resumeGatewayUrl);
    const initCb = () => {
      cb?.();
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
    this.ws = this.initialize(ws, initCb);
  }

  /** Reusable fetch init since all fetch requests in this class use the same init */
  private post(url: string, data: unknown) {
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
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content,
            flags: MessageFlags.Ephemeral,
          },
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
        logger.debug("Rate limited button interaction");
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
        type: responseType,
      }
    );

    // Forward interaction to main app
    const res = await this.post(this.forwardUrl + forwardPath, interaction);

    logger.info(
      "Forwarded interaction",
      interaction.id,
      "with response code",
      res.status,
      res.statusText
    );

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
              name: "NEDL",
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

  /** Update Discord client status */
  updatePresence({ name, type, status }: DiscordStatusUpdateData) {
    this.ws.send(
      JSON.stringify({
        op: GatewayOpcodes.PresenceUpdate,
        d: {
          activities: [
            {
              name: name,
              type: type,
            },
          ],
          since: Date.now(),
          status: status,
          afk: false,
        },
      } as GatewayUpdatePresence)
    );
  }
}
