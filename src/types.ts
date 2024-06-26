import * as http from "http";

export type OverlayTeam = {
  score: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
};

export type OverlayData = {
  blue: OverlayTeam;
  red: OverlayTeam;
  maxScore: 1 | 3 | 5;
};

export type HttpRequestType = http.IncomingMessage;

export type HttpResponseType = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";