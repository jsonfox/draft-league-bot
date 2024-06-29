import app from "../src/app";
import { env } from "../src/utils/env";

describe("app", () => {
  beforeAll((done) => {
    process.env.DISABLE_LOGGING = "true";
    app.listen(4000, () => {
      done();
    });
  });

  afterAll((done) => {
    app.close(() => {
      setTimeout(done, 100);
    });
  });

  const defaultOverlayData = { ...app.overlay };

  test("Default overlay data", () => {
    expect(defaultOverlayData).toBeDefined();
    for (const key in defaultOverlayData) {
      if (typeof defaultOverlayData[key] !== "object") continue;
      for (const subKey in defaultOverlayData[key]) {
        const expected = defaultOverlayData[key][subKey];
        expect(expected === "" || expected === 0).toBeTruthy();
      }
    }
  });

  test("Invalid route returns 404", async () => {
    const res = await fetch("http://localhost:4000/invalid");
    expect(res.status).toBe(404);
  });

  test("Protected route returns 403 without authorization", async () => {
    const res = await fetch("http://localhost:4000/overlay");
    expect(res.status).toBe(403);
  });

  test("GET /", async () => {
    const res = await fetch("http://localhost:4000");
    expect(res.status).toBe(200);

    const data = await res.text();
    expect(data).toBe("App is running");
  });

  test("GET /overlay", async () => {
    const res = await fetch("http://localhost:4000/overlay", {
      headers: {
        Authorization: env.AUTH_TOKEN,
      },
    });

    const data = await res.json();
    expect(data).toEqual(defaultOverlayData);
  });

  describe("POST /overlay", () => {
    let newOverlayData: any;

    const testInvalidData = (description: string, data: any) => {
      test(description, async () => {
        const res = await fetch("http://localhost:4000/overlay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: env.AUTH_TOKEN,
          },
          body: JSON.stringify(data),
        });
        expect(res.status).toBe(400);
      });
    };

    beforeEach(() => {
      newOverlayData = Object.assign({}, defaultOverlayData, {
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
      });
    });

    testInvalidData("with empty data", {});

    testInvalidData("with null data", null);

    testInvalidData("with invalid data structure", { data: "invalid" });

    testInvalidData(
      "with null team data",
      Object.assign({}, newOverlayData, { blue: null })
    );

    testInvalidData(
      "with negative team score",
      Object.assign({}, newOverlayData, { blue: { score: -1 } })
    );

    testInvalidData(
      "with team score greater than max score",
      Object.assign({}, newOverlayData, { blue: { score: 5 } })
    );

    testInvalidData(
      "with empty team name",
      Object.assign({}, newOverlayData, { blue: { name: "" } })
    );

    testInvalidData(
      "with empty team name",
      Object.assign({}, newOverlayData, { blue: { name: "" } })
    );

    testInvalidData(
      "with empty team primary color",
      Object.assign({}, newOverlayData, { blue: { primaryColor: "" } })
    );

    testInvalidData(
      "with empty team secondary color",
      Object.assign({}, newOverlayData, { blue: { secondaryColor: "" } })
    );

    testInvalidData(
      "with empty team logo URL",
      Object.assign({}, newOverlayData, { blue: { logoUrl: "" } })
    );

    testInvalidData(
      "with invalid team logo URL",
      Object.assign({}, newOverlayData, { blue: { logoUrl: "invalid" } })
    );

    testInvalidData(
      "with max score",
      Object.assign({}, newOverlayData, { maxScore: "invalid" })
    );

    testInvalidData(
      "with max score less than 1",
      Object.assign({}, newOverlayData, { maxScore: 0 })
    );

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
});
