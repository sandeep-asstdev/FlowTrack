import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar, getInitials } from './Avatar';

describe('Avatar Component', () => {
  it('extracts correct initials from full name or email', () => {
    expect(getInitials('Ramesh Kumar')).toBe('RK');
    expect(getInitials('Alice')).toBe('AL');
    expect(getInitials(null, 'john@example.com')).toBe('JO');
    expect(getInitials(null, null)).toBe('U');
  });

  it('renders initials when no avatar image URL is provided', () => {
    const html = renderToStaticMarkup(<Avatar user={{ fullName: 'Dev User' }} size={28} />);
    expect(html).toContain('DU');
    expect(html).not.toContain('<img');
  });

  it('renders img element when avatarUrl is provided', () => {
    const html = renderToStaticMarkup(
      <Avatar
        user={{
          fullName: 'Dev User',
          avatarUrl: 'https://example.com/avatar.jpg',
        }}
        size={28}
      />
    );
    expect(html).toContain('<img');
    expect(html).toContain('https://example.com/avatar.jpg');
    expect(html).toContain('Dev User');
  });

  it('falls back to initials when avatarUrl is empty or missing', () => {
    const htmlWithNull = renderToStaticMarkup(
      <Avatar
        user={{
          fullName: 'Priya Sharma',
          avatarUrl: null,
        }}
        size={28}
      />
    );
    expect(htmlWithNull).toContain('PS');
    expect(htmlWithNull).not.toContain('<img');
  });
});
