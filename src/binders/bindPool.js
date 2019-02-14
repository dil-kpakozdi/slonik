// @flow

import type {
  ClientConfigurationType,
  DatabasePoolType,
  InternalDatabaseConnectionType,
  InternalDatabasePoolType,
  LoggerType,
  TaggedTemplateLiteralInvocationType
} from '../types';
import {
  createPoolTransaction
} from '../factories';
import bindPoolConnection from './bindPoolConnection';

const getPoolId = (log: LoggerType): string => {
  const poolId = log.getContext().poolId;

  if (typeof poolId !== 'string') {
    throw new TypeError('Unexpected state.');
  }

  return poolId;
};

export default (
  parentLog: LoggerType,
  pool: InternalDatabasePoolType,
  clientConfiguration: ClientConfigurationType
): DatabasePoolType => {
  const connect = async (connectionRoutine) => {
    const connection: InternalDatabaseConnectionType = await pool.connect();

    const poolId = getPoolId(parentLog);

    const connectionId = connection.connection.slonik.connectionId;

    const connectionLog = parentLog.child({
      connectionId
    });

    const connectionContext = {
      connectionId,
      log: connectionLog,
      poolId
    };

    const boundConnection = bindPoolConnection(connectionLog, pool, connection, clientConfiguration);

    for (const interceptor of clientConfiguration.interceptors) {
      if (interceptor.afterPoolConnection) {
        await interceptor.afterPoolConnection(connectionContext, boundConnection);
      }
    }

    let result;

    try {
      result = await connectionRoutine(boundConnection);
    } finally {
      for (const interceptor of clientConfiguration.interceptors) {
        if (interceptor.beforePoolConnectionRelease) {
          await interceptor.beforePoolConnectionRelease(connectionContext, boundConnection);
        }
      }

      await connection.release();
    }

    return result;
  };

  const mapConnection = (targetMethodName: string) => {
    return (query: TaggedTemplateLiteralInvocationType) => {
      if (typeof query === 'string') {
        throw new TypeError('Query must be constructed using `sql` tagged template literal.');
      }

      return connect((connection) => {
        return connection[targetMethodName](query);
      });
    };
  };

  return {
    any: mapConnection('any'),
    anyFirst: mapConnection('anyFirst'),
    connect,
    many: mapConnection('many'),
    manyFirst: mapConnection('manyFirst'),
    maybeOne: mapConnection('maybeOne'),
    maybeOneFirst: mapConnection('maybeOneFirst'),
    one: mapConnection('one'),
    oneFirst: mapConnection('oneFirst'),
    query: mapConnection('query'),
    transaction: async (handler) => {
      return createPoolTransaction(parentLog, pool, clientConfiguration, handler);
    }
  };
};
