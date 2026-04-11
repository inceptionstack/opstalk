import crypto from "node:crypto";

import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { Hash as NodeHash } from "@smithy/hash-node";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

import { parseEventStream } from "./eventParser.js";
import type {
  AgentSpace,
  ChatExecution,
  CreateAgentSpaceInput,
  CreateChatInput,
  DevOpsAgentClientConfig,
  JournalRecord,
  SendMessageEvent,
  SendMessageInput,
  UserType,
} from "./types.js";

interface JsonResponse<T> { statusCode: number; data: T; }

interface SignedRequestOptions {
  plane?: "cp" | "dp";
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: string;
  contentType?: string;
}

interface ListAgentSpacesOutput { agentSpaces: AgentSpace[]; nextToken?: string; }
interface CreateChatOutput { executionId: string; createdAt: string; }
interface ListChatsOutput { executions: ChatExecution[]; nextToken?: string; }
interface ListJournalRecordsOutput { records: JournalRecord[]; nextToken?: string; }

function toIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  return new Date(String(value)).toISOString();
}

class Sha256Hash {
  private readonly hash = crypto.createHash("sha256");
  public update(data: string | Uint8Array): void { this.hash.update(data); }
  public async digest(): Promise<Uint8Array> { return this.hash.digest(); }
}

export class DevOpsAgentClient {
  private readonly region: string;
  private readonly credentialsProvider: NonNullable<DevOpsAgentClientConfig["credentialsProvider"]>;
  private readonly fetchImpl: typeof fetch;
  private readonly signer: SignatureV4;

  public constructor(config: DevOpsAgentClientConfig) {
    this.region = config.region;
    this.credentialsProvider = config.credentialsProvider ?? fromNodeProviderChain();
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.signer = new SignatureV4({
      credentials: this.credentialsProvider,
      region: this.region,
      service: "aidevops",
      sha256: NodeHash.bind(null, "sha256") as never,
    });
  }

  public async listAgentSpaces(nextToken?: string, maxResults = 50): Promise<ListAgentSpacesOutput> {
    const r = await this.sendJson<ListAgentSpacesOutput>({
      plane: "cp", method: "POST", path: "/v1/agentspaces/list",
      body: JSON.stringify(nextToken ? { nextToken, maxResults } : { maxResults }),
      contentType: "application/json",
    });
    return { agentSpaces: r.data.agentSpaces ?? [], nextToken: r.data.nextToken };
  }

  public async createAgentSpace(input: CreateAgentSpaceInput): Promise<AgentSpace> {
    const r = await this.sendJson<{ agentSpace: AgentSpace }>({
      plane: "cp", method: "POST", path: "/v1/agentspaces",
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        ...(input.kmsKeyArn ? { kmsKeyArn: input.kmsKeyArn } : {}),
      }),
      contentType: "application/json",
    });
    return r.data.agentSpace;
  }

  public async createChat(input: CreateChatInput): Promise<CreateChatOutput> {
    const r = await this.sendJson<CreateChatOutput>({
      plane: "dp", method: "POST",
      path: `/agents/agent-space/${encodeURIComponent(input.agentSpaceId)}/chat/create`,
      body: JSON.stringify({ userId: input.userId, userType: input.userType ?? "IAM" }),
      contentType: "application/json",
    });
    return { executionId: r.data.executionId, createdAt: toIsoString(r.data.createdAt) };
  }

  public async listChats(input: { agentSpaceId: string; userId: string; nextToken?: string; maxResults?: number }): Promise<ListChatsOutput> {
    const r = await this.sendJson<ListChatsOutput>({
      plane: "dp", method: "GET",
      path: `/agents/agent-space/${encodeURIComponent(input.agentSpaceId)}/chat/list`,
      query: { userId: input.userId, maxResults: input.maxResults ? String(input.maxResults) : undefined, nextToken: input.nextToken },
    });
    return {
      executions: (r.data.executions ?? []).map(e => ({ ...e, createdAt: toIsoString(e.createdAt), updatedAt: e.updatedAt ? toIsoString(e.updatedAt) : undefined })),
      nextToken: r.data.nextToken,
    };
  }

  public async listJournalRecords(input: { agentSpaceId: string; executionId: string; nextToken?: string; limit?: number }): Promise<ListJournalRecordsOutput> {
    const r = await this.sendJson<ListJournalRecordsOutput>({
      plane: "dp", method: "POST",
      path: `/journal/agent-space/${encodeURIComponent(input.agentSpaceId)}/journalRecords`,
      body: JSON.stringify({ executionId: input.executionId, ...(input.nextToken ? { nextToken: input.nextToken } : {}), ...(input.limit ? { maxResults: input.limit } : {}) }),
      contentType: "application/json",
    });
    return { records: (r.data.records ?? []).map(r2 => ({ ...r2, createdAt: toIsoString(r2.createdAt) })), nextToken: r.data.nextToken };
  }

  public async associateService(input: {
    agentSpaceId: string;
    serviceId: string;
    configuration: Record<string, unknown>;
  }): Promise<void> {
    await this.sendJson({
      plane: "cp", method: "POST",
      path: `/v1/agentspaces/${encodeURIComponent(input.agentSpaceId)}/associations`,
      body: JSON.stringify({
        serviceId: input.serviceId,
        configuration: input.configuration,
      }),
      contentType: "application/json",
    });
  }

  public async associateMonitorAccount(input: {
    agentSpaceId: string;
    accountId: string;
    assumableRoleArn: string;
  }): Promise<void> {
    await this.associateService({
      agentSpaceId: input.agentSpaceId,
      serviceId: "aws",
      configuration: {
        aws: {
          accountId: input.accountId,
          accountType: "monitor",
          assumableRoleArn: input.assumableRoleArn,
        },
      },
    });
  }

  public async enableOperatorApp(input: {
    agentSpaceId: string;
    authFlow: string;
    operatorAppRoleArn: string;
  }): Promise<void> {
    await this.sendJson({
      plane: "cp", method: "POST",
      path: `/v1/agentspaces/${encodeURIComponent(input.agentSpaceId)}/operator`,
      body: JSON.stringify({
        authFlow: input.authFlow,
        operatorAppRoleArn: input.operatorAppRoleArn,
      }),
      contentType: "application/json",
    });
  }

  public async *sendMessage(input: SendMessageInput): AsyncIterable<SendMessageEvent> {
    const response = await this.sendStreaming({
      plane: "dp", method: "POST",
      path: `/agents/agent-space/${encodeURIComponent(input.agentSpaceId)}/chat/sendMessage`,
      body: JSON.stringify({ executionId: input.executionId, content: input.content, userId: input.userId, ...(input.context ? { context: input.context } : {}) }),
      contentType: "application/json",
    });
    if (!response.body) throw new Error("SendMessage returned empty response stream");
    for await (const event of parseEventStream(response.body)) yield event;
  }

  public resolveDefaultUserType(): UserType { return "IAM"; }

  private host(plane: "cp" | "dp"): string { return `${plane}.aidevops.${this.region}.api.aws`; }

  private async sendJson<T>(options: SignedRequestOptions): Promise<JsonResponse<T>> {
    const response = await this.send(options);
    const text = await response.text();
    if (!response.ok) throw new Error(`DevOps Agent error (${response.status}): ${text || response.statusText}`);
    const data = text.length > 0 ? (JSON.parse(text) as T) : ({} as T);
    return { statusCode: response.status, data };
  }

  private async sendStreaming(options: SignedRequestOptions): Promise<Response> {
    const response = await this.send(options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DevOps Agent request failed (${response.status}): ${errorText || response.statusText}`);
    }
    return response;
  }

  private async send(options: SignedRequestOptions): Promise<Response> {
    const plane = options.plane ?? "cp";
    const host = this.host(plane);
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined && v.length > 0) query[k] = v;
    }

    const request = new HttpRequest({
      protocol: "https:",
      hostname: host,
      method: options.method,
      path: options.path,
      query,
      headers: {
        host,
        accept: "application/json, application/vnd.amazon.eventstream",
        ...(options.contentType ? { "content-type": options.contentType } : {}),
        ...(options.body ? { "content-length": String(Buffer.byteLength(options.body)) } : {}),
      },
      body: options.body,
    });

    const signed = await this.signer.sign(request);
    const url = new URL(`https://${host}${options.path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    return this.fetchImpl(url, {
      method: signed.method,
      headers: signed.headers as HeadersInit,
      body: options.body as BodyInit | null | undefined,
    });
  }
}
