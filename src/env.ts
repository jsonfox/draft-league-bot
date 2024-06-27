import dotenv from "dotenv";
import { v } from "./validator";
dotenv.config();

const envVariables = v.object({
  BOT_TOKEN: v.string().isNotEmpty(),
  APPLICATION_ID: v.string().isNotEmpty(),
  ORIGIN_URL: v.string().url(),
});

export const env = envVariables.parse(process.env);