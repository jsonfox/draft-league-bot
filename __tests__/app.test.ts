import app from "../src/app";
import { env } from "../src/env";

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

    const post = (data: any) => {
      return fetch("http://localhost:4000/overlay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: env.AUTH_TOKEN,
        },
        body: JSON.stringify(data),
      });
    };

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
      };
    });

    test("POST /overlay with invalid data structure", async () => {
      const res = await post({ data: "invalid" });
      expect(res.status).toBe(400);
    });

    test("POST /overlay with null team data", async () => {
      const res = await post(Object.assign({}, newOverlayData, { blue: null }));
      expect(res.status).toBe(400);
    });

    test("POST /overlay with negative team score", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { score: -1 } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with team score greater than max score", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { score: 5 } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with empty team name", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { name: "" } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with empty team name", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { name: "" } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with empty team primary color", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { primaryColor: "" } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with empty team secondary color", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { secondaryColor: "" } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with empty team logo URL", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { logoUrl: "" } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with invalid team logo URL", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { blue: { logoUrl: "invalid" } })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with max score", async () => {
      let res = await post(
        Object.assign({}, newOverlayData, { maxScore: "invalid" })
      );
      expect(res.status).toBe(400);
    });

    test("POST /overlay with max score less than 1", async () => {
      let res = await post(Object.assign({}, newOverlayData, { maxScore: 0 }));
      expect(res.status).toBe(400);
    });

    test("POST /overlay with valid data", async () => {
      const res = await post(newOverlayData);
      expect(res.status).toBe(200);

      const data = await res.text();
      expect(data).toBe("Overlay updated");
    });

    test("GET /overlay after update", async () => {
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
