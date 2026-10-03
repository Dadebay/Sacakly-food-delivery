export function FormFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <small className="form-field-error" role="alert">
      {message}
    </small>
  );
}
