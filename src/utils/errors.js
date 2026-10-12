// Pulls the readable message out of a failed backend request.
export function errorMessage(error, fallback) {
  const message = error?.response?.data?.error;
  return typeof message === 'string' ? message : fallback;
}