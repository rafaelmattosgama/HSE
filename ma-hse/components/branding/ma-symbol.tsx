type MaSymbolProps = {
  className?: string;
  title?: string;
};

export function MaSymbol({ className, title }: MaSymbolProps) {
  const labelled = Boolean(title);

  return (
    <svg
      viewBox="0 0 164 64"
      className={className}
      role={labelled ? "img" : "presentation"}
      aria-hidden={labelled ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 20C25 11 139 11 157 20V44C139 53 25 53 7 44Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M56 40V24h6.5L72 34.6 81.5 24H88v16h-5v-8.7l-8.2 9.2h-5.5L61 31.3V40Z"
        fill="currentColor"
      />
      <path
        d="M99.8 40 108 24h7.6l8.2 16H118l-1.5-3.1h-9.4L105.6 40Zm9.3-7.5h5.4l-2.7-5.8Z"
        fill="currentColor"
      />
    </svg>
  );
}
