import { BaseValidator, Parser } from "./base";

export class OptionalValidator<T> extends BaseValidator {
  private wrappedValidator: Parser<T>;

  constructor(validator: Parser<T>) {
    super();
    this.wrappedValidator = validator;
  }

  parse(arg: unknown) {
    if (arg === undefined) {
      return undefined;
    }

    return this.wrappedValidator.parse(arg);
  }
}
