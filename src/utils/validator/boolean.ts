import { BaseValidator } from "./base";

export class BooleanValidator extends BaseValidator {
  parse(arg: unknown) {
    this.isBoolean(arg);
    super.parse(arg);
    return arg as boolean;
  }
}
