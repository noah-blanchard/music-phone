"use client";

import { initial, playerColor } from "@/lib/colors";

interface Props {
  id: string;
  name: string;
  size?: number;
  dim?: boolean;
}

/** Round signature-colored avatar with the player's initial. */
export function PlayerAvatar({ id, name, size = 44, dim }: Props) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        opacity: dim ? 0.4 : 1,
        ["--av" as string]: playerColor(id),
      }}
      title={name}
    >
      {initial(name)}
    </div>
  );
}
