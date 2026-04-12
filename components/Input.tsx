import { InputHTMLAttributes, TextareaHTMLAttributes, CSSProperties } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  as?: 'input';
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  as: 'textarea';
}

type Props = InputProps | TextareaProps;

export default function Input({ label, error, hint, as: Tag = 'input', ...props }: Props) {
  const inputStyle: CSSProperties = {
    background: 'var(--bg-tertiary)',
    border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
    borderRadius: 0,
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
    transition: 'border-color 200ms ease, box-shadow 200ms ease',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  };

  const hintStyle: CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-tertiary)',
    marginTop: '4px',
    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
  };

  const errorStyle: CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--danger)',
    marginTop: '4px',
    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--accent)';
    e.currentTarget.style.boxShadow = error
      ? '0 0 0 2px rgba(255,68,68,0.12)'
      : '0 0 0 2px var(--accent-glow)';
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--border)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      {Tag === 'textarea' ? (
        <textarea
          {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          style={{ ...inputStyle, resize: 'vertical', minHeight: '100px', ...(props.style as CSSProperties) }}
          onFocus={handleFocus as React.FocusEventHandler<HTMLTextAreaElement>}
          onBlur={handleBlur as React.FocusEventHandler<HTMLTextAreaElement>}
        />
      ) : (
        <input
          {...(props as InputHTMLAttributes<HTMLInputElement>)}
          style={{ ...inputStyle, ...(props.style as CSSProperties) }}
          onFocus={handleFocus as React.FocusEventHandler<HTMLInputElement>}
          onBlur={handleBlur as React.FocusEventHandler<HTMLInputElement>}
        />
      )}
      {error && <p style={errorStyle}>{error}</p>}
      {hint && !error && <p style={hintStyle}>{hint}</p>}
    </div>
  );
}
