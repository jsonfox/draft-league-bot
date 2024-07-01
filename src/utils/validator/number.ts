import { BaseValidator } from "./base";
import { EnumValidator } from "./enum";

export class NumberValidator extends BaseValidator {
  parse(arg?: unknown) {
    this.isNumber(arg);
    super.parse(arg);
    return arg;
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

  enum<T, E extends number[]>(accepted: E) {
    return new EnumValidator<T, E>(accepted);
  }
}
