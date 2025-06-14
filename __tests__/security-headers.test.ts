import { app, client } from "../src/app";

describe("Security Headers", () => {
  beforeAll(() => {
    app.listen(4001);
  });

  afterAll((done) => {
    // Clean up Discord client to clear intervals
    if (client) {
      client.cleanup();
    }

    // Close server after test suite with longer timeout for Node 18.x compatibility
    app.close(() => {
      setTimeout(done, 500);
    });
  }, 10000); // 10 second timeout for the afterAll hook

  test("should include security headers in responses", async () => {
    const res = await fetch("http://localhost:4001/");

    // Check response status first
    expect(res.status).toBe(200);

    // Test for security headers - check if they exist (some might be case-sensitive)
    const headers = Object.fromEntries(res.headers.entries());

    // Look for headers with different cases
    const frameOptions =
      headers["x-frame-options"] || headers["X-Frame-Options"];
    const contentTypeOptions =
      headers["x-content-type-options"] || headers["X-Content-Type-Options"];
    const xssProtection =
      headers["x-xss-protection"] || headers["X-XSS-Protection"];
    const referrerPolicy =
      headers["referrer-policy"] || headers["Referrer-Policy"];
    const csp =
      headers["content-security-policy"] || headers["Content-Security-Policy"];

    expect(frameOptions).toBe("DENY");
    expect(contentTypeOptions).toBe("nosniff");
    expect(xssProtection).toBe("1; mode=block");
    expect(referrerPolicy).toBe("strict-origin-when-cross-origin");
    expect(csp).toContain("default-src 'self'");

    // Should not have X-Powered-By header (fingerprinting protection)
    const poweredBy = headers["x-powered-by"] || headers["X-Powered-By"];
    expect(poweredBy).toBeUndefined();
  });
  test("should include CORS headers alongside security headers", async () => {
    const res = await fetch("http://localhost:4001/");

    const headers = Object.fromEntries(res.headers.entries());

    // Both security and CORS headers should be present
    const corsOrigin =
      headers["access-control-allow-origin"] ||
      headers["Access-Control-Allow-Origin"];
    const frameOptions =
      headers["x-frame-options"] || headers["X-Frame-Options"];

    expect(corsOrigin).toBeDefined();
    expect(frameOptions).toBe("DENY");
  });
});
