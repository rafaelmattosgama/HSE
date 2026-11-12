import Image from "next/image";

export type MaxMascotStatus = "idle" | "greeting" | "thinking" | "speaking" | "error";
export type MaxMascotSize = "launcher" | "header" | "avatar";

export function MaxMascot({
  status = "idle",
  size = "launcher",
  className = "",
}: {
  status?: MaxMascotStatus;
  size?: MaxMascotSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`max-mascot max-mascot--${size} max-mascot--${status} ${className}`.trim()}
    >
      <Image
        src="/mascot/max-mascot.png"
        alt=""
        width={1024}
        height={1536}
        preload={size === "launcher"}
        draggable={false}
        className="max-mascot__image"
      />
      {(size === "launcher" || size === "header") && status === "thinking" ? (
        <span className="max-mascot__indicator max-mascot__thinking" aria-hidden="true">
          <i /><i /><i />
        </span>
      ) : null}
      {(size === "launcher" || size === "header") && status === "speaking" ? (
        <span className="max-mascot__indicator max-mascot__speaking" aria-hidden="true">
          <i /><i /><i />
        </span>
      ) : null}
      {size === "launcher" && status === "error" ? (
        <span className="max-mascot__indicator max-mascot__error" aria-hidden="true">!</span>
      ) : null}
    </span>
  );
}
