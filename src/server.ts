import { validateOverlayData } from "./helpers";
import { HttpMethod, OverlayData } from "./types";
import { Server } from "socket.io";
import { env } from "./env";
import { logger } from "./logger";
import http from "./http";

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
  close: typeof http.Server.prototype.close;

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
