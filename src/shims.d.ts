declare namespace React {
  type ReactNode = unknown;
  interface ReactElement<P = unknown> {
    props: P;
  }
  interface FC<P = unknown> {
    (props: P): ReactElement | null;
  }
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: unknown;
  }
  interface IntrinsicElements {
    [elemName: string]: unknown;
  }
}

declare module "react" {
  export = React;
  export as namespace React;
  export const createContext: <T>(value: T) => {
    Provider: (props: { value: T; children?: React.ReactNode }) => React.ReactElement;
  };
  export const useContext: <T>(context: { Provider: unknown }) => T;
  export const useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
  export const useMemo: <T>(factory: () => T, deps: unknown[]) => T;
  export const useState: {
    <T>(initial: T): [T, (value: T | ((current: T) => T)) => void];
    <T = undefined>(): [T | undefined, (value: T | undefined | ((current: T | undefined) => T | undefined)) => void];
  };
  export const useCallback: <T extends (...args: never[]) => unknown>(callback: T, deps: unknown[]) => T;
  export const useRef: <T>(initial: T) => { current: T };
}

declare module "react/jsx-runtime" {
  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: unknown, key?: unknown): React.ReactElement;
  export function jsxs(type: unknown, props: unknown, key?: unknown): React.ReactElement;
}

declare module "ink" {
  export const Box: (props: Record<string, unknown>) => React.ReactElement;
  export const Text: (props: Record<string, unknown>) => React.ReactElement;
  export function Static<T>(props: { items: T[]; children: (item: T, index: number) => React.ReactElement }): React.ReactElement;
  export function render(node: React.ReactElement): { unmount: () => void };
  export function useInput(handler: (input: string, key: Record<string, boolean>) => void | Promise<void>): void;
  export function useStdout(): { stdout?: { columns?: number; rows?: number } };
  export function useApp(): { exit: () => void };
}

declare module "ink-text-input" {
  const TextInput: (props: {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
  }) => React.ReactElement;
  export default TextInput;
}

declare module "commander" {
  export class Command {
    name(value: string): this;
    description(value: string): this;
    option(flags: string, description?: string): this;
    argument(flags: string, description?: string): this;
    command(name: string): Command;
    action(handler: (...args: any[]) => unknown): this;
    parseAsync(argv: string[]): Promise<void>;
  }
}

declare module "@aws-sdk/credential-providers" {
  export function defaultProvider(): () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }>;
  export function fromNodeProviderChain(): () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }>;
}

declare module "@aws-sdk/client-iam" {
  export class IAMClient {
    constructor(config?: { region?: string });
    send(command: unknown): Promise<{
      Role?: {
        Arn?: string;
      };
    }>;
  }
  export class CreateRoleCommand {
    constructor(input: {
      RoleName: string;
      AssumeRolePolicyDocument: string;
    });
  }
  export class GetRoleCommand {
    constructor(input: {
      RoleName: string;
    });
  }
  export class AttachRolePolicyCommand {
    constructor(input: {
      RoleName: string;
      PolicyArn: string;
    });
  }
  export class PutRolePolicyCommand {
    constructor(input: {
      RoleName: string;
      PolicyName: string;
      PolicyDocument: string;
    });
  }
}

declare module "@aws-sdk/client-sts" {
  export class STSClient {
    constructor(config?: { region?: string });
    send(command: unknown): Promise<{
      Account?: string;
    }>;
  }
  export class GetCallerIdentityCommand {
    constructor(input: Record<string, never>);
  }
}

declare module "marked" {
  export const marked: {
    (text: string): string;
    use: (...args: unknown[]) => void;
  };
}

declare module "marked-terminal" {
  export function markedTerminal(options?: Record<string, unknown>): unknown;
}
