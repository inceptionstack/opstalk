import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

const { deserializeMock } = vi.hoisted(() => ({
  deserializeMock: vi.fn(),
}));

vi.mock("@smithy/eventstream-serde-node", () => ({
  eventStreamSerdeProvider: vi.fn(() => ({
    deserialize: deserializeMock,
  })),
}));

describe("parseEventStream", () => {
  it("yields parsed events from the serde iterable", async () => {
    const first = {
      contentBlockDelta: {
        headers: {},
        body: new TextEncoder().encode(JSON.stringify({ index: 0, delta: { textDelta: { text: "hello" } } })),
      },
    };
    const second = {
      responseCompleted: {
        headers: {},
        body: new TextEncoder().encode(JSON.stringify({ usage: { totalTokens: 12 } })),
      },
    };

    deserializeMock.mockImplementation(async function* (
      stream: NodeJS.ReadableStream,
      deserializeMessage: (event: Record<string, { headers: Record<string, unknown>; body: Uint8Array }>) => Promise<unknown>,
    ) {
      expect(stream.readable).toBe(true);
      yield await deserializeMessage(first);
      yield await deserializeMessage(second);
    });

    const { parseEventStream } = await import("../agent/eventParser.js");
    const events = [];

    for await (const event of parseEventStream(Readable.from([Buffer.from("unused")]))) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "contentBlockDelta",
        payload: {
          index: 0,
          delta: {
            textDelta: {
              text: "hello",
            },
          },
        },
      },
      {
        type: "responseCompleted",
        payload: {
          usage: {
            totalTokens: 12,
          },
        },
      },
    ]);
  });

  it("throws on malformed messages", async () => {
    deserializeMock.mockImplementation(async function* (
      _stream: NodeJS.ReadableStream,
      deserializeMessage: (event: Record<string, { headers: Record<string, unknown>; body: Uint8Array }>) => Promise<unknown>,
    ) {
      yield await deserializeMessage({});
    });

    const { parseEventStream } = await import("../agent/eventParser.js");

    await expect(async () => {
      for await (const _event of parseEventStream(Readable.from([Buffer.from("unused")]))) {
        // no-op
      }
    }).rejects.toThrow("Malformed event stream message");
  });
});
