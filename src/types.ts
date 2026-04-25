import type { SVGProps } from "react";

export type LucideProps = SVGProps<SVGSVGElement> & {
  size?: string | number;
  absoluteStrokeWidth?: boolean;
};

export type IconNode = Array<
  [tag: keyof JSX.IntrinsicElements, attrs: Record<string, string | number | undefined>]
>;
