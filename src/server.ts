import { HttpMethod, OverlayData } from "./utils/types";
import { MiddlewareStack, Middleware, RouteHandler, cors, bodyParser, rateLimit } from "./utils/middleware";
import { Server } from "socket.io";
import { env } from "./utils/env";
import { logger } from "./utils/logger";
import http from "./utils/http";
import { v } from "./utils/validator";

type AppServerRequest = http.IncomingMessage;
type AppServerResponse = http.ServerResponse<http.IncomingMessage>;

/** Class for main application server */
export class AppServer {
  server: http.Server;
  io: Server;
  origin = env.ORIGIN_URL;
  private globalMiddleware = new MiddlewareStack();
  routes: {
    [path: string]: Partial<
      Record<
        HttpMethod,
        {
          isPublic: boolean;
          handler: RouteHandler;
          middleware?: MiddlewareStack;
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
    // Setup global middleware
    this.globalMiddleware.use(cors(this.origin));
    this.globalMiddleware.use(bodyParser);
    this.globalMiddleware.use(rateLimit(60000, 100)); // 100 requests per minute

    // Create http server
    this.server = http.createServer(async (req, res) => {
      try {
        // Ignore favicon requests
        if (req.url === "/favicon.ico") {
          res.sendStatus(204);
          return;
        }        const path = req.url ?? "/";

        // Execute handler
        const method: HttpMethod =
          (req.method as HttpMethod | undefined) ?? "GET";
        const route = this.routes[path]?.[method];

        // Check if route exists
        if (!route) {
          res.sendStatus(404);
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
            res.sendStatus(403);
            return;
          }
        }        // Execute middleware stack and handler
        const middlewareStack = route.middleware || new MiddlewareStack();
        await this.globalMiddleware.execute(req, res, async () => {
          await middlewareStack.execute(req, res, route.handler);
        });// Acknowledge if response is not sent
        // Note: This should rarely happen if handlers properly send responses
        // if (!res.writableEnded) {
        //   console.log("DEBUG: Server catch-all sending 200 status because response not ended");
        //   console.log("DEBUG: Current statusCode:", res.statusCode);
        //   res.sendStatus(200);
        // }
      } catch (err) {
        // Log error and send 500 status
        logger.error("Server error:", err);
        if (!res.writableEnded) {
          res.sendStatus(500);
        }
      }
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

  /**
   * Add global middleware to the server
   */
  use(middleware: Middleware) {
    this.globalMiddleware.use(middleware);
  }

  updateOverlay(data: any) {
    const teamSchema = v.object({
      score: v.number().integer().min(0),
      name: v.string().isNotEmpty(),
      primaryColor: v.string().isNotEmpty(),
      secondaryColor: v.string().isNotEmpty(),
      logoUrl: v.string().isNotEmpty(),
    });    const overlaySchema = v.object({
      maxScore: v.number().integer().min(1),
      blue: teamSchema,
      red: teamSchema,
      cameraControlsCover: v.boolean().optional(),
    });try {
      const parsed = overlaySchema.parse(data);
      if (parsed.blue.name === parsed.red.name) {
        throw new Error("Team names cannot be the same");
      }
      if (parsed.blue.score > parsed.maxScore || parsed.red.score > parsed.maxScore) {
        throw new Error("Team score cannot exceed max score");
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
    isPublic: boolean,
    middleware?: MiddlewareStack
  ) {
    if (!this.routes[path]) {
      this.routes[path] = {};
    }
    this.routes[path][method] = {
      handler,
      isPublic,
      middleware,
    };
  }

  GET(path: `/${string}`, handler: RouteHandler, isPublic = false, middleware?: MiddlewareStack) {
    this.addRoute("GET", path, handler, isPublic, middleware);
  }

  POST(path: `/${string}`, handler: RouteHandler, isPublic = false, middleware?: MiddlewareStack) {
    this.addRoute("POST", path, handler, isPublic, middleware);
  }

  PUT(path: `/${string}`, handler: RouteHandler, isPublic = false, middleware?: MiddlewareStack) {
    this.addRoute("PUT", path, handler, isPublic, middleware);
  }

  PATCH(path: `/${string}`, handler: RouteHandler, isPublic = false, middleware?: MiddlewareStack) {
    this.addRoute("PATCH", path, handler, isPublic, middleware);
  }

  DELETE(path: `/${string}`, handler: RouteHandler, isPublic = false, middleware?: MiddlewareStack) {
    this.addRoute("DELETE", path, handler, isPublic, middleware);
  }
}
