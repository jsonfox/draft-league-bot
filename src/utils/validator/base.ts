import { logger } from "../logger";

export type AssertFn<T> = (arg: unknown) => asserts arg is T;
export type ParseFn<T> = (arg: unknown) => T;
export type Parser<T> = {
  parse: ParseFn<T>;
};

export class BaseValidator {
  protected useValidators: ((arg: any) => void)[] = [];

  parse(arg: unknown) {
    for (const validator of this.useValidators) {
      validator(arg);
    }
    return arg;
  }

  safeParse(arg: unknown) {
    try {
      return this.parse(arg);
    } catch (err) {
      return logger.error((err as Error).message);
    }
  }

  custom(func: (arg: unknown) => boolean) {
    this.useValidators.push((arg) => {
      if (!func(arg)) {
        throw new Error(`\`${arg}\` does not match validator`);
      }
      return arg;
    });
    return this;
  }

  optional() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OptionalValidator } = require("./optional");
    return new OptionalValidator(this);
  }

  validationError(arg: unknown, message: string) {
    return new Error(`\`${arg}\` ${message}`);
  }

  isnt(arg: unknown, type: string) {
    return this.validationError(arg, `is not a ${type}`);
  }

  isType(arg: unknown, type: string) {
    switch (type) {
      case "array": {
        if (!Array.isArray(arg)) {
          throw this.isnt(arg, type);
        }
        break;
      }
      case "object": {
        if (arg === null || Array.isArray(arg)) {
          throw this.isnt(arg, type);
        }
        break;
      }
      default: {
        if (typeof arg !== type) {
          throw this.isnt(arg, type);
        }
        break;
      }
    }
  }

  isString(arg: unknown): asserts arg is string {
    this.isType(arg, "string");
  }

  isNumber(arg: unknown): asserts arg is number {
    this.isType(arg, "number");
  }

  isObject(arg: unknown): asserts arg is object {
    this.isType(arg, "object");
  }

  isArray(arg: unknown): asserts arg is any[] {
    this.isType(arg, "array");
  }

  isBoolean(arg: unknown): asserts arg is boolean {
    this.isType(arg, "boolean");
  }
}
