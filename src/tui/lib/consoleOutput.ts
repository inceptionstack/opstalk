const ANSI = {
  reset: "\u001B[0m",
  blue: "\u001B[34m",
  green: "\u001B[32m",
  red: "\u001B[31m",
  dim: "\u001B[2m",
  boldGreen: "\u001B[1;32m",
} as const;

export interface AssistantFormatState {
  bold: boolean;
  pendingStars: number;
  lineStart: boolean;
}

function wrap(text: string, style: string): string {
  if (!text) {
    return "";
  }

  return `${style}${text}${ANSI.reset}`;
}

function flushPendingStars(state: AssistantFormatState): void {
  while (state.pendingStars >= 2) {
    state.bold = !state.bold;
    state.pendingStars -= 2;
  }

  state.pendingStars = 0;
}

export function createAssistantFormatState(): AssistantFormatState {
  return {
    bold: false,
    pendingStars: 0,
    lineStart: true,
  };
}

export function formatAssistantDelta(text: string, state: AssistantFormatState): string {
  let output = "";
  let segment = "";

  const flushSegment = () => {
    if (!segment) {
      return;
    }

    output += wrap(segment, state.bold ? ANSI.boldGreen : ANSI.green);
    segment = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "*") {
      flushSegment();
      state.pendingStars += 1;
      continue;
    }

    if (state.pendingStars > 0) {
      flushPendingStars(state);
    }

    if (char === "\r" || char === "`" || char === "_") {
      continue;
    }

    if (state.lineStart && char === "#") {
      continue;
    }

    if (state.lineStart && (char === "-" || char === ">") && text[index + 1] === " ") {
      index += 1;
      continue;
    }

    segment += char;
    state.lineStart = char === "\n";
  }

  flushSegment();
  return output;
}

export function finishAssistantFormatting(state: AssistantFormatState): void {
  state.pendingStars = 0;
  state.bold = false;
  state.lineStart = true;
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

export function formatUserMessage(text: string): string {
  return wrap(`> ${text}`, ANSI.blue);
}

export function formatToolMessage(name: string, argsText: string, ok = true): string {
  const suffix = ok ? "✓" : "!";
  return wrap(`  → ${name}(${argsText}) ${suffix}`, ANSI.dim);
}

export function formatSystemMessage(text: string): string {
  return wrap(text, ANSI.dim);
}

export function formatErrorMessage(text: string): string {
  return wrap(`! ${text}`, ANSI.red);
}

export function formatHeader(region: string, agentSpaceId?: string): string[] {
  return [
    wrap("OpsTalk", ANSI.boldGreen),
    wrap(`Region: ${region}  Space: ${agentSpaceId ?? "-"}`, ANSI.dim),
  ];
}

export function writeLine(text = ""): void {
  process.stdout.write(`${text}\n`);
}

export function writeAssistantDelta(text: string, state: AssistantFormatState): void {
  const formatted = formatAssistantDelta(text, state);
  if (formatted) {
    process.stdout.write(formatted);
  }
}
