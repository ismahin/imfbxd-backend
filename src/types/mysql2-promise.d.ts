declare module "mysql2/promise" {
  import type { ConnectionOptions } from "mysql2";
  export interface Connection {
    query<T = unknown>(sql: string, values?: unknown): Promise<[T, unknown]>;
    end(): Promise<void>;
    release(): void;
  }
  export interface Pool {
    getConnection(): Promise<Connection>;
    query<T = unknown>(sql: string, values?: unknown): Promise<[T, unknown]>;
    end(): Promise<void>;
  }
  export interface PoolOptions extends ConnectionOptions {
    connectionLimit?: number;
    queueLimit?: number;
    waitForConnections?: boolean;
  }
  export function createConnection(config: ConnectionOptions): Promise<Connection>;
  export function createPool(config: PoolOptions): Pool;
}
