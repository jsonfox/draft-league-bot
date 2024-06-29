import { envSchema } from "../src/utils/env";

describe("environment variable config validation", () => {
  test("should throw error if required env variables are not set", () => {
    expect(() => envSchema.parse({})).toThrow();
  });

  test("should not throw error if all required env variables match validation", () => {
    expect(() => envSchema.parse(process.env)).not.toThrow();
  });

  test("should throw error if environment variable is set but does not match validation", () => {
    process.env.ORIGIN_URL = "not a url";
    expect(() => envSchema.parse(process.env)).toThrow();
  });
});
