import { NumberValidator } from "./number";
import { StringValidator } from "./string";
import { ObjectValidator } from "./object";
import { BooleanValidator } from "./boolean";
import { Parser } from "./base";
import { EnumValidator } from "./enum";

export const v = {
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  object: <T, S extends Record<string, Parser<T>>>(schema: S) =>
    new ObjectValidator<T, S>(schema),
  boolean: () => new BooleanValidator(),
  enum: <T, E extends unknown[]>(enumValues: E) =>
    new EnumValidator<T, E>(enumValues),
};
