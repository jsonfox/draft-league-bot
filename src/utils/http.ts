import * as http from "http";
import { logger } from "./logger";

declare module "http" {
  interface IncomingMessage {
    body?: object;
    json(): Promise<object>;
  }
  interface ServerResponse {
    status(code: number): this;
    json(data: object): void;
    send(message?: string | Buffer, status?: number): void;
    sendStatus(code: number): void;
  }
}

// req
http.IncomingMessage.prototype.json = async function () {
  if (this.headers["content-type"] !== "application/json") {
    throw new Error("Content type is not application/json");
  }

  let data = await new Promise((resolve, reject) => {
    const body: Buffer[] = [];
    this.on("data", (chunk: any) => {
      if (chunk instanceof Uint8Array) chunk = Buffer.from(chunk);
      if (typeof chunk === "string") chunk = Buffer.from(chunk);
      if (!Buffer.isBuffer(chunk)) return;
      body.push(chunk);
    });

    this.on("end", () => {
      try {
        resolve(Buffer.concat(body as any).toString());
      } catch (error) {
        reject("Invalid JSON");
      }
    });
  });

  if (typeof data === "string") {
    data = JSON.parse(data);
  } else if (typeof data !== "object") {
    throw new Error("Invalid JSON");
  }
  this.body = data as object;
  return this.body;
};

// res
http.ServerResponse.prototype.status = function (code: number) {
  this.statusCode = code;
  return this;
};

http.ServerResponse.prototype.json = function (data: object) {
  try {
    const body = JSON.stringify(data);    // Set content type to application/json if body is not empty
    if (!!body) {
      const statusToUse = this.statusCode !== 200 ? this.statusCode : 200;
      this.writeHead(statusToUse, { "Content-Type": "application/json" });
    }
    // Send response
    this.end(body);
  } catch (err) {
    logger.error("Error sending JSON response:", err);
    this.writeHead(500);
    this.end("Internal server error");
  }
};

http.ServerResponse.prototype.send = function (
  message?: string | Buffer,
  code = 200
) {
  if (this.writableEnded) {
    logger.debug("Response has already been sent");
    return;
  }
  // Send 204 status if message is undefined
  if (message === undefined) {
    // If status was explicitly set, use it; otherwise default to 204
    const statusToUse = this.statusCode !== 200 ? this.statusCode : 204;
    this.writeHead(statusToUse);
    this.end();
    return;
  }

  // Use existing status code or default
  const statusToUse = this.statusCode !== 200 ? this.statusCode : code;
  this.writeHead(statusToUse);

  // Send response
  this.end(message);
};

http.ServerResponse.prototype.sendStatus = function (code: number) {
  const statusText = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable"
  }[code] || "Unknown Status";
  
  this.writeHead(code);
  this.end(statusText);
};

export default http;
