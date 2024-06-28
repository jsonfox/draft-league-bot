import { logger } from "./logger";

function isnt(arg: unknown, type: string) {
  return new Error(`\`${arg}\` is not a ${type}`);
}

function isString(arg: unknown): asserts arg is string {
  if (typeof arg !== "string") {
    throw isnt(arg, "string");
  }
}

function isNumber(arg: unknown): asserts arg is number {
  if (typeof arg !== "number") {
    throw isnt(arg, "number");
  }
}

function isObject(arg: unknown): asserts arg is object {
  if (typeof arg !== "object") {
    throw isnt(arg, "object");
  }
}

type AssertFn<T> = (arg: unknown) => asserts arg is T;
type ParseFn<T> = (arg: unknown) => T;
type Parser<T> = {
  parse: ParseFn<T>;
};

class BaseValidator {
  protected useValidators: Array<(arg: any) => void> = [];

  constructor(protected value?: unknown) {}

  parse(value?: unknown) {
    this.value = value ?? this.value;

    for (const validator of this.useValidators) {
      validator(this.value);
    }

    return this.value;
  }

  safeParse() {
    try {
      return this.parse();
    } catch (err) {
      return logger.error((err as Error).message);
    }
  }

  validate(func: (arg: unknown) => boolean) {
    this.useValidators.push((arg) => {
      if (!func(arg)) {
        throw new Error(`\`${arg}\` does not match validator`);
      }
      return arg;
    });
    return this;
  }
}

export class StringValidator extends BaseValidator {
  parse(value?: unknown) {
    this.value = value ?? this.value;
    isString(this.value);
    super.parse();
    return this.value;
  }

  isNotEmpty() {
    this.useValidators.push((arg: string) => {
      if (arg.length === 0) {
        throw new Error(`\`${arg}\` must not be empty`);
      }
    });
    return this;
  }

  isAlphaNumeric() {
    this.useValidators.push((arg: string) => {
      if (!/^[a-zA-Z0-9]*$/.test(arg)) {
        throw new Error(`\`${arg}\` must be alphanumeric`);
      }
    });
    return this;
  }

  min(length: number) {
    this.useValidators.push((arg: string) => {
      if (arg.length < length) {
        throw new Error(
          `\`${arg}\` must be at least ${length} characters long`
        );
      }
    });
    return this;
  }

  max(length: number) {
    this.useValidators.push((arg: string) => {
      if (arg.length > length) {
        throw new Error(`\`${arg}\` must be at most ${length} characters long`);
      }
    });
    return this;
  }

  url() {
    this.useValidators.push((arg: string) => {
      if (
        !/https?:\/\/(?:w{1,3}\.)?[^\s.]+(?:\.[a-z]+)*(?::\d+)?(?![^<]*(?:<\/\w+>|\/?>))/.test(
          arg
        )
      ) {
        throw new Error(`\`${arg}\` must be a valid URL`);
      }
    });
    return this;
  }
}

export class NumberValidator extends BaseValidator {
  parse(value?: unknown) {
    this.value = value ?? this.value;
    isNumber(this.value);
    super.parse();
    return this.value;
  }

  min(min: number) {
    this.useValidators.push((arg: number) => {
      if (arg < min) {
        throw new Error(`\`${arg}\` must be at least ${min}`);
      }
    });
    return this;
  }

  max(max: number) {
    this.useValidators.push((arg: number) => {
      if (arg > max) {
        throw new Error(`\`${arg}\` must be at most ${max}`);
      }
    });
    return this;
  }

  integer() {
    this.useValidators.push((arg: number) => {
      if (!Number.isInteger(arg)) {
        throw new Error(`\`${arg}\` must be an integer`);
      }
    });
    return this;
  }
}

export const v = {
  string: (arg?: unknown) => new StringValidator(arg),
  number: (arg?: unknown) => new NumberValidator(arg),
  object<T, S extends Record<string, Parser<T>>>(schema: S) {
    function validate(arg: unknown): asserts arg is {
      [K in keyof S]: ReturnType<S[K]["parse"]>;
    } {
      isObject(arg);
      if (Array.isArray(arg)) {
        throw isnt(arg, "object");
      }

      for (const k in arg) {
        schema[k]?.parse((arg as any)[k]);
      }
    }

    return {
      parse(arg: unknown) {
        validate(arg);
        return arg;
      },
    };
  },
  boolean(arg?: unknown) {
    return {
      parse() {
        return !!arg;
      },
    };
  },
};
