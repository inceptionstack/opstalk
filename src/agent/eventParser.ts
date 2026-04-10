import { Readable } from "node:stream";

import { eventStreamSerdeProvider } from "@smithy/eventstream-serde-node";

import type { SendMessageEvent } from "./types.js";

type Message = {
  headers: Record<string, unknown>;
  body: Uint8Array;
};

const decoder = new TextDecoder("utf-8");

function encodeUtf8(input: string | Uint8Array): string {
  if (typeof input === "string") {
    return input;
  }

  return decoder.decode(input);
}

function decodeUtf8(input: string | Uint8Array): Uint8Array {
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }

  return input;
}

function toNodeReadable(stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream): NodeJS.ReadableStream {
  if (typeof (stream as ReadableStream<Uint8Array>).getReader === "function") {
    return Readable.fromWeb(stream as never);
  }

  return stream as NodeJS.ReadableStream;
}

async function deserializeMessage(event: Record<string, Message>): Promise<SendMessageEvent> {
  const [eventType, message] = Object.entries(event)[0] ?? [];

  if (!eventType || !message) {
    throw new Error("Malformed event stream message");
  }

  const bodyText = message.body.byteLength > 0 ? decoder.decode(message.body) : "{}";
  const payload = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};

  return {
    type: eventType as SendMessageEvent["type"],
    payload: payload as SendMessageEvent["payload"],
  } as SendMessageEvent;
}

export async function* parseEventStream(
  stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
): AsyncIterable<SendMessageEvent> {
  const marshaller = eventStreamSerdeProvider({
    utf8Encoder: encodeUtf8,
    utf8Decoder: decodeUtf8,
  });

  const iterable = marshaller.deserialize(toNodeReadable(stream), deserializeMessage);

  for await (const event of iterable) {
    yield event;
  }
}
