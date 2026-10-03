export function BrandLogo({ className = "brand-logo" }: { className?: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      data-testid="a7-tagam-logo"
      decoding="async"
      height="96"
      src="/a7-tagam-logo.webp"
      width="96"
    />
  );
}
