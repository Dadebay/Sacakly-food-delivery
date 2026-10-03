import type { SVGProps } from "react";

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.5 3.5h3l1.3 4-2 1.4a11.5 11.5 0 0 0 5.3 5.3l1.4-2 4 1.3v3a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 5 5.1 1.5 1.5 0 0 1 6.5 3.5Z" />
    </svg>
  );
}
