import { BaseValidator, Parser } from "./base";

export class ArrayValidator<T> extends BaseValidator {
  private elementValidator?: Parser<T>;

  parse(arg: unknown) {
    this.isArray(arg);

    if (this.elementValidator) {
      for (let i = 0; i < arg.length; i++) {
        try {
          this.elementValidator.parse(arg[i]);
        } catch (err) {
          throw new Error(
            `Array element at index ${i}: ${(err as Error).message}`
          );
        }
      }
    }

    super.parse(arg);
    return arg as T[];
  }

  of(validator: Parser<T>) {
    this.elementValidator = validator;
    return this;
  }

  minLength(length: number) {
    this.useValidators.push((arg: any[]) => {
      if (arg.length < length) {
        throw new Error(`Array must have at least ${length} elements`);
      }
    });
    return this;
  }

  maxLength(length: number) {
    this.useValidators.push((arg: any[]) => {
      if (arg.length > length) {
        throw new Error(`Array must have at most ${length} elements`);
      }
    });
    return this;
  }

  notEmpty() {
    this.useValidators.push((arg: any[]) => {
      if (arg.length === 0) {
        throw new Error("Array must not be empty");
      }
    });
    return this;
  }
}
