import dotenv from "dotenv";
import { v } from "./validator";
dotenv.config();

export const envSchema = v.object({
  BOT_TOKEN: v.string().isNotEmpty(),
  APPLICATION_ID: v.string().isNotEmpty(),
  ORIGIN_URL: v.string().url(),
  AUTH_TOKEN: v.string().isNotEmpty(),
  AUDIT_LOG_CHANNEL: v.string().isNotEmpty(),
});

export const env = envSchema.parse(process.env);
