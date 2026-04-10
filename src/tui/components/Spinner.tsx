import React, { useEffect, useState } from "react";
import { Text } from "ink";

const FRAMES = ["-", "\\", "|", "/"];

export function Spinner({ label }: { label?: string }): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, 100);

    return () => clearInterval(timer);
  }, []);

  return (
    <Text color="yellow">
      {FRAMES[frame]} {label ?? "Working"}
    </Text>
  );
}
