import React, { useId } from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  children,
  className = '',
  disabled = false,
  icon: Icon,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ui-button-${variant} ui-button-${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Loader2 className="ui-button-spinner" size={16} aria-hidden="true" /> : null}
      {!loading && Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function PageHeader({ actions, className = '', description, eyebrow, title }) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div className="ui-page-header-copy">
        {eyebrow ? <p className="ui-page-header-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="ui-page-header-description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ as: Element = 'section', children, className = '', padding = 'md', ...props }) {
  return (
    <Element {...props} className={`ui-card ui-card-${padding} ${className}`.trim()}>
      {children}
    </Element>
  );
}

export function Badge({ children, className = '', tone = 'neutral', ...props }) {
  return (
    <span {...props} className={`ui-badge ui-badge-${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}

export function TextField({ error, hint, id: suppliedId, label, ...inputProps }) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const messageId = `${id}-message`;
  const message = error || hint;
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        className={`ui-text-field ${inputProps.className || ''}`.trim()}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={message ? messageId : undefined}
      />
      {message ? (
        <p id={messageId} className={`ui-field-message ${error ? 'ui-field-error' : ''}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function EmptyState({ action, children, description, icon: Icon, title }) {
  return (
    <div className="ui-state ui-empty-state">
      {Icon ? <Icon className="ui-state-icon" size={24} aria-hidden="true" /> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {children}
      {action ? <div className="ui-state-action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ children = '載入中…', className = '' }) {
  return (
    <div className={`ui-state ui-loading-state ${className}`.trim()} role="status" aria-live="polite">
      <Loader2 className="ui-state-spinner" size={22} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
