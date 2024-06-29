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
