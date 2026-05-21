export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 500);
  }
}

export class PathTraversalError extends AppError {
  constructor() {
    super("Path traversal detected", 400);
  }
}

export class ExtractionError extends AppError {
  constructor(message: string) {
    super(message, 500);
  }
}

export class AudioConversionError extends AppError {
  constructor(message: string) {
    super(message, 500);
  }
}

export class DemoModeError extends AppError {
  constructor() {
    super("Demo mode: write operations are disabled", 403);
  }
}
