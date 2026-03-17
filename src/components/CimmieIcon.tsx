interface CimmieIconProps {
  className?: string;
  size?: number;
}

export default function CimmieIcon({ className = '', size = 28 }: CimmieIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" fill="currentColor" opacity="0.15" />
      <path
        d="M10 12h12v2H10V12zm0 4h10v2H10v-2zm0 4h8v2h-8v-2z"
        fill="currentColor"
      />
      <circle cx="22" cy="10" r="3" fill="var(--color-accent, #e07c24)" />
    </svg>
  );
}
