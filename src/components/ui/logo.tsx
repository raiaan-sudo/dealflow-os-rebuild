import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "small" | "medium" | "large";

type LogoProps = {
  size?: LogoSize;
  iconOnly?: boolean;
  className?: string;
  priority?: boolean;
};

const SIZE_MAP = {
  small: {
    full: { width: 134, height: 36 },
    icon: { width: 36, height: 36 },
  },
  medium: {
    full: { width: 178, height: 48 },
    icon: { width: 48, height: 48 },
  },
  large: {
    full: { width: 238, height: 64 },
    icon: { width: 64, height: 64 },
  },
} as const;

export function Logo({
  size = "medium",
  iconOnly = false,
  className,
  priority = false,
}: LogoProps) {
  const dimensions = iconOnly ? SIZE_MAP[size].icon : SIZE_MAP[size].full;

  return (
    <Image
      alt={iconOnly ? "DealFlow AI icon" : "DealFlow AI logo"}
      className={cn("h-auto w-auto object-contain", className)}
      src={iconOnly ? "/logo-icon.svg" : "/logo.svg"}
      width={dimensions.width}
      height={dimensions.height}
      priority={priority}
    />
  );
}

export default Logo;
