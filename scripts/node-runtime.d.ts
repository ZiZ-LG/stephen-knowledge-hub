declare const process: {
  readonly execPath: string;
  readonly env: Record<string, string | undefined>;
  readonly argv: readonly string[];
  cwd(): string;
  exitCode: number | undefined;
  readonly stdout: { write(value: string): void };
  readonly stderr: { write(value: string): void };
};

declare module 'node:fs/promises' {
  interface DirectoryEntry {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }

  export function mkdir(
    path: string,
    options: { readonly recursive: true },
  ): Promise<string | undefined>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function lstat(path: string): Promise<{
    readonly mode: number;
    readonly size: number;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }>;
  export function chmod(path: string, mode: number): Promise<void>;
  export function readdir(
    path: string,
    options: { readonly withFileTypes: true },
  ): Promise<readonly DirectoryEntry[]>;
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function rm(
    path: string,
    options: { readonly recursive: true; readonly force: true },
  ): Promise<void>;
  export function rm(path: string): Promise<void>;
  export function symlink(target: string, path: string): Promise<void>;
  export function stat(path: string): Promise<{ readonly mode: number }>;
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  export function writeFile(
    path: string,
    data: string,
    options: { readonly encoding: 'utf8'; readonly flag: 'wx' },
  ): Promise<void>;
  export function writeFile(path: string, data: Uint8Array): Promise<void>;
}

declare module 'node:child_process' {
  interface ChildReadableStream {
    setEncoding(encoding: 'utf8'): void;
    on(event: 'data', listener: (chunk: string) => void): void;
  }

  interface ChildProcess {
    readonly stderr: ChildReadableStream;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'close', listener: (code: number | null) => void): void;
  }

  export interface SpawnSyncResult {
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
  }

  export function spawnSync(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd?: string;
      readonly encoding: 'utf8';
      readonly env?: Record<string, string | undefined>;
      readonly input?: Uint8Array;
    },
  ): SpawnSyncResult;

  export function spawn(
    command: string,
    args: readonly string[],
    options: { readonly env?: Record<string, string | undefined> },
  ): ChildProcess;
}

declare module 'node:crypto' {
  interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: 'hex'): string;
  }

  export function createHash(algorithm: 'sha256'): Hash;
}

declare module 'node:path' {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function join(...paths: readonly string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: readonly string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:http' {
  interface IncomingMessage {
    readonly headers: Record<string, string | readonly string[] | undefined>;
    readonly url?: string;
  }

  interface ServerResponse {
    writeHead(statusCode: number, headers: Readonly<Record<string, string>>): void;
    end(body?: string): void;
  }

  interface AddressInfo {
    readonly port: number;
  }

  interface Server {
    readonly listening: boolean;
    listen(port: number, hostname: string, callback: () => void): void;
    address(): AddressInfo | string | null;
    close(callback: (error?: Error) => void): void;
  }

  export function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void,
  ): Server;
}

declare module 'node:url' {
  export function fileURLToPath(url: URL): string;
}
