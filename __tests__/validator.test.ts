import { v } from "../src/utils/validator";

describe("Enhanced validator tests", () => {
  describe("array validator", () => {
    test("validates basic arrays", () => {
      const schema = v.array();
      expect(() => schema.parse([1, 2, 3])).not.toThrow();
      expect(() => schema.parse("not an array")).toThrow();
    });

    test("validates array elements", () => {
      const schema = v.array().of(v.string());
      expect(() => schema.parse(["a", "b", "c"])).not.toThrow();
      expect(() => schema.parse(["a", 1, "c"])).toThrow();
    });

    test("validates array length", () => {
      const schema = v.array().minLength(2).maxLength(5);
      expect(() => schema.parse([1, 2, 3])).not.toThrow();
      expect(() => schema.parse([1])).toThrow();
      expect(() => schema.parse([1, 2, 3, 4, 5, 6])).toThrow();
    });

    test("validates non-empty arrays", () => {
      const schema = v.array().notEmpty();
      expect(() => schema.parse([1])).not.toThrow();
      expect(() => schema.parse([])).toThrow();
    });
  });

  describe("optional validator", () => {
    test("allows undefined values", () => {
      const schema = v.string().optional();
      expect(() => schema.parse(undefined)).not.toThrow();
      expect(() => schema.parse("valid string")).not.toThrow();
    });

    test("validates non-undefined values", () => {
      const schema = v.string().isNotEmpty().optional();
      expect(() => schema.parse(undefined)).not.toThrow();
      expect(() => schema.parse("valid")).not.toThrow();
      expect(() => schema.parse("")).toThrow();
    });
  });

  describe("complex schema validation", () => {
    test("validates nested objects with arrays", () => {
      const schema = v.object({
        name: v.string().isNotEmpty(),
        tags: v.array().of(v.string()).optional(),
        settings: v.object({
          enabled: v.boolean(),
          priority: v.number().min(0).max(10),
        }),
      });

      const validData = {
        name: "test",
        tags: ["tag1", "tag2"],
        settings: {
          enabled: true,
          priority: 5,
        },
      };
      expect(() => schema.parse(validData)).not.toThrow();
    });
  });
});

describe("object validator", () => {
  it("should throw error if required field is missing", () => {
    const schema = v.object({
      requiredField: v.string().isNotEmpty(),
    });
    expect(() => schema.parse({})).toThrow();
  });

  it("should throw error if field does not match type", () => {
    const schema = v.object({
      numberField: v.number(),
    });
    expect(() => schema.parse({ numberField: "not a number" })).toThrow();
  });

  it("should throw error if field does not match custom validation", () => {
    const schema = v.object({
      customField: v.string().custom((value) => value === "valid"),
    });
    expect(() => schema.parse({ customField: "invalid" })).toThrow();
  });

  it("should throw error if field does not match multiple validations", () => {
    const schema = v.object({
      multipleField: v.string().custom((value) => value === "valid"),
    });
    expect(() => schema.parse({ multipleField: "" })).toThrow();
  });

  it("should not throw error if all fields match validation", () => {
    const schema = v.object({
      requiredField: v.string().isNotEmpty(),
      numberField: v.number(),
      customField: v.string().custom((value) => value === "valid"),
      multipleField: v
        .string()
        .isNotEmpty()
        .custom((value) => value === "valid"),
    });
    expect(() =>
      schema.parse({
        requiredField: "value",
        numberField: 1,
        customField: "valid",
        multipleField: "valid",
      })
    ).not.toThrow();
  });
});

describe("string validator", () => {
  describe("isString validation", () => {
    it("should throw error if value is not a string", () => {
      expect(() => v.string().parse(1)).toThrow();
    });

    it("should not throw error if value is a string", () => {
      expect(() => v.string().parse("string")).not.toThrow();
    });
  });

  it("should throw error if string is empty", () => {
    expect(() => v.string().isNotEmpty().parse("")).toThrow();
  });

  it("should throw error if string is not a url", () => {
    expect(() => v.string().url().parse("not a url")).toThrow();
  });

  it("should not throw error if string is not empty", () => {
    expect(() => v.string().isNotEmpty().parse("not empty")).not.toThrow();
  });

  it("should not throw error if string is a url", () => {
    expect(() => v.string().url().parse("https://example.com")).not.toThrow();
  });

  describe("custom validator", () => {
    const schema = v.string().custom((value) => value === "valid");

    it("should throw error if string does not match custom validation", () => {
      expect(() => schema.parse("invalid")).toThrow();
    });

    it("should not throw error if string matches custom validation", () => {
      expect(() => schema.parse("valid")).not.toThrow();
    });
  });

  describe("minLength validation", () => {
    const schema = v.string().minLength(5);

    it("should throw error if length is less than minimum", () => {
      expect(() => schema.parse("shor")).toThrow();
    });

    it("should not throw error if length is at least minimum", () => {
      expect(() => schema.parse("long enough")).not.toThrow();
    });
  });

  describe("maxLength validation", () => {
    const schema = v.string().maxLength(5);

    it("should throw error if length is more than maximum", () => {
      expect(() => schema.parse("too long")).toThrow();
    });

    it("should not throw error if length is at most maximum", () => {
      expect(() => schema.parse("short")).not.toThrow();
    });
  });
});

describe("number validator", () => {
  describe("isNumber validation", () => {
    it("should throw error if value is not a number", () => {
      expect(() => v.number().parse("string")).toThrow();
    });

    it("should not throw error if value is a number", () => {
      expect(() => v.number().parse(1)).not.toThrow();
    });
  });

  describe("min validation", () => {
    const schema = v.number().min(5);

    it("should throw error if value is less than minimum", () => {
      expect(() => schema.parse(4)).toThrow();
    });

    it("should not throw error if value is at least minimum", () => {
      expect(() => schema.parse(5)).not.toThrow();
    });
  });

  describe("max validation", () => {
    const schema = v.number().max(5);

    it("should throw error if value is more than maximum", () => {
      expect(() => schema.parse(6)).toThrow();
    });

    it("should not throw error if value is at most maximum", () => {
      expect(() => schema.parse(5)).not.toThrow();
    });
  });

  describe("integer validation", () => {
    const schema = v.number().integer();

    it("should throw error if value is not an integer", () => {
      expect(() => schema.parse(1.5)).toThrow();
    });

    it("should not throw error if value is an integer", () => {
      expect(() => schema.parse(1)).not.toThrow();
    });
  });
});

describe("boolean validator", () => {
  describe("isBoolean validation", () => {
    it("should throw error if value is not a boolean", () => {
      expect(() => v.boolean().parse("string")).toThrow();
    });
    it("should not throw error if value is a boolean", () => {
      expect(() => v.boolean().parse(true)).not.toThrow();
    });
  });
});
