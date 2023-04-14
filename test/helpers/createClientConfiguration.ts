import { type ClientConfiguration } from '../../src/types';

export const createClientConfiguration = (): ClientConfiguration => {
  return {
    captureStackTrace: true,
    connectionRetryLimit: 3,
    connectionTimeout: 5_000,
    idleInTransactionSessionTimeout: 60_000,
    idleTimeout: 5_000,
    ignoreCommit: false,
    interceptors: [],
    maximumPoolSize: 10,
    queryRetryLimit: 5,
    statementTimeout: 60_000,
    transactionRetryLimit: 5,
    typeParsers: [],
  };
};
