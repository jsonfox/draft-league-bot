import { auditLog } from "./audit-log";
import { logger } from "./logger";

export { setTimeout as sleep } from "node:timers/promises";

// Deprecated - use auditLog.error() instead
export const sendErrorToDiscord = async (
  error: Error,
  context?: {
    component?: string;
    action?: string;
    userId?: string;
    additionalInfo?: Record<string, any>;
  }
) => {
  logger.warn("sendErrorToDiscord is deprecated, use auditLog.error() instead");
  await auditLog.error(error, context?.component || context?.action);
};

// Deprecated - use auditLog.info() instead
export const sendInfoToDiscord = async (
  title: string,
  message: string,
  _color = 0x00ff00
) => {
  logger.warn("sendInfoToDiscord is deprecated, use auditLog.info() instead");
  await auditLog.info(title, message);
};

export const resolveBitfield = (bits: number[]) => {
  /* tslint:disable-next-line no-bitwise */
  return bits.reduce((acc, bit) => acc | bit, 0);
};
