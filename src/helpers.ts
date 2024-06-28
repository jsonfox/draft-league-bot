import { OverlayData, OverlayTeam } from "./types";
import { v } from "./validator";

/** Generate random id of given length between 4 and 32, defaults to 16 */
export const generateRandomId = (length = 16) => {
  // Ensure length is within bounds
  const MIN_LENGTH = 4;
  if (length < MIN_LENGTH) {
    length = MIN_LENGTH;
  }
  const MAX_LENGTH = 32;
  if (length > MAX_LENGTH) {
    length = MAX_LENGTH;
  }

  return Math.random()
    .toString(36)
    .substring(2, length + 2);
};

/**
 * @throws Error if data does not match schema
 */
export const validateOverlayData = (data: OverlayData) => {
  const teamSchema = v.object({
    score: v.number().integer().min(0),
    name: v.string().isNotEmpty(),
    primaryColor: v.string().isNotEmpty(),
    secondaryColor: v.string().isNotEmpty(),
    logoUrl: v.string().isNotEmpty(),
  });

  const overlaySchema = v.object({
    maxScore: v.number().integer().min(1),
    blue: teamSchema,
    red: teamSchema,
    cameraControlsCover: v.boolean(),
  });

  overlaySchema.parse(data);
};
