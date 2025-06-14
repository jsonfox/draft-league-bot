import { HttpMethod, OverlayData } from "./utils/types";
import {
  MiddlewareStack,
  Middleware,
  RouteHandler,
  cors,
  bodyParser,
  rateLimit,
} from "./utils/middleware";
import { Server } from "socket.io";
import { env } from "./utils/env";
import { logger } from "./utils/logger";
import http from "./utils/http";
import { v } from "./utils/validator";

/** Route access level configuration */
export enum RouteAccess {
  /** Public route - no authentication required */
  Public = "public",
  /** Protected route - requires AUTH_TOKEN in authorization header */
  Protected = "protected",
  /** Admin route - requires both AUTH_TOKEN and additional validation */
  Admin = "admin",
}

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
          access: RouteAccess;
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
        }
        const path = req.url ?? "/";

        // Execute handler
        const method: HttpMethod =
          (req.method as HttpMethod | undefined) ?? "GET";
        const route = this.routes[path]?.[method];

        // Check if route exists
        if (!route) {
          res.sendStatus(404);
          return;
        }

        // Check route access level and authentication
        if (
          route.access === RouteAccess.Protected ||
          route.access === RouteAccess.Admin
        ) {
          if (!this.isAuthorizedRequest(req)) {
            res.sendStatus(403);
            return;
          }
        } // Execute middleware stack and handler
        const middlewareStack = route.middleware || new MiddlewareStack();
        await this.globalMiddleware.execute(req, res, async () => {
          await middlewareStack.execute(req, res, route.handler);
        });

        // Acknowledge if response is not sent
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
    });
    const overlaySchema = v.object({
      maxScore: v.number().integer().min(1),
      blue: teamSchema,
      red: teamSchema,
      cameraControlsCover: v.boolean().optional(),
    });

    try {
      const parsed = overlaySchema.parse(data);
      if (parsed.blue.name === parsed.red.name) {
        throw new Error("Team names cannot be the same");
      }
      if (
        parsed.blue.score > parsed.maxScore ||
        parsed.red.score > parsed.maxScore
      ) {
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
    access: RouteAccess = RouteAccess.Protected,
    middleware?: MiddlewareStack
  ) {
    if (!this.routes[path]) {
      this.routes[path] = {};
    }
    this.routes[path][method] = {
      handler,
      access,
      middleware,
    };
  }

  GET(
    path: `/${string}`,
    handler: RouteHandler,
    access: RouteAccess = RouteAccess.Protected,
    middleware?: MiddlewareStack
  ) {
    this.addRoute("GET", path, handler, access, middleware);
  }

  POST(
    path: `/${string}`,
    handler: RouteHandler,
    access: RouteAccess = RouteAccess.Protected,
    middleware?: MiddlewareStack
  ) {
    this.addRoute("POST", path, handler, access, middleware);
  }

  PUT(
    path: `/${string}`,
    handler: RouteHandler,
    access: RouteAccess = RouteAccess.Protected,
    middleware?: MiddlewareStack
  ) {
    this.addRoute("PUT", path, handler, access, middleware);
  }

  PATCH(
    path: `/${string}`,
    handler: RouteHandler,
    access: RouteAccess = RouteAccess.Protected,
    middleware?: MiddlewareStack
  ) {
    this.addRoute("PATCH", path, handler, access, middleware);
  }

  DELETE(
    path: `/${string}`,
    handler: RouteHandler,
    access: RouteAccess = RouteAccess.Protected,
    middleware?: MiddlewareStack
  ) {
    this.addRoute("DELETE", path, handler, access, middleware);
  }

  /**
   * Securely check if a request is authorized for protected routes.
   * This method implements proper origin validation and authentication.
   */
  private isAuthorizedRequest(req: http.IncomingMessage): boolean {
    // Always require valid AUTH_TOKEN for protected routes
    if (req.headers.authorization !== env.AUTH_TOKEN) {
      return false;
    }

    // If the request has an origin header (browser request), validate it
    if (req.headers.origin) {
      return this.isValidOrigin(req.headers.origin);
    }

    // Non-browser requests (API clients) without origin header are allowed with valid AUTH_TOKEN
    return true;
  }

  /**
   * Securely validate the origin header against the configured ORIGIN_URL.
   * Uses exact URL matching to prevent bypass attacks.
   */
  private isValidOrigin(originHeader: string | undefined): boolean {
    if (!originHeader || !this.origin) {
      return false;
    }

    try {
      // Parse both URLs to ensure exact matching
      const requestOrigin = new URL(originHeader);
      const allowedOrigin = new URL(this.origin);

      // Exact match on protocol, hostname, and port
      return (
        requestOrigin.protocol === allowedOrigin.protocol &&
        requestOrigin.hostname === allowedOrigin.hostname &&
        requestOrigin.port === allowedOrigin.port
      );
    } catch {
      // Invalid URL format
      logger.warn(`Invalid origin header format: ${originHeader}`);
      return false;
    }
  }
}
