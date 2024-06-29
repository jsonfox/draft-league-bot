import { BaseValidator, Parser } from "./base";

export class ObjectValidator<
  T,
  S extends Record<string, Parser<T>>
> extends BaseValidator {
  schema: S;

  constructor(schema: S) {
    super();
    this.schema = schema;
  }

  validateSchema(arg: unknown): asserts arg is {
    [K in keyof S]: ReturnType<S[K]["parse"]>;
  } {
    this.isObject(arg);
    if (Array.isArray(arg)) {
      throw this.isnt(arg, "object");
    }

    for (const k of Object.keys(this.schema)) {
      if (!this.schema[k]) {
        continue;
      }
      this.schema[k].parse((arg as any)[k]);
    }
  }

  parse(arg: unknown) {
    this.validateSchema(arg);
    super.parse(arg);
    return arg;
  }
}
