export type RetryStrategyF = (retries: number) => number;

export const MAX_DEFAULT_RETRY_AMOUNT = 5;
export const WAIT_MS = 1_000;
export const RETRY_EXPONENT = 2;
export const RETRY_EXPONENTIAL_FACTOR = 1.1;
export const RETRY_JITTER_MAX = 3_000;

const waitFor = (ms: number) => new Promise((res) => setTimeout(res, ms));

const exponentialStrategyWithJitter: RetryStrategyF = (retries: number) =>
  WAIT_MS * Math.pow(RETRY_EXPONENT, RETRY_EXPONENTIAL_FACTOR * retries) +
  RETRY_JITTER_MAX * Math.random();

export const continueRetryUntilValidation = async <T>(
  promiseFn: () => Promise<T> | T | Promise<void> | void,
  validationFn: (x: T) => Promise<boolean> | boolean = (x: T) =>
    Promise.resolve(!!x),
  maxRetries = MAX_DEFAULT_RETRY_AMOUNT,
  waitTimeStrategy: RetryStrategyF = exponentialStrategyWithJitter,
  retries = 0,
  lastError: undefined | unknown = undefined
): Promise<T> => {
  if (retries >= maxRetries) {
    if (lastError) throw lastError;
    throw new Error("Exceeded maximum retry amount");
  }
  try {
    if (retries) await waitFor(waitTimeStrategy(retries));

    const res = await promiseFn();
    if (res && (await validationFn(res))) return res;

    throw new Error("Validation predicate unsuccessful");
  } catch (e: unknown) {
    return continueRetryUntilValidation(
      promiseFn,
      validationFn,
      maxRetries,
      waitTimeStrategy,
      retries + 1,
      e
    );
  }
};
