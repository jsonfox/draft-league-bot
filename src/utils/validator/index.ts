import { NumberValidator } from "./number";
import { StringValidator } from "./string";
import { ObjectValidator } from "./object";
import { BooleanValidator } from "./boolean";
import { Parser } from "./base";

export const v = {
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  object: <T, S extends Record<string, Parser<T>>>(schema: S) =>
    new ObjectValidator(schema),
  boolean: () => new BooleanValidator(),
};
