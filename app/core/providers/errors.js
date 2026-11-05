/**
 * VeoFlow Normalized Provider Errors (ESM)
 */
import { ERROR_CODES } from '../../shared/constants.js';

export class BaseProviderError extends Error {
  constructor(message, code, provider, status = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.provider = provider;
    this.status = status;
  }
}

export class AuthenticationError extends BaseProviderError {
  constructor(message, provider, status = 401) {
    super(message, ERROR_CODES.INVALID_API_KEY, provider, status);
  }
}

export class RateLimitError extends BaseProviderError {
  constructor(message, provider, status = 429) {
    super(message, ERROR_CODES.RATE_LIMIT_EXCEEDED, provider, status);
  }
}

export class ServerError extends BaseProviderError {
  constructor(message, provider, status = 500) {
    super(message, ERROR_CODES.SERVER_ERROR, provider, status);
  }
}

export class NetworkError extends BaseProviderError {
  constructor(message, provider) {
    super(message, ERROR_CODES.NETWORK_ERROR, provider);
  }
}

export class TimeoutError extends BaseProviderError {
  constructor(message, provider) {
    super(message, ERROR_CODES.TIMEOUT, provider, 408);
  }
}

export class EmptyResponseError extends BaseProviderError {
  constructor(message, provider) {
    super(message, ERROR_CODES.EMPTY_RESPONSE, provider);
  }
}

