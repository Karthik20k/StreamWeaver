import React from 'react';

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  icon: Icon,
  type = 'button',
  title
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`btn btn-${variant} btn-${size} ${className}`}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 18} className="btn-icon" />}
      <span>{children}</span>
    </button>
  );
}
