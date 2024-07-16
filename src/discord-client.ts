import { Data, EventEmitter, once, WebSocket } from "ws";
import { env } from "./utils/env";
import {
  GatewayIntentBits,
  InteractionResponseType,
  MessageFlags,
  GatewayDispatchEvents,
  PresenceUpdateStatus,
  ActivityType,
  GatewayOpcodes,
  GatewayReceivePayload,
  InteractionType,
  GatewayInteractionCreateDispatchData,
  GatewayVersion,
  GatewayCloseCodes,
  GatewayUpdatePresence,
  GatewaySendPayload,
  GatewayIdentifyData,
} from "discord-api-types/v10";
import { logger } from "./utils/logger";
import {
  DiscordClientStatus,
  DiscordPresenceUpdateData,
  DiscordClientEvents,
  DiscordClientEventsMap,
} from "./utils/types";
import { sleep, resolveBitfield } from "./utils/helpers";
import { AsyncQueue } from "@sapphire/async-queue";
import { Collection } from "./utils/collection";

const ApiVersion = "v10";

enum CloseCodes {
  Normal = 1_000,
  Resuming = 4_200,
}

const ImportantGatewayOpcodes = new Set([
  GatewayOpcodes.Heartbeat,
  GatewayOpcodes.Identify,
  GatewayOpcodes.Resume,
]);

const KnownNetworkErrorCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

enum GatewayTimeouts {
  handshake = 30_000,
  hello = 60_000,
  ready = 15_000,
}

export enum ClientRecovery {
  Resume,
  Reconnect,
}

type ClientCloseOptions = {
  code?: number;
  reason?: string;
  recover?: ClientRecovery;
};

type SessionInfo = {
  id: string;
  sequence: number;
  resumeUrl: string;
};

type RateLimitState = {
  resetAt: number;
  sent: number;
};

const getInitialRateLimitState = (): RateLimitState => ({
  resetAt: Date.now() + 60_000,
  sent: 0,
});

const ReconnectCodes = new Set([
  CloseCodes.Normal,
  GatewayCloseCodes.NotAuthenticated,
  GatewayCloseCodes.AlreadyAuthenticated,
  GatewayCloseCodes.InvalidSeq,
  GatewayCloseCodes.RateLimited,
]);

const ResumeCodes = new Set([
  GatewayCloseCodes.UnknownError,
  GatewayCloseCodes.UnknownOpcode,
  GatewayCloseCodes.DecodeError,
  GatewayCloseCodes.SessionTimedOut,
]);

export class DiscordClient extends EventEmitter<DiscordClientEventsMap> {
  /** https://discord.com/developers/docs/topics/gateway#connecting */
  private readonly gatewayUrl = `wss://gateway.discord.gg/`;

  private readonly gatewayParams = `v=${GatewayVersion}&encoding=json`;

  /** Base url for Discord API */
  private readonly baseUrl = `https://discord.com/api/${ApiVersion}`;

  /** Base url for forwarded interactions */
  private readonly forwardUrl = env.ORIGIN_URL + "/api/discord/interactions";

  /** Map of interaction messages to prevent rate limiting */
  private readonly interactionMessages: Collection<string, number> =
    new Collection();

  /** WebSocket connection to Discord gateway */
  private ws: WebSocket | null = null;

  /** Session data for resuming connections */
  private session: SessionInfo | null = null;

  private reconnectAttempts = 0;

  private replayedEvents = 0;

  private initialHeartbeatTimeoutController: AbortController | null = null;

  private isAck = false;

  private lastHeartbeatAt = -1;

  /** Indicates whether the client has resolved its original connect() call */
  private initialConnectResolved = false;

  /** Indicates if client failed to connect to the ws url */
  private failedToConnectDueToNetworkError = false;

  private heartbeatInterval: NodeJS.Timeout | null = null;

  private rateLimitState = getInitialRateLimitState();

  private readonly sendQueue = new AsyncQueue();

  private readonly timeoutAbortControllers = new Collection<
    DiscordClientEvents,
    AbortController
  >();

  #status: DiscordClientStatus = DiscordClientStatus.Idle;

  get status() {
    return this.#status;
  }

  constructor() {
    super();
  }

  private async waitForEvent(
    event: DiscordClientEvents,
    timeoutDuration?: number | null
  ): Promise<{ ok: boolean }> {
    logger.debug(
      `Waiting for event ${event} ${
        timeoutDuration ? `for ${timeoutDuration}ms` : "indefinitely"
      }`
    );
    const timeoutController = new AbortController();
    const timeout = timeoutDuration
      ? setTimeout(() => timeoutController.abort(), timeoutDuration).unref()
      : null;

    this.timeoutAbortControllers.set(event, timeoutController);

    const closeController = new AbortController();

    try {
      const closed = await Promise.race<boolean>([
        once(this, event, { signal: timeoutController.signal }).then(
          () => false
        ),
        once(this, DiscordClientEvents.Closed, {
          signal: closeController.signal,
        }).then(() => true),
      ]);

      return { ok: !closed };
    } catch {
      logger.debug(
        "Something timed out or went wrong while waiting for an event"
      );

      void this.close({
        code: CloseCodes.Normal,
        reason: "Something timed out or went wrong while waiting for an event",
        recover: ClientRecovery.Reconnect,
      });

      return { ok: false };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }

      this.timeoutAbortControllers.delete(event);

      if (!closeController.signal.aborted) {
        closeController.abort();
      }
    }
  }

  // Start event handlers
  private async onMessage(data: Data) {
    if (typeof data !== "string") return;

    let payload: GatewayReceivePayload;
    try {
      payload = JSON.parse(data);
    } catch (err) {
      return;
    }

    switch (payload.op) {
      case GatewayOpcodes.Dispatch: {
        if (this.#status === DiscordClientStatus.Resuming) {
          this.replayedEvents++;
        }

        switch (payload.t) {
          case GatewayDispatchEvents.Ready: {
            this.#status = DiscordClientStatus.Ready;
            this.reconnectAttempts = 0;
            this.session = {
              id: payload.d.session_id,
              sequence: payload.s,
              resumeUrl: payload.d.resume_gateway_url,
            };
            logger.ready("Logged in as", payload.d.user.username);
            this.emit(DiscordClientEvents.Ready, { data: payload.d });
            break;
          }

          case GatewayDispatchEvents.Resumed: {
            this.#status = DiscordClientStatus.Ready;
            logger.ready(`Resumed and replayed ${this.replayedEvents} events`);
            this.emit(DiscordClientEvents.Resumed);
            this.replayedEvents = 0;
            break;
          }

          case GatewayDispatchEvents.InteractionCreate: {
            const interaction =
              payload.d as GatewayInteractionCreateDispatchData;

            if (interaction.application_id !== env.APPLICATION_ID) return;
            logger.debug("Received interaction", interaction.id);

            this.forwardInteraction(interaction);
          }

          default: {
            break;
          }
        }

        if (this.session) {
          if (payload.s > this.session.sequence) {
            this.session.sequence = payload.s;
          }
        } else {
          logger.warn(
            `Received a ${payload.t} event but no session is available. Full reconnect required to restore session state.`
          );
        }
        break;
      }

      case GatewayOpcodes.Heartbeat: {
        await this.heartbeat(true);
        break;
      }

      case GatewayOpcodes.Reconnect: {
        await this.close({
          reason: "Told to reconnect by Discord",
          recover: ClientRecovery.Resume,
        });
        break;
      }

      case GatewayOpcodes.InvalidSession: {
        if (payload.d && this.session) {
          logger.warn(
            `Invalid session; will attempt to resume: ${payload.d.toString()}`
          );
          await this.resume(this.session);
        } else {
          logger.warn("Invalid session; will attempt to reconnect");
          await this.close({
            reason: "Invalid session",
            recover: ClientRecovery.Reconnect,
          });
        }

        break;
      }

      case GatewayOpcodes.Hello: {
        this.emit(DiscordClientEvents.Hello);
        const jitter = Math.random();
        const firstWait = Math.floor(payload.d.heartbeat_interval * jitter);
        logger.debug(
          `Preparing first heartbeat of the connection with a jitter of ${jitter}; waiting ${firstWait}ms`
        );

        try {
          const controller = new AbortController();
          this.initialHeartbeatTimeoutController = controller;
          await sleep(firstWait, undefined, { signal: controller.signal });
        } catch {
          logger.debug(
            "Cancelled initial heartbeat due to #close being called"
          );
          return;
        } finally {
          this.initialHeartbeatTimeoutController = null;
        }

        await this.heartbeat(true);

        logger.debug(
          `First heartbeat sent, starting to beat every ${payload.d.heartbeat_interval}ms`
        );

        this.heartbeatInterval = setInterval(
          () => void this.heartbeat(),
          payload.d.heartbeat_interval
        );
        break;
      }

      case GatewayOpcodes.HeartbeatAck: {
        this.isAck = true;

        const ackAt = Date.now();
        this.emit(DiscordClientEvents.HeartbeatComplete, {
          ackAt,
          heartbeatAt: this.lastHeartbeatAt,
          latency: ackAt - this.lastHeartbeatAt,
        });

        break;
      }
    }
  }

  private onError(error: Error) {
    if ("code" in error && KnownNetworkErrorCodes.has(error.code as string)) {
      logger.error("Failed to connect to the gateway due to a network error");
      this.failedToConnectDueToNetworkError = true;
    } else {
      logger.error(
        "An error occurred in the WebSocket connection",
        error.stack ?? error.message
      );
    }
    this.emit(DiscordClientEvents.Error, { error });
  }

  private onClose(code: number) {
    this.emit(DiscordClientEvents.Closed, { code });

    const closeOptions: ClientCloseOptions = {
      code,
      recover: ResumeCodes.has(code)
        ? ClientRecovery.Resume
        : ReconnectCodes.has(code)
        ? ClientRecovery.Reconnect
        : undefined,
    };

    switch (code) {
      case CloseCodes.Resuming:
        return;
      case CloseCodes.Normal:
        closeOptions.reason = "Disconnected by Discord";
        return this.close(closeOptions);
      case GatewayCloseCodes.UnknownError:
      case GatewayCloseCodes.UnknownOpcode:
      case GatewayCloseCodes.DecodeError:
      case GatewayCloseCodes.NotAuthenticated:
      case GatewayCloseCodes.AuthenticationFailed:
      case GatewayCloseCodes.AlreadyAuthenticated:
      case GatewayCloseCodes.InvalidSeq:
      case GatewayCloseCodes.RateLimited:
      case GatewayCloseCodes.SessionTimedOut:
      case GatewayCloseCodes.InvalidShard:
      case GatewayCloseCodes.ShardingRequired:
      case GatewayCloseCodes.InvalidAPIVersion:
      case GatewayCloseCodes.InvalidIntents:
      case GatewayCloseCodes.DisallowedIntents:
        logger.error(
          `The gateway closed with a known error code ${code}\nSee https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes for more information`
        );
        return this.close(closeOptions);
      default:
        logger.error(
          `The gateway closed with an unexpected code ${code}, attempting to ${
            this.failedToConnectDueToNetworkError ? "reconnect" : "resume"
          }.`
        );
        return this.close({
          code,
          recover: this.failedToConnectDueToNetworkError
            ? ClientRecovery.Reconnect
            : ClientRecovery.Resume,
        });
    }
  }
  // End event handlers

  /** Internal ws client intialization */
  private async connect(resume = false) {
    if (this.#status !== DiscordClientStatus.Idle) {
      throw new Error("Client must be idle to connect");
    }

    if (this.initialConnectResolved) {
      this.reconnectAttempts++;
    }

    if (this.reconnectAttempts > 5) {
      logger.error("Exceeded maximum number of failed reconnect attempts");
      return;
    }

    logger.init("Connecting to Discord gateway");

    const url = `${this.session?.resumeUrl ?? this.gatewayUrl}?${
      this.gatewayParams
    }`;

    const ws = new WebSocket(url, {
      handshakeTimeout: GatewayTimeouts.handshake,
    });

    ws.onmessage = ({ data }) => {
      void this.onMessage(data);
    };

    ws.onerror = ({ error }) => {
      this.onError(error);
    };

    ws.onclose = ({ code }) => {
      void this.onClose(code);
    };

    ws.onopen = () => {
      this.rateLimitState = getInitialRateLimitState();
    };

    this.ws = ws;

    this.#status = DiscordClientStatus.Connecting;

    const { ok } = await this.waitForEvent(
      DiscordClientEvents.Hello,
      GatewayTimeouts.hello
    );
    if (!ok) {
      return;
    }

    if (resume && this.session) {
      await this.resume(this.session);
    } else {
      await this.identify();
    }
  }

  async open() {
    const controller = new AbortController();
    let promise;

    if (!this.initialConnectResolved) {
      promise = Promise.race([
        once(this, DiscordClientEvents.Ready, {
          signal: controller.signal,
        }),
        once(this, DiscordClientEvents.Resumed, {
          signal: controller.signal,
        }),
      ]);
    }

    void this.connect();

    try {
      await promise;
    } catch ({ error }: any) {
      throw error;
    } finally {
      controller.abort();
    }

    this.initialConnectResolved = true;
  }

  async close(options: ClientCloseOptions = {}) {
    if (this.#status === DiscordClientStatus.Idle) {
      logger.warn("Cannot close an idle client");
      return;
    }

    if (!options.code) {
      options.code =
        options.recover === ClientRecovery.Resume
          ? CloseCodes.Resuming
          : CloseCodes.Normal;
    }

    logger.warn(
      `Closing the client with code ${options.code} for reason: ${
        options.reason ?? "none"
      }`
    );

    // Reset state
    this.isAck = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.initialHeartbeatTimeoutController) {
      this.initialHeartbeatTimeoutController.abort();
      this.initialHeartbeatTimeoutController = null;
    }

    this.lastHeartbeatAt = -1;

    for (const controller of this.timeoutAbortControllers.values()) {
      controller.abort();
    }

    this.timeoutAbortControllers.clear();

    this.failedToConnectDueToNetworkError = false;

    // Clear session state if applicable
    if (options.recover !== ClientRecovery.Resume) {
      this.session = null;
    }

    if (this.ws) {
      // Remove event listeners
      this.ws.onmessage = null;
      this.ws.onclose = null;

      // Close the connection if it's open
      if (this.ws.readyState === WebSocket.OPEN) {
        let outerResolve: () => void;
        const promise = new Promise<void>((resolve) => {
          outerResolve = resolve;
        });

        this.ws.onclose = outerResolve!;

        this.ws.close(options.code, options.reason);

        await promise;
        this.emit(DiscordClientEvents.Closed, { code: options.code });
      }

      this.ws.onerror = null;
    } else {
      logger.warn("No WebSocket connection to close");
    }

    this.#status = DiscordClientStatus.Idle;

    if (options.recover !== undefined) {
      await sleep(500);
      return this.connect();
    }
  }

  private async resume(session: SessionInfo) {
    logger.init("Resuming session", session.id);

    this.#status = DiscordClientStatus.Resuming;
    this.replayedEvents = 0;
    return this.send({
      op: GatewayOpcodes.Resume,
      // eslint-disable-next-line id-length
      d: {
        token: env.BOT_TOKEN,
        seq: session.sequence,
        session_id: session.id,
      },
    });
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
    switch (interaction.type) {
      case InteractionType.ApplicationCommand: {
        forwardPath = "/command";
        responseType = InteractionResponseType.DeferredChannelMessageWithSource;
        break;
      }

      case InteractionType.MessageComponent: {
        // Check for component rate limit (3 seconds)
        if (this.interactionMessages.has(interaction.message.id)) {
          await sendErrorMessage(
            "Please wait a couple seconds before using another button on this message."
          );
          logger.debug("Rate limited button interaction");
          return;
        }

        // Add 3 second timeout to clear data from map
        this.interactionMessages.set(interaction.message.id, Date.now(), 3000);

        forwardPath = "/component";
        responseType = InteractionResponseType.DeferredMessageUpdate;
        break;
      }

      default: {
        return;
      }
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

    logger.debug(
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
          logger.error(error.stack ?? error.message);
        }
      }
    }
  }

  /** Send message to Discord gateway */
  private async send(payload: GatewaySendPayload): Promise<void> {
    if (!this.ws) {
      logger.error("Cannot send payload; no WebSocket connection");
      return;
    }

    // If the payload is an important one, send it immediately
    if (ImportantGatewayOpcodes.has(payload.op)) {
      this.ws.send(JSON.stringify(payload));
      return;
    }

    // If the client is not ready, wait for it to be ready
    if (
      this.#status !== DiscordClientStatus.Ready &&
      !ImportantGatewayOpcodes.has(payload.op)
    ) {
      logger.warn(
        "Tried to send a non-critical payload before the shard was ready, waiting"
      );

      try {
        await once(this, DiscordClientEvents.Ready);
      } catch {
        return this.send(payload);
      }
    }

    await this.sendQueue.wait();

    const now = Date.now();
    if (now >= this.rateLimitState.resetAt) {
      this.rateLimitState = getInitialRateLimitState();
    }

    if (this.rateLimitState.sent + 1 >= 115) {
      const sleepFor =
        this.rateLimitState.resetAt - now + Math.random() * 1_500;

      logger.warn(
        `Was about to hit the send rate limit, sleeping for ${sleepFor}ms`
      );
      const controller = new AbortController();

      // Cancel the wait if the connection is closed
      const interrupted = await Promise.race([
        sleep(sleepFor).then(() => false),
        once(this, DiscordClientEvents.Closed, {
          signal: controller.signal,
        }).then(() => true),
      ]);

      if (interrupted) {
        logger.warn(
          "Connection closed while waiting for the send rate limit to reset, re-queueing payload"
        );
        this.sendQueue.shift();
        return this.send(payload);
      }

      // This is so the listener from the `once` call is removed
      controller.abort();
    }

    this.rateLimitState.sent++;

    this.sendQueue.shift();
    this.ws.send(JSON.stringify(payload));
  }

  /** https://discord.com/developers/docs/topics/gateway#identifying */
  private async identify(payload?: GatewayIdentifyData) {
    // Payload for initial handshake
    const data: GatewayIdentifyData = payload ?? {
      token: env.BOT_TOKEN,
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
    };

    logger.debug("Waiting for identify");

    const controller = new AbortController();
    const closeHandler = () => {
      controller.abort();
    };

    this.on(DiscordClientEvents.Closed, closeHandler);

    try {
      await sleep(5_000, undefined, { signal: controller.signal });
    } catch {
      if (controller.signal.aborted) {
        logger.warn(
          "Was waiting for an identify, but the client closed in the meantime"
        );
        return;
      }

      await this.close({
        recover: ClientRecovery.Resume,
      });
    } finally {
      this.off(DiscordClientEvents.Closed, closeHandler);
    }

    await this.send({
      op: GatewayOpcodes.Identify,
      d: data,
    });

    await this.waitForEvent(DiscordClientEvents.Ready, GatewayTimeouts.ready);
  }

  /** https://discord.com/developers/docs/topics/gateway#sending-heartbeats */
  private async heartbeat(requested = false) {
    if (!this.isAck && !requested) {
      return this.close({
        reason: "Zombie connection",
        recover: ClientRecovery.Resume,
      });
    }

    await this.send({
      op: GatewayOpcodes.Heartbeat,
      d: this.session?.sequence ?? null,
    });

    this.lastHeartbeatAt = Date.now();
    this.isAck = false;
  }

  /** Update Discord client presence */
  updatePresence({ name, type, status }: DiscordPresenceUpdateData) {
    this.send({
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
    } as GatewayUpdatePresence);
  }
}
