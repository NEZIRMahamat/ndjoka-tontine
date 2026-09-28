type Props = { className?: string }

export function NdjokaLogoFull({ className }: Props) {
  return (
    <svg viewBox="60 30 600 175" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Ndjoka Tontine Digitale">
      <g transform="translate(60,40)">
        <g fill="#1DA35A">
          <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(0 90 90)" />
          <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(60 90 90)" />
          <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(120 90 90)" />
          <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(180 90 90)" />
          <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(240 90 90)" />
          <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(300 90 90)" />
        </g>
        <circle cx="90" cy="90" r="28" fill="#FAEEDA" />
        <text x="205" y="107" fontFamily="Georgia, serif" fontSize="75" fontWeight="700" fill="#166534">Ndjoka</text>
        <text x="207" y="140" fontFamily="Arial, sans-serif" fontSize="19" letterSpacing="3" fill="#1DA35A">TONTINE DIGITALE</text>
      </g>
    </svg>
  )
}

export function NdjokaIcon({ className }: Props) {
  return (
    <svg viewBox="25 25 130 130" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Ndjoka">
      <g fill="#1DA35A">
        <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(0 90 90)" />
        <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(60 90 90)" />
        <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(120 90 90)" />
        <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(180 90 90)" />
        <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(240 90 90)" />
        <ellipse cx="90" cy="55" rx="26" ry="42" transform="rotate(300 90 90)" />
      </g>
      <circle cx="90" cy="90" r="28" fill="#FAEEDA" />
    </svg>
  )
}
