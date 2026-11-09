import React, { useState } from 'react';

export interface AvatarUser {
  id?: string;
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  avatarThumbnailUrl?: string | null;
}

export interface AvatarProps {
  user?: AvatarUser | null;
  size?: number | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  preferThumbnail?: boolean;
  showTooltip?: boolean;
  alt?: string;
}

const COLOR_PALETTE = [
  'bg-blue-600 text-white',
  'bg-indigo-600 text-white',
  'bg-purple-600 text-white',
  'bg-emerald-600 text-white',
  'bg-teal-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-cyan-600 text-white',
];

export function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return 'U';
}

function getColorClass(seed?: string | null): string {
  if (!seed) return COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

export const Avatar: React.FC<AvatarProps> = ({
  user,
  size = 28,
  className = '',
  preferThumbnail,
  showTooltip = true,
  alt,
}) => {
  const [hasError, setHasError] = useState(false);

  // Calculate pixel size
  let pixelSize = 28;
  if (typeof size === 'number') {
    pixelSize = size;
  } else {
    switch (size) {
      case 'sm':
        pixelSize = 24;
        break;
      case 'md':
        pixelSize = 32;
        break;
      case 'lg':
        pixelSize = 48;
        break;
      case 'xl':
        pixelSize = 96;
        break;
      default:
        pixelSize = 28;
    }
  }

  const displayName = user?.fullName || user?.name || user?.email || 'User';
  const initials = getInitials(user?.fullName || user?.name, user?.email);

  // URL resolution
  const useThumb = preferThumbnail !== undefined ? preferThumbnail : pixelSize <= 48;
  let rawUrl = useThumb
    ? user?.avatarThumbnailUrl || user?.avatarUrl
    : user?.avatarUrl || user?.avatarThumbnailUrl;

  let imageUrl: string | null = null;
  if (rawUrl && typeof rawUrl === 'string') {
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      imageUrl = rawUrl;
    } else {
      // Relative path: in dev/prod resolve with API base if not absolute
      const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';
      const rootBase = apiBase.replace(/\/api\/v1\/?$/, '');
      if (rawUrl.startsWith('/api/v1/')) {
        imageUrl = `${rootBase}${rawUrl}`;
      } else if (rawUrl.startsWith('/')) {
        imageUrl = `${rootBase}${rawUrl}`;
      } else {
        imageUrl = `${rootBase}/${rawUrl}`;
      }
    }
  }

  const fontSize = Math.max(9, Math.round(pixelSize * 0.38));
  const colorClass = getColorClass(user?.id || displayName);

  const style: React.CSSProperties = {
    width: `${pixelSize}px`,
    height: `${pixelSize}px`,
    minWidth: `${pixelSize}px`,
    minHeight: `${pixelSize}px`,
    fontSize: `${fontSize}px`,
  };

  if (imageUrl && !hasError) {
    return (
      <img
        src={imageUrl}
        alt={alt || displayName}
        title={showTooltip ? displayName : undefined}
        onError={() => setHasError(true)}
        style={style}
        className={`rounded-full object-cover shrink-0 select-none ring-1 ring-black/5 dark:ring-white/10 ${className}`}
      />
    );
  }

  return (
    <div
      style={style}
      title={showTooltip ? displayName : undefined}
      className={`rounded-full flex items-center justify-center font-bold tracking-wider select-none shrink-0 shadow-sm ${colorClass} ${className}`}
    >
      {initials}
    </div>
  );
};

export interface AvatarGroupProps {
  users: (AvatarUser | null | undefined)[];
  size?: number | 'sm' | 'md' | 'lg';
  max?: number;
  className?: string;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  users = [],
  size = 28,
  max = 3,
  className = '',
}) => {
  const validUsers = users.filter((u): u is AvatarUser => Boolean(u));
  if (validUsers.length === 0) return null;

  const visibleUsers = validUsers.slice(0, max);
  const remainingCount = validUsers.length - max;

  let pixelSize = typeof size === 'number' ? size : 28;
  const fontSize = Math.max(9, Math.round(pixelSize * 0.36));

  return (
    <div className={`flex items-center -space-x-2 shrink-0 ${className}`}>
      {visibleUsers.map((u, i) => (
        <Avatar
          key={u.id || `${u.email}-${i}`}
          user={u}
          size={pixelSize}
          className="ring-2 ring-white dark:ring-slate-900"
        />
      ))}
      {remainingCount > 0 && (
        <div
          style={{
            width: `${pixelSize}px`,
            height: `${pixelSize}px`,
            minWidth: `${pixelSize}px`,
            minHeight: `${pixelSize}px`,
            fontSize: `${fontSize}px`,
          }}
          title={`${remainingCount} more member${remainingCount > 1 ? 's' : ''}`}
          className="rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold ring-2 ring-white dark:ring-slate-900 shrink-0 select-none"
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
};
