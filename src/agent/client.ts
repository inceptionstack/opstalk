import crypto from "node:crypto";

import { defaultProvider } from "@aws-sdk/credential-providers";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

import { parseEventStream } from "./eventParser.js";
import type {
  AgentSpace,
  ChatExecution,
  CreateChatInput,
  DevOpsAgentClientConfig,
  JournalRecord,
  SendMessageEvent,
  SendMessageInput,
  UserType,
} from "./types.js";

interface JsonResponse<T> {
  statusCode: number;
  data: T;
}

interface SignedRequestOptions {
  hostPrefix?: string;
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: string;
  contentType?: string;
}

interface ListAgentSpacesOutput {
  agentSpaces: AgentSpace[];
  nextToken?: string;
}

interface CreateChatOutput {
  executionId: string;
  createdAt: string;
}

interface ListChatsOutput {
  executions: ChatExecution[];
  nextToken?: string;
}

interface ListJournalRecordsOutput {
  records: JournalRecord[];
  nextToken?: string;
}

function toIsoString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  return new Date(String(value)).toISOString();
}

export class DevOpsAgentClient {
  private readonly region: string;
  private readonly credentialsProvider: NonNullable<DevOpsAgentClientConfig["credentialsProvider"]>;
  private readonly fetchImpl: typeof fetch;
  private readonly signer: SignatureV4;

  public constructor(config: DevOpsAgentClientConfig) {
    this.region = config.region;
    this.credentialsProvider = config.credentialsProvider ?? defaultProvider();
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.signer = new SignatureV4({
      credentials: this.credentialsProvider,
      region: this.region,
      service: "devops-agent",
      sha256: class Sha256 {
        private readonly hash = crypto.createHash("sha256");

        public update(data: string | Uint8Array): void {
          this.hash.update(data);
        }

        public async digest(): Promise<Uint8Array> {
          return this.hash.digest();
        }
      } as never,
    });
  }

  public async listAgentSpaces(nextToken?: string, maxResults = 50): Promise<ListAgentSpacesOutput> {
    const response = await this.sendJson<ListAgentSpacesOutput>({
      method: "GET",
      path: "/agents/list-agent-spaces",
      query: {
        maxResults: String(maxResults),
        nextToken,
      },
    });

    return {
      agentSpaces: (response.data.agentSpaces ?? []).map((space) => ({
        ...space,
        agentSpaceId: space.agentSpaceId,
      })),
      nextToken: response.data.nextToken,
    };
  }

  public async createChat(input: CreateChatInput): Promise<CreateChatOutput> {
    const query = new URLSearchParams({
      userId: input.userId,
    });

    if (input.userType) {
      query.set("userType", input.userType);
    }

    const response = await this.sendJson<CreateChatOutput>({
      method: "POST",
      path: `/agents/agent-space/${encodeURIComponent(input.agentSpaceId)}/chat`,
      query: Object.fromEntries(query.entries()),
    });

    return {
      executionId: response.data.executionId,
      createdAt: toIsoString(response.data.createdAt),
    };
  }

  public async listChats(input: {
    agentSpaceId: string;
    userId: string;
    nextToken?: string;
    maxResults?: number;
  }): Promise<ListChatsOutput> {
    const response = await this.sendJson<ListChatsOutput>({
      method: "GET",
      path: `/agents/agent-space/${encodeURIComponent(input.agentSpaceId)}/chats`,
      query: {
        userId: input.userId,
        maxResults: input.maxResults ? String(input.maxResults) : undefined,
        nextToken: input.nextToken,
      },
    });

    return {
      executions: (response.data.executions ?? []).map((execution) => ({
        ...execution,
        createdAt: toIsoString(execution.createdAt),
        updatedAt: execution.updatedAt ? toIsoString(execution.updatedAt) : undefined,
      })),
      nextToken: response.data.nextToken,
    };
  }

  public async listJournalRecords(input: {
    agentSpaceId: string;
    executionId: string;
    nextToken?: string;
    limit?: number;
  }): Promise<ListJournalRecordsOutput> {
    const response = await this.sendJson<ListJournalRecordsOutput>({
      method: "GET",
      path: `/agents/agent-space/${encodeURIComponent(input.agentSpaceId)}/executions/${encodeURIComponent(
        input.executionId,
      )}/journal`,
      query: {
        nextToken: input.nextToken,
        limit: input.limit ? String(input.limit) : undefined,
      },
    });

    return {
      records: (response.data.records ?? []).map((record) => ({
        ...record,
        createdAt: toIsoString(record.createdAt),
      })),
      nextToken: response.data.nextToken,
    };
  }

  public async *sendMessage(input: SendMessageInput): AsyncIterable<SendMessageEvent> {
    const response = await this.sendStreaming({
      hostPrefix: "dp.",
      method: "POST",
      path: `/agents/agent-space/${encodeURIComponent(input.agentSpaceId)}/chat/sendMessage`,
      body: JSON.stringify({
        executionId: input.executionId,
        content: input.content,
        context: input.context,
        userId: input.userId,
      }),
      contentType: "application/json",
    });

    if (!response.body) {
      throw new Error("SendMessage returned an empty response stream");
    }

    for await (const event of parseEventStream(response.body)) {
      yield event;
    }
  }

  public async resolveDefaultUserType(): Promise<UserType> {
    return "IAM";
  }

  private async sendJson<T>(options: SignedRequestOptions): Promise<JsonResponse<T>> {
    const response = await this.send(options);
    const text = await response.text();
    const data = text.length > 0 ? (JSON.parse(text) as T) : ({} as T);

    return {
      statusCode: response.status,
      data,
    };
  }

  private async sendStreaming(options: SignedRequestOptions): Promise<Response> {
    const response = await this.send({
      ...options,
      contentType: options.contentType ?? "application/json",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DevOps Agent request failed (${response.status}): ${errorText || response.statusText}`);
    }

    return response;
  }

  private async send(options: SignedRequestOptions): Promise<Response> {
    const host = `${options.hostPrefix ?? ""}devops-agent.${this.region}.amazonaws.com`;
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value.length > 0) {
        query.set(key, value);
      }
    }

    const request = new HttpRequest({
      protocol: "https:",
      hostname: host,
      method: options.method,
      path: options.path,
      query: Object.fromEntries(query.entries()),
      headers: {
        host,
        accept: "application/json, application/vnd.amazon.eventstream",
        ...(options.contentType ? { "content-type": options.contentType } : {}),
      },
      body: options.body,
    });

    const signed = await this.signer.sign(request);
    const url = new URL(`https://${host}${options.path}`);

    for (const [key, value] of Object.entries(query.entries ? Object.fromEntries(query.entries()) : {})) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchImpl(url, {
      method: signed.method,
      headers: signed.headers as HeadersInit,
      body: signed.body as BodyInit | null | undefined,
    });

    if (!response.ok && response.body == null) {
      const errorText = await response.text();
      throw new Error(`DevOps Agent request failed (${response.status}): ${errorText || response.statusText}`);
    }

    return response;
  }
}
