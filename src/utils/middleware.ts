import { HttpRequestType, HttpResponseType } from "./types";

export type Middleware = (
  req: HttpRequestType,
  res: HttpResponseType,
  next: () => void
) => void | Promise<void>;

export type RouteHandler = (
  req: HttpRequestType,
  res: HttpResponseType
) => Promise<void>;

export class MiddlewareStack {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
  }

  async execute(req: HttpRequestType, res: HttpResponseType, handler: RouteHandler) {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= this.middlewares.length) {
        // All middlewares executed, run the handler
        return handler(req, res);
      }
      
      const middleware = this.middlewares[index++];
      await middleware(req, res, next);
    };

    return next();
  }
}

// Built-in middleware
export const bodyParser: Middleware = async (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    try {
      await req.json();
    } catch (err) {
      // Body parsing failed, but continue anyway
    }
  }
  next();
};

export const cors = (origin: string): Middleware => (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  
  next();
};

export const logger: Middleware = (req, res, next) => {
  const start = Date.now();
  const { method, url } = req;
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    console.log(`${method} ${url} ${statusCode} - ${duration}ms`);
  });
  
  next();
};

export const rateLimit = (
  windowMs: number, 
  maxRequests: number
): Middleware => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req, res, next) => {
    const clientIp = req.socket.remoteAddress || "unknown";
    const now = Date.now();
    
    const clientData = requests.get(clientIp);
    
    if (!clientData || now > clientData.resetTime) {
      requests.set(clientIp, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }
    
    if (clientData.count >= maxRequests) {
      res.sendStatus(429);
      return;
    }
    
    clientData.count++;
    next();
  };
};
