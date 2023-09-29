import { type ExecutionRoutine } from '../routines/executeQuery';
import { executeQuery } from '../routines/executeQuery';
import {
  type ClientConfiguration,
  type Field,
  type Interceptor,
  type InternalStreamFunction,
  type Query,
  type QueryContext,
  type QueryStreamConfig,
  type StreamHandler,
} from '../types';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type PoolClient } from 'pg';
import QueryStream from 'pg-query-stream';

type RowTransformer = NonNullable<Interceptor['transformRow']>;

const createTransformStream = (
  connection: PoolClient,
  clientConfiguration: ClientConfiguration,
  queryContext: QueryContext,
  query: Query,
) => {
  const rowTransformers: RowTransformer[] = [];

  for (const interceptor of clientConfiguration.interceptors) {
    if (interceptor.transformRow) {
      rowTransformers.push(interceptor.transformRow);
    }
  }

  let fields: readonly Field[] = [];

  // `rowDescription` will not fire if the query produces a syntax error.
  // Also, `rowDescription` won't fire until client starts consuming the stream.
  // This is why we cannot simply await for `rowDescription` event before starting to pipe the stream.
  // @ts-expect-error – https://github.com/brianc/node-postgres/issues/3015
  connection.connection.once('rowDescription', (rowDescription) => {
    fields = rowDescription.fields.map((field) => {
      return {
        dataTypeId: field.dataTypeID,
        name: field.name,
      };
    });
  });

  return new Transform({
    objectMode: true,
    transform(datum, enc, callback) {
      if (!fields) {
        callback(new Error('Fields not available'));

        return;
      }

      let finalRow = datum;

      if (rowTransformers.length) {
        for (const rowTransformer of rowTransformers) {
          finalRow = rowTransformer(queryContext, query, finalRow, fields);
        }
      }

      // eslint-disable-next-line @babel/no-invalid-this
      this.push({
        data: finalRow,
        fields,
      });

      callback();
    },
  });
};

const createExecutionRoutine = <T>(
  clientConfiguration: ClientConfiguration,
  onStream: StreamHandler<T>,
  streamOptions?: QueryStreamConfig,
): ExecutionRoutine => {
  return async (connection, sql, values, executionContext, actualQuery) => {
    const streamEndResultRow = {
      command: 'SELECT',
      fields: [],
      notices: [],
      rowCount: 0,
      rows: [],
    } as const;

    const queryStream: Readable = connection.query(
      new QueryStream(sql, values as unknown[], streamOptions),
    );

    const transformStream = createTransformStream(
      connection,
      clientConfiguration,
      executionContext,
      actualQuery,
    );

    onStream(transformStream);

    await pipeline(queryStream, transformStream);

    return streamEndResultRow;
  };
};

export const stream: InternalStreamFunction = async (
  connectionLogger,
  connection,
  clientConfiguration,
  slonikSql,
  onStream,
  uid,
  streamOptions,
) => {
  return await executeQuery(
    connectionLogger,
    connection,
    clientConfiguration,
    slonikSql,
    undefined,
    createExecutionRoutine(clientConfiguration, onStream, streamOptions),
  );
};
