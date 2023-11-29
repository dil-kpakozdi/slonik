import { bindPool } from '../binders/bindPool';
import { Logger } from '../Logger';
import { createTypeOverrides } from '../routines/createTypeOverrides';
import { getPoolState } from '../state';
import {
  type ClientConfigurationInput,
  type ConnectionOptions,
  type DatabasePool,
} from '../types';
import { createClientConfiguration } from './createClientConfiguration';
import { createInternalPool } from './createInternalPool';
import { createPoolConfiguration } from './createPoolConfiguration';
import { Pool as PgPool } from 'pg';
import type pgTypes from 'pg-types';

export const createPool = async (
  connectionOptions: ConnectionOptions,
  clientConfigurationInput?: ClientConfigurationInput,
): Promise<DatabasePool> => {
  const clientConfiguration = createClientConfiguration(
    clientConfigurationInput,
  );

  const poolConfiguration = createPoolConfiguration(
    connectionOptions,
    clientConfiguration,
  );

  let Pool = clientConfiguration.PgPool;

  if (!Pool) {
    Pool = PgPool;
  }

  if (!Pool) {
    throw new Error('Unexpected state.');
  }

  const setupPool = createInternalPool(Pool, poolConfiguration);

  let getTypeParser: typeof pgTypes.getTypeParser;

  try {
    const connection = await setupPool.connect();

    getTypeParser = await createTypeOverrides(
      connection,
      clientConfiguration.typeParsers,
    );

    await connection.release();
  } finally {
    await setupPool.end();
  }

  const pool = createInternalPool(Pool, {
    ...poolConfiguration,
    types: {
      getTypeParser,
    },
  });

  return bindPool(
    Logger.child({
      poolId: getPoolState(pool).poolId,
    }),
    pool,
    clientConfiguration,
  );
};
