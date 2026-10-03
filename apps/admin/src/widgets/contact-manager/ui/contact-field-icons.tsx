import type { SVGProps } from "react";

function baseProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function StorefrontIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 10.5 5.2 4h13.6l1.2 6.5" />
      <path d="M4 10.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5.5 10.8V20h13v-9.2" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6.5 3.5h3l1.3 4-2 1.4a11.5 11.5 0 0 0 5.3 5.3l1.4-2 4 1.3v3a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 5 5.1 1.5 1.5 0 0 1 6.5 3.5Z" />
    </svg>
  );
}

export function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <path d="m3.5 12.3 16-6.8-2.8 15-5-3.6-2.6 2.5-.5-4.2Z" />
      <path d="m8.7 15.3 8.3-7.6" />
    </svg>
  );
}

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 6.5 8 6.5 8-6.5" />
    </svg>
  );
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.8 12.6 5.2a3 3 0 0 1 4.2 4.2l-1.6 1.6" />
      <path d="M13 17.2 11.4 18.8a3 3 0 0 1-4.2-4.2l1.6-1.6" />
    </svg>
  );
}
