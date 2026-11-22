import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => <Icon {...p}><path d="M3 10.5 12 3l9 7.5V21H3z" /><path d="M9 21v-7h6v7" /></Icon>;
export const BooksIcon = (p: IconProps) => <Icon {...p}><path d="M4 4h6v16H4z" /><path d="M14 4h6v16h-6z" /><path d="M10 7h4M10 12h4M10 17h4" /></Icon>;
export const CollectionIcon = (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></Icon>;
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const SettingsIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1Z" /></Icon>;
export const PlayIcon = (p: IconProps) => <Icon {...p}><path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none" /></Icon>;
export const PauseIcon = (p: IconProps) => <Icon {...p}><path d="M7 4h4v16H7zM14 4h4v16h-4z" fill="currentColor" stroke="none" /></Icon>;
export const SkipBackIcon = (p: IconProps) => <Icon {...p}><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></Icon>;
export const SkipForwardIcon = (p: IconProps) => <Icon {...p}><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v5h-5" /></Icon>;
export const RewindIcon = (p: IconProps) => <Icon {...p}><path d="M11 8 6 12l5 4z" fill="currentColor" stroke="none" /><text x="12" y="16" fontSize="10" fill="currentColor" stroke="none">15</text></Icon>;
export const ForwardIcon = (p: IconProps) => <Icon {...p}><path d="M13 8l5 4-5 4z" fill="currentColor" stroke="none" /><text x="1" y="16" fontSize="10" fill="currentColor" stroke="none">30</text></Icon>;
export const BookmarkIcon = (p: IconProps) => <Icon {...p}><path d="M6 3h12v18l-6-4-6 4z" /></Icon>;
export const SleepIcon = (p: IconProps) => <Icon {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></Icon>;
export const SpeedIcon = (p: IconProps) => <Icon {...p}><path d="M12 14 16 8" /><circle cx="12" cy="14" r="8" /><path d="M5 19h14" /></Icon>;
export const DownloadIcon = (p: IconProps) => <Icon {...p}><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v4h16v-4" /></Icon>;
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="m4 12 5 5L20 6" /></Icon>;
export const ChevronRight = (p: IconProps) => <Icon {...p}><path d="m9 5 7 7-7 7" /></Icon>;
export const ChevronLeft = (p: IconProps) => <Icon {...p}><path d="m15 5-7 7 7 7" /></Icon>;
export const ChevronDown = (p: IconProps) => <Icon {...p}><path d="m5 9 7 7 7-7" /></Icon>;
export const MoreIcon = (p: IconProps) => <Icon {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></Icon>;
export const ListIcon = (p: IconProps) => <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Icon>;
export const GridIcon = (p: IconProps) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>;
export const ClockIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const FlameIcon = (p: IconProps) => <Icon {...p}><path d="M12 3c2 3 1 5 0 6 2-1 3-2 3-4 3 3 4 6 4 8a7 7 0 1 1-14 0c0-3 2-6 7-10Z" /></Icon>;
export const HeadphonesIcon = (p: IconProps) => <Icon {...p}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2" y="13" width="5" height="8" rx="2" /><rect x="17" y="13" width="5" height="8" rx="2" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const TrashIcon = (p: IconProps) => <Icon {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /></Icon>;
export const XIcon = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const BookOpenIcon = (p: IconProps) => <Icon {...p}><path d="M12 6c-2-2-5-2-8-1v14c3-1 6-1 8 1 2-2 5-2 8-1V5c-3-1-6-1-8 1Z" /><path d="M12 6v14" /></Icon>;
export const VolumeIcon = (p: IconProps) => <Icon {...p}><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M17 8a6 6 0 0 1 0 8" /></Icon>;
export const EqualizerIcon = (p: IconProps) => <Icon {...p}><path d="M5 20V10M12 20V4M19 20v-8" /></Icon>;
export const RefreshIcon = (p: IconProps) => <Icon {...p}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 7l2 5M18.5 15A7 7 0 0 1 6 17l-2-5" /></Icon>;
export const AuthorIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></Icon>;
export const ServerIcon = (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01" /></Icon>;
export const CloudIcon = (p: IconProps) => <Icon {...p}><path d="M6 18a4 4 0 0 1-.5-8A6 6 0 0 1 17 9a4.5 4.5 0 0 1 .5 9H6Z" /></Icon>;
export const PaletteIcon = (p: IconProps) => <Icon {...p}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-.8-.6-1.3-.6-2 0-.8.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3Z" /><circle cx="7.5" cy="11" r=".8" fill="currentColor" /><circle cx="10" cy="7" r=".8" fill="currentColor" /><circle cx="15" cy="7.5" r=".8" fill="currentColor" /></Icon>;
export const DatabaseIcon = (p: IconProps) => <Icon {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Icon>;
export const SortIcon = (p: IconProps) => <Icon {...p}><path d="M4 6h16M6 12h12M9 18h6" /></Icon>;
export const UploadIcon = (p: IconProps) => <Icon {...p}><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 17v4h16v-4" /></Icon>;
export const LockIcon = (p: IconProps) => <Icon {...p}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>;
export const StarIcon = (p: IconProps) => <Icon {...p}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></Icon>;
export const ExportIcon = (p: IconProps) => <Icon {...p}><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 17v3h14v-3" /></Icon>;
export const WifiIcon = (p: IconProps) => <Icon {...p}><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></Icon>;
