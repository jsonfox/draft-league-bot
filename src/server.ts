import { HttpMethod, OverlayData } from "./utils/types";
import { Server } from "socket.io";
import { env } from "./utils/env";
import { logger } from "./utils/logger";
import http from "./utils/http";
import { v } from "./utils/validator";

type AppServerRequest = http.IncomingMessage;
type AppServerResponse = http.ServerResponse<http.IncomingMessage>;

type RouteHandler = (
  req: AppServerRequest,
  res: AppServerResponse
) => Promise<void>;

/** Class for main application server */
export class AppServer {
  server: http.Server;
  io: Server;
  origin = env.ORIGIN_URL;
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
  close: typeof http.Server.prototype.close;
  overlay: OverlayData = {
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

        // Ignore favicon requests
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
        if (!route.isPublic) {
          if (
            !(
              req.headers.origin?.includes(this.origin) ||
              req.headers.authorization === env.AUTH_TOKEN
            )
          ) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
          }
        }

        route.handler(req, res).then(() => {
          // Acknowledge if response is not sent
          if (!res.writableEnded) {
            res.writeHead(200);
            res.end("Success");
            return;
          }
        });
      } catch (err) {
        // Log error and send 500 status
        logger.error(err);
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    });

    this.listen = this.server.listen.bind(this.server);
    this.close = this.server.close.bind(this.server);

    // Create socket.io server
    const io = new Server(this.server, {
      cors: {
        origin: this.origin,
        methods: ["GET", "POST"],
      },
    });

    io.on("connection", (socket) => {
      if (
        socket.request.headers.origin !== this.origin &&
        socket.handshake.query.authorization !== env.AUTH_TOKEN
      ) {
        socket.disconnect(true);
      }
    });

    this.io = io;
  }

  updateOverlay(data: any) {
    const teamSchema = v.object({
      score: v.number().integer().min(0),
      name: v.string().isNotEmpty(),
      primaryColor: v.string().isNotEmpty(),
      secondaryColor: v.string().isNotEmpty(),
      logoUrl: v.string().isNotEmpty(),
    });

    const overlaySchema = v.object({
      maxScore: v.number().integer().min(1),
      blue: teamSchema,
      red: teamSchema,
      cameraControlsCover: v.boolean(),
    });

    try {
      const parsed = overlaySchema.parse(data);
      if (parsed.blue.name === parsed.red.name) {
        throw new Error("Team names cannot be the same");
      }
      this.overlay = parsed;
      this.io.of("/overlay").emit("overlay", this.overlay);
      logger.debug("Overlay updated");
      return true;
    } catch (err) {
      logger.debug(err);
      logger.warn("Received invalid overlay data");
      return false;
    }
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
