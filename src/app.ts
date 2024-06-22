import * as http from "http";
import { parseRequestBody, validateOverlayData } from "./helpers";
import {
  HttpMethod,
  HttpRequestType,
  HttpResponseType,
  OverlayData,
} from "./types";
import { Server } from "socket.io";
import "./env";

export class AppRequest extends http.IncomingMessage {
  body: any;

  constructor(req: HttpRequestType) {
    super(req.socket);
    Object.assign(this, req);
    // Parse body if content-type is application/json
    if (req.headers["content-type"] === "application/json") {
      parseRequestBody(req).then((body) => {
        this.body = body;
      });
    }
  }
}

export class AppResponse extends http.ServerResponse<HttpRequestType> {
  constructor(req: HttpRequestType, res: HttpResponseType) {
    super(req);
    Object.assign(this, res);
  }

  status(code: number) {
    this.writeHead(code);
    return this;
  }

  json(body: object) {
    this.writeHead(200, { "Content-Type": "application/json" });
    this.send(JSON.stringify(body));
  }

  send(message: string | Buffer) {
    // Set status code to 200 if not set
    if (!this.statusCode) {
      this.status(200);
    }
    // Send response
    this.write(message);
    this.end();
  }

  sendStatus(code: number) {
    this.writeHead(code);
    this.end();
  }
}

type RouteHandler = (req: AppRequest, res: AppResponse) => void;

export class App {
  server: http.Server;
  io: Server;
  origin = process.env.NODE_ENV === "development" ? "*" : process.env.ORIGIN_URL;
  overlay: OverlayData;
  routes: {
    [path: string]: Partial<Record<HttpMethod, RouteHandler>>;
  } = {};
  defaultRouteHandler: RouteHandler;
  listen: typeof http.Server.prototype.listen;

  constructor(defaultHandler: RouteHandler) {
    if (!this.origin) {
      throw new Error("ORIGIN_URL is not set");
    }

    this.defaultRouteHandler = defaultHandler;

    // Create http server
    this.server = http.createServer(async (req, res) => {
      try {
        // Enable CORS
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        // Execute handler
        const path = req.url ?? "";
        const method: HttpMethod =
          (req.method as HttpMethod | undefined) ?? "GET";
        const handler = this.routes[path]?.[method] ?? this.defaultRouteHandler;
        handler(new AppRequest(req), new AppResponse(req, res));

        // Send 404 if response not sent
        if (!res.writableEnded) {
          res.writeHead(404);
          res.write("Not found");
          res.end();
        }
      } catch (err) {
        // Log error and send 500 status
        console.error(err);
        res.writeHead(500);
        res.write("Internal server error");
        res.end();
      }
      return;
    });

    this.listen = this.server.listen.bind(this.server);

    // Create socket.io server
    this.io = new Server(this.server, {
      cors: {
        origin: this.origin,
        methods: ["GET", "POST"],
      },
    });

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
      maxScore: 3,
    };
  }

  updateOverlay(data: OverlayData) {
    validateOverlayData(data);
    this.overlay = data;
    this.io.of("/overlay").emit("overlay", this.overlay);
  }

  addRoute(method: HttpMethod, path: `/${string}`, handler: RouteHandler) {
    if (!this.routes[path]) {
      this.routes[path] = {};
    }
    this.routes[path][method] = handler;
  }

  GET(path: `/${string}`, handler: RouteHandler) {
    this.addRoute("GET", path, handler);
  }

  POST(path: `/${string}`, handler: RouteHandler) {
    this.addRoute("POST", path, handler);
  }

  PUT(path: `/${string}`, handler: RouteHandler) {
    this.addRoute("PUT", path, handler);
  }

  PATCH(path: `/${string}`, handler: RouteHandler) {
    this.addRoute("PATCH", path, handler);
  }

  DELETE(path: `/${string}`, handler: RouteHandler) {
    this.addRoute("DELETE", path, handler);
  }

  setDefaultRouteHandler(handler: RouteHandler) {
    this.defaultRouteHandler = handler;
  }
}
