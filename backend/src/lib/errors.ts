export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, "BAD_REQUEST", details);
  }
  static unauthorized(msg = "Authentication required") {
    return new ApiError(401, msg, "UNAUTHORIZED");
  }
  static forbidden(msg = "You do not have access to this resource") {
    return new ApiError(403, msg, "FORBIDDEN");
  }
  static notFound(msg = "Resource not found") {
    return new ApiError(404, msg, "NOT_FOUND");
  }
  static conflict(msg: string) {
    return new ApiError(409, msg, "CONFLICT");
  }
  static tooMany(msg = "Rate limit exceeded") {
    return new ApiError(429, msg, "RATE_LIMITED");
  }
  static internal(msg = "Internal server error") {
    return new ApiError(500, msg, "INTERNAL");
  }
  static unavailable(msg = "Service temporarily unavailable") {
    return new ApiError(503, msg, "SERVICE_UNAVAILABLE");
  }
}
