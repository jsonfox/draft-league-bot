import { BaseValidator } from "./base";

export class EnumValidator<
  T,
  E extends unknown[]
> extends BaseValidator {
  enum: E;

  constructor(enumValues: E) {
    super();
    this.enum = enumValues;
  }

  valueIsInEnum(arg: unknown): asserts arg is E[number] & T {
    if (!this.enum.includes(arg as any)) {
      throw new Error(`\`${arg}\` must be one of ${this.enum.join(", ")}`);
    }
  }

  parse(arg: unknown) {
    this.valueIsInEnum(arg);
    return arg;
  }
}
