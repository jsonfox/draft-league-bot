import {
  ActivityType,
  GatewayReadyDispatchData,
  PresenceUpdateStatus,
} from "discord-api-types/v10";
import * as http from "http";

export type OverlayTeam = {
  score: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
};

// Having Record<string, any> allows for any additional properties to be added to the OverlayData object without having to update the type definition
export type OverlayData = {
  blue: OverlayTeam;
  red: OverlayTeam;
  maxScore: number;
  cameraControlsCover?: boolean;
} & Record<string, any>;

export type HttpRequestType = http.IncomingMessage;

export type HttpResponseType = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type DiscordPresenceUpdateData = {
  status: PresenceUpdateStatus;
  type: ActivityType;
  name: string;
};

export enum DiscordClientStatus {
  Idle = "idle",
  Connecting = "connecting",
  Resuming = "resuming",
  Ready = "ready",
}

export enum DiscordClientEvents {
  Error = "error",
  HeartbeatComplete = "heartbeat",
  Hello = "hello",
  Ready = "ready",
  Resumed = "resumed",
  Closed = "closed",
}

export type DiscordClientEventsMap = {
  [DiscordClientEvents.Error]: [payload: { error: Error }];
  [DiscordClientEvents.Ready]: [payload: { data: GatewayReadyDispatchData }];
  [DiscordClientEvents.Resumed]: [];
  [DiscordClientEvents.Hello]: [];
  [DiscordClientEvents.Closed]: [{ code: number }];
  [DiscordClientEvents.HeartbeatComplete]: [
    payload: { ackAt: number; heartbeatAt: number; latency: number },
  ];
};
