import {
  MiddlewareStack,
  cors,
  bodyParser,
  rateLimit,
} from "../src/utils/middleware";
import { HttpRequestType, HttpResponseType } from "../src/utils/types";
import "../src/utils/http"; // Import to get the augmented types

describe("Middleware", () => {
  let req: Partial<HttpRequestType>;
  let res: Partial<HttpResponseType>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      method: "GET",
      url: "/test",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" } as any,
    };

    res = {
      setHeader: jest.fn(),
      writeHead: jest.fn(),
      end: jest.fn(),
      sendStatus: jest.fn(),
      writableEnded: false,
    };

    next = jest.fn();
  });

  describe("MiddlewareStack", () => {
    test("executes middlewares in order", async () => {
      const stack = new MiddlewareStack();
      const order: number[] = [];

      stack.use((req, res, next) => {
        order.push(1);
        next();
      });

      stack.use((req, res, next) => {
        order.push(2);
        next();
      });

      const handler = jest.fn().mockResolvedValue(undefined);

      await stack.execute(
        req as HttpRequestType,
        res as HttpResponseType,
        handler
      );

      expect(order).toEqual([1, 2]);
      expect(handler).toHaveBeenCalled();
    });

    test("stops execution if middleware doesn't call next", async () => {
      const stack = new MiddlewareStack();

      stack.use((_req, _res, _next) => {
        // Don't call next()
      });

      const handler = jest.fn();

      await stack.execute(
        req as HttpRequestType,
        res as HttpResponseType,
        handler
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("cors middleware", () => {
    test("sets CORS headers", () => {
      const corsMiddleware = cors("https://example.com");

      corsMiddleware(req as HttpRequestType, res as HttpResponseType, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Origin",
        "https://example.com"
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      expect(next).toHaveBeenCalled();
    });

    test("handles OPTIONS requests", () => {
      req.method = "OPTIONS";
      const corsMiddleware = cors("https://example.com");

      corsMiddleware(req as HttpRequestType, res as HttpResponseType, next);

      expect(res.sendStatus).toHaveBeenCalledWith(204);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("bodyParser middleware", () => {
    test("calls next for non-body methods", async () => {
      req.method = "GET";

      await bodyParser(req as HttpRequestType, res as HttpResponseType, next);

      expect(next).toHaveBeenCalled();
    });

    test("attempts to parse JSON for POST requests", async () => {
      req.method = "POST";
      req.json = jest.fn().mockResolvedValue({ test: "data" });

      await bodyParser(req as HttpRequestType, res as HttpResponseType, next);

      expect(req.json).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("rateLimit middleware", () => {
    test("allows requests under limit", () => {
      const rateLimitMiddleware = rateLimit(60000, 5); // 5 requests per minute

      rateLimitMiddleware(
        req as HttpRequestType,
        res as HttpResponseType,
        next
      );

      expect(next).toHaveBeenCalled();
      expect(res.sendStatus).not.toHaveBeenCalled();
    });

    test("blocks requests over limit", () => {
      const rateLimitMiddleware = rateLimit(1000, 1); // 1 request per second

      // First request should pass
      rateLimitMiddleware(
        req as HttpRequestType,
        res as HttpResponseType,
        next
      );
      expect(next).toHaveBeenCalledTimes(1);

      // Second request should be blocked
      next.mockClear();
      rateLimitMiddleware(
        req as HttpRequestType,
        res as HttpResponseType,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(429);
    });
  });
});
