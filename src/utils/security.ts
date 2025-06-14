import { env } from "./env";
import { logger } from "./logger";
import { HttpRequestType, HttpResponseType } from "./types";

/**
 * Security service for handling authentication, rate limiting, and security headers
 */
export class SecurityService {
  private static instance: SecurityService;
  private attemptMap = new Map<
    string,
    { count: number; lastAttempt: number; blocked: boolean }
  >();
  private readonly maxFailedAttempts = 5;
  private readonly blockDuration = 15 * 60 * 1000; // 15 minutes
  private readonly attemptWindow = 5 * 60 * 1000; // 5 minutes

  static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  /**
   * Validates authentication token with rate limiting
   */
  validateAuth(req: HttpRequestType, res: HttpResponseType): boolean {
    const clientIp = this.getClientIp(req);
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-token"] as string;

    // Check if IP is blocked
    if (this.isBlocked(clientIp)) {
      logger.warn(`Blocked IP attempted access: ${clientIp}`);
      res.status(429).send("Too many failed attempts. Try again later.");
      return false;
    }

    // Validate authentication
    const isValid =
      authHeader === env.AUTH_TOKEN ||
      (tokenHeader && tokenHeader.includes(env.BOT_TOKEN));

    if (!isValid) {
      this.recordFailedAttempt(clientIp);
      logger.warn(`Failed authentication attempt from IP: ${clientIp}`);
      res.sendStatus(403);
      return false;
    }

    // Reset failed attempts on successful auth
    this.resetFailedAttempts(clientIp);
    return true;
  }

  /**
   * Applies security headers to response
   */
  applySecurityHeaders(res: HttpResponseType): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );

    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }
  }

  /**
   * Validates request origin
   */
  validateOrigin(req: HttpRequestType): boolean {
    const origin = req.headers.origin;
    const host = req.headers.host;

    // Allow requests from the configured origin
    if (origin && origin.includes(env.ORIGIN_URL)) {
      return true;
    }

    // Allow requests to the same host (for health checks, etc.)
    if (host && env.ORIGIN_URL.includes(host)) {
      return true;
    }

    // Allow localhost in development
    if (
      process.env.NODE_ENV !== "production" &&
      (origin?.includes("localhost") || host?.includes("localhost"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Sanitizes input to prevent injection attacks
   */
  sanitizeInput(input: any): any {
    if (typeof input === "string") {
      // Remove potentially dangerous characters
      return input.replace(/[<>"'&]/g, "");
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.sanitizeInput(item));
    }

    if (typeof input === "object" && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[this.sanitizeInput(key)] = this.sanitizeInput(value);
      }
      return sanitized;
    }

    return input;
  }

  private getClientIp(req: HttpRequestType): string {
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "unknown"
    );
  }

  private isBlocked(ip: string): boolean {
    const attempt = this.attemptMap.get(ip);
    if (!attempt) return false;

    const now = Date.now();
    if (attempt.blocked && now - attempt.lastAttempt < this.blockDuration) {
      return true;
    }

    // Unblock if enough time has passed
    if (attempt.blocked && now - attempt.lastAttempt >= this.blockDuration) {
      this.attemptMap.delete(ip);
      return false;
    }

    return false;
  }

  private recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const attempt = this.attemptMap.get(ip);

    if (!attempt) {
      this.attemptMap.set(ip, { count: 1, lastAttempt: now, blocked: false });
      return;
    }

    // Reset count if outside the attempt window
    if (now - attempt.lastAttempt > this.attemptWindow) {
      attempt.count = 1;
    } else {
      attempt.count++;
    }

    attempt.lastAttempt = now;

    // Block if too many attempts
    if (attempt.count >= this.maxFailedAttempts) {
      attempt.blocked = true;
      logger.warn(`IP ${ip} blocked after ${attempt.count} failed attempts`);
    }

    this.attemptMap.set(ip, attempt);
  }

  private resetFailedAttempts(ip: string): void {
    this.attemptMap.delete(ip);
  }
}
