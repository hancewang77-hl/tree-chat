import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  decorative?: boolean;
  markOnly?: boolean;
  tone?: "brand" | "light";
};

export function BrandLogo({
  className = "",
  compact = false,
  decorative = false,
  markOnly = false,
  tone = "brand",
}: BrandLogoProps) {
  const showsWordmark = !markOnly && !compact;
  const classes = [
    "brand-logo",
    compact ? "brand-logo--compact" : "",
    markOnly ? "brand-logo--mark-only" : "",
    tone === "light" ? "brand-logo--light" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <Image
        className="brand-logo__mark"
        src="/assets/brand/tree-chat-mark.png"
        width={735}
        height={550}
        sizes={compact ? "76px" : "112px"}
        alt={decorative || showsWordmark ? "" : "智构树语 Tree Chat"}
      />
      {showsWordmark && (
        <span className="brand-logo__wordmark">
          <strong>Tree Chat</strong>
          <small>智构树语</small>
        </span>
      )}
    </span>
  );
}
