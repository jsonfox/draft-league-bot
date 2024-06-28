import * as http from "http";
import { validateOverlayData } from "./helpers";
import { HttpMethod, OverlayData } from "./types";
import { Server } from "socket.io";
import "./env";
import { env } from "./env";
import { logger } from "./logger";

declare module "http" {
  interface IncomingMessage {
    body?: object;
    json(): Promise<object>;
  }
  interface ServerResponse {
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
  // Send 204 status if message is undefined
  if (message === undefined) {
    !this.statusCode && this.writeHead(204);
    this.end();
  }

  // Set status code to 200 if not set
  if (!this.statusCode) {
    this.writeHead(code);
  }

  // Send response
  this.end(message);
};

type AppRequest = http.IncomingMessage;
type AppResponse = http.ServerResponse<http.IncomingMessage>;

type RouteHandler = (req: AppRequest, res: AppResponse) => void;

/** Class for main application server */
export class App {
  server: http.Server;
  io: Server;
  origin = env.ORIGIN_URL;
  overlay: OverlayData;
  routes: {
    [path: string]: Partial<
      Record<
        HttpMethod,
        {
          isPublic: boolean;
          handler: RouteHandler;
        }
      >
    >;
  } = {};
  listen: typeof http.Server.prototype.listen;

  constructor() {
    // Create http server
    this.server = http.createServer(async (req, res) => {
      try {
        // CORS headers
        res.setHeader("Access-Control-Allow-Origin", this.origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        // Handle preflight requests
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.url === "/favicon.ico") {
          res.writeHead(204);
          res.end();
          return;
        }

        const path = req.url ?? "/";

        // Execute handler
        const method: HttpMethod =
          (req.method as HttpMethod | undefined) ?? "GET";
        const route = this.routes[path]?.[method];

        // Check if route exists
        if (!route) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        // Check if route is protected
        if (!route.isPublic && !req.headers.origin?.includes(this.origin)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        route.handler(req, res);

        // Acknowledge if response is not sent
        if (!res.writableEnded) {
          res.writeHead(200);
          res.end("Success");
          return;
        }
      } catch (err) {
        // Log error and send 500 status
        logger.error(err);
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    });

    this.listen = this.server.listen.bind(this.server);

    // Create socket.io server
    const io = new Server(this.server, {
      cors: {
        origin: this.origin,
        methods: ["GET", "POST"],
      },
    });

    this.io = io;

    // Initialize overlay data
    this.overlay = {
      blue: {
        score: 0,
        name: "",
        primaryColor: "",
        secondaryColor: "",
        logoUrl: "",
      },
      red: {
        score: 0,
        name: "",
        primaryColor: "",
        secondaryColor: "",
        logoUrl: "",
      },
      maxScore: 2,
      cameraControlsCover: false,
    };
  }

  updateOverlay(data: any) {
    validateOverlayData(data);
    this.overlay = data;
    this.io.of("/overlay").emit("overlay", this.overlay);
  }

  addRoute(
    method: HttpMethod,
    path: `/${string}`,
    handler: RouteHandler,
    isPublic: boolean
  ) {
    if (!this.routes[path]) {
      this.routes[path] = {};
    }
    this.routes[path][method] = {
      handler,
      isPublic,
    };
  }

  GET(path: `/${string}`, handler: RouteHandler, isPublic = false) {
    this.addRoute("GET", path, handler, isPublic);
  }

  POST(path: `/${string}`, handler: RouteHandler, isPublic = false) {
    this.addRoute("POST", path, handler, isPublic);
  }

  PUT(path: `/${string}`, handler: RouteHandler, isPublic = false) {
    this.addRoute("PUT", path, handler, isPublic);
  }

  PATCH(path: `/${string}`, handler: RouteHandler, isPublic = false) {
    this.addRoute("PATCH", path, handler, isPublic);
  }

  DELETE(path: `/${string}`, handler: RouteHandler, isPublic = false) {
    this.addRoute("DELETE", path, handler, isPublic);
  }
}
