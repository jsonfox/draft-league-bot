import { app, client } from "../src/app";
import { env } from "../src/utils/env";

describe("app", () => {
  beforeAll((done) => {
    // Start server for test suite
    app.listen(4000, () => {
      done();
    });
  });

  afterAll((done) => {
    // Close Discord client first to clear intervals
    if (client) {
      client.cleanup();
    }

    // Close server after test suite with longer timeout for Node 18.x compatibility
    app.close(() => {
      console.log("Test suite complete, server closed");
      setTimeout(done, 500);
    });
  }, 10000); // 10 second timeout for the afterAll hook

  const defaultOverlayData = { ...app.overlay };

  describe("Health endpoints", () => {
    test("GET / returns 200", async () => {
      const res = await fetch("http://localhost:4000");
      expect(res.status).toBe(200);

      const data = await res.text();
      expect(data).toBe("App is running");
    });
    test("GET /health returns health status", async () => {
      const res = await fetch("http://localhost:4000/health");
      // Expect 503 because Discord client is not connected during tests
      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("discord");
      expect(data).toHaveProperty("services");
    });
    test("GET /analytics returns public analytics", async () => {
      const res = await fetch("http://localhost:4000/analytics");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("healthy");
    });
  });

  describe("Protected endpoints", () => {
    test("Protected route returns 403 without authorization", async () => {
      const res = await fetch("http://localhost:4000/overlay");
      expect(res.status).toBe(403);
    });

    test("GET /overlay with authorization", async () => {
      const res = await fetch("http://localhost:4000/overlay", {
        headers: {
          Authorization: env.AUTH_TOKEN,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(defaultOverlayData);
    });

    test("GET /health/detailed requires authorization", async () => {
      const res = await fetch("http://localhost:4000/health/detailed");
      expect(res.status).toBe(403);
    });

    test("GET /analytics/internal requires authorization", async () => {
      const res = await fetch("http://localhost:4000/analytics/internal");
      expect(res.status).toBe(403);
    });
  });

  test("Default overlay data", () => {
    expect(defaultOverlayData).toBeDefined();
    for (const key in defaultOverlayData) {
      if (typeof defaultOverlayData[key] !== "object") continue;
      for (const subKey in defaultOverlayData[key]) {
        const expected = defaultOverlayData[key][subKey];
        expect(
          expected === "" || expected === 0 || expected === false
        ).toBeTruthy();
      }
    }
  });

  test("Invalid route returns 404", async () => {
    const res = await fetch("http://localhost:4000/invalid");
    expect(res.status).toBe(404);
  });

  describe("POST /overlay", () => {
    let newOverlayData: any;

    beforeEach(() => {
      newOverlayData = {
        blue: {
          score: 1,
          name: "Team Blue",
          primaryColor: "#0000FF",
          secondaryColor: "#00FF00",
          logoUrl: "https://example.com/blue.png",
        },
        red: {
          score: 2,
          name: "Team Red",
          primaryColor: "#FF0000",
          secondaryColor: "#FF00FF",
          logoUrl: "https://example.com/red.png",
        },
        maxScore: 2,
        cameraControlsCover: false,
      };
    });

    const testInvalidData = (description: string, dataCallback: () => any) => {
      test(description, async () => {
        const res = await fetch("http://localhost:4000/overlay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: env.AUTH_TOKEN,
          },
          body: JSON.stringify(dataCallback()),
        });
        expect(res.status).toBe(400);
      });
    };

    testInvalidData("with empty data", () => ({}));
    testInvalidData("with null data", () => null);
    testInvalidData("with invalid data structure", () => ({ data: "invalid" }));
    testInvalidData("with null team data", () => ({
      ...newOverlayData,
      blue: null,
    }));

    testInvalidData("with negative team score", () => ({
      ...newOverlayData,
      blue: { ...newOverlayData.blue, score: -1 },
    }));

    testInvalidData("with team score greater than max score", () => ({
      ...newOverlayData,
      blue: { ...newOverlayData.blue, score: 5 },
    }));

    testInvalidData("with empty team name", () => ({
      ...newOverlayData,
      blue: { ...newOverlayData.blue, name: "" },
    }));

    testInvalidData("with empty team primary color", () => ({
      ...newOverlayData,
      blue: { ...newOverlayData.blue, primaryColor: "" },
    }));

    testInvalidData("with empty team secondary color", () => ({
      ...newOverlayData,
      blue: { ...newOverlayData.blue, secondaryColor: "" },
    }));

    testInvalidData("with empty team logo URL", () => ({
      ...newOverlayData,
      blue: { ...newOverlayData.blue, logoUrl: "" },
    }));

    testInvalidData("with max score not a number", () => ({
      ...newOverlayData,
      maxScore: "invalid",
    }));

    testInvalidData("with max score less than 1", () => ({
      ...newOverlayData,
      maxScore: 0,
    }));

    test("with valid data", async () => {
      const res = await fetch("http://localhost:4000/overlay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: env.AUTH_TOKEN,
        },
        body: JSON.stringify(newOverlayData),
      });
      expect(res.status).toBe(200);

      const data = await res.text();
      expect(data).toBe("Overlay updated");
    });

    test("overlay data after update", async () => {
      // First update the overlay
      await fetch("http://localhost:4000/overlay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: env.AUTH_TOKEN,
        },
        body: JSON.stringify(newOverlayData),
      });

      // Then get the updated data
      const res = await fetch("http://localhost:4000/overlay", {
        headers: {
          Authorization: env.AUTH_TOKEN,
        },
      });
      const data = await res.json();
      expect(data).toEqual(newOverlayData);
      expect(data).not.toEqual(defaultOverlayData);
      expect(data).toEqual(app.overlay);
    });
  });

  describe("socket.io server", () => {
    test("should be initialized", () => {
      expect(app.io).toBeDefined();
    });

    describe("/overlay namespace", () => {
      test("should be in namespaces map", () => {
        expect(app.io._nsps.keys()).toContain("/overlay");
      });
    });
  });
});
