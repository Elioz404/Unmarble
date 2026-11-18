/**
 * Hand-drawn line icons on a 24-unit grid, 1.5 stroke, round caps — the
 * weight of a pen line, matching the hairlines of the ruled ground.
 */
import type { ReactNode } from 'react';

type IconProps = { readonly size?: number; readonly title?: string };

const Svg = ({ size = 22, title, children }: IconProps & { readonly children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
  >
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

export const SoundOnIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
    <path d="M18 6.5a7.6 7.6 0 0 1 0 11" />
  </Svg>
);

export const SoundOffIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Svg>
);

/** A reading glass over three ruled lines. */
export const LensIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5.5 5.5" />
    <path d="M7 9h7M7 12h7" opacity="0.55" />
  </Svg>
);

export const CloseIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const CopyIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Svg>
);

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

/** A drop falling into a bath: the mark of the bindery. */
export const DropMark = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3.5c2.6 3.4 4.5 6 4.5 8.4a4.5 4.5 0 0 1-9 0c0-2.4 1.9-5 4.5-8.4z" />
    <path d="M4 20c2.2-1.2 4.4-1.2 6.6 0s4.4 1.2 6.6 0 2.4-.8 2.8-.6" />
  </Svg>
);

/** A bound book with a ribbon marker. */
/** An open book: the Book of every sheet so far. */
export const BookIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5" />
    <path d="M12 6.5C14 5 17 4.5 20.5 5v13c-3.5-.5-6.5 0-8.5 1.5" />
    <path d="M12 6.5v13" />
  </Svg>
);

/** A question mark in a pen ring: the pocket reading guide. */
export const GuideIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8v.4" />
    <path d="M12 17v.01" />
  </Svg>
);

/** A quill: making a sheet for someone else. */
export const QuillIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M19.5 4.5c-6 1-10 5-11.5 11.5" />
    <path d="M19.5 4.5c-.5 5-3.5 9-9 10.5" />
    <path d="M8 16l-3 3.5" />
  </Svg>
);

export const BackIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
);

export const UndoIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 7.5L5 11.5l4 4" />
    <path d="M5 11.5h9a5 5 0 0 1 0 10h-2" />
  </Svg>
);

/** A drop of ink, for the composer's drop tool. */
export const DropToolIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="13" r="6" />
  </Svg>
);

/** A fold: stripes kinked by a stroke. */
export const FoldToolIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 8h5l3 3 3-3h5" />
    <path d="M4 14h5l3 3 3-3h5" />
  </Svg>
);

/** A swirl around an eye. */
export const SwirlToolIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 12.5a1.5 1.5 0 1 1 1.5-1.5 4 4 0 0 1-4 4A5.5 5.5 0 0 1 4 9.5 7.5 7.5 0 0 1 11.5 2" />
  </Svg>
);
