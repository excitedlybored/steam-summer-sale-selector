export function Input(props) {
  return (
    <input
      type={props.type || "text"}
      class={`flex h-9 w-full rounded-lg border border-line bg-paper px-3 py-1 text-sm text-ink shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${props.class || ""}`}
      value={props.value}
      onInput={props.onInput}
      placeholder={props.placeholder}
      style={props.style}
    />
  )
}
