/**
 * node:sqlite ships with the Node runtime this project runs on (22.5+; this machine has 25), but the
 * installed @types/node is v20 and predates it. This declares the small part the app uses.
 */
declare module "node:sqlite" {
  type Value = null | number | bigint | string | Uint8Array
  interface StatementSync {
    run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint }
    get(...params: Value[]): unknown
    all(...params: Value[]): unknown[]
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}

declare namespace NodeJS {
  interface Process {
    /** Node 22.3+: load a built-in module without going through the bundler */
    getBuiltinModule(id: string): unknown
  }
}
