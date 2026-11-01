/** Product mark: three rows of a table being lifted out of a frame. Original artwork. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-accent" />
      <rect x="7" y="8" width="12" height="3" rx="1.5" fill="white" />
      <rect x="7" y="14.5" width="18" height="3" rx="1.5" fill="white" opacity="0.85" />
      <rect x="7" y="21" width="9" height="3" rx="1.5" fill="white" opacity="0.7" />
      <circle cx="24" cy="9.5" r="3" fill="white" opacity="0.95" />
    </svg>
  );
}
