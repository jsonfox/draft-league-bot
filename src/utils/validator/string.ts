import { BaseValidator } from "./base";

export class StringValidator extends BaseValidator {
  parse(arg: unknown) {
    this.isString(arg);
    super.parse(arg);
    return arg;
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
