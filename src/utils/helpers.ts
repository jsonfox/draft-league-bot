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