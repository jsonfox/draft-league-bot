import { OverlayData, OverlayTeam } from "./types";

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

export const validateOverlayData = (data: OverlayData) => {
  const error = new Error("Invalid overlay data");
  // Referring to top level keys in `data` as keys and nested keys in `teams[side]` as props
  if (!data || typeof data !== "object") throw error;

  // Iterate over keys in `data`
  for (const key in data) {
    // Max score key
    if (key === "maxScore") {
      if (typeof data.maxScore !== "number") {
        throw error;
      }
      continue;
    }

    // Other object keys in `data` must be either "blue" or "red"
    if (!["blue", "red"].includes(key)) {
      throw error;
    }

    // Iterate over nested keys in `teams[side]`
    const side = key as "blue" | "red";
    const stringProps = ["name", "primaryColor", "secondaryColor", "logoUrl"];
    for (const prop in data[side]) {
      // Score property in team object
      if (prop === "score") {
        // Score must be a number and within bounds
        if (typeof data[side][prop] !== "number") throw error;
        if (data[side].score < 0) throw error;
        if (data[side].score > data.maxScore) throw error;
      }
      // Other defined properties in team object must be strings
      if (stringProps.includes(prop)) {
        if (typeof data[side][prop as keyof OverlayTeam] !== "string") {
          throw error;
        }
      }
    } // End key iteration for `teams[side]`
  } // End key iteration for `teams`
};

