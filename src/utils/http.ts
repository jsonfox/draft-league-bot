import * as http from "http";
import { logger } from "./logger";

declare module "http" {
  interface IncomingMessage {
    body?: object;
    json(): Promise<object>;
  }
  interface ServerResponse {
    json(data: object): void;
    send(message?: string | Buffer, status?: number): void;
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
http.ServerResponse.prototype.json = function (data: object) {
  try {
    const body = JSON.stringify(data);
    // Set content type to application/json if body is not empty
    if (!!body) {
      this.writeHead(200, { "Content-Type": "application/json" });
    }
    // Send response
    this.send(body);
  } catch (err) {
    logger.error("Error sending JSON response:", err);
    this.writeHead(500);
    this.send("Internal server error");
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
    if (!this.statusCode) {
      this.writeHead(204);
    }
    this.end();
  }

  // Set status code to 200 if not set
  if (!this.statusCode) {
    this.writeHead(code);
  }

  // Send response
  this.end(message);
};

export default http;
