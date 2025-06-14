import { NumberValidator } from "./number";
import { StringValidator } from "./string";
import { ObjectValidator } from "./object";
import { BooleanValidator } from "./boolean";
import { ArrayValidator } from "./array";
import { Parser } from "./base";
import { EnumValidator } from "./enum";
import { OptionalValidator } from "./optional";

export const v = {
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  object: <T, S extends Record<string, Parser<T>>>(schema: S) =>
    new ObjectValidator<T, S>(schema),
  boolean: () => new BooleanValidator(),
  array: <T>() => new ArrayValidator<T>(),
  enum: <T, E extends unknown[]>(enumValues: E) =>
    new EnumValidator<T, E>(enumValues),
  optional: <T>(validator: Parser<T>) => new OptionalValidator<T>(validator),
};
