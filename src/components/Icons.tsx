import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps, children: ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (props: IconProps) =>
  base({ ...props, fill: "currentColor", stroke: "none" }, <path d="M8 5.5v13l10-6.5z" />);

export const PauseIcon = (props: IconProps) =>
  base(
    { ...props, fill: "currentColor", stroke: "none" },
    <>
      <rect x="7" y="5" width="3.6" height="14" rx="1.2" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />
    </>
  );

export const PreviousIcon = (props: IconProps) =>
  base(
    { ...props, fill: "currentColor", stroke: "none" },
    <>
      <rect x="5" y="5" width="2.6" height="14" rx="1" />
      <path d="M19 5.8v12.4L9.2 12z" />
    </>
  );

export const NextIcon = (props: IconProps) =>
  base(
    { ...props, fill: "currentColor", stroke: "none" },
    <>
      <rect x="16.4" y="5" width="2.6" height="14" rx="1" />
      <path d="M5 5.8v12.4L14.8 12z" />
    </>
  );

export const BackIcon = (props: IconProps) =>
  base(props, <path d="M15 5l-7 7 7 7" />);

export const ForwardIcon = (props: IconProps) =>
  base(props, <path d="M9 5l7 7-7 7" />);

export const ReloadIcon = (props: IconProps) =>
  base(
    props,
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.4h-4.4" />
    </>
  );

export const HomeIcon = (props: IconProps) =>
  base(
    props,
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
    </>
  );

export const SettingsIcon = (props: IconProps) =>
  base(
    props,
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-1.9-3.3-2 .8a7.5 7.5 0 0 0-2.6-1.5L14.2 3H9.8l-.4 2.2a7.5 7.5 0 0 0-2.6 1.5l-2-.8-1.9 3.3 1.7 1.3a7.6 7.6 0 0 0 0 3l-1.7 1.3 1.9 3.3 2-.8a7.5 7.5 0 0 0 2.6 1.5l.4 2.2h4.4l.4-2.2a7.5 7.5 0 0 0 2.6-1.5l2 .8 1.9-3.3z" />
    </>
  );

export const VolumeIcon = ({ level = 2, ...props }: IconProps & { level?: 0 | 1 | 2 }) =>
  base(
    props,
    <>
      <path d="M4 9.5h3L12 5v14l-5-4.5H4z" fill="currentColor" stroke="none" />
      {level > 0 && <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />}
      {level > 1 && <path d="M18.3 6.6a8 8 0 0 1 0 10.8" />}
    </>
  );

export const ExternalIcon = (props: IconProps) =>
  base(
    props,
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8 8" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  );

export const FolderIcon = (props: IconProps) =>
  base(props, <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.2h8A1.5 1.5 0 0 1 20.5 9.7v8.3A1.5 1.5 0 0 1 19 19.5H5a1.5 1.5 0 0 1-1.5-1.5z" />);

export const CloseIcon = (props: IconProps) =>
  base(props, <path d="M6 6l12 12M18 6L6 18" />);

export const CheckIcon = (props: IconProps) =>
  base(props, <path d="M5 12.5l4.2 4.2L19 7" />);

export const MusicIcon = (props: IconProps) =>
  base(
    props,
    <>
      <path d="M9 18V6l10-2v11" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="15" r="2.5" />
    </>
  );

export const WarningIcon = (props: IconProps) =>
  base(
    props,
    <>
      <path d="M12 4 3 20h18z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </>
  );
